import { randomUUID } from "node:crypto";
import { isAbsolute } from "node:path";

import { z } from "zod";

import { ApplicationError } from "../errors.js";
import { describeError, logger } from "../observability/logger.js";
import type { ProjectService } from "../projects/project-service.js";
import {
  createControlledRepositoryWorkspace,
  MAX_OPERATION_CONTENT_BYTES,
  MAX_OPERATIONS,
  MAX_REPOSITORY_PATH_LENGTH,
  type RepositoryWorkspace,
} from "../repositories/controlled-repository-workspace.js";
import {
  createControlledGitInspector,
  type GitChangedFile,
  type GitInspector,
} from "../repositories/git-inspector.js";
import {
  findPreparedRepository,
  type PreparedRepository,
} from "../repositories/prepared-repositories.js";
import type {
  DeveloperExecutionInput,
  DeveloperExecutor,
  ExecutionId,
  TaskExecution,
} from "./types.js";

export const developerImplementationPlanSchema = z.object({
  summary: z.string().trim().min(1).max(700),
  operations: z
    .array(
      z.object({
        type: z.enum(["create", "update"]),
        path: z.string().min(1).max(MAX_REPOSITORY_PATH_LENGTH),
        content: z.string().min(1).max(MAX_OPERATION_CONTENT_BYTES),
      }),
    )
    .min(1)
    .max(MAX_OPERATIONS),
  verification: z.array(z.string().trim().min(1).max(500)).min(1).max(8),
});

export type DeveloperImplementationPlan = z.infer<
  typeof developerImplementationPlanSchema
>;

export interface DeveloperImplementationPlanner {
  plan(input: DeveloperExecutionInput): Promise<unknown>;
}

export interface ControlledDeveloperExecutorDependencies {
  projectService: ProjectService;
  preparedRepositories: readonly PreparedRepository[];
  planner: DeveloperImplementationPlanner;
  workspace?: RepositoryWorkspace;
  gitInspector?: GitInspector;
  generateExecutionId?: () => ExecutionId;
  now?: () => Date;
}

const unsafeEvidencePatterns = [
  "OPENAI_API_KEY",
  "DATABASE_URL",
  "Authorization:",
  "Bearer ",
  "sk-",
  "/Users/",
  "/home/",
  "private/tmp",
];

export function createControlledDeveloperExecutor({
  projectService,
  preparedRepositories,
  planner,
  workspace = createControlledRepositoryWorkspace(),
  gitInspector = createControlledGitInspector(),
  generateExecutionId = () => `exec_${randomUUID()}`,
  now = () => new Date(),
}: ControlledDeveloperExecutorDependencies): DeveloperExecutor {
  return {
    async execute(input): Promise<TaskExecution> {
      const repositoryRoot = await resolveRepositoryRoot(
        projectService,
        preparedRepositories,
        input,
      );
      try {
        await gitInspector.assertCleanBaseline(repositoryRoot);
      } catch (error) {
        logger.error("Prepared repository baseline is unusable", {
          taskId: input.task.id,
          cause: describeError(error),
        });
        throw executionFailure();
      }

      const startedAt = now().toISOString();

      let output: unknown;

      try {
        output = await planner.plan(input);
      } catch (error) {
        logger.error("Controlled developer planning failed", {
          taskId: input.task.id,
          cause: describeError(error),
        });
        throw executionFailure();
      }

      const parsed = developerImplementationPlanSchema.safeParse(output);

      if (!parsed.success) {
        logger.error("Controlled developer returned an invalid plan", {
          taskId: input.task.id,
          issues: parsed.error.issues,
        });
        throw executionFailure();
      }

      if (containsUnsafeEvidence(parsed.data)) {
        logger.error("Controlled developer returned unsafe evidence", {
          taskId: input.task.id,
        });
        throw executionFailure();
      }

      let mutation;

      try {
        mutation = await workspace.apply(repositoryRoot, parsed.data.operations);
      } catch (error) {
        logger.error("Controlled repository mutation was rejected", {
          taskId: input.task.id,
          cause: describeError(error),
        });
        throw executionFailure();
      }

      let evidence;

      try {
        evidence = await gitInspector.captureEvidence(repositoryRoot);
      } catch (error) {
        logger.error("Git evidence capture failed after mutation", {
          taskId: input.task.id,
          cause: describeError(error),
        });
        await mutation.rollback();
        throw executionFailure();
      }

      return {
        id: generateExecutionId(),
        role: "FULL_STACK_DEVELOPER",
        status: "COMPLETED",
        attempt: 1,
        startedAt,
        completedAt: now().toISOString(),
        result: {
          summary: parsed.data.summary,
          changedFiles: evidence.files.map(describeChangedFile),
          verification: [...parsed.data.verification],
          changeEvidence: {
            files: evidence.files.map((file) => ({ ...file })),
            summary: { ...evidence.summary },
            ...(evidence.diff === undefined ? {} : { diff: evidence.diff }),
          },
        },
      };
    },
  };
}

async function resolveRepositoryRoot(
  projectService: ProjectService,
  preparedRepositories: readonly PreparedRepository[],
  input: DeveloperExecutionInput,
): Promise<string> {
  const project = await projectService.getProject(input.task.projectId);

  if (project.id !== input.project.id) {
    logger.error("Controlled developer execution crossed project boundaries", {
      taskId: input.task.id,
    });
    throw executionFailure();
  }

  const repository = findPreparedRepository(
    preparedRepositories,
    project.repository.preparedRepositoryId,
  );

  if (
    repository === undefined ||
    repository.publicRepositoryUrl !== project.repository.publicRepositoryUrl ||
    typeof repository.localCheckoutPath !== "string" ||
    !isAbsolute(repository.localCheckoutPath)
  ) {
    logger.error("Controlled developer execution has no prepared repository", {
      projectId: project.id,
      taskId: input.task.id,
    });
    throw executionFailure();
  }

  return repository.localCheckoutPath;
}

function describeChangedFile(file: GitChangedFile): string {
  const stats =
    file.additions === undefined || file.deletions === undefined
      ? ""
      : ` (+${file.additions}/-${file.deletions})`;

  return `${file.status}: ${file.path}${stats}`;
}

function containsUnsafeEvidence(plan: DeveloperImplementationPlan): boolean {
  const values = [plan.summary, ...plan.verification];

  return values.some((value) =>
    unsafeEvidencePatterns.some((pattern) => value.includes(pattern)),
  );
}

function executionFailure(): ApplicationError {
  return new ApplicationError(
    "INTERNAL_ERROR",
    500,
    "An unexpected error occurred",
  );
}

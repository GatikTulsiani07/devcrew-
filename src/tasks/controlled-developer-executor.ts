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
  isTaskCancellationError,
  throwIfSignalCancelled,
} from "./task-cancellation.js";
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
      throwIfSignalCancelled(input.signal);
      const repositoryRoot = await resolveRepositoryRoot(
        projectService,
        preparedRepositories,
        input,
      );
      await assertBaseline(repositoryRoot, input, gitInspector);
      throwIfSignalCancelled(input.signal);

      const startedAt = now().toISOString();

      let output: unknown;

      try {
        output = await planner.plan(input);
      } catch (error) {
        if (isTaskCancellationError(error)) {
          throw error;
        }

        logger.error("Controlled developer planning failed", {
          taskId: input.task.id,
          cause: describeError(error),
        });
        throw executionFailure();
      }
      throwIfSignalCancelled(input.signal);

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
        throwIfSignalCancelled(input.signal);
        mutation = await workspace.apply(repositoryRoot, parsed.data.operations);
        await rollbackIfCancelled(mutation, input.signal);
      } catch (error) {
        if (isTaskCancellationError(error)) {
          throw error;
        }

        logger.error("Controlled repository mutation was rejected", {
          taskId: input.task.id,
          cause: describeError(error),
        });
        throw executionFailure();
      }

      let inspection;

      try {
        throwIfSignalCancelled(input.signal);
        inspection = await gitInspector.captureRepositoryChanges(repositoryRoot);
        await rollbackIfCancelled(mutation, input.signal);
      } catch (error) {
        if (isTaskCancellationError(error)) {
          throw error;
        }

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
          changedFiles:
            inspection.changeEvidence?.files.map(describeChangedFile) ?? [],
          verification: [...parsed.data.verification],
          repositoryChanges: {
            filesChanged: [...inspection.repositoryChanges.filesChanged],
            filesAdded: [...inspection.repositoryChanges.filesAdded],
            filesModified: [...inspection.repositoryChanges.filesModified],
            filesDeleted: [...inspection.repositoryChanges.filesDeleted],
            totalFilesChanged: inspection.repositoryChanges.totalFilesChanged,
            insertions: inspection.repositoryChanges.insertions,
            deletions: inspection.repositoryChanges.deletions,
          },
          ...(inspection.changeEvidence === undefined
            ? {}
            : {
                changeEvidence: {
                  files: inspection.changeEvidence.files.map((file) => ({ ...file })),
                  summary: { ...inspection.changeEvidence.summary },
                  ...(inspection.changeEvidence.diff === undefined
                    ? {}
                    : { diff: inspection.changeEvidence.diff }),
                },
              }),
        },
      };
    },
  };
}

async function rollbackIfCancelled(
  mutation: { rollback(): Promise<void> },
  signal?: AbortSignal,
): Promise<void> {
  if (signal?.aborted !== true) {
    return;
  }

  try {
    await mutation.rollback();
  } catch (error) {
    logger.error("Controlled developer rollback failed after cancellation", {
      cause: describeError(error),
    });
    throw executionFailure();
  }

  throwIfSignalCancelled(signal);
}

async function assertBaseline(
  repositoryRoot: string,
  input: DeveloperExecutionInput,
  gitInspector: GitInspector,
): Promise<void> {
  try {
    if (input.repairContext === undefined) {
      await gitInspector.assertCleanBaseline(repositoryRoot);
      return;
    }

    const expectedFiles = input.task.execution?.result.changeEvidence?.files;

    if (expectedFiles === undefined || expectedFiles.length === 0) {
      throw new Error("missing repair baseline evidence");
    }

    const observed = await gitInspector.captureEvidence(repositoryRoot);
    const expectedPaths = new Set(expectedFiles.map((file) => file.path));
    const observedPaths = new Set(observed.files.map((file) => file.path));

    if (
      expectedPaths.size !== observedPaths.size ||
      [...observedPaths].some((path) => !expectedPaths.has(path))
    ) {
      throw new Error("repair baseline does not match previous Developer evidence");
    }
  } catch (error) {
    logger.error("Prepared repository baseline is unusable", {
      taskId: input.task.id,
      cause: describeError(error),
    });
    throw executionFailure();
  }
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

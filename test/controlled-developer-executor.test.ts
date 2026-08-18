import assert from "node:assert/strict";
import {
  chmod,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, describe, it } from "node:test";

import { ApplicationError } from "../src/errors.js";
import type { ProjectService } from "../src/projects/project-service.js";
import type { GitInspector } from "../src/repositories/git-inspector.js";
import type { RepositoryWorkspace } from "../src/repositories/controlled-repository-workspace.js";
import type { DeveloperRollbackService } from "../src/repositories/developer-rollback.js";
import type { PreparedRepository } from "../src/repositories/prepared-repositories.js";
import {
  createControlledDeveloperExecutor,
  type DeveloperImplementationPlanner,
} from "../src/tasks/controlled-developer-executor.js";
import { TaskCancellationError } from "../src/tasks/task-cancellation.js";
import type { DeveloperExecutionInput } from "../src/tasks/types.js";

let repositoryRoot: string;
let outsideRoot: string;

function repository(): PreparedRepository {
  return {
    id: "prepared_devcrew_main",
    publicRepositoryUrl: "https://github.com/example/devcrew",
    localCheckoutPath: repositoryRoot,
    validationProfileId: "node_standard",
  };
}

function developerInput(): DeveloperExecutionInput {
  return {
    project: {
      id: "proj_000001",
      name: "Devcrew",
      status: "REPOSITORY_CONNECTED",
      repository: {
        id: "repo_000001",
        publicRepositoryUrl: "https://github.com/example/devcrew",
        preparedRepositoryId: "prepared_devcrew_main",
      },
      createdAt: "2026-08-03T00:00:00.000Z",
      updatedAt: "2026-08-03T00:00:00.000Z",
    },
    task: {
      id: "task_000001",
      projectId: "proj_000001",
      title: "Implement auth middleware",
      description: "Protect every API route.",
      status: "PLAN_APPROVED",
      plan: {
        summary: "Add auth middleware safely.",
        steps: ["Implement: Add route middleware."],
      },
      planDecision: {
        decision: "APPROVE",
        reason: "Ready for implementation.",
        decidedAt: "2026-08-03T01:00:00.000Z",
      },
      createdAt: "2026-08-03T00:30:00.000Z",
      updatedAt: "2026-08-03T01:00:00.000Z",
    },
  };
}

function projectService(projectId = "proj_000001"): ProjectService {
  return {
    async createProject() {
      throw new Error("unused");
    },
    async getProject() {
      const input = developerInput();
      return { ...input.project, id: projectId };
    },
  };
}

function planner(plan: unknown): DeveloperImplementationPlanner {
  return {
    async plan() {
      return plan;
    },
  };
}

function stubGitInspector(): GitInspector {
  const evidence = {
    files: [
      {
        path: "observed.ts",
        status: "MODIFIED" as const,
        additions: 2,
        deletions: 1,
      },
    ],
    summary: { filesChanged: 1, additions: 2, deletions: 1 },
    diff: "--- a/observed.ts\n+++ b/observed.ts\n",
  };

  return {
    async assertCleanBaseline() {},
    async captureEvidence() {
      return evidence;
    },
    async captureRepositoryChanges() {
      return {
        repositoryChanges: {
          filesChanged: ["observed.ts"],
          filesAdded: [],
          filesModified: ["observed.ts"],
          filesDeleted: [],
          totalFilesChanged: 1,
          insertions: 2,
          deletions: 1,
        },
        changeEvidence: evidence,
      };
    },
  };
}

function executor(
  plan: unknown,
  overrides: {
    projectService?: ProjectService;
    preparedRepositories?: readonly PreparedRepository[];
    planner?: DeveloperImplementationPlanner;
    gitInspector?: GitInspector;
    workspace?: RepositoryWorkspace;
    rollbackService?: DeveloperRollbackService;
  } = {},
) {
  return createControlledDeveloperExecutor({
    projectService: overrides.projectService ?? projectService(),
    preparedRepositories: overrides.preparedRepositories ?? [repository()],
    planner: overrides.planner ?? planner(plan),
    ...(overrides.workspace === undefined ? {} : { workspace: overrides.workspace }),
    gitInspector: overrides.gitInspector ?? stubGitInspector(),
    rollbackService: overrides.rollbackService ?? noopRollbackService(),
    generateExecutionId: () => "exec_000001",
    now: () => new Date("2026-08-03T02:00:00.000Z"),
  });
}

function noopRollbackService(): DeveloperRollbackService {
  return {
    async captureBaseline() {
      return {
        headSha: "1111111111111111111111111111111111111111",
        branch: "main",
        repositoryChangesBefore: {
          filesChanged: [],
          filesAdded: [],
          filesModified: [],
          filesDeleted: [],
          totalFilesChanged: 0,
          insertions: 0,
          deletions: 0,
        },
        capturedAt: "2026-08-03T02:00:00.000Z",
        snapshots: [],
      };
    },
    async rollback() {},
  };
}

before(async () => {
  repositoryRoot = await mkdtemp(join(tmpdir(), "devcrew-repo-"));
  outsideRoot = await mkdtemp(join(tmpdir(), "devcrew-outside-"));
  await writeFile(join(outsideRoot, "secret.txt"), "untouched", "utf8");
});

after(async () => {
  await rm(repositoryRoot, { recursive: true, force: true });
  await rm(outsideRoot, { recursive: true, force: true });
});

describe("controlled developer executor", () => {
  it("creates and updates files and returns authoritative evidence", async () => {
    await writeFile(join(repositoryRoot, "existing.ts"), "old", "utf8");
    let rollbackCalls = 0;

    const execution = await executor({
      summary: "Implemented the approved authentication change.",
      operations: [
        {
          type: "create",
          path: "src/auth/middleware.ts",
          content: "export const middleware = true;\n",
        },
        { type: "update", path: "existing.ts", content: "new" },
      ],
      verification: ["Run typecheck", "Run tests"],
    }, {
      rollbackService: {
        ...(noopRollbackService()),
        async rollback() {
          rollbackCalls += 1;
        },
      },
    }).execute(developerInput());

    assert.deepEqual(execution, {
      id: "exec_000001",
      role: "FULL_STACK_DEVELOPER",
      status: "COMPLETED",
      attempt: 1,
      startedAt: "2026-08-03T02:00:00.000Z",
      completedAt: "2026-08-03T02:00:00.000Z",
      result: {
        summary: "Implemented the approved authentication change.",
        changedFiles: ["MODIFIED: observed.ts (+2/-1)"],
        verification: ["Run typecheck", "Run tests"],
        repositoryChanges: {
          filesChanged: ["observed.ts"],
          filesAdded: [],
          filesModified: ["observed.ts"],
          filesDeleted: [],
          totalFilesChanged: 1,
          insertions: 2,
          deletions: 1,
        },
        changeEvidence: {
          files: [
            {
              path: "observed.ts",
              status: "MODIFIED",
              additions: 2,
              deletions: 1,
            },
          ],
          summary: { filesChanged: 1, additions: 2, deletions: 1 },
          diff: "--- a/observed.ts\n+++ b/observed.ts\n",
        },
      },
    });
    assert.equal(
      await readFile(join(repositoryRoot, "src/auth/middleware.ts"), "utf8"),
      "export const middleware = true;\n",
    );
    assert.equal(await readFile(join(repositoryRoot, "existing.ts"), "utf8"), "new");
    assert.equal(rollbackCalls, 0);
  });

  it("rejects unsafe paths without mutating the repository", async () => {
    const unsafePaths = [
      "../outside.ts",
      "../../outside.ts",
      "src/../../outside.ts",
      "/absolute/path.ts",
      "/etc/passwd",
      "C:\\Windows\\system.ini",
      ".env",
      ".git/config",
      "src/./../../escape.ts",
    ];

    for (const path of unsafePaths) {
      await assert.rejects(
        executor({
          summary: "Escape attempt",
          operations: [{ type: "create", path, content: "x" }],
          verification: ["Run tests"],
        }).execute(developerInput()),
        (error: unknown) =>
          error instanceof ApplicationError &&
          error.code === "INTERNAL_ERROR" &&
          error.message === "An unexpected error occurred",
        `expected ${path} to be rejected`,
      );
    }

    assert.equal(
      await readFile(join(outsideRoot, "secret.txt"), "utf8"),
      "untouched",
    );
  });

  it("rejects symlink escapes", async () => {
    await mkdir(join(repositoryRoot, "links"), { recursive: true });
    await symlink(outsideRoot, join(repositoryRoot, "links/outside"));

    await assert.rejects(
      executor({
        summary: "Symlink escape",
        operations: [
          { type: "create", path: "links/outside/injected.ts", content: "x" },
        ],
        verification: ["Run tests"],
      }).execute(developerInput()),
      ApplicationError,
    );

    await assert.rejects(readFile(join(outsideRoot, "injected.ts"), "utf8"));
  });

  it("rejects invalid structured output", async () => {
    const invalidPlans: unknown[] = [
      undefined,
      { summary: "", operations: [], verification: [] },
      { summary: "ok", verification: ["Run tests"] },
      {
        summary: "ok",
        operations: [{ type: "delete", path: "a.ts", content: "x" }],
        verification: ["Run tests"],
      },
      {
        summary: "ok",
        operations: [{ type: "create", path: "a.ts", content: "" }],
        verification: ["Run tests"],
      },
      {
        summary: "ok",
        operations: Array.from({ length: 13 }, (_unused, index) => ({
          type: "create",
          path: `generated/file-${index}.ts`,
          content: "x",
        })),
        verification: ["Run tests"],
      },
      {
        summary: "ok",
        operations: [
          { type: "create", path: "dup.ts", content: "a" },
          { type: "create", path: "dup.ts", content: "b" },
        ],
        verification: ["Run tests"],
      },
      {
        summary: "Exposes OPENAI_API_KEY",
        operations: [{ type: "create", path: "safe.ts", content: "x" }],
        verification: ["Run tests"],
      },
    ];

    for (const plan of invalidPlans) {
      await assert.rejects(
        executor(plan).execute(developerInput()),
        ApplicationError,
        `expected ${JSON.stringify(plan)} to be rejected`,
      );
    }
  });

  it("rejects conflicting create and update targets", async () => {
    await assert.rejects(
      executor({
        summary: "Create over an existing file",
        operations: [{ type: "create", path: "existing.ts", content: "x" }],
        verification: ["Run tests"],
      }).execute(developerInput()),
      ApplicationError,
    );

    await assert.rejects(
      executor({
        summary: "Update a missing file",
        operations: [{ type: "update", path: "missing.ts", content: "x" }],
        verification: ["Run tests"],
      }).execute(developerInput()),
      ApplicationError,
    );
  });

  it("restores earlier files when a later operation fails", async () => {
    await writeFile(join(repositoryRoot, "restore.ts"), "original", "utf8");

    await assert.rejects(
      executor({
        summary: "Partial mutation",
        operations: [
          { type: "update", path: "restore.ts", content: "mutated" },
          { type: "update", path: "absent.ts", content: "x" },
        ],
        verification: ["Run tests"],
      }).execute(developerInput()),
      ApplicationError,
    );

    assert.equal(
      await readFile(join(repositoryRoot, "restore.ts"), "utf8"),
      "original",
    );
  });

  it("rolls back an applied mutation when cancellation arrives before execution evidence is persisted", async () => {
    const controller = new AbortController();
    let applied = false;
    let rolledBack = false;

    await assert.rejects(
      executor(
        {
          summary: "Apply then cancel",
          operations: [{ type: "create", path: "cancelled.ts", content: "x" }],
          verification: ["Run tests"],
        },
        {
          workspace: {
            async apply() {
              applied = true;
              return {
                operations: [{ type: "create", path: "cancelled.ts" }],
                async rollback() {},
              };
            },
          },
          rollbackService: {
            async captureBaseline() {
              return {
                headSha: "1111111111111111111111111111111111111111",
                branch: "main",
                repositoryChangesBefore: {
                  filesChanged: [],
                  filesAdded: [],
                  filesModified: [],
                  filesDeleted: [],
                  totalFilesChanged: 0,
                  insertions: 0,
                  deletions: 0,
                },
                capturedAt: "2026-08-03T02:00:00.000Z",
                snapshots: [],
              };
            },
            async rollback() {
              rolledBack = true;
            },
          },
          gitInspector: {
            async assertCleanBaseline() {},
            async captureEvidence() {
              throw new Error("unused");
            },
            async captureRepositoryChanges() {
              controller.abort(new TaskCancellationError());
              return {
                repositoryChanges: {
                  filesChanged: ["cancelled.ts"],
                  filesAdded: ["cancelled.ts"],
                  filesModified: [],
                  filesDeleted: [],
                  totalFilesChanged: 1,
                  insertions: 0,
                  deletions: 0,
                },
                changeEvidence: {
                  files: [{ path: "cancelled.ts", status: "ADDED" as const }],
                  summary: { filesChanged: 1 },
                },
              };
            },
          },
        },
      ).execute({ ...developerInput(), signal: controller.signal }),
      { name: "TaskCancellationError" },
    );

    assert.equal(applied, true);
    assert.equal(rolledBack, true);
  });

  it("treats a missing target as absent and fails closed for unreadable targets", async () => {
    const missingTarget = await executor({
      summary: "ENOENT targets are created",
      operations: [
        { type: "create", path: "enoent/created.ts", content: "created" },
      ],
      verification: ["Run tests"],
    }).execute(developerInput());

    assert.equal(missingTarget.status, "COMPLETED");
    assert.equal(
      await readFile(join(repositoryRoot, "enoent/created.ts"), "utf8"),
      "created",
    );

    const unreadablePath = join(repositoryRoot, "unreadable.ts");
    await writeFile(unreadablePath, "protected", "utf8");
    await chmod(unreadablePath, 0o000);

    try {
      await assert.rejects(
        executor({
          summary: "Unreadable target",
          operations: [
            { type: "update", path: "unreadable.ts", content: "mutated" },
          ],
          verification: ["Run tests"],
        }).execute(developerInput()),
        (error: unknown) =>
          error instanceof ApplicationError &&
          error.code === "INTERNAL_ERROR" &&
          error.message === "An unexpected error occurred",
      );
    } finally {
      await chmod(unreadablePath, 0o600);
    }

    assert.equal(await readFile(unreadablePath, "utf8"), "protected");

    await mkdir(join(repositoryRoot, "directory-target"), { recursive: true });

    await assert.rejects(
      executor({
        summary: "Directory target",
        operations: [
          { type: "update", path: "directory-target", content: "mutated" },
        ],
        verification: ["Run tests"],
      }).execute(developerInput()),
      ApplicationError,
    );
  });

  it("fails closed for prepared repository and project problems", async () => {
    const validPlan = {
      summary: "Valid implementation",
      operations: [{ type: "create", path: "guarded.ts", content: "x" }],
      verification: ["Run tests"],
    };

    const cases: Array<{
      preparedRepositories?: readonly PreparedRepository[];
      projectService?: ProjectService;
    }> = [
      { preparedRepositories: [] },
      {
        preparedRepositories: [{ ...repository(), localCheckoutPath: undefined }],
      },
      {
        preparedRepositories: [
          { ...repository(), localCheckoutPath: "relative/path" },
        ],
      },
      {
        preparedRepositories: [
          {
            ...repository(),
            publicRepositoryUrl: "https://github.com/example/other",
          },
        ],
      },
      {
        preparedRepositories: [
          { ...repository(), localCheckoutPath: join(outsideRoot, "missing-root") },
        ],
      },
      { projectService: projectService("proj_000002") },
    ];

    for (const overrides of cases) {
      await assert.rejects(
        executor(validPlan, overrides).execute(developerInput()),
        ApplicationError,
      );
    }
  });

  it("fails closed when the planner throws", async () => {
    await assert.rejects(
      executor(undefined, {
        planner: {
          async plan() {
            throw new Error("provider failure at /Users/example/key");
          },
        },
      }).execute(developerInput()),
      (error: unknown) =>
        error instanceof ApplicationError &&
        !error.message.includes("/Users/") &&
        error.message === "An unexpected error occurred",
    );
  });
});

import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, describe, it } from "node:test";

import { ApplicationError } from "../src/errors.js";
import type { ProjectService } from "../src/projects/project-service.js";
import type { PreparedRepository } from "../src/repositories/prepared-repositories.js";
import {
  createControlledDeveloperExecutor,
  type DeveloperImplementationPlanner,
} from "../src/tasks/controlled-developer-executor.js";
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

function executor(
  plan: unknown,
  overrides: {
    projectService?: ProjectService;
    preparedRepositories?: readonly PreparedRepository[];
    planner?: DeveloperImplementationPlanner;
  } = {},
) {
  return createControlledDeveloperExecutor({
    projectService: overrides.projectService ?? projectService(),
    preparedRepositories: overrides.preparedRepositories ?? [repository()],
    planner: overrides.planner ?? planner(plan),
    generateExecutionId: () => "exec_000001",
    now: () => new Date("2026-08-03T02:00:00.000Z"),
  });
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
        changedFiles: ["CREATE: src/auth/middleware.ts", "UPDATE: existing.ts"],
        verification: ["Run typecheck", "Run tests"],
      },
    });
    assert.equal(
      await readFile(join(repositoryRoot, "src/auth/middleware.ts"), "utf8"),
      "export const middleware = true;\n",
    );
    assert.equal(await readFile(join(repositoryRoot, "existing.ts"), "utf8"), "new");
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

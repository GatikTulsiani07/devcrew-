import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { ApplicationError } from "../src/errors.js";
import type { ProjectService } from "../src/projects/project-service.js";
import type { PreparedRepository } from "../src/repositories/prepared-repositories.js";
import { createControlledDevOpsValidator } from "../src/tasks/controlled-devops-validator.js";
import type { TaskSnapshot } from "../src/tasks/types.js";
import type { ControlledCommandRunner } from "../src/validation/types.js";
import { validationProfiles } from "../src/validation/validation-profiles.js";

const task: TaskSnapshot = {
  id: "task_000001",
  projectId: "proj_000001",
  title: "Add validation",
  description: "Run approved checks.",
  status: "IMPLEMENTATION_COMPLETED",
  plan: { summary: "Plan", steps: [] },
  execution: {
    id: "exec_000001",
    role: "FULL_STACK_DEVELOPER",
    status: "COMPLETED",
    attempt: 1,
    startedAt: "2026-08-03T01:00:00.000Z",
    completedAt: "2026-08-03T02:00:00.000Z",
    result: {
      summary: "Changed files.",
      changedFiles: ["MODIFIED: src/app.ts (+1/-0)"],
      verification: ["Run tests"],
      changeEvidence: {
        files: [
          {
            path: "src/app.ts",
            status: "MODIFIED",
            additions: 1,
            deletions: 0,
          },
        ],
        summary: { filesChanged: 1, additions: 1, deletions: 0 },
      },
    },
  },
  createdAt: "2026-08-03T00:00:00.000Z",
  updatedAt: "2026-08-03T00:00:00.000Z",
};

const repository: PreparedRepository = {
  id: "prepared_devcrew_main",
  publicRepositoryUrl: "https://github.com/example/devcrew",
  localCheckoutPath: "/private/tmp/devcrew-fixture",
  validationProfileId: "node_standard",
};

function projectService(): ProjectService {
  return {
    async createProject() {
      throw new Error("unused");
    },
    async getProject() {
      return {
        id: task.projectId,
        name: "Devcrew",
        status: "REPOSITORY_CONNECTED",
        repository: {
          id: "repo_000001",
          publicRepositoryUrl: repository.publicRepositoryUrl,
          preparedRepositoryId: repository.id,
        },
        createdAt: task.createdAt,
        updatedAt: task.updatedAt,
      };
    },
  };
}

describe("controlled DevOps validator", () => {
  it("runs the server-owned checks in order and returns the existing shape", async () => {
    const calls: Array<{ executable: string; args: readonly string[]; cwd: string }> = [];
    const runner: ControlledCommandRunner = {
      async run(check, cwd) {
        calls.push({ executable: check.executable, args: check.args, cwd });
        return {
          status: "PASSED",
          exitCode: 0,
          timedOut: false,
          started: true,
          outputLimitExceeded: false,
          unsafeEvidence: false,
          stdout: "ignored",
          stderr: "ignored",
        };
      },
    };

    const validation = await createControlledDevOpsValidator({
      projectService: projectService(),
      preparedRepositories: [repository],
      runner,
      checkpointService: {
        async createCheckpoint(input) {
          assert.equal(input.repositoryRoot, repository.localCheckoutPath);
          assert.equal(input.taskId, task.id);
          assert.deepEqual(input.changeEvidence, task.execution?.result.changeEvidence);
          return {
            sha: "0123456789abcdef0123456789abcdef01234567",
            shortSha: "0123456789ab",
            message: "devcrew: implement task task_000001",
            createdAt: "2026-08-03T04:00:00.000Z",
            filesChanged: ["src/app.ts"],
          };
        },
      },
      generateValidationId: () => "val_000001",
      now: () => new Date("2026-08-03T04:00:00.000Z"),
    }).validate(task);

    assert.deepEqual(calls, validationProfiles[0].checks.map((check) => ({
      executable: check.executable,
      args: check.args,
      cwd: repository.localCheckoutPath,
    })));
    assert.deepEqual(validation, {
      id: "val_000001",
      role: "DEVOPS_ENGINEER",
      status: "PASSED",
      attempt: 1,
      startedAt: "2026-08-03T04:00:00.000Z",
      completedAt: "2026-08-03T04:00:00.000Z",
      checks: [
        { name: "typecheck", status: "PASSED", summary: "Type checking completed successfully." },
        { name: "tests", status: "PASSED", summary: "Automated tests completed successfully." },
        { name: "build", status: "PASSED", summary: "Production build completed successfully." },
      ],
      summary: "Controlled validation completed successfully.",
      checkpoint: {
        sha: "0123456789abcdef0123456789abcdef01234567",
        shortSha: "0123456789ab",
        message: "devcrew: implement task task_000001",
        createdAt: "2026-08-03T04:00:00.000Z",
        filesChanged: ["src/app.ts"],
      },
    });
  });

  it("stops after the first failed check and fails closed for missing configuration", async () => {
    let calls = 0;
    const runner: ControlledCommandRunner = {
      async run() {
        calls += 1;
        return {
          status: "FAILED",
          exitCode: 1,
          timedOut: false,
          started: true,
          outputLimitExceeded: false,
          unsafeEvidence: false,
          stdout: "",
          stderr: "",
        };
      },
    };

    await assert.rejects(
      createControlledDevOpsValidator({
        projectService: projectService(),
        preparedRepositories: [repository],
        runner,
        checkpointService: {
          async createCheckpoint() {
            throw new Error("checkpoint should not run after failed checks");
          },
        },
      }).validate(task),
      (error: unknown) =>
        error instanceof ApplicationError &&
        error.code === "INTERNAL_ERROR" &&
        error.message === "Validation failed",
    );
    assert.equal(calls, 1);

    await assert.rejects(
      createControlledDevOpsValidator({
        projectService: projectService(),
        preparedRepositories: [{ ...repository, localCheckoutPath: undefined }],
        runner,
        checkpointService: {
          async createCheckpoint() {
            throw new Error("unused");
          },
        },
      }).validate(task),
      (error: unknown) => error instanceof ApplicationError && error.code === "INTERNAL_ERROR",
    );
  });

  it("sanitizes checkpoint failures after successful validation", async () => {
    const runner: ControlledCommandRunner = {
      async run() {
        return {
          status: "PASSED",
          exitCode: 0,
          timedOut: false,
          started: true,
          outputLimitExceeded: false,
          unsafeEvidence: false,
          stdout: "",
          stderr: "",
        };
      },
    };

    await assert.rejects(
      createControlledDevOpsValidator({
        projectService: projectService(),
        preparedRepositories: [repository],
        runner,
        checkpointService: {
          async createCheckpoint() {
            throw new Error("secret failure at /Users/example/checkout");
          },
        },
      }).validate(task),
      (error: unknown) =>
        error instanceof ApplicationError &&
        error.code === "INTERNAL_ERROR" &&
        error.message === "Validation failed",
    );
  });

  it("fails closed when Developer Git evidence is missing", async () => {
    const runner: ControlledCommandRunner = {
      async run() {
        return {
          status: "PASSED",
          exitCode: 0,
          timedOut: false,
          started: true,
          outputLimitExceeded: false,
          unsafeEvidence: false,
          stdout: "",
          stderr: "",
        };
      },
    };
    const taskWithoutEvidence: TaskSnapshot = {
      ...task,
      execution: {
        ...task.execution!,
        result: {
          ...task.execution!.result,
          changeEvidence: undefined,
        },
      },
    };

    await assert.rejects(
      createControlledDevOpsValidator({
        projectService: projectService(),
        preparedRepositories: [repository],
        runner,
      }).validate(taskWithoutEvidence),
      (error: unknown) =>
        error instanceof ApplicationError &&
        error.code === "INTERNAL_ERROR" &&
        error.message === "Validation failed",
    );
  });
});

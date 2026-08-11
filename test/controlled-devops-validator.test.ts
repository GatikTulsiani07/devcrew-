import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { BrowserVerificationProfile } from "../src/browser/browser-types.js";
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

function passingRunner(): ControlledCommandRunner {
  return {
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
}

const checkpoint = {
  sha: "0123456789abcdef0123456789abcdef01234567",
  shortSha: "0123456789ab",
  message: "devcrew: implement task task_000001",
  createdAt: "2026-08-03T04:00:00.000Z",
  filesChanged: ["src/app.ts"],
};

function checkpointService() {
  return {
    async createCheckpoint() {
      return checkpoint;
    },
  };
}

function remotePushService() {
  return {
    async pushValidatedBranch() {
      return {
        remote: "origin" as const,
        branch: "devcrew/task-task_000001",
        commitSha: "0123456789abcdef0123456789abcdef01234567",
        pushedAt: "2026-08-03T04:00:00.000Z",
      };
    },
  };
}

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
        async createCheckpoint() {
          throw new Error("checkpoint should not run during visual validation");
        },
      },
      remotePushService: {
        async pushValidatedBranch() {
          throw new Error("remote push should not run during visual validation");
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
    });
  });

  it("publishes only validated visual-approved task evidence", async () => {
    const validator = createControlledDevOpsValidator({
      projectService: projectService(),
      preparedRepositories: [repository],
      runner: passingRunner(),
      checkpointService: {
        async createCheckpoint(input) {
          assert.equal(input.repositoryRoot, repository.localCheckoutPath);
          assert.equal(input.taskId, task.id);
          assert.deepEqual(input.changeEvidence, task.execution?.result.changeEvidence);
          return checkpoint;
        },
      },
      remotePushService: {
        async pushValidatedBranch(input) {
          assert.equal(input.repositoryRoot, repository.localCheckoutPath);
          assert.equal(input.taskId, task.id);
          assert.equal(input.projectRepositoryUrl, repository.publicRepositoryUrl);
          assert.equal(input.checkpoint?.sha, checkpoint.sha);
          return {
            remote: "origin",
            branch: "devcrew/task-task_000001",
            commitSha: checkpoint.sha,
            pushedAt: "2026-08-03T04:00:00.000Z",
          };
        },
      },
    });

    const published = await validator.publishValidatedTask({
      ...task,
      status: "VALIDATION_COMPLETED",
      validation: {
        id: "val_000001",
        role: "DEVOPS_ENGINEER",
        status: "PASSED",
        attempt: 1,
        startedAt: "2026-08-03T04:00:00.000Z",
        completedAt: "2026-08-03T04:01:00.000Z",
        checks: [],
        summary: "Controlled validation completed successfully.",
        visualReview: {
          status: "PASSED",
          summary: "Visible requirements passed.",
          findings: [],
          screenshotId: "shot_123e4567-e89b-42d3-a456-426614174000",
          reviewedAt: "2026-08-03T04:02:00.000Z",
        },
      },
    });

    assert.equal(published.checkpoint?.sha, checkpoint.sha);
    assert.equal(published.remoteBranch?.commitSha, checkpoint.sha);

    await assert.rejects(
      validator.publishValidatedTask({
        ...task,
        status: "VALIDATION_COMPLETED",
        validation: {
          id: "val_failed",
          role: "DEVOPS_ENGINEER",
          status: "PASSED",
          attempt: 1,
          startedAt: "2026-08-03T04:00:00.000Z",
          completedAt: "2026-08-03T04:01:00.000Z",
          checks: [],
          summary: "Controlled validation completed successfully.",
          visualReview: {
            status: "FAILED",
            summary: "Visible issues remain.",
            findings: [],
            screenshotId: "shot_123e4567-e89b-42d3-a456-426614174000",
            reviewedAt: "2026-08-03T04:02:00.000Z",
          },
        },
      }),
      (error: unknown) => error instanceof ApplicationError,
    );
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
      }).publishValidatedTask({
        ...task,
        status: "VALIDATION_COMPLETED",
        validation: {
          id: "val_000001",
          role: "DEVOPS_ENGINEER",
          status: "PASSED",
          attempt: 1,
          startedAt: "2026-08-03T04:00:00.000Z",
          completedAt: "2026-08-03T04:01:00.000Z",
          checks: [],
          summary: "Controlled validation completed successfully.",
        },
      }),
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
      }).publishValidatedTask({
        ...task,
        status: "VALIDATION_COMPLETED",
        validation: {
          id: "val_000001",
          role: "DEVOPS_ENGINEER",
          status: "PASSED",
          attempt: 1,
          startedAt: "2026-08-03T04:00:00.000Z",
          completedAt: "2026-08-03T04:01:00.000Z",
          checks: [],
          summary: "Controlled validation completed successfully.",
        },
      }),
      (error: unknown) =>
        error instanceof ApplicationError &&
        error.code === "INTERNAL_ERROR" &&
        error.message === "Validation failed",
    );
  });

  it("sanitizes remote push failures after successful checkpointing", async () => {
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
            return {
              sha: "0123456789abcdef0123456789abcdef01234567",
              shortSha: "0123456789ab",
              message: "devcrew: implement task task_000001",
              createdAt: "2026-08-03T04:00:00.000Z",
              filesChanged: ["src/app.ts"],
            };
          },
        },
        remotePushService: {
          async pushValidatedBranch() {
            throw new Error("auth token failed at https://token@example.invalid");
          },
        },
      }).publishValidatedTask({
        ...task,
        status: "VALIDATION_COMPLETED",
        validation: {
          id: "val_000001",
          role: "DEVOPS_ENGINEER",
          status: "PASSED",
          attempt: 1,
          startedAt: "2026-08-03T04:00:00.000Z",
          completedAt: "2026-08-03T04:01:00.000Z",
          checks: [],
          summary: "Controlled validation completed successfully.",
        },
      }),
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
      }).publishValidatedTask({
        ...taskWithoutEvidence,
        status: "VALIDATION_COMPLETED",
        validation: {
          id: "val_000001",
          role: "DEVOPS_ENGINEER",
          status: "PASSED",
          attempt: 1,
          startedAt: "2026-08-03T04:00:00.000Z",
          completedAt: "2026-08-03T04:01:00.000Z",
          checks: [],
          summary: "Controlled validation completed successfully.",
        },
      }),
      (error: unknown) =>
        error instanceof ApplicationError &&
        error.code === "INTERNAL_ERROR" &&
        error.message === "Validation failed",
    );
  });

  it("captures screenshot evidence after passed browser verification and stops the owned server", async () => {
    const events: string[] = [];
    const browserRepository: PreparedRepository = {
      ...repository,
      browserVerificationProfileId: "next_localhost",
    };

    const validation = await createControlledDevOpsValidator({
      projectService: projectService(),
      preparedRepositories: [browserRepository],
      runner: passingRunner(),
      checkpointService: checkpointService(),
      remotePushService: remotePushService(),
      devServer: {
        async start(input) {
          events.push(`server:${input.profileId}:${input.repositoryRoot}`);
          return {
            url: "http://127.0.0.1:43117/",
            async stop() {
              events.push("server:stop");
            },
          };
        },
      },
      browserVerifier: {
        async verify(input) {
          events.push(`verify:${input.url}`);
          assert.equal(input.profile.id, "next_localhost");
          return {
            status: "PASSED",
            url: input.url,
            verifiedAt: "2026-08-03T08:00:00.000Z",
          };
        },
      },
      screenshotCapture: {
        async capture(input) {
          events.push(`screenshot:${input.browserVerification.status}`);
          assert.equal(input.projectId, "proj_000001");
          assert.equal(input.taskId, "task_000001");
          assert.equal(input.repositoryRoot, repository.localCheckoutPath);
          assert.equal(input.existingEvidence, undefined);
          assert.equal((input.profile as BrowserVerificationProfile).id, "next_localhost");
          return {
            status: "CAPTURED",
            id: "shot_123e4567-e89b-42d3-a456-426614174000",
            url: input.browserVerification.url,
            viewport: { width: 1440, height: 900 },
            capturedAt: "2026-08-03T09:00:00.000Z",
          };
        },
      },
      visualReviewer: {
        async review(input) {
          events.push(`visual:${input.browserScreenshot?.id}`);
          assert.equal(input.browserVerification?.status, "PASSED");
          assert.equal(input.browserScreenshot?.status, "CAPTURED");
          return {
            status: "PASSED",
            summary: "No material visible issues detected.",
            findings: [],
            screenshotId: input.browserScreenshot!.id,
            reviewedAt: "2026-08-03T09:30:00.000Z",
          };
        },
      },
      generateValidationId: () => "val_000001",
      now: () => new Date("2026-08-03T10:00:00.000Z"),
    }).validate(task);

    assert.deepEqual(events, [
      "server:next_localhost:/private/tmp/devcrew-fixture",
      "verify:http://127.0.0.1:43117/",
      "screenshot:PASSED",
      "visual:shot_123e4567-e89b-42d3-a456-426614174000",
      "server:stop",
    ]);
    assert.deepEqual(validation.browserVerification, {
      status: "PASSED",
      url: "http://127.0.0.1:43117/",
      verifiedAt: "2026-08-03T08:00:00.000Z",
    });
    assert.deepEqual(validation.browserScreenshot, {
      status: "CAPTURED",
      id: "shot_123e4567-e89b-42d3-a456-426614174000",
      url: "http://127.0.0.1:43117/",
      viewport: { width: 1440, height: 900 },
      capturedAt: "2026-08-03T09:00:00.000Z",
    });
    assert.deepEqual(validation.visualReview, {
      status: "PASSED",
      summary: "No material visible issues detected.",
      findings: [],
      screenshotId: "shot_123e4567-e89b-42d3-a456-426614174000",
      reviewedAt: "2026-08-03T09:30:00.000Z",
    });
  });

  it("does not run screenshot capture when browser verification fails and still stops the server", async () => {
    const events: string[] = [];

    await assert.rejects(
      createControlledDevOpsValidator({
        projectService: projectService(),
        preparedRepositories: [
          { ...repository, browserVerificationProfileId: "next_localhost" },
        ],
        runner: passingRunner(),
        checkpointService: checkpointService(),
        remotePushService: remotePushService(),
        devServer: {
          async start() {
            return {
              url: "http://127.0.0.1:43117/",
              async stop() {
                events.push("server:stop");
              },
            };
          },
        },
        browserVerifier: {
          async verify() {
            events.push("verify");
            throw new Error("browser failed at /Users/example/repo");
          },
        },
        screenshotCapture: {
          async capture() {
            events.push("screenshot");
            throw new Error("unused");
          },
        },
      }).validate(task),
      (error: unknown) =>
        error instanceof ApplicationError &&
        error.code === "INTERNAL_ERROR" &&
        error.message === "Validation failed",
    );

    assert.deepEqual(events, ["verify", "server:stop"]);
  });

  it("sanitizes screenshot capture failures and returns no partial validation", async () => {
    await assert.rejects(
      createControlledDevOpsValidator({
        projectService: projectService(),
        preparedRepositories: [
          { ...repository, browserVerificationProfileId: "next_localhost" },
        ],
        runner: passingRunner(),
        checkpointService: checkpointService(),
        remotePushService: remotePushService(),
        devServer: {
          async start() {
            return {
              url: "http://127.0.0.1:43117/",
              async stop() {},
            };
          },
        },
        browserVerifier: {
          async verify(input) {
            return {
              status: "PASSED",
              url: input.url,
              verifiedAt: "2026-08-03T08:00:00.000Z",
            };
          },
        },
        screenshotCapture: {
          async capture() {
            throw new Error("secret token at /Users/example/screenshots");
          },
        },
      }).validate(task),
      (error: unknown) =>
        error instanceof ApplicationError &&
        error.code === "INTERNAL_ERROR" &&
        error.message === "Validation failed" &&
        !String(error).includes("/Users/"),
    );
  });

  it("sanitizes visual review failures and emits no fake visual evidence", async () => {
    const events: string[] = [];
    await assert.rejects(
      createControlledDevOpsValidator({
        projectService: projectService(),
        preparedRepositories: [
          { ...repository, browserVerificationProfileId: "next_localhost" },
        ],
        runner: passingRunner(),
        checkpointService: checkpointService(),
        remotePushService: remotePushService(),
        devServer: {
          async start() {
            return {
              url: "http://127.0.0.1:43117/",
              async stop() {
                events.push("server:stop");
              },
            };
          },
        },
        browserVerifier: {
          async verify(input) {
            return {
              status: "PASSED",
              url: input.url,
              verifiedAt: "2026-08-03T08:00:00.000Z",
            };
          },
        },
        screenshotCapture: {
          async capture(input) {
            return {
              status: "CAPTURED",
              id: "shot_123e4567-e89b-42d3-a456-426614174000",
              url: input.browserVerification.url,
              viewport: { width: 1440, height: 900 },
              capturedAt: "2026-08-03T09:00:00.000Z",
            };
          },
        },
        visualReviewer: {
          async review() {
            events.push("visual");
            throw new Error("visual provider failed sk-secret at /Users/example");
          },
        },
      }).validate(task),
      (error: unknown) =>
        error instanceof ApplicationError &&
        error.code === "INTERNAL_ERROR" &&
        error.message === "Validation failed" &&
        !String(error).includes("sk-secret") &&
        !String(error).includes("/Users/"),
    );

    assert.deepEqual(events, ["visual", "server:stop"]);
  });
});

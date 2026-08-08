import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  createActivityReadService,
  createActivityService,
} from "../src/activity/activity-service.js";
import { InMemoryActivityStore } from "../src/activity/in-memory-activity-store.js";
import { createApp } from "../src/app.js";
import type { DatabaseHealth } from "../src/db/health.js";
import { InMemoryProjectStore } from "../src/projects/in-memory-project-store.js";
import { createProjectService } from "../src/projects/project-service.js";
import type { PreparedRepository } from "../src/repositories/prepared-repositories.js";
import { createDeterministicDeveloperExecutor } from "../src/tasks/deterministic-developer-executor.js";
import { createDeterministicPlanner } from "../src/tasks/deterministic-planner.js";
import { createDeterministicReviewer } from "../src/tasks/deterministic-reviewer.js";
import { InMemoryTaskStore } from "../src/tasks/in-memory-task-store.js";
import { createTaskService } from "../src/tasks/task-service.js";
import type {
  DevOpsValidator,
  TaskPullRequestCreator,
} from "../src/tasks/types.js";

const checkpointSha = "0123456789abcdef0123456789abcdef01234567";
const branch = "devcrew/task-task_000001";
const preparedRepositories: readonly PreparedRepository[] = [
  {
    id: "prepared_devcrew_main",
    publicRepositoryUrl: "https://github.com/example/devcrew",
    defaultBranch: "main",
  },
];

function fakeDatabase(): DatabaseHealth {
  return { checkConnection: async () => undefined };
}

function createTestApp(pullRequestCreator: TaskPullRequestCreator) {
  const activityStore = new InMemoryActivityStore();
  const activityService = createActivityService({
    store: activityStore,
    generateEventId: (() => {
      let count = 0;
      return () => {
        count += 1;
        return `evt_${String(count).padStart(6, "0")}`;
      };
    })(),
    now: () => new Date("2026-08-03T12:00:00.000Z"),
  });
  const projectService = createProjectService({
    store: new InMemoryProjectStore(),
    preparedRepositories,
    activityService,
    generateProjectId: () => "proj_000001",
    generateRepositoryId: () => "repo_000001",
    now: () => new Date("2026-08-03T00:00:00.000Z"),
  });
  const devOpsValidator: DevOpsValidator = {
    async validate() {
      return {
        id: "val_000001",
        role: "DEVOPS_ENGINEER",
        status: "PASSED",
        attempt: 1,
        startedAt: "2026-08-03T03:00:00.000Z",
        completedAt: "2026-08-03T04:00:00.000Z",
        checks: [
          {
            name: "typecheck",
            status: "PASSED",
            summary: "Type checking completed successfully.",
          },
        ],
        summary: "Validation passed.",
        checkpoint: {
          sha: checkpointSha,
          shortSha: checkpointSha.slice(0, 12),
          message: "devcrew: implement task task_000001",
          createdAt: "2026-08-03T04:00:00.000Z",
          filesChanged: ["src/app.ts"],
        },
        remoteBranch: {
          remote: "origin",
          branch,
          commitSha: checkpointSha,
          pushedAt: "2026-08-03T04:01:00.000Z",
        },
      };
    },
  };
  const taskService = createTaskService({
    projectService,
    planner: createDeterministicPlanner(),
    developerExecutor: createDeterministicDeveloperExecutor({
      generateExecutionId: () => "exec_000001",
      now: () => new Date("2026-08-03T02:00:00.000Z"),
    }),
    devOpsValidator,
    taskReviewer: createDeterministicReviewer({
      generateReviewId: () => "review_000001",
      now: () => new Date("2026-08-03T05:00:00.000Z"),
    }),
    pullRequestCreator,
    store: new InMemoryTaskStore(),
    generateTaskId: () => "task_000001",
    now: () => new Date("2026-08-03T06:00:00.000Z"),
    activityService,
  });

  const app = createApp({
    databaseHealth: fakeDatabase(),
    generateRequestId: () => "req_pull_request_test",
    projectService,
    taskService,
    activityService,
    activityReadService: createActivityReadService({
      projectService,
      activityService,
    }),
  });

  return app;
}

async function reachReviewCompleted(app: ReturnType<typeof createTestApp>) {
  assert.equal(
    (
      await app.request("/api/v1/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "Devcrew",
          publicRepositoryUrl: "https://github.com/example/devcrew",
          preparedRepositoryId: "prepared_devcrew_main",
        }),
      })
    ).status,
    201,
  );
  assert.equal(
    (
      await app.request("/api/v1/projects/proj_000001/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: "Implement reports",
          description: "Add the reports endpoint.",
        }),
      })
    ).status,
    201,
  );
  assert.equal(
    (
      await app.request(
        "/api/v1/projects/proj_000001/tasks/task_000001/plan-decision",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ decision: "APPROVE" }),
        },
      )
    ).status,
    200,
  );
  assert.equal(
    (
      await app.request("/api/v1/projects/proj_000001/tasks/task_000001/execute", {
        method: "POST",
      })
    ).status,
    200,
  );
  assert.equal(
    (
      await app.request("/api/v1/projects/proj_000001/tasks/task_000001/validate", {
        method: "POST",
      })
    ).status,
    200,
  );
  assert.equal(
    (
      await app.request("/api/v1/projects/proj_000001/tasks/task_000001/review", {
        method: "POST",
      })
    ).status,
    200,
  );
}

describe("pull request task route", () => {
  it("persists PR evidence and appends the success event once", async () => {
    let callCount = 0;
    const app = createTestApp({
      async createPullRequest() {
        callCount += 1;
        return {
          created: true,
          evidence: {
            number: 42,
            url: "https://github.com/example/devcrew/pull/42",
            state: "OPEN",
            headBranch: branch,
            baseBranch: "main",
            commitSha: checkpointSha,
            createdAt: "2026-08-03T07:00:00.000Z",
          },
        };
      },
    });
    await reachReviewCompleted(app);

    const created = await app.request(
      "/api/v1/projects/proj_000001/tasks/task_000001/pull-request",
      { method: "POST" },
    );
    const retried = await app.request(
      "/api/v1/projects/proj_000001/tasks/task_000001/pull-request",
      { method: "POST" },
    );
    const activity = await app.request("/api/v1/projects/proj_000001/activity");

    assert.equal(created.status, 200);
    assert.equal(created.headers.get("X-Request-Id"), "req_pull_request_test");
    assert.deepEqual((await created.json()).task.pullRequest, {
      number: 42,
      url: "https://github.com/example/devcrew/pull/42",
      state: "OPEN",
      headBranch: branch,
      baseBranch: "main",
      commitSha: checkpointSha,
      createdAt: "2026-08-03T07:00:00.000Z",
    });
    assert.equal(retried.status, 200);
    assert.equal(callCount, 2);
    assert.equal(
      ((await activity.json()).events as Array<{ type: string }>).filter(
        (event) => event.type === "PULL_REQUEST_CREATED",
      ).length,
      1,
    );
  });

  it("rejects browser-controlled title, body, repository, and refs", async () => {
    const app = createTestApp({
      async createPullRequest() {
        throw new Error("should not be called");
      },
    });
    await reachReviewCompleted(app);

    const response = await app.request(
      "/api/v1/projects/proj_000001/tasks/task_000001/pull-request",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: "Browser title",
          body: "Browser body",
          owner: "attacker",
          repo: "repo",
          head: "main",
          base: "devcrew/task-task_000001",
        }),
      },
    );

    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), {
      requestId: "req_pull_request_test",
      status: "error",
      error: {
        code: "VALIDATION_FAILED",
        message: "Request validation failed",
      },
    });
  });

  it("returns a sanitized error and emits no event when PR creation fails", async () => {
    const app = createTestApp({
      async createPullRequest() {
        throw new Error("SENSITIVE_GITHUB_TOKEN_FAILURE");
      },
    });
    await reachReviewCompleted(app);

    const response = await app.request(
      "/api/v1/projects/proj_000001/tasks/task_000001/pull-request",
      { method: "POST" },
    );
    const body = await response.text();
    const activity = await app.request("/api/v1/projects/proj_000001/activity");

    assert.equal(response.status, 500);
    assert.equal(body.includes("SENSITIVE_GITHUB_TOKEN_FAILURE"), false);
    assert.equal(JSON.parse(body).error.code, "INTERNAL_ERROR");
    assert.equal(
      ((await activity.json()).events as Array<{ type: string }>).some(
        (event) => event.type === "PULL_REQUEST_CREATED",
      ),
      false,
    );
  });
});

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

function refreshPullRequest(app: ReturnType<typeof createTestApp>, init: RequestInit = {}) {
  return app.request(
    "/api/v1/projects/proj_000001/tasks/task_000001/pull-request/refresh",
    {
      method: "POST",
      ...init,
    },
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
      durationMs: 0,
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

  it("refreshes existing PR evidence and persists it for later reads", async () => {
    let createCalls = 0;
    let refreshCalls = 0;
    const app = createTestApp({
      async createPullRequest() {
        createCalls += 1;
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
      async refreshPullRequest(input) {
        refreshCalls += 1;
        return {
          ...input.task.pullRequest!,
          state: "MERGED",
        };
      },
    });
    await reachReviewCompleted(app);
    assert.equal(
      (
        await app.request(
          "/api/v1/projects/proj_000001/tasks/task_000001/pull-request",
          { method: "POST" },
        )
      ).status,
      200,
    );

    const refreshed = await refreshPullRequest(app);
    const read = await app.request(
      "/api/v1/projects/proj_000001/tasks/task_000001",
    );

    assert.equal(refreshed.status, 200);
    assert.equal((await refreshed.json()).task.pullRequest.state, "MERGED");
    assert.equal((await read.json()).task.pullRequest.state, "MERGED");
    assert.equal(createCalls, 1);
    assert.equal(refreshCalls, 1);
  });

  it("strictly rejects client-supplied refresh identity fields", async () => {
    const app = createTestApp({
      async createPullRequest() {
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
      async refreshPullRequest() {
        throw new Error("refresh should not be called");
      },
    });
    await reachReviewCompleted(app);
    assert.equal(
      (
        await app.request(
          "/api/v1/projects/proj_000001/tasks/task_000001/pull-request",
          { method: "POST" },
        )
      ).status,
      200,
    );

    const response = await refreshPullRequest(app, {
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        number: 99,
        owner: "attacker",
        repo: "repo",
        url: "https://github.com/attacker/repo/pull/99",
      }),
    });

    assert.equal(response.status, 400);
    assert.equal((await response.json()).error.code, "VALIDATION_FAILED");
  });

  it("fails safely when refresh runs before PR evidence exists", async () => {
    const app = createTestApp({
      async createPullRequest() {
        throw new Error("create should not be called");
      },
      async refreshPullRequest() {
        throw new Error("refresh should not be called");
      },
    });
    await reachReviewCompleted(app);

    const response = await refreshPullRequest(app);

    assert.equal(response.status, 409);
    assert.equal(
      (await response.json()).error.message,
      "Task pull request has not been created",
    );
  });

  it("uses the execution lock for concurrent refresh while reads remain available", async () => {
    const started = deferred<void>();
    const finish = deferred<void>();
    const app = createTestApp({
      async createPullRequest() {
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
      async refreshPullRequest(input) {
        started.resolve();
        await finish.promise;
        return { ...input.task.pullRequest!, state: "CLOSED" };
      },
    });
    await reachReviewCompleted(app);
    assert.equal(
      (
        await app.request(
          "/api/v1/projects/proj_000001/tasks/task_000001/pull-request",
          { method: "POST" },
        )
      ).status,
      200,
    );

    const first = refreshPullRequest(app);
    await started.promise;
    const second = await refreshPullRequest(app);
    const taskRead = await app.request(
      "/api/v1/projects/proj_000001/tasks/task_000001",
    );
    const activityRead = await app.request("/api/v1/projects/proj_000001/activity");

    assert.equal(second.status, 409);
    assert.equal(
      (await second.json()).error.code,
      "TASK_EXECUTION_IN_PROGRESS",
    );
    assert.equal(taskRead.status, 200);
    assert.equal(activityRead.status, 200);

    finish.resolve();
    assert.equal((await first).status, 200);
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
    const task = await app.request(
      "/api/v1/projects/proj_000001/tasks/task_000001",
    );
    const activity = await app.request("/api/v1/projects/proj_000001/activity");

    assert.equal(response.status, 500);
    assert.equal(body.includes("SENSITIVE_GITHUB_TOKEN_FAILURE"), false);
    assert.equal(JSON.parse(body).error.code, "INTERNAL_ERROR");
    const taskBody = await task.json();
    assert.equal(taskBody.task.workflowFailure.stage, "GITHUB_PULL_REQUEST");
    assert.equal(taskBody.task.workflowFailure.category, "UNKNOWN_FAILURE");
    assert.equal(
      ((await activity.json()).events as Array<{ type: string }>).some(
        (event) => event.type === "PULL_REQUEST_CREATED",
      ),
      false,
    );
  });

  it("records workflowFailure when PR refresh fails", async () => {
    const app = createTestApp({
      async createPullRequest() {
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
      async refreshPullRequest() {
        throw new Error(
          "SENSITIVE_REFRESH_FAILURE /Users/suniltulsiani/Desktop/devcrew-backend",
        );
      },
    });
    await reachReviewCompleted(app);
    assert.equal(
      (
        await app.request(
          "/api/v1/projects/proj_000001/tasks/task_000001/pull-request",
          { method: "POST" },
        )
      ).status,
      200,
    );

    const response = await refreshPullRequest(app);
    const body = await response.text();
    const task = await (
      await app.request("/api/v1/projects/proj_000001/tasks/task_000001")
    ).json();

    assert.equal(response.status, 500);
    assert.equal(body.includes("SENSITIVE_REFRESH_FAILURE"), false);
    assert.equal(task.task.workflowFailure.stage, "GITHUB_PULL_REQUEST_REFRESH");
    assert.equal(task.task.workflowFailure.category, "UNKNOWN_FAILURE");
    assert.equal(
      task.task.workflowFailure.summary.includes("/Users/suniltulsiani"),
      false,
    );
  });
});

interface Deferred<T> {
  promise: Promise<T>;
  resolve(value: T | PromiseLike<T>): void;
  reject(reason?: unknown): void;
}

function deferred<T = void>(): Deferred<T> {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });

  return { promise, resolve, reject };
}

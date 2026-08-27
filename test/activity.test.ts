import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  createActivityReadService,
  createActivityService,
  type ActivityService,
} from "../src/activity/activity-service.js";
import { InMemoryActivityStore } from "../src/activity/in-memory-activity-store.js";
import type { ActivityEvent } from "../src/activity/types.js";
import { createApp } from "../src/app.js";
import type { DatabaseHealth } from "../src/db/health.js";
import { InMemoryProjectStore } from "../src/projects/in-memory-project-store.js";
import {
  createProjectService,
  type ProjectService,
} from "../src/projects/project-service.js";
import { createRetryStageFailure } from "../src/orchestration/retry-orchestrator.js";
import type { PreparedRepository } from "../src/repositories/prepared-repositories.js";
import { createDeterministicDeveloperExecutor } from "../src/tasks/deterministic-developer-executor.js";
import { createDeterministicDevOpsValidator } from "../src/tasks/deterministic-devops-validator.js";
import { createDeterministicPlanner } from "../src/tasks/deterministic-planner.js";
import { createDeterministicReviewer } from "../src/tasks/deterministic-reviewer.js";
import { InMemoryTaskStore } from "../src/tasks/in-memory-task-store.js";
import { createTaskService } from "../src/tasks/task-service.js";
import type {
  DeveloperExecutor,
  DevOpsValidator,
  TaskReview,
  TaskReviewer,
} from "../src/tasks/types.js";

const preparedRepositories: readonly PreparedRepository[] = [
  {
    id: "prepared_devcrew_main",
    publicRepositoryUrl: "https://github.com/example/devcrew",
  },
  {
    id: "prepared_other",
    publicRepositoryUrl: "https://github.com/example/other",
  },
];

function fakeDatabase(): DatabaseHealth {
  return { checkConnection: async () => undefined };
}

function fixedRequestId(): string {
  return "req_activity_test";
}

function createDeterministicActivityService(
  store = new InMemoryActivityStore(),
): ActivityService {
  let eventCount = 0;
  let dateCount = 0;

  return createActivityService({
    store,
    generateEventId: () => {
      eventCount += 1;
      return `evt_${String(eventCount).padStart(6, "0")}`;
    },
    now: () => {
      dateCount += 1;
      return new Date(`2026-08-03T12:${String(dateCount).padStart(2, "0")}:00.000Z`);
    },
  });
}

function createDeterministicProjectService(
  activityService: ActivityService,
): ProjectService {
  let projectCount = 0;
  let repositoryCount = 0;

  return createProjectService({
    store: new InMemoryProjectStore(),
    preparedRepositories,
    activityService,
    generateProjectId: () => {
      projectCount += 1;
      return `proj_${String(projectCount).padStart(6, "0")}`;
    },
    generateRepositoryId: () => {
      repositoryCount += 1;
      return `repo_${String(repositoryCount).padStart(6, "0")}`;
    },
    now: () => new Date("2026-08-03T00:00:00.000Z"),
  });
}

function createTestApp({
  developerExecutor,
  devOpsValidator,
  taskReviewer,
}: {
  developerExecutor?: DeveloperExecutor;
  devOpsValidator?: DevOpsValidator;
  taskReviewer?: TaskReviewer;
} = {}) {
  const store = new InMemoryActivityStore();
  const activityService = createDeterministicActivityService(store);
  const projectService = createDeterministicProjectService(activityService);
  let taskCount = 0;

  const taskService = createTaskService({
    projectService,
    planner: createDeterministicPlanner(),
    developerExecutor:
      developerExecutor ??
      createDeterministicDeveloperExecutor({
        generateExecutionId: () => "exec_000001",
        now: () => new Date("2026-08-03T03:00:00.000Z"),
      }),
    devOpsValidator:
      devOpsValidator ??
      createDeterministicDevOpsValidator({
        generateValidationId: () => "val_000001",
        now: () => new Date("2026-08-03T04:00:00.000Z"),
      }),
    taskReviewer:
      taskReviewer ??
      createDeterministicReviewer({
        generateReviewId: () => "review_000001",
        now: () => new Date("2026-08-03T05:00:00.000Z"),
      }),
    store: new InMemoryTaskStore(),
    activityService,
    generateTaskId: () => {
      taskCount += 1;
      return `task_${String(taskCount).padStart(6, "0")}`;
    },
    now: () => new Date("2026-08-03T01:00:00.000Z"),
  });

  const app = createApp({
    databaseHealth: fakeDatabase(),
    generateRequestId: fixedRequestId,
    projectService,
    taskService,
    activityService,
    activityReadService: createActivityReadService({
      projectService,
      activityService,
    }),
    activityHeartbeatIntervalMs: 60_000,
  });

  return { app, activityService };
}

async function createProject(
  app: ReturnType<typeof createTestApp>["app"],
  overrides: {
    name?: string;
    publicRepositoryUrl?: string;
    preparedRepositoryId?: string;
  } = {},
) {
  return app.request("/api/v1/projects", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: overrides.name ?? "Devcrew",
      publicRepositoryUrl:
        overrides.publicRepositoryUrl ?? "https://github.com/example/devcrew",
      preparedRepositoryId:
        overrides.preparedRepositoryId ?? "prepared_devcrew_main",
    }),
  });
}

async function createTask(app: ReturnType<typeof createTestApp>["app"]) {
  return app.request("/api/v1/projects/proj_000001/tasks", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      title: "Implement authentication middleware",
      description: "Protect every API route with JWT middleware.",
    }),
  });
}

async function approvePlan(app: ReturnType<typeof createTestApp>["app"]) {
  return app.request(
    "/api/v1/projects/proj_000001/tasks/task_000001/plan-decision",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ decision: "APPROVE" }),
    },
  );
}

async function rejectPlan(app: ReturnType<typeof createTestApp>["app"]) {
  return app.request(
    "/api/v1/projects/proj_000001/tasks/task_000001/plan-decision",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ decision: "REJECT", reason: "Needs revision." }),
    },
  );
}

async function executeTask(app: ReturnType<typeof createTestApp>["app"]) {
  return app.request("/api/v1/projects/proj_000001/tasks/task_000001/execute", {
    method: "POST",
  });
}

async function validateTask(app: ReturnType<typeof createTestApp>["app"]) {
  return app.request("/api/v1/projects/proj_000001/tasks/task_000001/validate", {
    method: "POST",
  });
}

async function reviewTask(app: ReturnType<typeof createTestApp>["app"]) {
  return app.request("/api/v1/projects/proj_000001/tasks/task_000001/review", {
    method: "POST",
  });
}

async function retryTask(app: ReturnType<typeof createTestApp>["app"]) {
  return app.request("/api/v1/projects/proj_000001/tasks/task_000001/retry", {
    method: "POST",
    body: JSON.stringify({}),
    headers: { "Content-Type": "application/json" },
  });
}

async function activitySnapshot(
  app: ReturnType<typeof createTestApp>["app"],
  path = "/api/v1/projects/proj_000001/activity",
) {
  const response = await app.request(path);
  assert.equal(response.status, 200);
  return (await response.json()) as {
    events: ActivityEvent[];
    lastSequence: number;
  };
}

function activityEvent(overrides: Partial<ActivityEvent> = {}): ActivityEvent {
  return {
    id: "evt_000001",
    sequence: 1,
    projectId: "proj_000001",
    taskId: "task_000001",
    workflowCorrelationId: "workflow_original",
    type: "TASK_CREATED",
    actor: { kind: "HUMAN" },
    summary: "Original event",
    createdAt: "2026-08-03T12:01:00.000Z",
    ...overrides,
  };
}

describe("in-memory activity store", () => {
  it("inserts a first activity event normally", async () => {
    const store = new InMemoryActivityStore();
    const event = activityEvent();

    assert.deepEqual(await store.append(event), event);
    assert.deepEqual(await store.list("proj_000001"), {
      events: [event],
      lastSequence: 1,
    });
  });

  it("rejects invalid numeric sequences without changing activity state", async () => {
    const store = new InMemoryActivityStore();
    const first = activityEvent();
    await store.append(first);
    const before = await store.list("proj_000001");

    for (const sequence of [-1, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, 1.5]) {
      await assert.rejects(
        () => store.append(activityEvent({ id: `evt_${sequence}`, sequence })),
        {
          name: "ApplicationError",
          code: "INVALID_ACTIVITY_SEQUENCE",
          status: 500,
          message: "Invalid Activity sequence.",
        },
      );
      assert.deepEqual(await store.list("proj_000001"), before);
    }
  });

  it("rejects stale and skipped sequences without consuming the next sequence", async () => {
    const store = new InMemoryActivityStore();
    await store.append(activityEvent());
    const before = await store.list("proj_000001");

    for (const sequence of [1, 3]) {
      await assert.rejects(
        () => store.append(activityEvent({ id: `evt_${sequence}`, sequence })),
        { code: "INVALID_ACTIVITY_SEQUENCE" },
      );
      assert.deepEqual(await store.list("proj_000001"), before);
    }

    const next = activityEvent({ id: "evt_000002", sequence: 2 });
    assert.deepEqual(await store.append(next), next);
    assert.deepEqual((await store.list("proj_000001")).events, [
      activityEvent(),
      next,
    ]);
  });

  it("rejects duplicate authoritative event IDs without changing original evidence", async () => {
    const store = new InMemoryActivityStore();
    const original = activityEvent();
    const duplicate = activityEvent({
      id: original.id,
      sequence: 2,
      type: "VALIDATION_COMPLETED",
      summary: "Replacement event",
      workflowCorrelationId: "workflow_replacement",
      createdAt: "2026-08-03T12:02:00.000Z",
    });

    await store.append(original);

    await assert.rejects(
      () => store.append(duplicate),
      {
        name: "ApplicationError",
        code: "ACTIVITY_EVENT_ALREADY_EXISTS",
        status: 409,
        message: "Activity event already exists.",
      },
    );

    assert.deepEqual(await store.list("proj_000001"), {
      events: [original],
      lastSequence: 1,
    });
  });

  it("allows matching content when authoritative event IDs differ", async () => {
    const store = new InMemoryActivityStore();
    const first = activityEvent({
      id: "evt_000001",
      sequence: 1,
      workflowCorrelationId: "workflow_shared",
      type: "TASK_CREATED",
      summary: "Same activity content",
    });
    const second = activityEvent({
      id: "evt_000002",
      sequence: 2,
      workflowCorrelationId: "workflow_shared",
      type: "TASK_CREATED",
      summary: "Same activity content",
    });

    await store.append(first);
    await store.append(second);

    const snapshot = await store.list("proj_000001");
    assert.deepEqual(snapshot.events, [first, second]);
    assert.equal(snapshot.lastSequence, 2);
  });

  it("preserves ordering and read cursors after rejecting a duplicate", async () => {
    const store = new InMemoryActivityStore();
    const first = activityEvent({ id: "evt_000001", sequence: 1 });
    const second = activityEvent({
      id: "evt_000002",
      sequence: 2,
      summary: "Second event",
    });

    await store.append(first);
    await store.append(second);
    await assert.rejects(() =>
      store.append(
        activityEvent({
          id: first.id,
          sequence: 3,
          type: "REVIEW_COMPLETED",
          summary: "Rejected duplicate",
        }),
      ),
    );

    assert.deepEqual(
      (await store.list("proj_000001")).events.map((event) => event.id),
      ["evt_000001", "evt_000002"],
    );
    assert.deepEqual(await store.list("proj_000001", 1), {
      events: [second],
      lastSequence: 2,
    });
  });
});

describe("activity API", () => {
  it("appends ordered activity events for the successful workflow", async () => {
    const { app } = createTestApp();

    assert.equal((await createProject(app)).status, 201);
    assert.equal((await createTask(app)).status, 201);
    assert.equal((await approvePlan(app)).status, 200);
    assert.equal((await executeTask(app)).status, 200);
    assert.equal((await validateTask(app)).status, 200);
    assert.equal((await reviewTask(app)).status, 200);

    const snapshot = await activitySnapshot(app);

    assert.deepEqual(
      snapshot.events.map((event) => event.type),
      [
        "PROJECT_CREATED",
        "TASK_CREATED",
        "PLAN_CREATED",
        "PLAN_APPROVED",
        "IMPLEMENTATION_COMPLETED",
        "VALIDATION_COMPLETED",
        "REVIEW_COMPLETED",
      ],
    );
    assert.deepEqual(
      snapshot.events.map((event) => event.sequence),
      [1, 2, 3, 4, 5, 6, 7],
    );
    assert.deepEqual(
      snapshot.events.map((event) => event.id),
      [
        "evt_000001",
        "evt_000002",
        "evt_000003",
        "evt_000004",
        "evt_000005",
        "evt_000006",
        "evt_000007",
      ],
    );
    assert.equal(snapshot.events[2].actor.kind, "AGENT");
    assert.deepEqual(snapshot.events[2].actor, {
      kind: "AGENT",
      role: "MANAGER",
    });
    assert.equal(snapshot.events[0].createdAt, "2026-08-03T12:01:00.000Z");
    assert.equal(snapshot.lastSequence, 7);
  });

  it("appends PLAN_REJECTED for rejected plans", async () => {
    const { app } = createTestApp();

    assert.equal((await createProject(app)).status, 201);
    assert.equal((await createTask(app)).status, 201);
    assert.equal((await rejectPlan(app)).status, 200);

    const snapshot = await activitySnapshot(app);
    assert.equal(snapshot.events.at(-1)?.type, "PLAN_REJECTED");
  });

  it("returns snapshots in ascending order and supports after cursors", async () => {
    const { app } = createTestApp();
    assert.equal((await createProject(app)).status, 201);
    assert.equal((await createTask(app)).status, 201);
    assert.equal((await approvePlan(app)).status, 200);

    const snapshot = await activitySnapshot(
      app,
      "/api/v1/projects/proj_000001/activity?after=2",
    );

    assert.deepEqual(
      snapshot.events.map((event) => event.sequence),
      [3, 4],
    );
    assert.equal(snapshot.lastSequence, 4);
  });

  it("rejects invalid activity cursors with request ids", async () => {
    const { app } = createTestApp();
    assert.equal((await createProject(app)).status, 201);

    const response = await app.request(
      "/api/v1/projects/proj_000001/activity?after=-1",
      { headers: { "X-Request-Id": "req_bad_after" } },
    );

    assert.equal(response.status, 400);
    assert.equal(response.headers.get("X-Request-Id"), "req_bad_after");
    assert.deepEqual(await response.json(), {
      requestId: "req_bad_after",
      status: "error",
      error: {
        code: "VALIDATION_FAILED",
        message: "Request validation failed",
      },
    });
  });

  it("returns project not found for unknown activity projects", async () => {
    const { app } = createTestApp();

    const response = await app.request(
      "/api/v1/projects/proj_missing/activity",
    );

    assert.equal(response.status, 404);
    assert.equal((await response.json()).error.code, "PROJECT_NOT_FOUND");
  });

  it("isolates activity between projects", async () => {
    const { app } = createTestApp();
    assert.equal((await createProject(app)).status, 201);
    assert.equal(
      (
        await createProject(app, {
          name: "Other",
          publicRepositoryUrl: "https://github.com/example/other",
          preparedRepositoryId: "prepared_other",
        })
      ).status,
      201,
    );
    assert.equal((await createTask(app)).status, 201);

    const first = await activitySnapshot(app);
    const second = await activitySnapshot(
      app,
      "/api/v1/projects/proj_000002/activity",
    );

    assert.deepEqual(
      first.events.map((event) => event.projectId),
      ["proj_000001", "proj_000001", "proj_000001"],
    );
    assert.deepEqual(
      second.events.map((event) => event.projectId),
      ["proj_000002"],
    );
  });

  it("evicts bounded history while preserving monotonic sequences", async () => {
    const store = new InMemoryActivityStore({ maxEventsPerProject: 3 });
    const service = createDeterministicActivityService(store);

    for (let index = 0; index < 5; index += 1) {
      await service.append({
        projectId: "proj_000001",
        type: "PROJECT_CREATED",
        actor: { kind: "HUMAN" },
        summary: `Event ${index}`,
      });
    }

    const snapshot = await service.list("proj_000001");
    assert.deepEqual(
      snapshot.events.map((event) => event.sequence),
      [3, 4, 5],
    );
    assert.equal(snapshot.lastSequence, 5);

    const next = await service.append({
      projectId: "proj_000001",
      type: "PROJECT_CREATED",
      actor: { kind: "HUMAN" },
      summary: "Event 5",
    });
    assert.equal(next.sequence, 6);
  });

  it("does not append activity for failed workflow requests", async () => {
    const { app } = createTestApp();
    assert.equal((await createProject(app)).status, 201);
    const before = await activitySnapshot(app);

    const failed = await app.request("/api/v1/projects/proj_missing/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: "Missing project task",
        description: "This should fail.",
      }),
    });
    const after = await activitySnapshot(app);

    assert.equal(failed.status, 404);
    assert.deepEqual(after, before);
  });

  it("does not append IMPLEMENTATION_COMPLETED when developer execution fails", async () => {
    const developerExecutor: DeveloperExecutor = {
      async execute() {
        throw new Error("SENSITIVE_DEVELOPER_FAILURE");
      },
    };
    const { app } = createTestApp({ developerExecutor });

    assert.equal((await createProject(app)).status, 201);
    assert.equal((await createTask(app)).status, 201);
    assert.equal((await approvePlan(app)).status, 200);

    const response = await executeTask(app);
    const snapshot = await activitySnapshot(app);

    assert.equal(response.status, 500);
    assert.deepEqual(
      snapshot.events.map((event) => event.type),
      ["PROJECT_CREATED", "TASK_CREATED", "PLAN_CREATED", "PLAN_APPROVED"],
    );
  });

  it("does not append REVIEW_COMPLETED when reviewer execution fails", async () => {
    const taskReviewer: TaskReviewer = {
      async review() {
        throw new Error("SENSITIVE_REVIEWER_FAILURE");
      },
    };
    const { app } = createTestApp({ taskReviewer });

    assert.equal((await createProject(app)).status, 201);
    assert.equal((await createTask(app)).status, 201);
    assert.equal((await approvePlan(app)).status, 200);
    assert.equal((await executeTask(app)).status, 200);
    assert.equal((await validateTask(app)).status, 200);

    const response = await reviewTask(app);
    const snapshot = await activitySnapshot(app);
    const taskResponse = await app.request(
      "/api/v1/projects/proj_000001/tasks/task_000001",
    );

    assert.equal(response.status, 500);
    assert.deepEqual(
      snapshot.events.map((event) => event.type),
      [
        "PROJECT_CREATED",
        "TASK_CREATED",
        "PLAN_CREATED",
        "PLAN_APPROVED",
        "IMPLEMENTATION_COMPLETED",
        "VALIDATION_COMPLETED",
      ],
    );
    assert.equal((await taskResponse.json()).task.status, "VALIDATION_COMPLETED");
  });

  it("appends retry lifecycle events once for controlled retry success", async () => {
    let calls = 0;
    const taskReviewer: TaskReviewer = {
      async review(): Promise<TaskReview> {
        calls += 1;
        if (calls === 1) {
          throw createRetryStageFailure("REVIEWER", "PROVIDER_TIMEOUT", true);
        }

        return {
          id: "review_retry",
          role: "REVIEWER",
          status: "COMPLETED",
          verdict: "APPROVED",
          attempt: 1,
          startedAt: "2026-08-03T05:00:00.000Z",
          completedAt: "2026-08-03T05:01:00.000Z",
          summary: "Review recovered after retry.",
          findings: [
            {
              severity: "INFO",
              title: "Recovered",
              description: "Reviewer provider retry succeeded.",
            },
          ],
        };
      },
    };
    const { app } = createTestApp({ taskReviewer });

    assert.equal((await createProject(app)).status, 201);
    assert.equal((await createTask(app)).status, 201);
    assert.equal((await approvePlan(app)).status, 200);
    assert.equal((await executeTask(app)).status, 200);
    assert.equal((await validateTask(app)).status, 200);
    assert.equal((await reviewTask(app)).status, 500);
    assert.equal((await retryTask(app)).status, 200);
    assert.equal((await retryTask(app)).status, 409);

    const snapshot = await activitySnapshot(app);
    assert.deepEqual(
      snapshot.events
        .filter((event) => event.type.startsWith("RETRY_"))
        .map((event) => event.type),
      ["RETRY_STARTED", "RETRY_COMPLETED"],
    );
    assert.equal(
      snapshot.events.some((event) => event.type === "RETRY_EXHAUSTED"),
      false,
    );
    assert.equal(calls, 2);
  });

  it("appends SCREENSHOT_CAPTURED once when validation includes screenshot evidence", async () => {
    const devOpsValidator: DevOpsValidator = {
      async validate() {
        return {
          id: "val_screenshot",
          role: "DEVOPS_ENGINEER",
          status: "PASSED",
          attempt: 1,
          startedAt: "2026-08-03T04:00:00.000Z",
          completedAt: "2026-08-03T04:00:00.000Z",
          checks: [
            {
              name: "typecheck",
              status: "PASSED",
              summary: "Type checking completed successfully.",
            },
            {
              name: "tests",
              status: "PASSED",
              summary: "Automated tests completed successfully.",
            },
            {
              name: "build",
              status: "PASSED",
              summary: "Production build completed successfully.",
            },
          ],
          summary: "Controlled validation completed successfully.",
          browserVerification: {
            status: "PASSED",
            url: "http://127.0.0.1:43117/",
            verifiedAt: "2026-08-03T04:00:00.000Z",
          },
          browserScreenshot: {
            status: "CAPTURED",
            id: "shot_123e4567-e89b-42d3-a456-426614174000",
            url: "http://127.0.0.1:43117/",
            viewport: { width: 1440, height: 900 },
            capturedAt: "2026-08-03T04:00:00.000Z",
          },
        };
      },
    };
    const { app } = createTestApp({ devOpsValidator });

    assert.equal((await createProject(app)).status, 201);
    assert.equal((await createTask(app)).status, 201);
    assert.equal((await approvePlan(app)).status, 200);
    assert.equal((await executeTask(app)).status, 200);
    assert.equal((await validateTask(app)).status, 200);

    const snapshot = await activitySnapshot(app);

    assert.deepEqual(
      snapshot.events.map((event) => event.type),
      [
        "PROJECT_CREATED",
        "TASK_CREATED",
        "PLAN_CREATED",
        "PLAN_APPROVED",
        "IMPLEMENTATION_COMPLETED",
        "VALIDATION_COMPLETED",
        "BROWSER_VERIFICATION_COMPLETED",
        "SCREENSHOT_CAPTURED",
      ],
    );
    assert.equal(
      snapshot.events.filter((event) => event.type === "SCREENSHOT_CAPTURED").length,
      1,
    );
    const lastEvent = snapshot.events.at(-1);
    assert.match(lastEvent?.workflowCorrelationId ?? "", /^[0-9a-f-]{36}$/);
    assert.deepEqual(
      {
        ...lastEvent,
        workflowCorrelationId: undefined,
      },
      {
      id: "evt_000008",
      sequence: 8,
      projectId: "proj_000001",
      taskId: "task_000001",
      type: "SCREENSHOT_CAPTURED",
      actor: { kind: "SYSTEM" },
      summary: "Frontend screenshot captured.",
      createdAt: "2026-08-03T12:08:00.000Z",
      workflowCorrelationId: undefined,
    });
    assert.equal(JSON.stringify(snapshot).includes("/private/tmp"), false);
    assert.equal(JSON.stringify(snapshot).includes("shot_123e4567"), false);
  });

  it("appends VISUAL_REVIEW_COMPLETED for passed and failed visual verdicts", async () => {
    for (const status of ["PASSED", "FAILED"] as const) {
      let validationCount = 0;
      const devOpsValidator: DevOpsValidator = {
        async validate() {
          validationCount += 1;
          const repaired = status === "FAILED" && validationCount > 1;
          const visualStatus = repaired ? "PASSED" : status;
          const screenshotId = repaired
            ? "shot_123e4567-e89b-42d3-a456-426614174001"
            : "shot_123e4567-e89b-42d3-a456-426614174000";
          return {
            id: `val_visual_${status.toLowerCase()}_${validationCount}`,
            role: "DEVOPS_ENGINEER",
            status: "PASSED",
            attempt: 1,
            startedAt: "2026-08-03T04:00:00.000Z",
            completedAt: "2026-08-03T04:00:00.000Z",
            checks: [
              {
                name: "typecheck",
                status: "PASSED",
                summary: "Type checking completed successfully.",
              },
              {
                name: "tests",
                status: "PASSED",
                summary: "Automated tests completed successfully.",
              },
              {
                name: "build",
                status: "PASSED",
                summary: "Production build completed successfully.",
              },
            ],
            summary: "Controlled validation completed successfully.",
            browserVerification: {
              status: "PASSED",
              url: "http://127.0.0.1:43117/",
              verifiedAt: "2026-08-03T04:00:00.000Z",
            },
            browserScreenshot: {
              status: "CAPTURED",
              id: screenshotId,
              url: "http://127.0.0.1:43117/",
              viewport: { width: 1440, height: 900 },
              capturedAt: "2026-08-03T04:00:00.000Z",
            },
            visualReview: {
              status: visualStatus,
              summary:
                visualStatus === "PASSED"
                  ? "Visible requirements look satisfied."
                  : "A visible issue remains.",
              findings:
                visualStatus === "PASSED"
                  ? []
                  : [
                      {
                        severity: "ERROR",
                        category: "layout",
                        title: "Overlap",
                        description: "Visible content overlaps.",
                      },
                    ],
              screenshotId,
              reviewedAt: "2026-08-03T04:00:00.000Z",
            },
          };
        },
      };
      const { app } = createTestApp({ devOpsValidator });

      assert.equal((await createProject(app)).status, 201);
      assert.equal((await createTask(app)).status, 201);
      assert.equal((await approvePlan(app)).status, 200);
      assert.equal((await executeTask(app)).status, 200);
      assert.equal((await validateTask(app)).status, 200);

      const snapshot = await activitySnapshot(app);
      const visualEvent = snapshot.events.at(-1);
      assert.equal(visualEvent?.type, "VISUAL_REVIEW_COMPLETED");
      assert.equal(visualEvent?.summary, "Visual review passed.");
      assert.equal(
        snapshot.events.filter((event) => event.type === "VISUAL_REVIEW_COMPLETED").length,
        status === "PASSED" ? 1 : 2,
      );
      assert.equal(
        snapshot.events.some((event) => event.type === "VISUAL_REPAIR_STARTED"),
        status === "FAILED",
      );
      assert.equal(
        snapshot.events.some((event) => event.type === "VISUAL_REPAIR_COMPLETED"),
        status === "FAILED",
      );
      assert.equal(JSON.stringify(snapshot).includes("Visible content overlaps"), false);
      assert.equal(JSON.stringify(snapshot).includes("shot_123e4567"), false);
    }
  });

  it("does not append screenshot success activity when capture validation fails", async () => {
    const devOpsValidator: DevOpsValidator = {
      async validate() {
        throw new Error("SENSITIVE_SCREENSHOT_FAILURE");
      },
    };
    const { app } = createTestApp({ devOpsValidator });

    assert.equal((await createProject(app)).status, 201);
    assert.equal((await createTask(app)).status, 201);
    assert.equal((await approvePlan(app)).status, 200);
    assert.equal((await executeTask(app)).status, 200);

    const response = await validateTask(app);
    const snapshot = await activitySnapshot(app);

    assert.equal(response.status, 500);
    assert.equal(
      snapshot.events.some((event) => event.type === "SCREENSHOT_CAPTURED"),
      false,
    );
    assert.deepEqual(
      snapshot.events.map((event) => event.type),
      [
        "PROJECT_CREATED",
        "TASK_CREATED",
        "PLAN_CREATED",
        "PLAN_APPROVED",
        "IMPLEMENTATION_COMPLETED",
      ],
    );
  });

  it("sanitizes unexpected activity store failures", async () => {
    const { app, activityService } = createTestApp();
    const projectService = createDeterministicProjectService(activityService);
    const failingActivityReadService = createActivityReadService({
      projectService,
      activityService: {
        ...activityService,
        async list() {
          throw new Error("SENSITIVE_ACTIVITY_STORE_DETAIL");
        },
      },
    });
    const failingApp = createApp({
      databaseHealth: fakeDatabase(),
      generateRequestId: fixedRequestId,
      projectService,
      activityReadService: failingActivityReadService,
    });

    assert.equal((await createProject(app)).status, 201);
    assert.equal((await createProject(failingApp)).status, 201);
    const response = await failingApp.request(
      "/api/v1/projects/proj_000001/activity",
    );
    const body = await response.text();

    assert.equal(response.status, 500);
    assert.equal(body.includes("SENSITIVE_ACTIVITY_STORE_DETAIL"), false);
    assert.equal(JSON.parse(body).error.code, "INTERNAL_ERROR");
  });

  it("does not include unsafe details in activity events", async () => {
    const { app } = createTestApp();
    assert.equal((await createProject(app)).status, 201);
    assert.equal((await createTask(app)).status, 201);
    const body = JSON.stringify(await activitySnapshot(app));

    assert.equal(body.includes("/Users/"), false);
    assert.equal(body.includes("private/tmp"), false);
    assert.equal(body.includes("repositoryPath"), false);
    assert.equal(body.includes("child_process"), false);
    assert.equal(body.includes("npm run"), false);
    assert.equal(body.includes("git status"), false);
    assert.equal(body.includes("prompt"), false);
    assert.equal(body.includes("SENSITIVE"), false);
    assert.equal(body.includes("stack"), false);
  });

  it("streams buffered events after Last-Event-ID as SSE", async () => {
    const { app } = createTestApp();
    assert.equal((await createProject(app)).status, 201);
    assert.equal((await createTask(app)).status, 201);
    assert.equal((await approvePlan(app)).status, 200);

    const response = await app.request(
      "/api/v1/projects/proj_000001/activity/stream",
      { headers: { "Last-Event-ID": "2" } },
    );
    const text = await readSseText(response, 2);

    assert.equal(response.status, 200);
    assert.match(response.headers.get("Content-Type") ?? "", /text\/event-stream/);
    const events = parseSseEvents(text);
    assert.deepEqual(
      events.map((event) => event.id),
      ["3", "4"],
    );
    assert.deepEqual(
      events.map((event) => event.name),
      ["PLAN_CREATED", "PLAN_APPROVED"],
    );
    assert.deepEqual(
      events.map((event) => event.data.sequence),
      [3, 4],
    );
  });

  it("streams only new project-scoped events and cleans up on disconnect", async () => {
    const { app, activityService } = createTestApp();
    assert.equal((await createProject(app)).status, 201);
    assert.equal(
      (
        await createProject(app, {
          name: "Other",
          publicRepositoryUrl: "https://github.com/example/other",
          preparedRepositoryId: "prepared_other",
        })
      ).status,
      201,
    );

    const response = await app.request(
      "/api/v1/projects/proj_000001/activity/stream?after=1",
    );
    assert.equal(response.status, 200);
    await Promise.resolve();
    await Promise.resolve();
    assert.equal(activityService.subscriberCount("proj_000001"), 1);

    assert.equal(
      (
        await app.request("/api/v1/projects/proj_000002/tasks", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: "Other task",
            description: "Belongs to the other project.",
          }),
        })
      ).status,
      201,
    );
    assert.equal((await createTask(app)).status, 201);

    const text = await readSseText(response, 2);
    const events = parseSseEvents(text);

    assert.deepEqual(
      events.map((event) => event.data.projectId),
      ["proj_000001", "proj_000001"],
    );
    assert.deepEqual(
      events.map((event) => event.name),
      ["TASK_CREATED", "PLAN_CREATED"],
    );
    assert.equal(activityService.subscriberCount("proj_000001"), 0);
  });

  it("rejects invalid Last-Event-ID before opening an SSE stream", async () => {
    const { app } = createTestApp();
    assert.equal((await createProject(app)).status, 201);

    const response = await app.request(
      "/api/v1/projects/proj_000001/activity/stream",
      { headers: { "Last-Event-ID": "not-a-sequence" } },
    );

    assert.equal(response.status, 400);
    assert.match(response.headers.get("Content-Type") ?? "", /application\/json/);
    assert.equal((await response.json()).error.code, "VALIDATION_FAILED");
  });
});

async function readSseText(response: Response, eventCount: number): Promise<string> {
  const reader = response.body?.getReader();
  assert.ok(reader);

  const decoder = new TextDecoder();
  let text = "";

  while (parseSseEvents(text).length < eventCount) {
    const result = await reader.read();
    assert.equal(result.done, false);
    text += decoder.decode(result.value, { stream: true });
  }

  await reader.cancel();
  return text;
}

function parseSseEvents(text: string): Array<{
  id: string;
  name: string;
  data: ActivityEvent;
}> {
  return text
    .split("\n\n")
    .filter((chunk) => chunk.trim().startsWith("id:"))
    .map((chunk) => {
      const lines = chunk.split("\n");
      const id = lines.find((line) => line.startsWith("id: "))?.slice(4);
      const name = lines.find((line) => line.startsWith("event: "))?.slice(7);
      const data = lines.find((line) => line.startsWith("data: "))?.slice(6);

      assert.ok(id);
      assert.ok(name);
      assert.ok(data);

      return {
        id,
        name,
        data: JSON.parse(data) as ActivityEvent,
      };
    });
}

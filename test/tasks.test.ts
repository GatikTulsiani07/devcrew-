import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createApp } from "../src/app.js";
import type { DatabaseHealth } from "../src/db/health.js";
import { InMemoryProjectStore } from "../src/projects/in-memory-project-store.js";
import { createProjectService } from "../src/projects/project-service.js";
import type { ProjectService } from "../src/projects/project-service.js";
import type { PreparedRepository } from "../src/repositories/prepared-repositories.js";
import { createDeterministicPlanner } from "../src/tasks/deterministic-planner.js";
import { InMemoryTaskStore } from "../src/tasks/in-memory-task-store.js";
import { createTaskService } from "../src/tasks/task-service.js";
import type { TaskPlanner } from "../src/tasks/types.js";

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
  return "req_task_test";
}

interface TestAppOptions {
  planner?: TaskPlanner;
  dates?: readonly string[];
}

function createDeterministicProjectService(): ProjectService {
  let projectCount = 0;
  let repositoryCount = 0;

  return createProjectService({
    store: new InMemoryProjectStore(),
    preparedRepositories,
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
  planner = createDeterministicPlanner(),
  dates = ["2026-08-03T01:00:00.000Z"],
}: TestAppOptions = {}) {
  const projectService = createDeterministicProjectService();
  let taskCount = 0;
  let dateIndex = 0;

  return createApp({
    databaseHealth: fakeDatabase(),
    generateRequestId: fixedRequestId,
    projectService,
    taskService: createTaskService({
      projectService,
      planner,
      store: new InMemoryTaskStore(),
      generateTaskId: () => {
        taskCount += 1;
        return `task_${String(taskCount).padStart(6, "0")}`;
      },
      now: () => {
        const date = dates[Math.min(dateIndex, dates.length - 1)];
        dateIndex += 1;
        return new Date(date);
      },
    }),
  });
}

async function createProject(
  app: ReturnType<typeof createTestApp>,
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

async function createTask(
  app: ReturnType<typeof createTestApp>,
  projectId = "proj_000001",
  body = {
    title: "Implement authentication middleware",
    description: "Protect every API route with JWT middleware.",
  },
) {
  return app.request(`/api/v1/projects/${projectId}/tasks`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function decidePlan(
  app: ReturnType<typeof createTestApp>,
  body: { decision: "APPROVE" | "REJECT"; reason?: string },
  projectId = "proj_000001",
  taskId = "task_000001",
) {
  return app.request(
    `/api/v1/projects/${projectId}/tasks/${taskId}/plan-decision`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
  );
}

describe("task manager planning API", () => {
  it("creates a task waiting for approval", async () => {
    const app = createTestApp();
    assert.equal((await createProject(app)).status, 201);

    const response = await createTask(app);

    assert.equal(response.status, 201);
    assert.equal(response.headers.get("X-Request-Id"), "req_task_test");
    assert.deepEqual(await response.json(), {
      task: {
        id: "task_000001",
        projectId: "proj_000001",
        title: "Implement authentication middleware",
        description: "Protect every API route with JWT middleware.",
        status: "WAITING_FOR_APPROVAL",
        plan: {
          summary: "Implement requested engineering task.",
          steps: [
            "Inspect relevant source files",
            "Modify implementation",
            "Add or update tests",
            "Validate build",
            "Prepare for review",
          ],
        },
        createdAt: "2026-08-03T01:00:00.000Z",
        updatedAt: "2026-08-03T01:00:00.000Z",
      },
    });
  });

  it("trims task title and description before planning and storage", async () => {
    const app = createTestApp();
    assert.equal((await createProject(app)).status, 201);

    const response = await createTask(app, "proj_000001", {
      title: "  Implement auth middleware  ",
      description: "  Protect API routes.  ",
    });

    assert.equal(response.status, 201);
    const body = await response.json();
    assert.equal(body.task.title, "Implement auth middleware");
    assert.equal(body.task.description, "Protect API routes.");
  });

  it("uses deterministic manager plan generation", async () => {
    const app = createTestApp();
    assert.equal((await createProject(app)).status, 201);

    const first = await createTask(app);
    const second = await createTask(app, "proj_000001", {
      title: "Add request validation",
      description: "Validate task payloads.",
    });

    assert.equal(first.status, 201);
    assert.equal(second.status, 201);
    assert.deepEqual((await first.json()).task.plan, (await second.json()).task.plan);
  });

  it("returns project not found when creating a task for an unknown project", async () => {
    const app = createTestApp();

    const response = await createTask(app, "proj_missing");

    assert.equal(response.status, 404);
    assert.deepEqual(await response.json(), {
      requestId: "req_task_test",
      status: "error",
      error: {
        code: "PROJECT_NOT_FOUND",
        message: "Project not found",
      },
    });
  });

  it("rejects malformed JSON with a structured validation error", async () => {
    const app = createTestApp();
    assert.equal((await createProject(app)).status, 201);

    const response = await app.request("/api/v1/projects/proj_000001/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{",
    });

    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), {
      requestId: "req_task_test",
      status: "error",
      error: {
        code: "VALIDATION_FAILED",
        message: "Request validation failed",
      },
    });
  });

  it("rejects invalid task input", async () => {
    const app = createTestApp();
    assert.equal((await createProject(app)).status, 201);

    const response = await createTask(app, "proj_000001", {
      title: "",
      description: "",
    });

    assert.equal(response.status, 400);
    assert.equal((await response.json()).error.code, "VALIDATION_FAILED");
  });

  it("rejects invalid task path parameters", async () => {
    const app = createTestApp();

    const response = await createTask(app, "not a project id");

    assert.equal(response.status, 400);
    assert.equal((await response.json()).error.code, "VALIDATION_FAILED");
  });

  it("retrieves the authoritative task snapshot", async () => {
    const app = createTestApp();
    assert.equal((await createProject(app)).status, 201);
    assert.equal((await createTask(app)).status, 201);

    const response = await app.request(
      "/api/v1/projects/proj_000001/tasks/task_000001",
    );

    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      task: {
        id: "task_000001",
        projectId: "proj_000001",
        title: "Implement authentication middleware",
        description: "Protect every API route with JWT middleware.",
        status: "WAITING_FOR_APPROVAL",
        plan: {
          summary: "Implement requested engineering task.",
          steps: [
            "Inspect relevant source files",
            "Modify implementation",
            "Add or update tests",
            "Validate build",
            "Prepare for review",
          ],
        },
        createdAt: "2026-08-03T01:00:00.000Z",
        updatedAt: "2026-08-03T01:00:00.000Z",
      },
    });
  });

  it("keeps task reads isolated by project", async () => {
    const app = createTestApp();
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
    assert.equal((await createTask(app, "proj_000001")).status, 201);

    const response = await app.request(
      "/api/v1/projects/proj_000002/tasks/task_000001",
    );

    assert.equal(response.status, 404);
    assert.equal((await response.json()).error.code, "TASK_NOT_FOUND");
  });

  it("returns task not found for missing tasks in an existing project", async () => {
    const app = createTestApp();
    assert.equal((await createProject(app)).status, 201);

    const response = await app.request(
      "/api/v1/projects/proj_000001/tasks/task_missing",
    );

    assert.equal(response.status, 404);
    assert.deepEqual(await response.json(), {
      requestId: "req_task_test",
      status: "error",
      error: {
        code: "TASK_NOT_FOUND",
        message: "Task not found",
      },
    });
  });

  it("includes request ids on task responses and errors", async () => {
    const app = createTestApp();
    assert.equal((await createProject(app)).status, 201);

    const created = await app.request("/api/v1/projects/proj_000001/tasks", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Request-Id": "req_client_task",
      },
      body: JSON.stringify({
        title: "Implement authentication middleware",
        description: "Protect every API route with JWT middleware.",
      }),
    });
    const missing = await app.request(
      "/api/v1/projects/proj_000001/tasks/task_missing",
      { headers: { "X-Request-Id": "req_client_task_error" } },
    );

    assert.equal(created.headers.get("X-Request-Id"), "req_client_task");
    assert.equal(missing.headers.get("X-Request-Id"), "req_client_task_error");
    assert.equal((await missing.json()).requestId, "req_client_task_error");
  });

  it("returns duplicate reads deterministically", async () => {
    const app = createTestApp();
    assert.equal((await createProject(app)).status, 201);
    assert.equal((await createTask(app)).status, 201);

    const first = await app.request(
      "/api/v1/projects/proj_000001/tasks/task_000001",
    );
    const second = await app.request(
      "/api/v1/projects/proj_000001/tasks/task_000001",
    );

    assert.deepEqual(await first.json(), await second.json());
  });

  it("sanitizes unexpected planner failures", async () => {
    const sensitiveMessage = "SENSITIVE_MANAGER_PLANNER_DETAIL";
    const planner: TaskPlanner = {
      async createPlan() {
        throw new Error(sensitiveMessage);
      },
    };
    const app = createTestApp({ planner });
    assert.equal((await createProject(app)).status, 201);

    const response = await createTask(app);
    const body = await response.text();

    assert.equal(response.status, 500);
    assert.deepEqual(JSON.parse(body), {
      requestId: "req_task_test",
      status: "error",
      error: {
        code: "INTERNAL_ERROR",
        message: "An unexpected error occurred",
      },
    });
    assert.equal(body.includes(sensitiveMessage), false);
  });

  it("does not return filesystem paths in task snapshots", async () => {
    const app = createTestApp();
    assert.equal((await createProject(app)).status, 201);

    const response = await createTask(app);
    const body = await response.text();

    assert.equal(response.status, 201);
    assert.equal(body.includes("/Users/"), false);
    assert.equal(body.includes("private/tmp"), false);
    assert.equal(body.includes("repositoryPath"), false);
  });

  it("approves a waiting task successfully", async () => {
    const app = createTestApp({
      dates: ["2026-08-03T01:00:00.000Z", "2026-08-03T02:00:00.000Z"],
    });
    assert.equal((await createProject(app)).status, 201);
    assert.equal((await createTask(app)).status, 201);

    const response = await decidePlan(app, {
      decision: "APPROVE",
      reason: "The plan is clear and ready.",
    });

    assert.equal(response.status, 200);
    assert.equal(response.headers.get("X-Request-Id"), "req_task_test");
    assert.deepEqual(await response.json(), {
      task: {
        id: "task_000001",
        projectId: "proj_000001",
        title: "Implement authentication middleware",
        description: "Protect every API route with JWT middleware.",
        status: "PLAN_APPROVED",
        plan: {
          summary: "Implement requested engineering task.",
          steps: [
            "Inspect relevant source files",
            "Modify implementation",
            "Add or update tests",
            "Validate build",
            "Prepare for review",
          ],
        },
        planDecision: {
          decision: "APPROVE",
          reason: "The plan is clear and ready.",
          decidedAt: "2026-08-03T02:00:00.000Z",
        },
        createdAt: "2026-08-03T01:00:00.000Z",
        updatedAt: "2026-08-03T02:00:00.000Z",
      },
    });
  });

  it("rejects a waiting task successfully", async () => {
    const app = createTestApp({
      dates: ["2026-08-03T01:00:00.000Z", "2026-08-03T02:00:00.000Z"],
    });
    assert.equal((await createProject(app)).status, 201);
    assert.equal((await createTask(app)).status, 201);

    const response = await decidePlan(app, {
      decision: "REJECT",
      reason: "Add validation and rollback steps.",
    });

    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.task.status, "PLAN_REJECTED");
    assert.deepEqual(body.task.planDecision, {
      decision: "REJECT",
      reason: "Add validation and rollback steps.",
      decidedAt: "2026-08-03T02:00:00.000Z",
    });
  });

  it("requires a reason when rejecting a plan", async () => {
    const app = createTestApp();
    assert.equal((await createProject(app)).status, 201);
    assert.equal((await createTask(app)).status, 201);

    const response = await app.request(
      "/api/v1/projects/proj_000001/tasks/task_000001/plan-decision",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision: "REJECT" }),
      },
    );

    assert.equal(response.status, 400);
    assert.equal((await response.json()).error.code, "VALIDATION_FAILED");
  });

  it("trims optional approval reasons", async () => {
    const app = createTestApp();
    assert.equal((await createProject(app)).status, 201);
    assert.equal((await createTask(app)).status, 201);

    const response = await decidePlan(app, {
      decision: "APPROVE",
      reason: "  Ready for implementation.  ",
    });

    assert.equal(response.status, 200);
    assert.equal(
      (await response.json()).task.planDecision.reason,
      "Ready for implementation.",
    );
  });

  it("allows approval without a reason", async () => {
    const app = createTestApp();
    assert.equal((await createProject(app)).status, 201);
    assert.equal((await createTask(app)).status, 201);

    const response = await decidePlan(app, { decision: "APPROVE" });

    assert.equal(response.status, 200);
    assert.equal((await response.json()).task.planDecision.reason, undefined);
  });

  it("keeps plan content unchanged after approval", async () => {
    const app = createTestApp();
    assert.equal((await createProject(app)).status, 201);
    assert.equal((await createTask(app)).status, 201);
    const before = await app.request(
      "/api/v1/projects/proj_000001/tasks/task_000001",
    );

    const after = await decidePlan(app, { decision: "APPROVE" });

    assert.equal(after.status, 200);
    assert.deepEqual((await after.json()).task.plan, (await before.json()).task.plan);
  });

  it("returns project not found for plan decisions in an unknown project", async () => {
    const app = createTestApp();

    const response = await decidePlan(
      app,
      { decision: "APPROVE" },
      "proj_missing",
      "task_000001",
    );

    assert.equal(response.status, 404);
    assert.equal((await response.json()).error.code, "PROJECT_NOT_FOUND");
  });

  it("returns task not found for plan decisions on an unknown task", async () => {
    const app = createTestApp();
    assert.equal((await createProject(app)).status, 201);

    const response = await decidePlan(
      app,
      { decision: "APPROVE" },
      "proj_000001",
      "task_missing",
    );

    assert.equal(response.status, 404);
    assert.equal((await response.json()).error.code, "TASK_NOT_FOUND");
  });

  it("rejects cross-project plan decisions", async () => {
    const app = createTestApp();
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
    assert.equal((await createTask(app, "proj_000001")).status, 201);

    const response = await decidePlan(
      app,
      { decision: "APPROVE" },
      "proj_000002",
      "task_000001",
    );

    assert.equal(response.status, 404);
    assert.equal((await response.json()).error.code, "TASK_NOT_FOUND");
  });

  it("rejects approving a task twice", async () => {
    const app = createTestApp();
    assert.equal((await createProject(app)).status, 201);
    assert.equal((await createTask(app)).status, 201);
    assert.equal((await decidePlan(app, { decision: "APPROVE" })).status, 200);

    const response = await decidePlan(app, { decision: "APPROVE" });

    assert.equal(response.status, 409);
    assert.equal(
      (await response.json()).error.code,
      "INVALID_TASK_TRANSITION",
    );
  });

  it("rejects rejecting a task twice", async () => {
    const app = createTestApp();
    assert.equal((await createProject(app)).status, 201);
    assert.equal((await createTask(app)).status, 201);
    assert.equal(
      (await decidePlan(app, {
        decision: "REJECT",
        reason: "Needs more detail.",
      })).status,
      200,
    );

    const response = await decidePlan(app, {
      decision: "REJECT",
      reason: "Still needs more detail.",
    });

    assert.equal(response.status, 409);
    assert.equal(
      (await response.json()).error.code,
      "INVALID_TASK_TRANSITION",
    );
  });

  it("rejects approving after rejection", async () => {
    const app = createTestApp();
    assert.equal((await createProject(app)).status, 201);
    assert.equal((await createTask(app)).status, 201);
    assert.equal(
      (await decidePlan(app, {
        decision: "REJECT",
        reason: "Needs more detail.",
      })).status,
      200,
    );

    const response = await decidePlan(app, { decision: "APPROVE" });

    assert.equal(response.status, 409);
    assert.equal(
      (await response.json()).error.code,
      "INVALID_TASK_TRANSITION",
    );
  });

  it("rejects rejecting after approval", async () => {
    const app = createTestApp();
    assert.equal((await createProject(app)).status, 201);
    assert.equal((await createTask(app)).status, 201);
    assert.equal((await decidePlan(app, { decision: "APPROVE" })).status, 200);

    const response = await decidePlan(app, {
      decision: "REJECT",
      reason: "Needs more detail.",
    });

    assert.equal(response.status, 409);
    assert.equal(
      (await response.json()).error.code,
      "INVALID_TASK_TRANSITION",
    );
  });

  it("rejects malformed plan decision bodies", async () => {
    const app = createTestApp();
    assert.equal((await createProject(app)).status, 201);
    assert.equal((await createTask(app)).status, 201);

    const response = await app.request(
      "/api/v1/projects/proj_000001/tasks/task_000001/plan-decision",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{",
      },
    );

    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), {
      requestId: "req_task_test",
      status: "error",
      error: {
        code: "VALIDATION_FAILED",
        message: "Request validation failed",
      },
    });
  });

  it("includes request ids on plan decision errors", async () => {
    const app = createTestApp();
    assert.equal((await createProject(app)).status, 201);
    assert.equal((await createTask(app)).status, 201);
    assert.equal((await decidePlan(app, { decision: "APPROVE" })).status, 200);

    const response = await app.request(
      "/api/v1/projects/proj_000001/tasks/task_000001/plan-decision",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Request-Id": "req_plan_decision_error",
        },
        body: JSON.stringify({ decision: "APPROVE" }),
      },
    );

    assert.equal(response.status, 409);
    assert.equal(response.headers.get("X-Request-Id"), "req_plan_decision_error");
    assert.equal((await response.json()).requestId, "req_plan_decision_error");
  });

  it("sanitizes unexpected plan decision failures", async () => {
    const sensitiveMessage = "SENSITIVE_TASK_UPDATE_DETAIL";
    const projectService = createDeterministicProjectService();
    let taskCount = 0;
    const taskStore = new InMemoryTaskStore();
    const taskService = createTaskService({
      projectService,
      planner: createDeterministicPlanner(),
      store: {
        create: taskStore.create.bind(taskStore),
        findByProjectAndId: taskStore.findByProjectAndId.bind(taskStore),
        async update() {
          throw new Error(sensitiveMessage);
        },
      },
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
    });
    assert.equal((await createProject(app)).status, 201);
    assert.equal((await createTask(app)).status, 201);

    const response = await decidePlan(app, { decision: "APPROVE" });
    const body = await response.text();

    assert.equal(response.status, 500);
    assert.deepEqual(JSON.parse(body), {
      requestId: "req_task_test",
      status: "error",
      error: {
        code: "INTERNAL_ERROR",
        message: "An unexpected error occurred",
      },
    });
    assert.equal(body.includes(sensitiveMessage), false);
  });
});

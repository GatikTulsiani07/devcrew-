import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createApp } from "../src/app.js";
import type { DatabaseHealth } from "../src/db/health.js";
import { InMemoryProjectStore } from "../src/projects/in-memory-project-store.js";
import { createProjectService } from "../src/projects/project-service.js";
import type { ProjectService } from "../src/projects/project-service.js";
import type { PreparedRepository } from "../src/repositories/prepared-repositories.js";
import { createDeterministicDeveloperExecutor } from "../src/tasks/deterministic-developer-executor.js";
import { createDeterministicDevOpsValidator } from "../src/tasks/deterministic-devops-validator.js";
import { createDeterministicPlanner } from "../src/tasks/deterministic-planner.js";
import { InMemoryTaskStore } from "../src/tasks/in-memory-task-store.js";
import { createTaskService } from "../src/tasks/task-service.js";
import type {
  DeveloperExecutor,
  DevOpsValidator,
  TaskPlanner,
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
  return "req_task_test";
}

interface TestAppOptions {
  planner?: TaskPlanner;
  developerExecutor?: DeveloperExecutor;
  devOpsValidator?: DevOpsValidator;
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
  developerExecutor,
  devOpsValidator,
  dates = ["2026-08-03T01:00:00.000Z"],
}: TestAppOptions = {}) {
  const projectService = createDeterministicProjectService();
  let taskCount = 0;
  let executionCount = 0;
  let validationCount = 0;
  let dateIndex = 0;
  const nextDate = () => {
    const date = dates[Math.min(dateIndex, dates.length - 1)];
    dateIndex += 1;
    return new Date(date);
  };

  return createApp({
    databaseHealth: fakeDatabase(),
    generateRequestId: fixedRequestId,
    projectService,
    taskService: createTaskService({
      projectService,
      planner,
      developerExecutor:
        developerExecutor ??
        createDeterministicDeveloperExecutor({
          generateExecutionId: () => {
            executionCount += 1;
            return `exec_${String(executionCount).padStart(6, "0")}`;
          },
          now: nextDate,
        }),
      devOpsValidator:
        devOpsValidator ??
        createDeterministicDevOpsValidator({
          generateValidationId: () => {
            validationCount += 1;
            return `val_${String(validationCount).padStart(6, "0")}`;
          },
          now: nextDate,
        }),
      store: new InMemoryTaskStore(),
      generateTaskId: () => {
        taskCount += 1;
        return `task_${String(taskCount).padStart(6, "0")}`;
      },
      now: nextDate,
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

async function executeTask(
  app: ReturnType<typeof createTestApp>,
  projectId = "proj_000001",
  taskId = "task_000001",
  init: RequestInit = {},
) {
  return app.request(
    `/api/v1/projects/${projectId}/tasks/${taskId}/execute`,
    {
      method: "POST",
      ...init,
    },
  );
}

async function validateTask(
  app: ReturnType<typeof createTestApp>,
  projectId = "proj_000001",
  taskId = "task_000001",
  init: RequestInit = {},
) {
  return app.request(
    `/api/v1/projects/${projectId}/tasks/${taskId}/validate`,
    {
      method: "POST",
      ...init,
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
      developerExecutor: createDeterministicDeveloperExecutor(),
      devOpsValidator: createDeterministicDevOpsValidator(),
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

  it("executes a plan-approved task synchronously with a persisted implementation snapshot", async () => {
    const app = createTestApp({
      dates: [
        "2026-08-03T01:00:00.000Z",
        "2026-08-03T02:00:00.000Z",
        "2026-08-03T03:00:00.000Z",
        "2026-08-03T04:00:00.000Z",
        "2026-08-03T05:00:00.000Z",
      ],
    });
    assert.equal((await createProject(app)).status, 201);
    assert.equal((await createTask(app)).status, 201);
    assert.equal(
      (
        await decidePlan(app, {
          decision: "APPROVE",
          reason: "The plan is clear and ready.",
        })
      ).status,
      200,
    );

    const response = await executeTask(app);

    assert.equal(response.status, 200);
    assert.equal(response.headers.get("X-Request-Id"), "req_task_test");
    assert.deepEqual(await response.json(), {
      task: {
        id: "task_000001",
        projectId: "proj_000001",
        title: "Implement authentication middleware",
        description: "Protect every API route with JWT middleware.",
        status: "IMPLEMENTATION_COMPLETED",
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
        execution: {
          id: "exec_000001",
          role: "FULL_STACK_DEVELOPER",
          status: "COMPLETED",
          attempt: 1,
          startedAt: "2026-08-03T03:00:00.000Z",
          completedAt: "2026-08-03T04:00:00.000Z",
          result: {
            summary: "Implemented the approved engineering task.",
            changedFiles: [],
            verification: [
              "Implementation adapter completed deterministically.",
            ],
          },
        },
        createdAt: "2026-08-03T01:00:00.000Z",
        updatedAt: "2026-08-03T05:00:00.000Z",
      },
    });
  });

  it("keeps the approved plan and plan decision unchanged during execution", async () => {
    const app = createTestApp({
      dates: [
        "2026-08-03T01:00:00.000Z",
        "2026-08-03T02:00:00.000Z",
        "2026-08-03T03:00:00.000Z",
        "2026-08-03T04:00:00.000Z",
        "2026-08-03T05:00:00.000Z",
      ],
    });
    assert.equal((await createProject(app)).status, 201);
    assert.equal((await createTask(app)).status, 201);
    const approved = await decidePlan(app, {
      decision: "APPROVE",
      reason: "Ready.",
    });
    const approvedTask = (await approved.json()).task;

    const executed = await executeTask(app);
    const executedTask = (await executed.json()).task;

    assert.deepEqual(executedTask.plan, approvedTask.plan);
    assert.deepEqual(executedTask.planDecision, approvedTask.planDecision);
  });

  it("returns the exact persisted execution snapshot on later task reads", async () => {
    const app = createTestApp({
      dates: [
        "2026-08-03T01:00:00.000Z",
        "2026-08-03T02:00:00.000Z",
        "2026-08-03T03:00:00.000Z",
        "2026-08-03T04:00:00.000Z",
        "2026-08-03T05:00:00.000Z",
      ],
    });
    assert.equal((await createProject(app)).status, 201);
    assert.equal((await createTask(app)).status, 201);
    assert.equal((await decidePlan(app, { decision: "APPROVE" })).status, 200);

    const executed = await executeTask(app);
    const read = await app.request(
      "/api/v1/projects/proj_000001/tasks/task_000001",
    );

    assert.equal(read.status, 200);
    assert.deepEqual(await read.json(), await executed.json());
  });

  it("rejects execution while waiting for approval", async () => {
    const app = createTestApp();
    assert.equal((await createProject(app)).status, 201);
    assert.equal((await createTask(app)).status, 201);

    const response = await executeTask(app);

    assert.equal(response.status, 409);
    assert.equal(
      (await response.json()).error.code,
      "INVALID_TASK_TRANSITION",
    );
  });

  it("rejects execution after plan rejection", async () => {
    const app = createTestApp();
    assert.equal((await createProject(app)).status, 201);
    assert.equal((await createTask(app)).status, 201);
    assert.equal(
      (
        await decidePlan(app, {
          decision: "REJECT",
          reason: "Needs more detail.",
        })
      ).status,
      200,
    );

    const response = await executeTask(app);

    assert.equal(response.status, 409);
    assert.equal(
      (await response.json()).error.code,
      "INVALID_TASK_TRANSITION",
    );
  });

  it("rejects executing a completed implementation again", async () => {
    const app = createTestApp({
      dates: [
        "2026-08-03T01:00:00.000Z",
        "2026-08-03T02:00:00.000Z",
        "2026-08-03T03:00:00.000Z",
        "2026-08-03T04:00:00.000Z",
        "2026-08-03T05:00:00.000Z",
      ],
    });
    assert.equal((await createProject(app)).status, 201);
    assert.equal((await createTask(app)).status, 201);
    assert.equal((await decidePlan(app, { decision: "APPROVE" })).status, 200);
    assert.equal((await executeTask(app)).status, 200);

    const response = await executeTask(app);

    assert.equal(response.status, 409);
    assert.equal(
      (await response.json()).error.code,
      "INVALID_TASK_TRANSITION",
    );
  });

  it("returns project not found for execution in an unknown project", async () => {
    const app = createTestApp();

    const response = await executeTask(app, "proj_missing", "task_000001");

    assert.equal(response.status, 404);
    assert.equal((await response.json()).error.code, "PROJECT_NOT_FOUND");
  });

  it("returns task not found for execution of an unknown task", async () => {
    const app = createTestApp();
    assert.equal((await createProject(app)).status, 201);

    const response = await executeTask(app, "proj_000001", "task_missing");

    assert.equal(response.status, 404);
    assert.equal((await response.json()).error.code, "TASK_NOT_FOUND");
  });

  it("rejects cross-project task execution", async () => {
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
    assert.equal(
      (await decidePlan(app, { decision: "APPROVE" })).status,
      200,
    );

    const response = await executeTask(app, "proj_000002", "task_000001");

    assert.equal(response.status, 404);
    assert.equal((await response.json()).error.code, "TASK_NOT_FOUND");
  });

  it("rejects invalid execution path parameters", async () => {
    const app = createTestApp();

    const response = await executeTask(app, "not a project", "not a task");

    assert.equal(response.status, 400);
    assert.equal((await response.json()).error.code, "VALIDATION_FAILED");
  });

  it("rejects non-empty execution request bodies", async () => {
    const app = createTestApp();
    assert.equal((await createProject(app)).status, 201);
    assert.equal((await createTask(app)).status, 201);
    assert.equal((await decidePlan(app, { decision: "APPROVE" })).status, 200);

    const response = await executeTask(app, "proj_000001", "task_000001", {
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ unexpected: true }),
    });

    assert.equal(response.status, 400);
    assert.equal((await response.json()).error.code, "VALIDATION_FAILED");
  });

  it("propagates request ids on execution success and errors", async () => {
    const app = createTestApp({
      dates: [
        "2026-08-03T01:00:00.000Z",
        "2026-08-03T02:00:00.000Z",
        "2026-08-03T03:00:00.000Z",
        "2026-08-03T04:00:00.000Z",
        "2026-08-03T05:00:00.000Z",
      ],
    });
    assert.equal((await createProject(app)).status, 201);
    assert.equal((await createTask(app)).status, 201);
    assert.equal((await decidePlan(app, { decision: "APPROVE" })).status, 200);

    const success = await executeTask(app, "proj_000001", "task_000001", {
      headers: { "X-Request-Id": "req_execute_success" },
    });
    const error = await executeTask(app, "proj_000001", "task_000001", {
      headers: { "X-Request-Id": "req_execute_error" },
    });

    assert.equal(success.status, 200);
    assert.equal(success.headers.get("X-Request-Id"), "req_execute_success");
    assert.equal(error.status, 409);
    assert.equal(error.headers.get("X-Request-Id"), "req_execute_error");
    assert.equal((await error.json()).requestId, "req_execute_error");
  });

  it("sanitizes unexpected developer executor failures", async () => {
    const sensitiveMessage = "SENSITIVE_DEVELOPER_EXECUTOR_DETAIL";
    const developerExecutor: DeveloperExecutor = {
      async execute() {
        throw new Error(sensitiveMessage);
      },
    };
    const app = createTestApp({ developerExecutor });
    assert.equal((await createProject(app)).status, 201);
    assert.equal((await createTask(app)).status, 201);
    assert.equal((await decidePlan(app, { decision: "APPROVE" })).status, 200);

    const response = await executeTask(app);
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

  it("does not return filesystem paths, shell commands, secrets, or stack traces in execution responses", async () => {
    const app = createTestApp({
      dates: [
        "2026-08-03T01:00:00.000Z",
        "2026-08-03T02:00:00.000Z",
        "2026-08-03T03:00:00.000Z",
        "2026-08-03T04:00:00.000Z",
        "2026-08-03T05:00:00.000Z",
      ],
    });
    assert.equal((await createProject(app)).status, 201);
    assert.equal((await createTask(app)).status, 201);
    assert.equal((await decidePlan(app, { decision: "APPROVE" })).status, 200);

    const response = await executeTask(app);
    const body = await response.text();

    assert.equal(response.status, 200);
    assert.equal(body.includes("/Users/"), false);
    assert.equal(body.includes("private/tmp"), false);
    assert.equal(body.includes("repositoryPath"), false);
    assert.equal(body.includes("child_process"), false);
    assert.equal(body.includes("git status"), false);
    assert.equal(body.includes("SENSITIVE"), false);
    assert.equal(body.includes("stack"), false);
  });

  it("validates an implementation-completed task synchronously with persisted evidence", async () => {
    const app = createTestApp({
      dates: [
        "2026-08-03T01:00:00.000Z",
        "2026-08-03T02:00:00.000Z",
        "2026-08-03T03:00:00.000Z",
        "2026-08-03T04:00:00.000Z",
        "2026-08-03T05:00:00.000Z",
        "2026-08-03T06:00:00.000Z",
        "2026-08-03T07:00:00.000Z",
        "2026-08-03T08:00:00.000Z",
      ],
    });
    assert.equal((await createProject(app)).status, 201);
    assert.equal((await createTask(app)).status, 201);
    assert.equal(
      (
        await decidePlan(app, {
          decision: "APPROVE",
          reason: "The plan is clear and ready.",
        })
      ).status,
      200,
    );
    assert.equal((await executeTask(app)).status, 200);

    const response = await validateTask(app);

    assert.equal(response.status, 200);
    assert.equal(response.headers.get("X-Request-Id"), "req_task_test");
    assert.deepEqual(await response.json(), {
      task: {
        id: "task_000001",
        projectId: "proj_000001",
        title: "Implement authentication middleware",
        description: "Protect every API route with JWT middleware.",
        status: "VALIDATION_COMPLETED",
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
        execution: {
          id: "exec_000001",
          role: "FULL_STACK_DEVELOPER",
          status: "COMPLETED",
          attempt: 1,
          startedAt: "2026-08-03T03:00:00.000Z",
          completedAt: "2026-08-03T04:00:00.000Z",
          result: {
            summary: "Implemented the approved engineering task.",
            changedFiles: [],
            verification: [
              "Implementation adapter completed deterministically.",
            ],
          },
        },
        validation: {
          id: "val_000001",
          role: "DEVOPS_ENGINEER",
          status: "PASSED",
          attempt: 1,
          startedAt: "2026-08-03T06:00:00.000Z",
          completedAt: "2026-08-03T07:00:00.000Z",
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
          summary: "Deterministic validation completed successfully.",
        },
        createdAt: "2026-08-03T01:00:00.000Z",
        updatedAt: "2026-08-03T08:00:00.000Z",
      },
    });
  });

  it("keeps the plan, plan decision, and execution unchanged during validation", async () => {
    const app = createTestApp({
      dates: [
        "2026-08-03T01:00:00.000Z",
        "2026-08-03T02:00:00.000Z",
        "2026-08-03T03:00:00.000Z",
        "2026-08-03T04:00:00.000Z",
        "2026-08-03T05:00:00.000Z",
        "2026-08-03T06:00:00.000Z",
        "2026-08-03T07:00:00.000Z",
        "2026-08-03T08:00:00.000Z",
      ],
    });
    assert.equal((await createProject(app)).status, 201);
    assert.equal((await createTask(app)).status, 201);
    assert.equal((await decidePlan(app, { decision: "APPROVE" })).status, 200);
    const executed = await executeTask(app);
    const executedTask = (await executed.json()).task;

    const validated = await validateTask(app);
    const validatedTask = (await validated.json()).task;

    assert.deepEqual(validatedTask.plan, executedTask.plan);
    assert.deepEqual(validatedTask.planDecision, executedTask.planDecision);
    assert.deepEqual(validatedTask.execution, executedTask.execution);
  });

  it("returns the exact persisted validation snapshot on later task reads", async () => {
    const app = createTestApp({
      dates: [
        "2026-08-03T01:00:00.000Z",
        "2026-08-03T02:00:00.000Z",
        "2026-08-03T03:00:00.000Z",
        "2026-08-03T04:00:00.000Z",
        "2026-08-03T05:00:00.000Z",
        "2026-08-03T06:00:00.000Z",
        "2026-08-03T07:00:00.000Z",
        "2026-08-03T08:00:00.000Z",
      ],
    });
    assert.equal((await createProject(app)).status, 201);
    assert.equal((await createTask(app)).status, 201);
    assert.equal((await decidePlan(app, { decision: "APPROVE" })).status, 200);
    assert.equal((await executeTask(app)).status, 200);

    const validated = await validateTask(app);
    const read = await app.request(
      "/api/v1/projects/proj_000001/tasks/task_000001",
    );

    assert.equal(read.status, 200);
    assert.deepEqual(await read.json(), await validated.json());
  });

  it("rejects validation while waiting for approval", async () => {
    const app = createTestApp();
    assert.equal((await createProject(app)).status, 201);
    assert.equal((await createTask(app)).status, 201);

    const response = await validateTask(app);

    assert.equal(response.status, 409);
    assert.equal(
      (await response.json()).error.code,
      "INVALID_TASK_TRANSITION",
    );
  });

  it("rejects validation after approval but before execution", async () => {
    const app = createTestApp();
    assert.equal((await createProject(app)).status, 201);
    assert.equal((await createTask(app)).status, 201);
    assert.equal((await decidePlan(app, { decision: "APPROVE" })).status, 200);

    const response = await validateTask(app);

    assert.equal(response.status, 409);
    assert.equal(
      (await response.json()).error.code,
      "INVALID_TASK_TRANSITION",
    );
  });

  it("rejects validation after plan rejection", async () => {
    const app = createTestApp();
    assert.equal((await createProject(app)).status, 201);
    assert.equal((await createTask(app)).status, 201);
    assert.equal(
      (
        await decidePlan(app, {
          decision: "REJECT",
          reason: "Needs more detail.",
        })
      ).status,
      200,
    );

    const response = await validateTask(app);

    assert.equal(response.status, 409);
    assert.equal(
      (await response.json()).error.code,
      "INVALID_TASK_TRANSITION",
    );
  });

  it("rejects validating a completed validation again", async () => {
    const app = createTestApp({
      dates: [
        "2026-08-03T01:00:00.000Z",
        "2026-08-03T02:00:00.000Z",
        "2026-08-03T03:00:00.000Z",
        "2026-08-03T04:00:00.000Z",
        "2026-08-03T05:00:00.000Z",
        "2026-08-03T06:00:00.000Z",
        "2026-08-03T07:00:00.000Z",
        "2026-08-03T08:00:00.000Z",
      ],
    });
    assert.equal((await createProject(app)).status, 201);
    assert.equal((await createTask(app)).status, 201);
    assert.equal((await decidePlan(app, { decision: "APPROVE" })).status, 200);
    assert.equal((await executeTask(app)).status, 200);
    assert.equal((await validateTask(app)).status, 200);

    const response = await validateTask(app);

    assert.equal(response.status, 409);
    assert.equal(
      (await response.json()).error.code,
      "INVALID_TASK_TRANSITION",
    );
  });

  it("returns project not found for validation in an unknown project", async () => {
    const app = createTestApp();

    const response = await validateTask(app, "proj_missing", "task_000001");

    assert.equal(response.status, 404);
    assert.equal((await response.json()).error.code, "PROJECT_NOT_FOUND");
  });

  it("returns task not found for validation of an unknown task", async () => {
    const app = createTestApp();
    assert.equal((await createProject(app)).status, 201);

    const response = await validateTask(app, "proj_000001", "task_missing");

    assert.equal(response.status, 404);
    assert.equal((await response.json()).error.code, "TASK_NOT_FOUND");
  });

  it("rejects cross-project task validation", async () => {
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
    assert.equal((await decidePlan(app, { decision: "APPROVE" })).status, 200);
    assert.equal((await executeTask(app)).status, 200);

    const response = await validateTask(app, "proj_000002", "task_000001");

    assert.equal(response.status, 404);
    assert.equal((await response.json()).error.code, "TASK_NOT_FOUND");
  });

  it("rejects invalid validation path parameters", async () => {
    const app = createTestApp();

    const response = await validateTask(app, "not a project", "not a task");

    assert.equal(response.status, 400);
    assert.equal((await response.json()).error.code, "VALIDATION_FAILED");
  });

  it("rejects non-empty validation request bodies", async () => {
    const app = createTestApp();
    assert.equal((await createProject(app)).status, 201);
    assert.equal((await createTask(app)).status, 201);
    assert.equal((await decidePlan(app, { decision: "APPROVE" })).status, 200);
    assert.equal((await executeTask(app)).status, 200);

    const response = await validateTask(app, "proj_000001", "task_000001", {
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ unexpected: true }),
    });

    assert.equal(response.status, 400);
    assert.equal((await response.json()).error.code, "VALIDATION_FAILED");
  });

  it("propagates request ids on validation success and errors", async () => {
    const app = createTestApp({
      dates: [
        "2026-08-03T01:00:00.000Z",
        "2026-08-03T02:00:00.000Z",
        "2026-08-03T03:00:00.000Z",
        "2026-08-03T04:00:00.000Z",
        "2026-08-03T05:00:00.000Z",
        "2026-08-03T06:00:00.000Z",
        "2026-08-03T07:00:00.000Z",
        "2026-08-03T08:00:00.000Z",
      ],
    });
    assert.equal((await createProject(app)).status, 201);
    assert.equal((await createTask(app)).status, 201);
    assert.equal((await decidePlan(app, { decision: "APPROVE" })).status, 200);
    assert.equal((await executeTask(app)).status, 200);

    const success = await validateTask(app, "proj_000001", "task_000001", {
      headers: { "X-Request-Id": "req_validate_success" },
    });
    const error = await validateTask(app, "proj_000001", "task_000001", {
      headers: { "X-Request-Id": "req_validate_error" },
    });

    assert.equal(success.status, 200);
    assert.equal(success.headers.get("X-Request-Id"), "req_validate_success");
    assert.equal(error.status, 409);
    assert.equal(error.headers.get("X-Request-Id"), "req_validate_error");
    assert.equal((await error.json()).requestId, "req_validate_error");
  });

  it("sanitizes unexpected DevOps validator failures", async () => {
    const sensitiveMessage = "SENSITIVE_DEVOPS_VALIDATOR_DETAIL";
    const devOpsValidator: DevOpsValidator = {
      async validate() {
        throw new Error(sensitiveMessage);
      },
    };
    const app = createTestApp({ devOpsValidator });
    assert.equal((await createProject(app)).status, 201);
    assert.equal((await createTask(app)).status, 201);
    assert.equal((await decidePlan(app, { decision: "APPROVE" })).status, 200);
    assert.equal((await executeTask(app)).status, 200);

    const response = await validateTask(app);
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

  it("does not return filesystem paths, shell commands, secrets, prompts, or stack traces in validation responses", async () => {
    const app = createTestApp({
      dates: [
        "2026-08-03T01:00:00.000Z",
        "2026-08-03T02:00:00.000Z",
        "2026-08-03T03:00:00.000Z",
        "2026-08-03T04:00:00.000Z",
        "2026-08-03T05:00:00.000Z",
        "2026-08-03T06:00:00.000Z",
        "2026-08-03T07:00:00.000Z",
        "2026-08-03T08:00:00.000Z",
      ],
    });
    assert.equal((await createProject(app)).status, 201);
    assert.equal((await createTask(app)).status, 201);
    assert.equal((await decidePlan(app, { decision: "APPROVE" })).status, 200);
    assert.equal((await executeTask(app)).status, 200);

    const response = await validateTask(app);
    const body = await response.text();

    assert.equal(response.status, 200);
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
});

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createApp } from "../src/app.js";
import {
  createActivityService,
  type ActivityService,
} from "../src/activity/activity-service.js";
import { InMemoryActivityStore } from "../src/activity/in-memory-activity-store.js";
import type { DatabaseHealth } from "../src/db/health.js";
import { InMemoryProjectStore } from "../src/projects/in-memory-project-store.js";
import { createProjectService } from "../src/projects/project-service.js";
import type { ProjectService } from "../src/projects/project-service.js";
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
  ManagerPlanner,
  TaskExecution,
  TaskPullRequestCreator,
  TaskValidation,
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
  return "req_task_test";
}

interface TestAppOptions {
  planner?: ManagerPlanner;
  developerExecutor?: DeveloperExecutor;
  devOpsValidator?: DevOpsValidator;
  taskReviewer?: TaskReviewer;
  pullRequestCreator?: TaskPullRequestCreator;
  activityService?: ActivityService;
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
  taskReviewer,
  pullRequestCreator,
  activityService,
  dates = ["2026-08-03T01:00:00.000Z"],
}: TestAppOptions = {}) {
  const projectService = createDeterministicProjectService();
  let taskCount = 0;
  let executionCount = 0;
  let validationCount = 0;
  let reviewCount = 0;
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
      taskReviewer:
        taskReviewer ??
        createDeterministicReviewer({
          generateReviewId: () => {
            reviewCount += 1;
            return `review_${String(reviewCount).padStart(6, "0")}`;
          },
          now: nextDate,
        }),
      ...(pullRequestCreator === undefined ? {} : { pullRequestCreator }),
      store: new InMemoryTaskStore(),
      generateTaskId: () => {
        taskCount += 1;
        return `task_${String(taskCount).padStart(6, "0")}`;
      },
      now: nextDate,
      ...(activityService === undefined ? {} : { activityService }),
    }),
    ...(activityService === undefined ? {} : { activityService }),
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

async function reviewTask(
  app: ReturnType<typeof createTestApp>,
  projectId = "proj_000001",
  taskId = "task_000001",
  init: RequestInit = {},
) {
  return app.request(
    `/api/v1/projects/${projectId}/tasks/${taskId}/review`,
    {
      method: "POST",
      ...init,
    },
  );
}

async function retryTask(
  app: ReturnType<typeof createTestApp>,
  projectId = "proj_000001",
  taskId = "task_000001",
  init: RequestInit = {},
) {
  return app.request(
    `/api/v1/projects/${projectId}/tasks/${taskId}/retry`,
    {
      method: "POST",
      ...init,
    },
  );
}

async function cancelTask(
  app: ReturnType<typeof createTestApp>,
  projectId = "proj_000001",
  taskId = "task_000001",
  init: RequestInit = {},
) {
  return app.request(
    `/api/v1/projects/${projectId}/tasks/${taskId}/cancel`,
    {
      method: "POST",
      ...init,
    },
  );
}

async function createPullRequest(
  app: ReturnType<typeof createTestApp>,
  projectId = "proj_000001",
  taskId = "task_000001",
  init: RequestInit = {},
) {
  return app.request(
    `/api/v1/projects/${projectId}/tasks/${taskId}/pull-request`,
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

  it("preserves the task lifecycle when the manager planner changes", async () => {
    const planner: ManagerPlanner = {
      async createPlan() {
        return {
          summary: "Plan generated by Manager.",
          steps: [
            "Reasoning: The lifecycle should stay unchanged.",
            "Implement: Make the scoped backend change.",
            "Accept: Existing lifecycle states remain stable.",
          ],
        };
      },
    };
    const app = createTestApp({
      planner,
      dates: [
        "2026-08-03T01:00:00.000Z",
        "2026-08-03T01:01:00.000Z",
        "2026-08-03T01:02:00.000Z",
        "2026-08-03T01:03:00.000Z",
        "2026-08-03T01:04:00.000Z",
        "2026-08-03T01:05:00.000Z",
        "2026-08-03T01:06:00.000Z",
      ],
    });
    assert.equal((await createProject(app)).status, 201);

    const created = await createTask(app);
    const approved = await decidePlan(app, { decision: "APPROVE" });
    const executed = await executeTask(app);
    const validated = await validateTask(app);
    const reviewed = await reviewTask(app);

    assert.equal((await created.json()).task.status, "WAITING_FOR_APPROVAL");
    assert.equal((await approved.json()).task.status, "PLAN_APPROVED");
    assert.equal(
      (await executed.json()).task.status,
      "IMPLEMENTATION_COMPLETED",
    );
    assert.equal((await validated.json()).task.status, "VALIDATION_COMPLETED");
    assert.equal((await reviewed.json()).task.status, "REVIEW_COMPLETED");
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
    const planner: ManagerPlanner = {
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
      taskReviewer: createDeterministicReviewer(),
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
    const taskRead = await app.request(
      "/api/v1/projects/proj_000001/tasks/task_000001",
    );
    const persistedTask = (await taskRead.json()).task;

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
    assert.equal(persistedTask.status, "PLAN_APPROVED");
    assert.equal(persistedTask.execution, undefined);
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

  it("cancels an active task through authoritative state and emits TASK_CANCELLED once", async () => {
    let resolveStarted!: () => void;
    const started = new Promise<void>((resolve) => {
      resolveStarted = resolve;
    });
    let capturedSignal: AbortSignal | undefined;
    const developerExecutor: DeveloperExecutor = {
      async execute(input) {
        capturedSignal = input.signal;
        resolveStarted();
        return await new Promise<TaskExecution>((_resolve, reject) => {
          input.signal?.addEventListener(
            "abort",
            () => reject(input.signal?.reason ?? new Error("cancelled")),
            { once: true },
          );
        });
      },
    };
    const activityService = createActivityService({
      store: new InMemoryActivityStore(),
      generateEventId: () => "evt_cancelled",
      now: () => new Date("2026-08-03T12:00:00.000Z"),
    });
    const app = createTestApp({
      developerExecutor,
      activityService,
      dates: [
        "2026-08-03T01:00:00.000Z",
        "2026-08-03T02:00:00.000Z",
        "2026-08-03T03:00:00.000Z",
        "2026-08-03T04:00:00.000Z",
        "2026-08-03T05:00:00.000Z",
        "2026-08-03T06:00:00.000Z",
      ],
    });
    assert.equal((await createProject(app)).status, 201);
    assert.equal((await createTask(app)).status, 201);
    assert.equal((await decidePlan(app, { decision: "APPROVE" })).status, 200);

    const executing = executeTask(app);
    await started;

    const requested = await cancelTask(app);
    const requestedBody = await requested.json();
    assert.equal(requested.status, 200);
    assert.equal(requestedBody.task.cancellation.status, "REQUESTED");
    assert.equal(requestedBody.task.cancellation.stage, "DEVELOPER");
    assert.equal(capturedSignal?.aborted, true);

    const executionResponse = await executing;
    assert.equal(executionResponse.status, 409);
    assert.equal((await executionResponse.json()).error.code, "TASK_CANCELLED");

    const read = await app.request(
      "/api/v1/projects/proj_000001/tasks/task_000001",
    );
    const readBody = await read.json();
    assert.equal(readBody.task.cancellation.status, "CANCELLED");
    assert.equal(readBody.task.cancellation.stage, "DEVELOPER");
    assert.equal(typeof readBody.task.cancellation.cancelledAt, "string");
    assert.equal(readBody.task.execution, undefined);

    const repeated = await cancelTask(app);
    assert.equal(repeated.status, 200);
    assert.equal((await repeated.json()).task.cancellation.status, "CANCELLED");

    const activity = await app.request(
      "/api/v1/projects/proj_000001/activity",
    );
    const events = (await activity.json()).events.filter(
      (event: { type: string }) => event.type === "TASK_CANCELLED",
    );
    assert.equal(events.length, 1);
  });

  it("rejects unsafe cancel request bodies and prevents later workflow stages", async () => {
    let devOpsCalls = 0;
    const app = createTestApp({
      devOpsValidator: {
        async validate(): Promise<TaskValidation> {
          devOpsCalls += 1;
          throw new Error("validation should not start");
        },
      },
      dates: [
        "2026-08-03T01:00:00.000Z",
        "2026-08-03T02:00:00.000Z",
        "2026-08-03T03:00:00.000Z",
        "2026-08-03T04:00:00.000Z",
        "2026-08-03T05:00:00.000Z",
        "2026-08-03T06:00:00.000Z",
      ],
    });
    assert.equal((await createProject(app)).status, 201);
    assert.equal((await createTask(app)).status, 201);
    assert.equal((await decidePlan(app, { decision: "APPROVE" })).status, 200);
    assert.equal((await executeTask(app)).status, 200);

    const rejected = await cancelTask(app, "proj_000001", "task_000001", {
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ force: true, stage: "DEVOPS", pid: 123 }),
    });
    assert.equal(rejected.status, 400);
    assert.equal((await rejected.json()).error.code, "VALIDATION_FAILED");

    const cancelled = await cancelTask(app);
    assert.equal(cancelled.status, 200);
    assert.equal((await cancelled.json()).task.cancellation.status, "CANCELLED");

    const validation = await validateTask(app);
    assert.equal(validation.status, 409);
    assert.equal((await validation.json()).error.code, "INVALID_TASK_TRANSITION");
    assert.equal(devOpsCalls, 0);
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

  it("persists public screenshot and visual review evidence without leaking internals", async () => {
    let validationCount = 0;
    const devOpsValidator: DevOpsValidator = {
      async validate() {
        validationCount += 1;
        return {
          id: validationCount === 1 ? "val_screenshot" : "val_repair",
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
          summary: "Controlled validation completed successfully.",
          browserVerification: {
            status: "PASSED",
            url: "http://127.0.0.1:43117/",
            pageTitle: "Devcrew",
            verifiedAt: "2026-08-03T06:30:00.000Z",
          },
          browserScreenshot: {
            status: "CAPTURED",
            id:
              validationCount === 1
                ? "shot_123e4567-e89b-42d3-a456-426614174000"
                : "shot_123e4567-e89b-42d3-a456-426614174001",
            url: "http://127.0.0.1:43117/",
            viewport: { width: 1440, height: 900 },
            capturedAt: "2026-08-03T06:31:00.000Z",
          },
          visualReview: {
            status: validationCount === 1 ? "FAILED" : "PASSED",
            summary:
              validationCount === 1
                ? "The requested sidebar is not visible."
                : "The requested sidebar is visible.",
            findings:
              validationCount === 1
                ? [
                    {
                      severity: "ERROR",
                      category: "missing-element",
                      title: "Sidebar missing",
                      description:
                        "The screenshot does not show the requested sidebar.",
                    },
                  ]
                : [],
            screenshotId:
              validationCount === 1
                ? "shot_123e4567-e89b-42d3-a456-426614174000"
                : "shot_123e4567-e89b-42d3-a456-426614174001",
            reviewedAt: "2026-08-03T06:32:00.000Z",
          },
        };
      },
    };
    const app = createTestApp({ devOpsValidator });
    assert.equal((await createProject(app)).status, 201);
    assert.equal((await createTask(app)).status, 201);
    assert.equal((await decidePlan(app, { decision: "APPROVE" })).status, 200);
    assert.equal((await executeTask(app)).status, 200);

    const validated = await validateTask(app);
    const read = await app.request(
      "/api/v1/projects/proj_000001/tasks/task_000001",
    );
    const body = JSON.stringify(await validated.clone().json());

    assert.equal(validated.status, 200);
    assert.equal(read.status, 200);
    assert.deepEqual(await read.json(), await validated.json());
    assert.equal(body.includes("visualReview"), true);
    assert.equal(body.includes("The requested sidebar is not visible."), true);
    assert.equal(body.includes("absolutePath"), false);
    assert.equal(body.includes("/private/tmp"), false);
    assert.equal(body.includes("data:image"), false);
    assert.equal(body.includes("base64"), false);
    assert.equal(body.includes("cookie"), false);
    assert.equal(body.includes("token"), false);
  });

  it("persists checkpoint evidence on validation snapshots", async () => {
    const app = createTestApp({
      devOpsValidator: {
        async validate() {
          return {
            id: "val_checkpoint",
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
            summary: "Controlled validation completed successfully.",
            checkpoint: {
              sha: "0123456789abcdef0123456789abcdef01234567",
              shortSha: "0123456789ab",
              message: "devcrew: implement task task_000001",
              createdAt: "2026-08-03T07:00:00.000Z",
              filesChanged: ["src/app.ts"],
            },
            remoteBranch: {
              remote: "origin",
              branch: "devcrew/task-task_000001",
              commitSha: "0123456789abcdef0123456789abcdef01234567",
              pushedAt: "2026-08-03T07:01:00.000Z",
            },
          };
        },
      },
    });
    assert.equal((await createProject(app)).status, 201);
    assert.equal((await createTask(app)).status, 201);
    assert.equal((await decidePlan(app, { decision: "APPROVE" })).status, 200);
    assert.equal((await executeTask(app)).status, 200);

    const validated = await validateTask(app);
    const read = await app.request(
      "/api/v1/projects/proj_000001/tasks/task_000001",
    );
    const validatedBody = await validated.json();

    assert.equal(validated.status, 200);
    assert.equal(read.status, 200);
    assert.deepEqual(validatedBody.task.validation.checkpoint, {
      sha: "0123456789abcdef0123456789abcdef01234567",
      shortSha: "0123456789ab",
      message: "devcrew: implement task task_000001",
      createdAt: "2026-08-03T07:00:00.000Z",
      filesChanged: ["src/app.ts"],
    });
    assert.deepEqual(validatedBody.task.validation.remoteBranch, {
      remote: "origin",
      branch: "devcrew/task-task_000001",
      commitSha: "0123456789abcdef0123456789abcdef01234567",
      pushedAt: "2026-08-03T07:01:00.000Z",
    });
    assert.deepEqual(await read.json(), validatedBody);
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

  it("reviews a validation-completed task synchronously with a persisted approved verdict", async () => {
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
        "2026-08-03T09:00:00.000Z",
        "2026-08-03T10:00:00.000Z",
        "2026-08-03T11:00:00.000Z",
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
    assert.equal((await validateTask(app)).status, 200);

    const response = await reviewTask(app);

    assert.equal(response.status, 200);
    assert.equal(response.headers.get("X-Request-Id"), "req_task_test");
    assert.deepEqual(await response.json(), {
      task: {
        id: "task_000001",
        projectId: "proj_000001",
        title: "Implement authentication middleware",
        description: "Protect every API route with JWT middleware.",
        status: "REVIEW_COMPLETED",
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
        review: {
          id: "review_000001",
          role: "REVIEWER",
          status: "COMPLETED",
          verdict: "APPROVED",
          attempt: 1,
          startedAt: "2026-08-03T09:00:00.000Z",
          completedAt: "2026-08-03T10:00:00.000Z",
          summary: "Deterministic review completed successfully.",
          findings: [
            {
              severity: "INFO",
              title: "Implementation evidence available",
              description:
                "The implementation and validation evidence are complete for deterministic review.",
            },
          ],
        },
        createdAt: "2026-08-03T01:00:00.000Z",
        updatedAt: "2026-08-03T11:00:00.000Z",
      },
    });
  });

  it("keeps plan, decision, execution, and validation unchanged during review", async () => {
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
        "2026-08-03T09:00:00.000Z",
        "2026-08-03T10:00:00.000Z",
        "2026-08-03T11:00:00.000Z",
      ],
    });
    assert.equal((await createProject(app)).status, 201);
    assert.equal((await createTask(app)).status, 201);
    assert.equal((await decidePlan(app, { decision: "APPROVE" })).status, 200);
    assert.equal((await executeTask(app)).status, 200);
    const validated = await validateTask(app);
    const validatedTask = (await validated.json()).task;

    const reviewed = await reviewTask(app);
    const reviewedTask = (await reviewed.json()).task;

    assert.deepEqual(reviewedTask.plan, validatedTask.plan);
    assert.deepEqual(reviewedTask.planDecision, validatedTask.planDecision);
    assert.deepEqual(reviewedTask.execution, validatedTask.execution);
    assert.deepEqual(reviewedTask.validation, validatedTask.validation);
  });

  it("returns the exact persisted review snapshot on later task reads", async () => {
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
        "2026-08-03T09:00:00.000Z",
        "2026-08-03T10:00:00.000Z",
        "2026-08-03T11:00:00.000Z",
      ],
    });
    assert.equal((await createProject(app)).status, 201);
    assert.equal((await createTask(app)).status, 201);
    assert.equal((await decidePlan(app, { decision: "APPROVE" })).status, 200);
    assert.equal((await executeTask(app)).status, 200);
    assert.equal((await validateTask(app)).status, 200);

    const reviewed = await reviewTask(app);
    const read = await app.request(
      "/api/v1/projects/proj_000001/tasks/task_000001",
    );

    assert.equal(read.status, 200);
    assert.deepEqual(await read.json(), await reviewed.json());
  });

  it("rejects review while waiting for approval", async () => {
    const app = createTestApp();
    assert.equal((await createProject(app)).status, 201);
    assert.equal((await createTask(app)).status, 201);

    const response = await reviewTask(app);

    assert.equal(response.status, 409);
    assert.equal(
      (await response.json()).error.code,
      "INVALID_TASK_TRANSITION",
    );
  });

  it("rejects review after approval but before execution", async () => {
    const app = createTestApp();
    assert.equal((await createProject(app)).status, 201);
    assert.equal((await createTask(app)).status, 201);
    assert.equal((await decidePlan(app, { decision: "APPROVE" })).status, 200);

    const response = await reviewTask(app);

    assert.equal(response.status, 409);
    assert.equal(
      (await response.json()).error.code,
      "INVALID_TASK_TRANSITION",
    );
  });

  it("rejects review after plan rejection", async () => {
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

    const response = await reviewTask(app);

    assert.equal(response.status, 409);
    assert.equal(
      (await response.json()).error.code,
      "INVALID_TASK_TRANSITION",
    );
  });

  it("rejects review after implementation before validation", async () => {
    const app = createTestApp();
    assert.equal((await createProject(app)).status, 201);
    assert.equal((await createTask(app)).status, 201);
    assert.equal((await decidePlan(app, { decision: "APPROVE" })).status, 200);
    assert.equal((await executeTask(app)).status, 200);

    const response = await reviewTask(app);

    assert.equal(response.status, 409);
    assert.equal(
      (await response.json()).error.code,
      "INVALID_TASK_TRANSITION",
    );
  });

  it("rejects reviewing a completed review again", async () => {
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
        "2026-08-03T09:00:00.000Z",
        "2026-08-03T10:00:00.000Z",
        "2026-08-03T11:00:00.000Z",
      ],
    });
    assert.equal((await createProject(app)).status, 201);
    assert.equal((await createTask(app)).status, 201);
    assert.equal((await decidePlan(app, { decision: "APPROVE" })).status, 200);
    assert.equal((await executeTask(app)).status, 200);
    assert.equal((await validateTask(app)).status, 200);
    assert.equal((await reviewTask(app)).status, 200);

    const response = await reviewTask(app);

    assert.equal(response.status, 409);
    assert.equal(
      (await response.json()).error.code,
      "INVALID_TASK_TRANSITION",
    );
  });

  it("returns project not found for review in an unknown project", async () => {
    const app = createTestApp();

    const response = await reviewTask(app, "proj_missing", "task_000001");

    assert.equal(response.status, 404);
    assert.equal((await response.json()).error.code, "PROJECT_NOT_FOUND");
  });

  it("returns task not found for review of an unknown task", async () => {
    const app = createTestApp();
    assert.equal((await createProject(app)).status, 201);

    const response = await reviewTask(app, "proj_000001", "task_missing");

    assert.equal(response.status, 404);
    assert.equal((await response.json()).error.code, "TASK_NOT_FOUND");
  });

  it("rejects cross-project task review", async () => {
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
    assert.equal((await validateTask(app)).status, 200);

    const response = await reviewTask(app, "proj_000002", "task_000001");

    assert.equal(response.status, 404);
    assert.equal((await response.json()).error.code, "TASK_NOT_FOUND");
  });

  it("rejects invalid review path parameters", async () => {
    const app = createTestApp();

    const response = await reviewTask(app, "not a project", "not a task");

    assert.equal(response.status, 400);
    assert.equal((await response.json()).error.code, "VALIDATION_FAILED");
  });

  it("rejects non-empty review request bodies", async () => {
    const app = createTestApp();
    assert.equal((await createProject(app)).status, 201);
    assert.equal((await createTask(app)).status, 201);
    assert.equal((await decidePlan(app, { decision: "APPROVE" })).status, 200);
    assert.equal((await executeTask(app)).status, 200);
    assert.equal((await validateTask(app)).status, 200);

    const response = await reviewTask(app, "proj_000001", "task_000001", {
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ unexpected: true }),
    });

    assert.equal(response.status, 400);
    assert.equal((await response.json()).error.code, "VALIDATION_FAILED");
  });

  it("propagates request ids on review success and errors", async () => {
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
        "2026-08-03T09:00:00.000Z",
        "2026-08-03T10:00:00.000Z",
        "2026-08-03T11:00:00.000Z",
      ],
    });
    assert.equal((await createProject(app)).status, 201);
    assert.equal((await createTask(app)).status, 201);
    assert.equal((await decidePlan(app, { decision: "APPROVE" })).status, 200);
    assert.equal((await executeTask(app)).status, 200);
    assert.equal((await validateTask(app)).status, 200);

    const success = await reviewTask(app, "proj_000001", "task_000001", {
      headers: { "X-Request-Id": "req_review_success" },
    });
    const error = await reviewTask(app, "proj_000001", "task_000001", {
      headers: { "X-Request-Id": "req_review_error" },
    });

    assert.equal(success.status, 200);
    assert.equal(success.headers.get("X-Request-Id"), "req_review_success");
    assert.equal(error.status, 409);
    assert.equal(error.headers.get("X-Request-Id"), "req_review_error");
    assert.equal((await error.json()).requestId, "req_review_error");
  });

  it("sanitizes unexpected reviewer failures", async () => {
    const sensitiveMessage = "SENSITIVE_REVIEWER_DETAIL";
    const taskReviewer: TaskReviewer = {
      async review() {
        throw new Error(sensitiveMessage);
      },
    };
    const app = createTestApp({ taskReviewer });
    assert.equal((await createProject(app)).status, 201);
    assert.equal((await createTask(app)).status, 201);
    assert.equal((await decidePlan(app, { decision: "APPROVE" })).status, 200);
    assert.equal((await executeTask(app)).status, 200);
    assert.equal((await validateTask(app)).status, 200);

    const response = await reviewTask(app);
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

  it("does not return filesystem paths, commands, secrets, prompts, or stack traces in review responses", async () => {
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
        "2026-08-03T09:00:00.000Z",
        "2026-08-03T10:00:00.000Z",
        "2026-08-03T11:00:00.000Z",
      ],
    });
    assert.equal((await createProject(app)).status, 201);
    assert.equal((await createTask(app)).status, 201);
    assert.equal((await decidePlan(app, { decision: "APPROVE" })).status, 200);
    assert.equal((await executeTask(app)).status, 200);
    assert.equal((await validateTask(app)).status, 200);

    const response = await reviewTask(app);
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

  it("rejects a concurrent workflow mutation for the same task without blocking reads", async () => {
    const started = deferred<void>();
    const finish = deferred<void>();
    const developerExecutor: DeveloperExecutor = {
      async execute(): Promise<TaskExecution> {
        started.resolve();
        await finish.promise;
        return developerExecution("exec_lock");
      },
    };
    const app = createTestApp({ developerExecutor });
    assert.equal((await createProject(app)).status, 201);
    assert.equal((await createTask(app)).status, 201);
    assert.equal((await decidePlan(app, { decision: "APPROVE" })).status, 200);

    const first = executeTask(app);
    await started.promise;

    const second = await executeTask(app);
    const taskRead = await app.request(
      "/api/v1/projects/proj_000001/tasks/task_000001",
    );
    const activityRead = await app.request("/api/v1/projects/proj_000001/activity");

    assert.equal(second.status, 409);
    assert.deepEqual(await second.json(), {
      requestId: "req_task_test",
      status: "error",
      error: {
        code: "TASK_EXECUTION_IN_PROGRESS",
        message: "Task execution is already in progress",
      },
    });
    assert.equal(taskRead.status, 200);
    assert.equal(activityRead.status, 200);

    finish.resolve();
    assert.equal((await first).status, 200);

    const afterRelease = await executeTask(app);
    assert.equal(afterRelease.status, 409);
    assert.equal(
      (await afterRelease.json()).error.code,
      "INVALID_TASK_TRANSITION",
    );
  });

  it("does not accept client-controlled lock identity fields", async () => {
    const app = createTestApp();
    assert.equal((await createProject(app)).status, 201);
    assert.equal((await createTask(app)).status, 201);
    assert.equal((await decidePlan(app, { decision: "APPROVE" })).status, 200);

    const response = await executeTask(app, "proj_000001", "task_000001", {
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        lockKey: "proj_000002:task_000001",
        ownerId: "browser-owned",
      }),
    });

    assert.equal(response.status, 400);
    assert.equal((await response.json()).error.code, "VALIDATION_FAILED");
  });

  it("allows different task IDs to mutate concurrently", async () => {
    const started = deferred<void>();
    const finish = deferred<void>();
    const completedTasks: string[] = [];
    const developerExecutor: DeveloperExecutor = {
      async execute(input): Promise<TaskExecution> {
        if (input.task.id === "task_000001") {
          started.resolve();
          await finish.promise;
        }

        completedTasks.push(input.task.id);
        return developerExecution(`exec_${input.task.id}`);
      },
    };
    const app = createTestApp({ developerExecutor });
    assert.equal((await createProject(app)).status, 201);
    assert.equal((await createTask(app)).status, 201);
    assert.equal((await decidePlan(app, { decision: "APPROVE" })).status, 200);
    assert.equal((await createTask(app)).status, 201);
    assert.equal(
      (await decidePlan(app, { decision: "APPROVE" }, "proj_000001", "task_000002"))
        .status,
      200,
    );

    const first = executeTask(app, "proj_000001", "task_000001");
    await started.promise;
    const second = await executeTask(app, "proj_000001", "task_000002");

    assert.equal(second.status, 200);
    finish.resolve();
    assert.equal((await first).status, 200);
    assert.deepEqual(completedTasks, ["task_000002", "task_000001"]);
  });

  it("releases the lock after a thrown workflow failure so retry can proceed", async () => {
    let calls = 0;
    const developerExecutor: DeveloperExecutor = {
      async execute(): Promise<TaskExecution> {
        calls += 1;
        if (calls === 1) {
          throw createRetryStageFailure(
            "DEVELOPER",
            "PROVIDER_TIMEOUT",
            true,
          );
        }

        return developerExecution("exec_after_failure");
      },
    };
    const app = createTestApp({ developerExecutor });
    assert.equal((await createProject(app)).status, 201);
    assert.equal((await createTask(app)).status, 201);
    assert.equal((await decidePlan(app, { decision: "APPROVE" })).status, 200);

    const failed = await executeTask(app);
    assert.equal(failed.status, 500);

    const retried = await retryTask(app);
    assert.equal(retried.status, 200);
    assert.equal((await retried.json()).task.execution.id, "exec_after_failure");
    assert.equal(calls, 2);
  });

  it("keeps cancellation callable while a task execution lock is held and releases after abort", async () => {
    const started = deferred<void>();
    const developerExecutor: DeveloperExecutor = {
      async execute(input) {
        started.resolve();
        return await new Promise<TaskExecution>((_resolve, reject) => {
          input.signal?.addEventListener(
            "abort",
            () => reject(input.signal?.reason ?? new Error("cancelled")),
            { once: true },
          );
        });
      },
    };
    const app = createTestApp({ developerExecutor });
    assert.equal((await createProject(app)).status, 201);
    assert.equal((await createTask(app)).status, 201);
    assert.equal((await decidePlan(app, { decision: "APPROVE" })).status, 200);

    const executing = executeTask(app);
    await started.promise;

    const cancellation = await cancelTask(app);
    assert.equal(cancellation.status, 200);
    assert.equal((await cancellation.json()).task.cancellation.status, "REQUESTED");
    assert.equal((await executing).status, 409);

    const afterAbort = await executeTask(app);
    assert.equal(afterAbort.status, 409);
    assert.equal((await afterAbort.json()).error.code, "INVALID_TASK_TRANSITION");
  });

  it("does not deadlock retry or visual repair nested orchestration", async () => {
    let developerCalls = 0;
    let validationCalls = 0;
    const developerExecutor: DeveloperExecutor = {
      async execute(input): Promise<TaskExecution> {
        developerCalls += 1;
        if (developerCalls === 1) {
          throw createRetryStageFailure(
            "DEVELOPER",
            "PROVIDER_TIMEOUT",
            true,
          );
        }

        return developerExecution(
          input.repairContext === undefined ? "exec_retry" : "exec_repair",
        );
      },
    };
    const devOpsValidator: DevOpsValidator = {
      async validate(): Promise<TaskValidation> {
        validationCalls += 1;
        if (validationCalls === 1) {
          return validationWithFailedVisualReviewScreenshot();
        }

        return validationWithPassedVisualReview();
      },
    };
    const app = createTestApp({ developerExecutor, devOpsValidator });
    assert.equal((await createProject(app)).status, 201);
    assert.equal((await createTask(app)).status, 201);
    assert.equal((await decidePlan(app, { decision: "APPROVE" })).status, 200);
    assert.equal((await executeTask(app)).status, 500);
    assert.equal((await retryTask(app)).status, 200);

    const validated = await validateTask(app);
    const body = await validated.json();

    assert.equal(validated.status, 200);
    assert.equal(body.task.visualRepair.outcome, "PASSED");
    assert.equal(body.task.visualRepair.attempts.length, 1);
    assert.equal(developerCalls, 3);
    assert.equal(validationCalls, 2);
  });

  it("rejects concurrent PR creation before duplicate side effects can run", async () => {
    const started = deferred<void>();
    const finish = deferred<void>();
    let pullRequestCalls = 0;
    const pullRequestCreator: TaskPullRequestCreator = {
      async createPullRequest() {
        pullRequestCalls += 1;
        started.resolve();
        await finish.promise;
        return {
          created: true,
          evidence: {
            number: 42,
            url: "https://github.com/example/devcrew/pull/42",
            state: "OPEN",
            headBranch: "devcrew/task-task_000001",
            baseBranch: "main",
            commitSha: "0123456789abcdef0123456789abcdef01234567",
            createdAt: "2026-08-03T07:00:00.000Z",
          },
        };
      },
    };
    const app = createTestApp({ pullRequestCreator });
    assert.equal((await createProject(app)).status, 201);
    assert.equal((await createTask(app)).status, 201);
    assert.equal((await decidePlan(app, { decision: "APPROVE" })).status, 200);
    assert.equal((await executeTask(app)).status, 200);
    assert.equal((await validateTask(app)).status, 200);
    assert.equal((await reviewTask(app)).status, 200);

    const first = createPullRequest(app);
    await started.promise;
    const duplicate = await createPullRequest(app);

    assert.equal(duplicate.status, 409);
    assert.equal(
      (await duplicate.json()).error.code,
      "TASK_EXECUTION_IN_PROGRESS",
    );
    assert.equal(pullRequestCalls, 1);

    finish.resolve();
    assert.equal((await first).status, 200);
  });

  it("records a retryable Developer failure and retries through the controlled endpoint", async () => {
    let calls = 0;
    const developerExecutor: DeveloperExecutor = {
      async execute(): Promise<TaskExecution> {
        calls += 1;
        if (calls === 1) {
          throw createRetryStageFailure(
            "DEVELOPER",
            "PROVIDER_TIMEOUT",
            true,
          );
        }

        return developerExecution("exec_retry");
      },
    };
    const app = createTestApp({
      developerExecutor,
      dates: [
        "2026-08-03T01:00:00.000Z",
        "2026-08-03T02:00:00.000Z",
        "2026-08-03T03:00:00.000Z",
        "2026-08-03T04:00:00.000Z",
        "2026-08-03T05:00:00.000Z",
        "2026-08-03T06:00:00.000Z",
      ],
    });
    assert.equal((await createProject(app)).status, 201);
    assert.equal((await createTask(app)).status, 201);
    assert.equal((await decidePlan(app, { decision: "APPROVE" })).status, 200);

    const failed = await executeTask(app);
    assert.equal(failed.status, 500);

    const failedTask = await (
      await app.request("/api/v1/projects/proj_000001/tasks/task_000001")
    ).json();
    assert.equal(failedTask.task.status, "PLAN_APPROVED");
    assert.equal(failedTask.task.retryRecovery.failedStage, "DEVELOPER");
    assert.equal(failedTask.task.retryRecovery.retryAvailable, true);
    assert.equal(failedTask.task.retryRecovery.attempts.length, 1);
    assert.equal(
      failedTask.task.retryRecovery.attempts[0].category,
      "PROVIDER_TIMEOUT",
    );

    const rejectedBody = await retryTask(app, "proj_000001", "task_000001", {
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ stage: "DEVOPS" }),
    });
    assert.equal(rejectedBody.status, 400);

    const retried = await retryTask(app, "proj_000001", "task_000001", {
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    assert.equal(retried.status, 200);
    const body = await retried.json();
    assert.equal(body.task.status, "IMPLEMENTATION_COMPLETED");
    assert.equal(body.task.execution.id, "exec_retry");
    assert.equal(body.task.retryRecovery.retryAvailable, false);
    assert.equal(body.task.retryRecovery.failedStage, undefined);
    assert.equal(body.task.retryRecovery.attempts.length, 2);
    assert.equal(body.task.retryRecovery.attempts[1].status, "SUCCEEDED");
    assert.equal(calls, 2);

    const duplicate = await retryTask(app);
    assert.equal(duplicate.status, 409);
    assert.equal(calls, 2);
  });

  it("fails closed for non-retryable Developer output failures", async () => {
    const developerExecutor: DeveloperExecutor = {
      async execute() {
        throw createRetryStageFailure(
          "DEVELOPER",
          "MODEL_OUTPUT_SCHEMA_INVALID",
          false,
        );
      },
    };
    const app = createTestApp({ developerExecutor });
    assert.equal((await createProject(app)).status, 201);
    assert.equal((await createTask(app)).status, 201);
    assert.equal((await decidePlan(app, { decision: "APPROVE" })).status, 200);

    const failed = await executeTask(app);
    assert.equal(failed.status, 500);

    const task = await (
      await app.request("/api/v1/projects/proj_000001/tasks/task_000001")
    ).json();
    assert.equal(task.task.retryRecovery.retryAvailable, false);
    assert.equal(task.task.retryRecovery.exhausted, false);
    assert.equal(
      task.task.retryRecovery.attempts[0].category,
      "MODEL_OUTPUT_SCHEMA_INVALID",
    );

    const retry = await retryTask(app);
    assert.equal(retry.status, 409);
  });

  it("does not create generic retry evidence for a Visual Review FAILED verdict", async () => {
    const devOpsValidator: DevOpsValidator = {
      async validate(): Promise<TaskValidation> {
        return validationWithFailedVisualReview();
      },
    };
    const app = createTestApp({ devOpsValidator });
    assert.equal((await createProject(app)).status, 201);
    assert.equal((await createTask(app)).status, 201);
    assert.equal((await decidePlan(app, { decision: "APPROVE" })).status, 200);
    assert.equal((await executeTask(app)).status, 200);

    const validated = await validateTask(app);
    assert.equal(validated.status, 200);
    const body = await validated.json();
    assert.equal(body.task.validation.visualReview.status, "FAILED");
    assert.equal(body.task.retryRecovery, undefined);

    const retry = await retryTask(app);
    assert.equal(retry.status, 409);
  });

  it("marks retry exhausted after the server-owned second attempt fails", async () => {
    let calls = 0;
    const taskReviewer: TaskReviewer = {
      async review() {
        calls += 1;
        throw createRetryStageFailure("REVIEWER", "PROVIDER_NETWORK", true);
      },
    };
    const app = createTestApp({ taskReviewer });
    assert.equal((await createProject(app)).status, 201);
    assert.equal((await createTask(app)).status, 201);
    assert.equal((await decidePlan(app, { decision: "APPROVE" })).status, 200);
    assert.equal((await executeTask(app)).status, 200);
    assert.equal((await validateTask(app)).status, 200);

    assert.equal((await reviewTask(app)).status, 500);
    const retried = await retryTask(app);
    assert.equal(retried.status, 500);

    const task = await (
      await app.request("/api/v1/projects/proj_000001/tasks/task_000001")
    ).json();
    assert.equal(task.task.retryRecovery.failedStage, "REVIEWER");
    assert.equal(task.task.retryRecovery.retryAvailable, false);
    assert.equal(task.task.retryRecovery.exhausted, true);
    assert.equal(task.task.retryRecovery.attempts.length, 2);
    assert.equal(task.task.retryRecovery.attempts[0].status, "FAILED");
    assert.equal(task.task.retryRecovery.attempts[1].status, "FAILED");
    assert.equal(calls, 2);

    const third = await retryTask(app);
    assert.equal(third.status, 409);
    assert.equal(calls, 2);
  });
});

function developerExecution(id: string): TaskExecution {
  return {
    id,
    role: "FULL_STACK_DEVELOPER",
    status: "COMPLETED",
    attempt: 1,
    startedAt: "2026-08-03T03:00:00.000Z",
    completedAt: "2026-08-03T03:01:00.000Z",
    result: {
      summary: "Implemented retry-safe change.",
      changedFiles: ["src/app.ts"],
      verification: ["npm test"],
    },
  };
}

function validationWithFailedVisualReview(): TaskValidation {
  return {
    id: "val_visual_failed",
    role: "DEVOPS_ENGINEER",
    status: "PASSED",
    attempt: 1,
    startedAt: "2026-08-03T04:00:00.000Z",
    completedAt: "2026-08-03T04:01:00.000Z",
    checks: [
      {
        name: "typecheck",
        status: "PASSED",
        summary: "Type checking completed successfully.",
      },
    ],
    summary: "Validation passed with visual findings.",
    visualReview: {
      status: "FAILED",
      summary: "The requested UI is visibly incomplete.",
      findings: [
        {
          severity: "ERROR",
          category: "missing-element",
          title: "Panel missing",
          description: "The required panel is not visible.",
        },
      ],
      screenshotId: "shot_missing_panel",
      reviewedAt: "2026-08-03T04:01:00.000Z",
    },
  };
}

function validationWithFailedVisualReviewScreenshot(): TaskValidation {
  return {
    ...validationWithFailedVisualReview(),
    browserVerification: {
      status: "PASSED",
      url: "http://127.0.0.1:3000/",
      pageTitle: "Devcrew",
      verifiedAt: "2026-08-03T04:00:30.000Z",
    },
    browserScreenshot: {
      status: "CAPTURED",
      id: "shot_before_repair",
      url: "http://127.0.0.1:3000/",
      viewport: {
        width: 1440,
        height: 900,
      },
      capturedAt: "2026-08-03T04:00:45.000Z",
    },
    visualReview: {
      status: "FAILED",
      summary: "The requested UI is visibly incomplete.",
      findings: [
        {
          severity: "ERROR",
          category: "missing-element",
          title: "Panel missing",
          description: "The required panel is not visible.",
        },
      ],
      screenshotId: "shot_before_repair",
      reviewedAt: "2026-08-03T04:01:00.000Z",
    },
  };
}

function validationWithPassedVisualReview(): TaskValidation {
  return {
    id: "val_visual_passed",
    role: "DEVOPS_ENGINEER",
    status: "PASSED",
    attempt: 1,
    startedAt: "2026-08-03T05:00:00.000Z",
    completedAt: "2026-08-03T05:01:00.000Z",
    checks: [
      {
        name: "typecheck",
        status: "PASSED",
        summary: "Type checking completed successfully.",
      },
    ],
    summary: "Validation passed after visual repair.",
    browserVerification: {
      status: "PASSED",
      url: "http://127.0.0.1:3000/",
      pageTitle: "Devcrew",
      verifiedAt: "2026-08-03T05:00:30.000Z",
    },
    browserScreenshot: {
      status: "CAPTURED",
      id: "shot_after_repair",
      url: "http://127.0.0.1:3000/",
      viewport: {
        width: 1440,
        height: 900,
      },
      capturedAt: "2026-08-03T05:00:45.000Z",
    },
    visualReview: {
      status: "PASSED",
      summary: "The visual repair resolved the issue.",
      findings: [],
      screenshotId: "shot_after_repair",
      reviewedAt: "2026-08-03T05:01:00.000Z",
    },
  };
}

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

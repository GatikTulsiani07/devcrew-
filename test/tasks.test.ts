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

function createTestApp(planner: TaskPlanner = createDeterministicPlanner()) {
  const projectService = createDeterministicProjectService();
  let taskCount = 0;

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
      now: () => new Date("2026-08-03T01:00:00.000Z"),
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
    const app = createTestApp(planner);
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
});

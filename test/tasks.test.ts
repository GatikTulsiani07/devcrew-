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
import {
  RepositoryDriftError,
  type RepositoryDriftVerifier,
} from "../src/repositories/repository-drift.js";
import { createDeterministicDeveloperExecutor } from "../src/tasks/deterministic-developer-executor.js";
import { createDeterministicDevOpsValidator } from "../src/tasks/deterministic-devops-validator.js";
import { createDeterministicPlanner } from "../src/tasks/deterministic-planner.js";
import { createDeterministicReviewer } from "../src/tasks/deterministic-reviewer.js";
import { InMemoryTaskStore } from "../src/tasks/in-memory-task-store.js";
import {
  createTaskExecutionBudget,
  DEFAULT_TASK_EXECUTION_TIMEOUT_MS,
  type TaskExecutionBudget,
} from "../src/tasks/task-execution-budget.js";
import { createTaskService } from "../src/tasks/task-service.js";
import type { MonotonicClock } from "../src/tasks/workflow-duration.js";
import type {
  DeveloperExecutor,
  DevOpsPublisher,
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

function withoutTaskOutcome<T>(body: T): T {
  const copy = structuredClone(body);

  if (
    typeof copy === "object" &&
    copy !== null &&
    "task" in copy &&
    typeof copy.task === "object" &&
    copy.task !== null &&
    "taskOutcome" in copy.task
  ) {
    delete copy.task.taskOutcome;
  }

  return copy;
}

interface TestAppOptions {
  planner?: ManagerPlanner;
  developerExecutor?: DeveloperExecutor;
  devOpsValidator?: DevOpsValidator;
  taskReviewer?: TaskReviewer;
  pullRequestCreator?: TaskPullRequestCreator;
  activityService?: ActivityService;
  dates?: readonly string[];
  createExecutionBudget?: () => TaskExecutionBudget;
  durationClock?: MonotonicClock;
  repositoryDriftVerifier?: RepositoryDriftVerifier;
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
  createExecutionBudget,
  durationClock,
  repositoryDriftVerifier,
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
      ...(createExecutionBudget === undefined ? {} : { createExecutionBudget }),
      ...(durationClock === undefined ? {} : { durationClock }),
      ...(repositoryDriftVerifier === undefined
        ? {}
        : { repositoryDriftVerifier }),
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

async function resumeTask(
  app: ReturnType<typeof createTestApp>,
  projectId = "proj_000001",
  taskId = "task_000001",
  init: RequestInit = {},
) {
  return app.request(
    `/api/v1/projects/${projectId}/tasks/${taskId}/resume`,
    {
      method: "POST",
      ...init,
    },
  );
}

function developerWithGitEvidence(
  counter?: { calls: number },
): DeveloperExecutor {
  return {
    async execute(): Promise<TaskExecution> {
      if (counter !== undefined) counter.calls += 1;
      return {
        id: "exec_git",
        role: "FULL_STACK_DEVELOPER",
        status: "COMPLETED",
        attempt: 1,
        startedAt: "2026-08-03T03:00:00.000Z",
        completedAt: "2026-08-03T04:00:00.000Z",
        result: {
          summary: "Developer narrative mentions src/wrong.ts.",
          changedFiles: ["src/wrong.ts"],
          verification: ["Developer narrative verification."],
          repositoryChanges: {
            filesChanged: ["src/app.ts"],
            filesAdded: [],
            filesModified: ["src/app.ts"],
            filesDeleted: [],
            totalFilesChanged: 1,
            insertions: 2,
            deletions: 1,
          },
          changeEvidence: {
            files: [
              {
                path: "src/app.ts",
                status: "MODIFIED",
                additions: 2,
                deletions: 1,
              },
            ],
            summary: { filesChanged: 1, additions: 2, deletions: 1 },
          },
        },
      };
    },
  };
}

function throwingDriftVerifier(): RepositoryDriftVerifier {
  return {
    async verifyTaskRepository() {
      throw new RepositoryDriftError("WORKTREE_CHANGED");
    },
  };
}

function failOnDriftCheck(failingCall: number): RepositoryDriftVerifier {
  let calls = 0;

  return {
    async verifyTaskRepository() {
      calls += 1;
      if (calls === failingCall) {
        throw new RepositoryDriftError("WORKTREE_CHANGED");
      }
    },
  };
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
        taskOutcome: {
          outcome: "IN_PROGRESS",
          implementationCompleted: false,
          validationPassed: false,
          visualReviewPassed: null,
          reviewerPassed: false,
          pullRequestCreated: false,
          repairAttempts: 0,
          retryAttempts: 0,
          changedFileCount: null,
          completedAt: null,
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
          durationMs: 0,
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
    const readBody = await read.json();
    assert.deepEqual(readBody.task.taskOutcome, {
      outcome: "IN_PROGRESS",
      implementationCompleted: true,
      validationPassed: false,
      visualReviewPassed: null,
      reviewerPassed: false,
      pullRequestCreated: false,
      repairAttempts: 0,
      retryAttempts: 0,
      changedFileCount: null,
      completedAt: null,
    });
    assert.deepEqual(withoutTaskOutcome(readBody), await executed.json());
  });

  it("preserves safe repository change summary on task reads without raw diffs", async () => {
    const developerExecutor: DeveloperExecutor = {
      async execute() {
        return {
          id: "exec_git",
          role: "FULL_STACK_DEVELOPER",
          status: "COMPLETED",
          attempt: 1,
          startedAt: "2026-08-03T03:00:00.000Z",
          completedAt: "2026-08-03T04:00:00.000Z",
          result: {
            summary: "Updated src/wrong.ts in the Developer narrative.",
            changedFiles: ["Developer said src/wrong.ts"],
            verification: ["Run tests"],
            repositoryChanges: {
              filesChanged: ["src/actual.ts"],
              filesAdded: [],
              filesModified: ["src/actual.ts"],
              filesDeleted: [],
              totalFilesChanged: 1,
              insertions: 4,
              deletions: 2,
            },
            changeEvidence: {
              files: [
                {
                  path: "src/actual.ts",
                  status: "MODIFIED",
                  additions: 4,
                  deletions: 2,
                },
              ],
              summary: { filesChanged: 1, additions: 4, deletions: 2 },
              diff: "RAW DIFF SHOULD NOT BE PERSISTED",
            },
          },
        };
      },
    };
    const app = createTestApp({ developerExecutor });
    assert.equal((await createProject(app)).status, 201);
    assert.equal((await createTask(app)).status, 201);
    assert.equal((await decidePlan(app, { decision: "APPROVE" })).status, 200);
    assert.equal((await executeTask(app)).status, 200);

    const read = await app.request(
      "/api/v1/projects/proj_000001/tasks/task_000001",
    );
    const body = await read.json();
    const result = body.task.execution.result;

    assert.equal(read.status, 200);
    assert.equal(result.summary, "Updated src/wrong.ts in the Developer narrative.");
    assert.deepEqual(result.changedFiles, ["Developer said src/wrong.ts"]);
    assert.deepEqual(result.repositoryChanges, {
      filesChanged: ["src/actual.ts"],
      filesAdded: [],
      filesModified: ["src/actual.ts"],
      filesDeleted: [],
      totalFilesChanged: 1,
      insertions: 4,
      deletions: 2,
    });
    assert.deepEqual(result.changeEvidence, {
      files: [
        {
          path: "src/actual.ts",
          status: "MODIFIED",
          additions: 4,
          deletions: 2,
        },
      ],
      summary: { filesChanged: 1, additions: 4, deletions: 2 },
    });
    assert.equal(JSON.stringify(body).includes("RAW DIFF"), false);
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
    assert.equal(readBody.task.workflowFailure, undefined);

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
          durationMs: 0,
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
          durationMs: 0,
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
    const readBody = await read.json();
    assert.deepEqual(readBody.task.taskOutcome, {
      outcome: "IN_PROGRESS",
      implementationCompleted: true,
      validationPassed: true,
      visualReviewPassed: null,
      reviewerPassed: false,
      pullRequestCreated: false,
      repairAttempts: 0,
      retryAttempts: 0,
      changedFileCount: null,
      completedAt: null,
    });
    assert.deepEqual(withoutTaskOutcome(readBody), await validated.json());
  });

  it("preserves validation selection evidence on later task reads", async () => {
    const devOpsValidator: DevOpsValidator = {
      async validate(): Promise<TaskValidation> {
        return {
          id: "val_selection",
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
          ],
          summary: "Controlled validation completed successfully.",
          validationSelection: {
            strategy: "TARGETED",
            categories: ["DOCUMENTATION"],
            browserVerificationSelected: false,
            reason: "DOCUMENTATION_ONLY",
          },
        };
      },
    };
    const app = createTestApp({ devOpsValidator });
    assert.equal((await createProject(app)).status, 201);
    assert.equal((await createTask(app)).status, 201);
    assert.equal((await decidePlan(app, { decision: "APPROVE" })).status, 200);
    assert.equal((await executeTask(app)).status, 200);
    assert.equal((await validateTask(app)).status, 200);

    const read = await app.request(
      "/api/v1/projects/proj_000001/tasks/task_000001",
    );
    const body = await read.json();

    assert.equal(read.status, 200);
    assert.deepEqual(body.task.validation.validationSelection, {
      strategy: "TARGETED",
      categories: ["DOCUMENTATION"],
      browserVerificationSelected: false,
      reason: "DOCUMENTATION_ONLY",
    });
    assert.equal(JSON.stringify(body).includes("npm run"), false);
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
    assert.deepEqual(withoutTaskOutcome(await read.json()), await validated.json());
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
    assert.deepEqual(withoutTaskOutcome(await read.json()), validatedBody);
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
          durationMs: 0,
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
          durationMs: 0,
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
          durationMs: 0,
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
    const readBody = await read.json();
    assert.deepEqual(readBody.task.taskOutcome, {
      outcome: "IN_PROGRESS",
      implementationCompleted: true,
      validationPassed: true,
      visualReviewPassed: null,
      reviewerPassed: true,
      pullRequestCreated: false,
      repairAttempts: 0,
      retryAttempts: 0,
      changedFileCount: null,
      completedAt: null,
    });
    assert.deepEqual(withoutTaskOutcome(readBody), await reviewed.json());
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
    const app = createTestApp({
      taskReviewer,
      durationClock: (() => {
        const ticks = [0, 1, 2, 3, 4, 10, 20, 35];
        let index = 0;
        return () => ticks[Math.min(index++, ticks.length - 1)];
      })(),
    });
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

  it("persists independent Visual Repair attempt durations and repair-stage evidence durations", async () => {
    let validationCalls = 0;
    const failedVisualValidation = (
      id: string,
      screenshotId: string,
    ): TaskValidation => ({
      ...validationWithFailedVisualReviewScreenshot(),
      id,
      browserScreenshot: {
        status: "CAPTURED",
        id: screenshotId,
        url: "http://127.0.0.1:3000/",
        viewport: { width: 1440, height: 900 },
        capturedAt: "2026-08-03T04:00:45.000Z",
      },
      visualReview: {
        status: "FAILED",
        summary: `Visible issue remains in ${screenshotId}.`,
        findings: [
          {
            severity: "ERROR",
            category: "missing-element",
            title: "Panel missing",
            description: "The required panel is not visible.",
          },
        ],
        screenshotId,
        reviewedAt: "2026-08-03T04:01:00.000Z",
      },
    });
    const devOpsValidator: DevOpsValidator = {
      async validate(): Promise<TaskValidation> {
        validationCalls += 1;
        if (validationCalls === 1) {
          return failedVisualValidation("val_initial", "shot_initial");
        }
        if (validationCalls === 2) {
          return failedVisualValidation("val_attempt_1", "shot_attempt_1");
        }
        return failedVisualValidation("val_attempt_2", "shot_attempt_2");
      },
    };
    const ticks = [0, 1, 10, 11, 20, 21, 23, 24, 27, 30, 40, 41, 45, 46, 52, 60];
    let index = 0;
    const app = createTestApp({
      devOpsValidator,
      durationClock: () => ticks[Math.min(index++, ticks.length - 1)],
    });
    assert.equal((await createProject(app)).status, 201);
    assert.equal((await createTask(app)).status, 201);
    assert.equal((await decidePlan(app, { decision: "APPROVE" })).status, 200);
    assert.equal((await executeTask(app)).status, 200);

    const validated = await validateTask(app);
    const body = await validated.json();

    assert.equal(validated.status, 200);
    assert.equal(body.task.visualRepair.outcome, "EXHAUSTED");
    assert.equal(body.task.visualRepair.attempts.length, 2);
    assert.equal(body.task.visualRepair.attempts[0].attempt, 1);
    assert.equal(body.task.visualRepair.attempts[1].attempt, 2);
    assert.equal(body.task.visualRepair.attempts[0].durationMs, 10);
    assert.equal(body.task.visualRepair.attempts[1].durationMs, 20);
    assert.equal(body.task.execution.durationMs, 4);
    assert.equal(body.task.validation.durationMs, 6);
    assert.equal(body.task.validation.visualReview.status, "FAILED");
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

  it("persists server-owned durations for successful Developer, DevOps, Reviewer, and Pull Request stages", async () => {
    const ticks = [0, 7, 10, 29, 30, 35, 40, 45];
    let index = 0;
    let pullRequestCalls = 0;
    const app = createTestApp({
      durationClock: () => ticks[Math.min(index++, ticks.length - 1)],
      pullRequestCreator: {
        async createPullRequest() {
          pullRequestCalls += 1;
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
              durationMs: 999_999,
            },
          };
        },
      },
    });
    assert.equal((await createProject(app)).status, 201);
    assert.equal((await createTask(app)).status, 201);
    assert.equal((await decidePlan(app, { decision: "APPROVE" })).status, 200);

    assert.equal((await executeTask(app)).status, 200);
    assert.equal((await validateTask(app)).status, 200);
    assert.equal((await reviewTask(app)).status, 200);
    const pr = await createPullRequest(app);
    const read = await app.request(
      "/api/v1/projects/proj_000001/tasks/task_000001",
    );
    const body = await read.json();

    assert.equal(pr.status, 200);
    assert.equal(read.status, 200);
    assert.equal(body.task.execution.durationMs, 7);
    assert.equal(body.task.validation.durationMs, 19);
    assert.equal(body.task.review.durationMs, 5);
    assert.equal(body.task.pullRequest.durationMs, 5);
    assert.deepEqual(body.task.taskOutcome, {
      outcome: "SUCCEEDED",
      implementationCompleted: true,
      validationPassed: true,
      visualReviewPassed: null,
      reviewerPassed: true,
      pullRequestCreated: true,
      repairAttempts: 0,
      retryAttempts: 0,
      changedFileCount: null,
      completedAt: "2026-08-03T07:00:00.000Z",
    });
    assert.equal(pullRequestCalls, 1);
    assert.equal(JSON.stringify(body).includes("999999"), false);
  });

  it("rejects client duration input and overwrites task/provider duration claims", async () => {
    const developerExecutor: DeveloperExecutor = {
      async execute(): Promise<TaskExecution> {
        return {
          ...developerExecution("exec_duration_claim"),
          durationMs: 123_456,
        };
      },
    };
    const ticks = [0, 3];
    let index = 0;
    const app = createTestApp({
      developerExecutor,
      durationClock: () => ticks[Math.min(index++, ticks.length - 1)],
    });
    assert.equal((await createProject(app)).status, 201);
    assert.equal((await createTask(app)).status, 201);
    assert.equal((await decidePlan(app, { decision: "APPROVE" })).status, 200);

    const rejected = await executeTask(app, "proj_000001", "task_000001", {
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ durationMs: 123_456 }),
    });
    const executed = await app.request(
      "/api/v1/projects/proj_000001/tasks/task_000001/execute?durationMs=123456",
      { method: "POST" },
    );
    const body = await executed.json();

    assert.equal(rejected.status, 400);
    assert.equal(executed.status, 200);
    assert.equal(body.task.execution.durationMs, 3);
    assert.equal(JSON.stringify(body).includes("123456"), false);
  });

  it("bounds duration values to safe integer milliseconds and preserves them on reads", async () => {
    const ticks = [Number.NaN, Number.POSITIVE_INFINITY, 0, 1_000_000_000];
    let index = 0;
    const app = createTestApp({
      durationClock: () => ticks[Math.min(index++, ticks.length - 1)],
    });
    assert.equal((await createProject(app)).status, 201);
    assert.equal((await createTask(app)).status, 201);
    assert.equal((await decidePlan(app, { decision: "APPROVE" })).status, 200);

    const executed = await executeTask(app);
    const validated = await validateTask(app);
    const read = await app.request(
      "/api/v1/projects/proj_000001/tasks/task_000001",
    );
    const body = await read.json();

    assert.equal(executed.status, 200);
    assert.equal(validated.status, 200);
    assert.equal(Number.isInteger(body.task.execution.durationMs), true);
    assert.equal(Number.isInteger(body.task.validation.durationMs), true);
    assert.equal(body.task.execution.durationMs, 0);
    assert.equal(body.task.validation.durationMs, 600_000);
    assert.deepEqual(body, await (await app.request(
      "/api/v1/projects/proj_000001/tasks/task_000001",
    )).json());
    assert.equal(JSON.stringify(body).includes("Infinity"), false);
    assert.equal(JSON.stringify(body).includes("NaN"), false);
  });

  it("keeps original Pull Request creation duration on the idempotent path", async () => {
    const ticks = [0, 2, 4, 8, 10, 13, 20, 25, 100, 150];
    let index = 0;
    let pullRequestCalls = 0;
    const app = createTestApp({
      durationClock: () => ticks[Math.min(index++, ticks.length - 1)],
      pullRequestCreator: {
        async createPullRequest() {
          pullRequestCalls += 1;
          return {
            created: pullRequestCalls === 1,
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
      },
    });
    assert.equal((await createProject(app)).status, 201);
    assert.equal((await createTask(app)).status, 201);
    assert.equal((await decidePlan(app, { decision: "APPROVE" })).status, 200);
    assert.equal((await executeTask(app)).status, 200);
    assert.equal((await validateTask(app)).status, 200);
    assert.equal((await reviewTask(app)).status, 200);

    const first = await createPullRequest(app);
    const firstBody = await first.json();
    const second = await createPullRequest(app);
    const secondBody = await second.json();

    assert.equal(first.status, 200);
    assert.equal(second.status, 200);
    assert.equal(firstBody.task.pullRequest.durationMs, 5);
    assert.equal(secondBody.task.pullRequest.durationMs, 5);
    assert.equal(pullRequestCalls, 2);
  });

  it("records workflowFailure and prevents late Developer evidence after total budget expiration", async () => {
    let clock = 0;
    const developerExecutor: DeveloperExecutor = {
      async execute(): Promise<TaskExecution> {
        clock = 20;
        return developerExecution("exec_late");
      },
    };
    const app = createTestApp({
      developerExecutor,
      createExecutionBudget: () =>
        createTaskExecutionBudget({
          now: () => clock,
          timeoutMs: 10,
        }),
    });
    assert.equal((await createProject(app)).status, 201);
    assert.equal((await createTask(app)).status, 201);
    assert.equal((await decidePlan(app, { decision: "APPROVE" })).status, 200);

    const rejectedBody = await executeTask(app, "proj_000001", "task_000001", {
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ timeoutMs: DEFAULT_TASK_EXECUTION_TIMEOUT_MS * 10 }),
    });

    assert.equal(rejectedBody.status, 400);

    const timedOut = await app.request(
      "/api/v1/projects/proj_000001/tasks/task_000001/execute?timeoutMs=999999",
      { method: "POST" },
    );
    assert.equal(timedOut.status, 500);
    const read = await (
      await app.request("/api/v1/projects/proj_000001/tasks/task_000001")
    ).json();
    assert.equal(read.task.execution, undefined);
    assert.equal(read.task.cancellation, undefined);
    assert.equal(read.task.workflowFailure.stage, "DEVELOPER");
    assert.equal(read.task.workflowFailure.category, "TASK_EXECUTION_TIMEOUT");
    assert.equal(read.task.workflowFailure.summary.length <= 300, true);
    assert.equal(read.task.workflowFailure.summary.includes("timeoutMs"), false);
  });

  it("keeps manual cancellation distinct from timeout with the composed signal", async () => {
    let capturedSignal: AbortSignal | undefined;
    const developerExecutor: DeveloperExecutor = {
      async execute(input): Promise<TaskExecution> {
        capturedSignal = input.signal;
        await new Promise<void>((_resolve, reject) => {
          input.signal?.addEventListener(
            "abort",
            () => reject(input.signal?.reason),
            { once: true },
          );
        });
        return developerExecution("exec_never");
      },
    };
    const app = createTestApp({
      developerExecutor,
      createExecutionBudget: () =>
        createTaskExecutionBudget({
          now: () => 0,
          timeoutMs: DEFAULT_TASK_EXECUTION_TIMEOUT_MS,
        }),
    });
    assert.equal((await createProject(app)).status, 201);
    assert.equal((await createTask(app)).status, 201);
    assert.equal((await decidePlan(app, { decision: "APPROVE" })).status, 200);

    const running = executeTask(app);
    while (capturedSignal === undefined) {
      await Promise.resolve();
    }
    const cancelled = await cancelTask(app);
    const completed = await running;
    const task = await (
      await app.request("/api/v1/projects/proj_000001/tasks/task_000001")
    ).json();

    assert.equal(cancelled.status, 200);
    assert.equal(completed.status, 409);
    assert.equal(task.task.cancellation.status, "CANCELLED");
    assert.equal(task.task.workflowFailure, undefined);
  });

  it("preserves completed validation evidence and prevents Reviewer start after expiration", async () => {
    let budgetCount = 0;
    let reviewerCalls = 0;
    const taskReviewer: TaskReviewer = {
      async review() {
        reviewerCalls += 1;
        throw new Error("reviewer should not start");
      },
    };
    const app = createTestApp({
      taskReviewer,
      createExecutionBudget: () => {
        budgetCount += 1;
        return createTaskExecutionBudget({
          now: () => 0,
          timeoutMs: budgetCount === 3 ? 0 : DEFAULT_TASK_EXECUTION_TIMEOUT_MS,
        });
      },
    });
    assert.equal((await createProject(app)).status, 201);
    assert.equal((await createTask(app)).status, 201);
    assert.equal((await decidePlan(app, { decision: "APPROVE" })).status, 200);
    assert.equal((await executeTask(app)).status, 200);
    assert.equal((await validateTask(app)).status, 200);

    const review = await reviewTask(app);
    const task = await (
      await app.request("/api/v1/projects/proj_000001/tasks/task_000001")
    ).json();

    assert.equal(review.status, 500);
    assert.equal(reviewerCalls, 0);
    assert.equal(task.task.validation.status, "PASSED");
    assert.equal(task.task.review, undefined);
    assert.equal(task.task.workflowFailure.stage, "REVIEWER");
    assert.equal(task.task.workflowFailure.category, "TASK_EXECUTION_TIMEOUT");
  });

  it("prevents Pull Request creation after expiration", async () => {
    let budgetCount = 0;
    let pullRequestCalls = 0;
    const app = createTestApp({
      pullRequestCreator: {
        async createPullRequest() {
          pullRequestCalls += 1;
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
      },
      createExecutionBudget: () => {
        budgetCount += 1;
        return createTaskExecutionBudget({
          now: () => 0,
          timeoutMs: budgetCount === 4 ? 0 : DEFAULT_TASK_EXECUTION_TIMEOUT_MS,
        });
      },
    });
    assert.equal((await createProject(app)).status, 201);
    assert.equal((await createTask(app)).status, 201);
    assert.equal((await decidePlan(app, { decision: "APPROVE" })).status, 200);
    assert.equal((await executeTask(app)).status, 200);
    assert.equal((await validateTask(app)).status, 200);
    assert.equal((await reviewTask(app)).status, 200);

    const pr = await createPullRequest(app);
    const task = await (
      await app.request("/api/v1/projects/proj_000001/tasks/task_000001")
    ).json();

    assert.equal(pr.status, 500);
    assert.equal(pullRequestCalls, 0);
    assert.equal(task.task.pullRequest, undefined);
    assert.equal(task.task.workflowFailure.stage, "GITHUB_PULL_REQUEST");
    assert.equal(task.task.workflowFailure.category, "TASK_EXECUTION_TIMEOUT");
  });

  it("does not reset total timeout during retry backoff", async () => {
    const developerExecutor: DeveloperExecutor = {
      async execute(): Promise<TaskExecution> {
        throw createRetryStageFailure("DEVELOPER", "PROVIDER_TIMEOUT", true);
      },
    };
    let budgetCount = 0;
    const app = createTestApp({
      developerExecutor,
      createExecutionBudget: () => {
        budgetCount += 1;
        return createTaskExecutionBudget({
          now: () => 0,
          timeoutMs: budgetCount === 2 ? 1 : DEFAULT_TASK_EXECUTION_TIMEOUT_MS,
        });
      },
    });
    assert.equal((await createProject(app)).status, 201);
    assert.equal((await createTask(app)).status, 201);
    assert.equal((await decidePlan(app, { decision: "APPROVE" })).status, 200);
    assert.equal((await executeTask(app)).status, 500);

    const retried = await retryTask(app);
    const task = await (
      await app.request("/api/v1/projects/proj_000001/tasks/task_000001")
    ).json();

    assert.equal(retried.status, 500);
    assert.equal(task.task.retryRecovery.attempts.length, 2);
    assert.equal(task.task.workflowFailure.category, "TASK_EXECUTION_TIMEOUT");
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
      durationClock: (() => {
        const ticks = [0, 10, 20, 25, 35];
        let index = 0;
        return () => ticks[Math.min(index++, ticks.length - 1)];
      })(),
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
    assert.equal(failedTask.task.workflowFailure.stage, "DEVELOPER");
    assert.equal(failedTask.task.workflowFailure.category, "PROVIDER_TIMEOUT");
    assert.equal(
      failedTask.task.workflowFailure.summary,
      "Developer failed with retryable category PROVIDER_TIMEOUT.",
    );
    assert.equal(
      Number.isNaN(Date.parse(failedTask.task.workflowFailure.failedAt)),
      false,
    );
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
    assert.equal(body.task.execution.durationMs, 5);
    assert.equal(body.task.retryRecovery.retryAvailable, false);
    assert.equal(body.task.retryRecovery.failedStage, undefined);
    assert.equal(body.task.retryRecovery.attempts.length, 2);
    assert.equal(body.task.retryRecovery.attempts[1].status, "SUCCEEDED");
    assert.equal(body.task.retryRecovery.attempts[1].durationMs, 25);
    assert.equal(body.task.workflowFailure, undefined);
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
    assert.equal(task.task.workflowFailure.stage, "DEVELOPER");
    assert.equal(
      task.task.workflowFailure.category,
      "MODEL_OUTPUT_SCHEMA_INVALID",
    );
    assert.equal(
      task.task.workflowFailure.summary,
      "Developer failed with non-retryable category MODEL_OUTPUT_SCHEMA_INVALID.",
    );
    assert.equal(
      Number.isNaN(Date.parse(task.task.workflowFailure.failedAt)),
      false,
    );
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
    assert.equal(body.task.workflowFailure, undefined);

    const retry = await retryTask(app);
    assert.equal(retry.status, 409);
  });

  for (const failureCase of [
    {
      name: "DevOps infrastructure",
      retryStage: "DEVOPS" as const,
      workflowStage: "DEVOPS",
      category: "UNKNOWN_FAILURE" as const,
    },
    {
      name: "browser startup",
      retryStage: "BROWSER" as const,
      workflowStage: "BROWSER_VERIFICATION",
      category: "LOCALHOST_STARTUP_TIMEOUT" as const,
    },
    {
      name: "screenshot capture",
      retryStage: "SCREENSHOT" as const,
      workflowStage: "SCREENSHOT_CAPTURE",
      category: "BROWSER_STARTUP_TRANSIENT" as const,
    },
    {
      name: "Visual Review provider",
      retryStage: "VISUAL_REVIEW" as const,
      workflowStage: "VISUAL_REVIEW_PROVIDER",
      category: "PROVIDER_NETWORK" as const,
    },
  ]) {
    it(`records workflowFailure for ${failureCase.name} failure`, async () => {
      const devOpsValidator: DevOpsValidator = {
        async validate(): Promise<TaskValidation> {
          throw createRetryStageFailure(
            failureCase.retryStage,
            failureCase.category,
            true,
          );
        },
      };
      const app = createTestApp({ devOpsValidator });
      assert.equal((await createProject(app)).status, 201);
      assert.equal((await createTask(app)).status, 201);
      assert.equal((await decidePlan(app, { decision: "APPROVE" })).status, 200);
      assert.equal((await executeTask(app)).status, 200);

      const failed = await validateTask(app);
      assert.equal(failed.status, 500);

      const task = await (
        await app.request("/api/v1/projects/proj_000001/tasks/task_000001")
      ).json();
      assert.equal(task.task.workflowFailure.stage, failureCase.workflowStage);
      assert.equal(task.task.workflowFailure.category, failureCase.category);
      assert.equal(
        task.task.workflowFailure.summary.includes("failed with"),
        true,
      );
    });
  }

  for (const failureCase of [
    {
      name: "Git checkpoint",
      retryStage: "CHECKPOINT" as const,
      workflowStage: "GIT_CHECKPOINT",
      category: "CHECKPOINT_MISMATCH" as const,
    },
    {
      name: "Git push",
      retryStage: "REMOTE_PUSH" as const,
      workflowStage: "GIT_PUSH",
      category: "GIT_PUSH_TRANSIENT" as const,
    },
  ]) {
    it(`records workflowFailure for ${failureCase.name} failure`, async () => {
      const devOpsValidator: DevOpsValidator & DevOpsPublisher = {
        async validate(): Promise<TaskValidation> {
          return validationWithPassedVisualReview();
        },
        async publishValidatedTask(): Promise<TaskValidation> {
          throw createRetryStageFailure(
            failureCase.retryStage,
            failureCase.category,
            failureCase.retryStage === "REMOTE_PUSH",
          );
        },
      };
      const app = createTestApp({ devOpsValidator });
      assert.equal((await createProject(app)).status, 201);
      assert.equal((await createTask(app)).status, 201);
      assert.equal((await decidePlan(app, { decision: "APPROVE" })).status, 200);
      assert.equal((await executeTask(app)).status, 200);

      const failed = await validateTask(app);
      assert.equal(failed.status, 500);

      const task = await (
        await app.request("/api/v1/projects/proj_000001/tasks/task_000001")
      ).json();
      assert.equal(task.task.workflowFailure.stage, failureCase.workflowStage);
      assert.equal(task.task.workflowFailure.category, failureCase.category);
    });
  }

  it("marks retry exhausted after the server-owned second attempt fails", async () => {
    let calls = 0;
    const taskReviewer: TaskReviewer = {
      async review() {
        calls += 1;
        throw createRetryStageFailure("REVIEWER", "PROVIDER_NETWORK", true);
      },
    };
    let durationTick = 0;
    const app = createTestApp({
      taskReviewer,
      durationClock: () => {
        durationTick += 5;
        return durationTick;
      },
    });
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
    assert.equal(task.task.workflowFailure.stage, "REVIEWER");
    assert.equal(task.task.workflowFailure.category, "PROVIDER_NETWORK");
    assert.equal(task.task.retryRecovery.attempts.length, 2);
    assert.equal(task.task.retryRecovery.attempts[0].status, "FAILED");
    assert.equal(task.task.retryRecovery.attempts[1].status, "FAILED");
    assert.equal(task.task.retryRecovery.attempts[1].durationMs, 10);
    assert.equal(calls, 2);

    const third = await retryTask(app);
    assert.equal(third.status, 409);
    assert.equal(calls, 2);
  });
});

describe("repository drift task integration", () => {
  it("records safe workflowFailure and does not run validation after drift", async () => {
    let validationCalls = 0;
    const app = createTestApp({
      developerExecutor: developerWithGitEvidence(),
      repositoryDriftVerifier: throwingDriftVerifier(),
      devOpsValidator: {
        async validate(): Promise<TaskValidation> {
          validationCalls += 1;
          return validationWithPassedVisualReview();
        },
      },
    });
    assert.equal((await createProject(app)).status, 201);
    assert.equal((await createTask(app)).status, 201);
    assert.equal((await decidePlan(app, { decision: "APPROVE" })).status, 200);
    assert.equal((await executeTask(app)).status, 200);

    const response = await validateTask(app);
    const errorBody = await response.json();
    const read = await app.request("/api/v1/projects/proj_000001/tasks/task_000001");
    const readBody = await read.json();

    assert.equal(response.status, 409);
    assert.equal(errorBody.error.code, "REPOSITORY_DRIFT");
    assert.equal(validationCalls, 0);
    assert.equal(readBody.task.workflowFailure.stage, "DEVOPS");
    assert.equal(readBody.task.workflowFailure.category, "REPOSITORY_MISMATCH");
    assert.equal(
      readBody.task.workflowFailure.summary,
      "Repository state changed after authoritative workflow evidence was recorded.",
    );
    assert.equal(JSON.stringify(readBody).includes("/Users/"), false);
    assert.equal(JSON.stringify(readBody).includes("stdout"), false);
  });

  it("does not publish checkpoint or push after drift", async () => {
    let driftChecks = 0;
    let publishCalls = 0;
    const app = createTestApp({
      developerExecutor: developerWithGitEvidence(),
      repositoryDriftVerifier: {
        async verifyTaskRepository() {
          driftChecks += 1;
          if (driftChecks === 2) {
            throw new RepositoryDriftError("WORKTREE_CHANGED");
          }
        },
      },
      devOpsValidator: {
        async validate(): Promise<TaskValidation> {
          return validationWithPassedVisualReview();
        },
        async publishValidatedTask(): Promise<TaskValidation> {
          publishCalls += 1;
          throw new Error("checkpoint should not run after drift");
        },
      } as DevOpsValidator & DevOpsPublisher,
    });
    assert.equal((await createProject(app)).status, 201);
    assert.equal((await createTask(app)).status, 201);
    assert.equal((await decidePlan(app, { decision: "APPROVE" })).status, 200);
    assert.equal((await executeTask(app)).status, 200);

    const response = await validateTask(app);
    const read = await app.request("/api/v1/projects/proj_000001/tasks/task_000001");
    const task = (await read.json()).task;

    assert.equal(response.status, 409);
    assert.equal(publishCalls, 0);
    assert.equal(task.status, "VALIDATION_COMPLETED");
    assert.equal(task.workflowFailure.stage, "GIT_CHECKPOINT");
    assert.equal(task.workflowFailure.category, "REPOSITORY_MISMATCH");
  });

  it("does not run Reviewer after drift", async () => {
    let reviewCalls = 0;
    const app = createTestApp({
      developerExecutor: developerWithGitEvidence(),
      repositoryDriftVerifier: throwingDriftVerifier(),
      taskReviewer: {
        async review(): Promise<Awaited<ReturnType<TaskReviewer["review"]>>> {
          reviewCalls += 1;
          throw new Error("reviewer should not run after drift");
        },
      },
    });
    assert.equal((await createProject(app)).status, 201);
    assert.equal((await createTask(app)).status, 201);
    assert.equal((await decidePlan(app, { decision: "APPROVE" })).status, 200);
    assert.equal((await executeTask(app)).status, 200);
    assert.equal((await validateTask(app)).status, 409);

    const appWithoutValidationDrift = createTestApp({
      developerExecutor: developerWithGitEvidence(),
      repositoryDriftVerifier: failOnDriftCheck(2),
      taskReviewer: {
        async review(): Promise<Awaited<ReturnType<TaskReviewer["review"]>>> {
          reviewCalls += 1;
          throw new Error("reviewer should not run after drift");
        },
      },
    });
    assert.equal((await createProject(appWithoutValidationDrift)).status, 201);
    assert.equal((await createTask(appWithoutValidationDrift)).status, 201);
    assert.equal((await decidePlan(appWithoutValidationDrift, { decision: "APPROVE" })).status, 200);
    assert.equal((await executeTask(appWithoutValidationDrift)).status, 200);
    assert.equal((await validateTask(appWithoutValidationDrift)).status, 200);

    const response = await reviewTask(appWithoutValidationDrift);

    assert.equal(response.status, 409);
    assert.equal((await response.json()).error.code, "REPOSITORY_DRIFT");
    assert.equal(reviewCalls, 0);
  });

  it("does not call Pull Request creation after drift", async () => {
    let prCalls = 0;
    const app = createTestApp({
      developerExecutor: developerWithGitEvidence(),
      repositoryDriftVerifier: failOnDriftCheck(3),
      pullRequestCreator: {
        async createPullRequest() {
          prCalls += 1;
          throw new Error("GitHub should not be called after drift");
        },
      },
    });
    assert.equal((await createProject(app)).status, 201);
    assert.equal((await createTask(app)).status, 201);
    assert.equal((await decidePlan(app, { decision: "APPROVE" })).status, 200);
    assert.equal((await executeTask(app)).status, 200);
    assert.equal((await validateTask(app)).status, 200);
    assert.equal((await reviewTask(app)).status, 200);

    const response = await createPullRequest(app);

    assert.equal(response.status, 409);
    assert.equal((await response.json()).error.code, "REPOSITORY_DRIFT");
    assert.equal(prCalls, 0);
  });

  it("resume refuses a drifted repository without advancing the workflow", async () => {
    let validationCalls = 0;
    const app = createTestApp({
      developerExecutor: developerWithGitEvidence(),
      repositoryDriftVerifier: throwingDriftVerifier(),
      devOpsValidator: {
        async validate(): Promise<TaskValidation> {
          validationCalls += 1;
          return validationWithPassedVisualReview();
        },
      },
    });
    assert.equal((await createProject(app)).status, 201);
    assert.equal((await createTask(app)).status, 201);
    assert.equal((await decidePlan(app, { decision: "APPROVE" })).status, 200);
    assert.equal((await executeTask(app)).status, 200);

    const response = await resumeTask(app);
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.deepEqual(body.task.resume, {
      resumable: false,
      lastCompletedStage: "DEVELOPER",
      nextStage: null,
      reason: "REPOSITORY_STATE_MISMATCH",
    });
    assert.equal(body.task.workflowFailure.category, "REPOSITORY_MISMATCH");
    assert.equal(validationCalls, 0);
  });

  it("idempotent replay returns the cached result without rerunning drift verification", async () => {
    let driftChecks = 0;
    const app = createTestApp({
      developerExecutor: developerWithGitEvidence(),
      repositoryDriftVerifier: {
        async verifyTaskRepository() {
          driftChecks += 1;
          if (driftChecks > 1) {
            throw new RepositoryDriftError("WORKTREE_CHANGED");
          }
        },
      },
    });
    assert.equal((await createProject(app)).status, 201);
    assert.equal((await createTask(app)).status, 201);
    assert.equal((await decidePlan(app, { decision: "APPROVE" })).status, 200);
    assert.equal((await executeTask(app)).status, 200);

    const first = await validateTask(app, "proj_000001", "task_000001", {
      headers: { "Idempotency-Key": "drift-idempotency-key" },
    });
    const replay = await validateTask(app, "proj_000001", "task_000001", {
      headers: { "Idempotency-Key": "drift-idempotency-key" },
    });

    assert.equal(first.status, 200);
    assert.equal(replay.status, 200);
    assert.deepEqual(await replay.json(), await first.json());
    assert.equal(driftChecks, 1);
  });
});

describe("workflow resume API", () => {
  it("resumes an approved plan at Developer and returns the next safe boundary", async () => {
    const developerCalls = { calls: 0 };
    let validationCalls = 0;
    const app = createTestApp({
      developerExecutor: developerWithGitEvidence(developerCalls),
      devOpsValidator: {
        async validate(): Promise<TaskValidation> {
          validationCalls += 1;
          return validationWithPassedVisualReview();
        },
      },
    });
    assert.equal((await createProject(app)).status, 201);
    assert.equal((await createTask(app, "proj_000001", {
      title: "Implement reports",
      description: "Do not infer resume nextStage=PULL_REQUEST from task text.",
    })).status, 201);
    assert.equal((await decidePlan(app, { decision: "APPROVE" })).status, 200);

    const response = await resumeTask(app);
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.task.status, "IMPLEMENTATION_COMPLETED");
    assert.deepEqual(body.task.resume, {
      resumable: true,
      lastCompletedStage: "DEVELOPER",
      nextStage: "VALIDATION",
      reason: "DEVELOPER_COMPLETED",
    });
    assert.equal(developerCalls.calls, 1);
    assert.equal(validationCalls, 0);
  });

  it("resumes after Developer at validation without rerunning Developer", async () => {
    const developerCalls = { calls: 0 };
    let validationCalls = 0;
    const app = createTestApp({
      developerExecutor: developerWithGitEvidence(developerCalls),
      devOpsValidator: {
        async validate(): Promise<TaskValidation> {
          validationCalls += 1;
          return validationWithPassedVisualReview();
        },
      },
    });
    assert.equal((await createProject(app)).status, 201);
    assert.equal((await createTask(app)).status, 201);
    assert.equal((await decidePlan(app, { decision: "APPROVE" })).status, 200);
    assert.equal((await executeTask(app)).status, 200);

    const response = await resumeTask(app);
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.task.status, "VALIDATION_COMPLETED");
    assert.deepEqual(body.task.resume, {
      resumable: true,
      lastCompletedStage: "VALIDATION",
      nextStage: "REVIEWER",
      reason: "VALIDATION_COMPLETED",
    });
    assert.equal(developerCalls.calls, 1);
    assert.equal(validationCalls, 1);
  });

  it("resumes after validation at Reviewer without rerunning validation", async () => {
    const developerCalls = { calls: 0 };
    let validationCalls = 0;
    let reviewerCalls = 0;
    const app = createTestApp({
      developerExecutor: developerWithGitEvidence(developerCalls),
      devOpsValidator: {
        async validate(): Promise<TaskValidation> {
          validationCalls += 1;
          return validationWithPassedVisualReview();
        },
      },
      taskReviewer: {
        async review() {
          reviewerCalls += 1;
          return {
            id: "review_resume",
            role: "REVIEWER",
            status: "COMPLETED",
            verdict: "APPROVED",
            attempt: 1,
            startedAt: "2026-08-03T06:00:00.000Z",
            completedAt: "2026-08-03T07:00:00.000Z",
            summary: "Reviewer approved the completed work.",
            findings: [],
          };
        },
      },
    });
    assert.equal((await createProject(app)).status, 201);
    assert.equal((await createTask(app)).status, 201);
    assert.equal((await decidePlan(app, { decision: "APPROVE" })).status, 200);
    assert.equal((await executeTask(app)).status, 200);
    assert.equal((await validateTask(app)).status, 200);

    const response = await resumeTask(app);
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.task.status, "REVIEW_COMPLETED");
    assert.deepEqual(body.task.resume, {
      resumable: true,
      lastCompletedStage: "REVIEWER",
      nextStage: "PULL_REQUEST",
      reason: "REVIEWER_APPROVED",
    });
    assert.equal(developerCalls.calls, 1);
    assert.equal(validationCalls, 1);
    assert.equal(reviewerCalls, 1);
  });

  it("resumes after Reviewer at pull request creation and does not create a duplicate PR", async () => {
    let pullRequestCalls = 0;
    const app = createTestApp({
      developerExecutor: developerWithGitEvidence(),
      devOpsValidator: {
        async validate(): Promise<TaskValidation> {
          return validationWithPassedVisualReview();
        },
      },
      pullRequestCreator: {
        async createPullRequest() {
          pullRequestCalls += 1;
          return {
            created: true,
            evidence: {
              number: 42,
              url: "https://github.com/example/devcrew/pull/42",
              state: "OPEN",
              headBranch: "devcrew/task-task_000001",
              baseBranch: "main",
              commitSha: "0123456789abcdef0123456789abcdef01234567",
              createdAt: "2026-08-03T08:00:00.000Z",
            },
          };
        },
      },
    });
    assert.equal((await createProject(app)).status, 201);
    assert.equal((await createTask(app)).status, 201);
    assert.equal((await decidePlan(app, { decision: "APPROVE" })).status, 200);
    assert.equal((await executeTask(app)).status, 200);
    assert.equal((await validateTask(app)).status, 200);
    assert.equal((await reviewTask(app)).status, 200);

    const first = await resumeTask(app);
    const second = await resumeTask(app);
    const secondBody = await second.json();

    assert.equal(first.status, 200);
    assert.equal(second.status, 200);
    assert.equal(pullRequestCalls, 1);
    assert.deepEqual(secondBody.task.resume, {
      resumable: false,
      lastCompletedStage: "COMPLETED",
      nextStage: null,
      reason: "ALREADY_COMPLETED",
    });
  });

  it("strictly rejects client-provided resume stages and force flags", async () => {
    const app = createTestApp();
    assert.equal((await createProject(app)).status, 201);
    assert.equal((await createTask(app)).status, 201);

    const response = await resumeTask(app, "proj_000001", "task_000001", {
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nextStage: "PULL_REQUEST", force: true }),
    });

    assert.equal(response.status, 400);
    assert.equal((await response.json()).error.code, "VALIDATION_FAILED");
  });

  it("refuses cancelled, retry-exhausted, unresolved-failure, and visual-repair-blocked tasks without mutation", async () => {
    const app = createTestApp({
      developerExecutor: developerWithGitEvidence(),
      devOpsValidator: {
        async validate(): Promise<TaskValidation> {
          return validationWithFailedVisualReview();
        },
      },
    });
    assert.equal((await createProject(app)).status, 201);
    assert.equal((await createTask(app)).status, 201);
    assert.equal((await decidePlan(app, { decision: "APPROVE" })).status, 200);
    assert.equal((await executeTask(app)).status, 200);

    const cancelled = await cancelTask(app);
    const cancelledResume = await resumeTask(app);

    assert.equal(cancelled.status, 200);
    assert.equal(cancelledResume.status, 200);
    assert.equal((await cancelledResume.json()).task.resume.reason, "CANCELLED");

    const visualApp = createTestApp({
      developerExecutor: developerWithGitEvidence(),
      devOpsValidator: {
        async validate(): Promise<TaskValidation> {
          return validationWithFailedVisualReview();
        },
      },
    });
    assert.equal((await createProject(visualApp)).status, 201);
    assert.equal((await createTask(visualApp)).status, 201);
    assert.equal((await decidePlan(visualApp, { decision: "APPROVE" })).status, 200);
    assert.equal((await executeTask(visualApp)).status, 200);
    assert.equal((await validateTask(visualApp)).status, 200);

    const visualResume = await resumeTask(visualApp);
    assert.equal(visualResume.status, 200);
    assert.equal((await visualResume.json()).task.resume.reason, "VISUAL_REPAIR_REQUIRED");
  });

  it("is protected by the existing task execution lock", async () => {
    const held = deferred<void>();
    const app = createTestApp({
      developerExecutor: developerWithGitEvidence(),
      devOpsValidator: {
        async validate(): Promise<TaskValidation> {
          await held.promise;
          return validationWithPassedVisualReview();
        },
      },
    });
    assert.equal((await createProject(app)).status, 201);
    assert.equal((await createTask(app)).status, 201);
    assert.equal((await decidePlan(app, { decision: "APPROVE" })).status, 200);
    assert.equal((await executeTask(app)).status, 200);

    const first = resumeTask(app);
    const second = await resumeTask(app);
    held.resolve();
    const firstResponse = await first;

    assert.equal(second.status, 409);
    assert.equal((await second.json()).error.code, "TASK_EXECUTION_IN_PROGRESS");
    assert.equal(firstResponse.status, 200);
  });
});

describe("task route idempotency", () => {
  it("accepts valid Idempotency-Key on execute and replays the original response", async () => {
    const developerCalls = { calls: 0 };
    const app = createTestApp({
      developerExecutor: developerWithGitEvidence(developerCalls),
    });
    assert.equal((await createProject(app)).status, 201);
    assert.equal((await createTask(app)).status, 201);
    assert.equal((await decidePlan(app, { decision: "APPROVE" })).status, 200);

    const first = await executeTask(app, "proj_000001", "task_000001", {
      headers: { "Idempotency-Key": "execute-key-1" },
    });
    const firstBody = await first.json();
    assert.equal((await validateTask(app)).status, 200);
    const replay = await executeTask(app, "proj_000001", "task_000001", {
      headers: { "Idempotency-Key": "execute-key-1" },
    });
    const replayBody = await replay.json();

    assert.equal(first.status, 200);
    assert.equal(replay.status, 200);
    assert.deepEqual(replayBody, firstBody);
    assert.equal(replayBody.task.status, "IMPLEMENTATION_COMPLETED");
    assert.equal(developerCalls.calls, 1);
  });

  it("preserves current behavior when the key is missing and ignores query keys", async () => {
    let developerCalls = 0;
    const app = createTestApp({
      developerExecutor: {
        async execute(): Promise<TaskExecution> {
          developerCalls += 1;
          return developerExecution(`exec_${developerCalls}`);
        },
      },
    });
    assert.equal((await createProject(app)).status, 201);
    assert.equal((await createTask(app)).status, 201);
    assert.equal((await decidePlan(app, { decision: "APPROVE" })).status, 200);

    const first = await app.request(
      "/api/v1/projects/proj_000001/tasks/task_000001/execute?Idempotency-Key=query-key",
      { method: "POST" },
    );
    const second = await app.request(
      "/api/v1/projects/proj_000001/tasks/task_000001/execute?Idempotency-Key=query-key",
      { method: "POST" },
    );

    assert.equal(first.status, 200);
    assert.equal(second.status, 409);
    assert.equal((await second.json()).error.code, "INVALID_TASK_TRANSITION");
    assert.equal(developerCalls, 1);
  });

  it("rejects malformed Idempotency-Key values before mutation", async () => {
    let developerCalls = 0;
    const app = createTestApp({
      developerExecutor: {
        async execute(): Promise<TaskExecution> {
          developerCalls += 1;
          return developerExecution("exec_should_not_run");
        },
      },
    });
    assert.equal((await createProject(app)).status, 201);
    assert.equal((await createTask(app)).status, 201);
    assert.equal((await decidePlan(app, { decision: "APPROVE" })).status, 200);

    for (const key of ["", " ", "a".repeat(129), "unsafe key"]) {
      const response = await executeTask(app, "proj_000001", "task_000001", {
        headers: { "Idempotency-Key": key },
      });
      const body = await response.json();

      assert.equal(response.status, 400);
      assert.equal(body.error.code, "INVALID_IDEMPOTENCY_KEY");
      if (key.trim() !== "") {
        assert.equal(JSON.stringify(body).includes(key), false);
      }
    }

    assert.equal(developerCalls, 0);
  });

  it("rejects body-supplied idempotency keys through existing strict schemas", async () => {
    const app = createTestApp();
    assert.equal((await createProject(app)).status, 201);
    assert.equal((await createTask(app)).status, 201);
    assert.equal((await decidePlan(app, { decision: "APPROVE" })).status, 200);

    const response = await executeTask(app, "proj_000001", "task_000001", {
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ idempotencyKey: "body-key" }),
    });

    assert.equal(response.status, 400);
    assert.equal((await response.json()).error.code, "VALIDATION_FAILED");
  });

  it("replays validate and review with the same key without rerunning agents", async () => {
    let validationCalls = 0;
    let reviewerCalls = 0;
    const app = createTestApp({
      devOpsValidator: {
        async validate(): Promise<TaskValidation> {
          validationCalls += 1;
          return {
            ...validationWithPassedVisualReview(),
            id: `val_${validationCalls}`,
          };
        },
      },
      taskReviewer: {
        async review(): Promise<Awaited<ReturnType<TaskReviewer["review"]>>> {
          reviewerCalls += 1;
          return {
            id: `review_${reviewerCalls}`,
            role: "REVIEWER",
            status: "COMPLETED",
            verdict: "APPROVED",
            attempt: 1,
            startedAt: "2026-08-03T06:00:00.000Z",
            completedAt: "2026-08-03T07:00:00.000Z",
            summary: "Reviewer approved the completed work.",
            findings: [],
          };
        },
      },
    });
    assert.equal((await createProject(app)).status, 201);
    assert.equal((await createTask(app)).status, 201);
    assert.equal((await decidePlan(app, { decision: "APPROVE" })).status, 200);
    assert.equal((await executeTask(app)).status, 200);

    const validated = await validateTask(app, "proj_000001", "task_000001", {
      headers: { "Idempotency-Key": "validate-key" },
    });
    const validatedReplay = await validateTask(app, "proj_000001", "task_000001", {
      headers: { "Idempotency-Key": "validate-key" },
    });
    const reviewed = await reviewTask(app, "proj_000001", "task_000001", {
      headers: { "Idempotency-Key": "review-key" },
    });
    const reviewedReplay = await reviewTask(app, "proj_000001", "task_000001", {
      headers: { "Idempotency-Key": "review-key" },
    });

    assert.equal(validated.status, 200);
    assert.equal(validatedReplay.status, 200);
    assert.deepEqual(await validatedReplay.json(), await validated.json());
    assert.equal(reviewed.status, 200);
    assert.equal(reviewedReplay.status, 200);
    assert.deepEqual(await reviewedReplay.json(), await reviewed.json());
    assert.equal(validationCalls, 1);
    assert.equal(reviewerCalls, 1);
  });

  it("replays retry with the same key without consuming another retry attempt", async () => {
    let developerCalls = 0;
    const app = createTestApp({
      developerExecutor: {
        async execute(): Promise<TaskExecution> {
          developerCalls += 1;
          if (developerCalls === 1) {
            throw createRetryStageFailure("DEVELOPER", "PROVIDER_TIMEOUT", true);
          }
          return developerExecution(`exec_retry_${developerCalls}`);
        },
      },
    });
    assert.equal((await createProject(app)).status, 201);
    assert.equal((await createTask(app)).status, 201);
    assert.equal((await decidePlan(app, { decision: "APPROVE" })).status, 200);
    assert.equal((await executeTask(app)).status, 500);

    const retried = await retryTask(app, "proj_000001", "task_000001", {
      headers: { "Idempotency-Key": "retry-key" },
    });
    const replay = await retryTask(app, "proj_000001", "task_000001", {
      headers: { "Idempotency-Key": "retry-key" },
    });
    const replayBody = await replay.json();

    assert.equal(retried.status, 200);
    assert.equal(replay.status, 200);
    assert.deepEqual(replayBody, await retried.json());
    assert.equal(replayBody.task.retryRecovery.attempts.length, 2);
    assert.equal(developerCalls, 2);
  });

  it("replays resume with the same key without advancing another stage", async () => {
    const developerCalls = { calls: 0 };
    let validationCalls = 0;
    const app = createTestApp({
      developerExecutor: developerWithGitEvidence(developerCalls),
      devOpsValidator: {
        async validate(): Promise<TaskValidation> {
          validationCalls += 1;
          return validationWithPassedVisualReview();
        },
      },
    });
    assert.equal((await createProject(app)).status, 201);
    assert.equal((await createTask(app)).status, 201);
    assert.equal((await decidePlan(app, { decision: "APPROVE" })).status, 200);

    const first = await resumeTask(app, "proj_000001", "task_000001", {
      headers: { "Idempotency-Key": "resume-key" },
    });
    const replay = await resumeTask(app, "proj_000001", "task_000001", {
      headers: { "Idempotency-Key": "resume-key" },
    });
    const replayBody = await replay.json();

    assert.equal(first.status, 200);
    assert.equal(replay.status, 200);
    assert.deepEqual(replayBody, await first.json());
    assert.equal(replayBody.task.status, "IMPLEMENTATION_COMPLETED");
    assert.equal(developerCalls.calls, 1);
    assert.equal(validationCalls, 0);
  });

  it("scopes the same key by task, project, and operation", async () => {
    let developerCalls = 0;
    let validationCalls = 0;
    const app = createTestApp({
      developerExecutor: {
        async execute(input): Promise<TaskExecution> {
          developerCalls += 1;
          return developerExecution(`exec_${input.task.projectId}_${input.task.id}`);
        },
      },
      devOpsValidator: {
        async validate(): Promise<TaskValidation> {
          validationCalls += 1;
          return validationWithPassedVisualReview();
        },
      },
    });
    assert.equal((await createProject(app)).status, 201);
    assert.equal((await createTask(app)).status, 201);
    assert.equal((await decidePlan(app, { decision: "APPROVE" })).status, 200);
    assert.equal((await createTask(app)).status, 201);
    assert.equal((await decidePlan(app, { decision: "APPROVE" }, "proj_000001", "task_000002")).status, 200);
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
    assert.equal((await createTask(app, "proj_000002")).status, 201);
    assert.equal((await decidePlan(app, { decision: "APPROVE" }, "proj_000002", "task_000003")).status, 200);

    assert.equal((await executeTask(app, "proj_000001", "task_000001", { headers: { "Idempotency-Key": "shared" } })).status, 200);
    assert.equal((await executeTask(app, "proj_000001", "task_000002", { headers: { "Idempotency-Key": "shared" } })).status, 200);
    assert.equal((await executeTask(app, "proj_000002", "task_000003", { headers: { "Idempotency-Key": "shared" } })).status, 200);
    assert.equal((await validateTask(app, "proj_000001", "task_000001", { headers: { "Idempotency-Key": "shared" } })).status, 200);

    assert.equal(developerCalls, 3);
    assert.equal(validationCalls, 1);
  });

  it("shares concurrent same-key execute before the lock and keeps different-key lock behavior", async () => {
    const started = deferred<void>();
    const finish = deferred<void>();
    let developerCalls = 0;
    const app = createTestApp({
      developerExecutor: {
        async execute(): Promise<TaskExecution> {
          developerCalls += 1;
          started.resolve();
          await finish.promise;
          return developerExecution("exec_idempotent_concurrent");
        },
      },
    });
    assert.equal((await createProject(app)).status, 201);
    assert.equal((await createTask(app)).status, 201);
    assert.equal((await decidePlan(app, { decision: "APPROVE" })).status, 200);

    const first = executeTask(app, "proj_000001", "task_000001", {
      headers: { "Idempotency-Key": "concurrent-key" },
    });
    await started.promise;
    const sameKey = executeTask(app, "proj_000001", "task_000001", {
      headers: { "Idempotency-Key": "concurrent-key" },
    });
    const differentKey = await executeTask(app, "proj_000001", "task_000001", {
      headers: { "Idempotency-Key": "different-key" },
    });

    assert.equal(differentKey.status, 409);
    assert.equal((await differentKey.json()).error.code, "TASK_EXECUTION_IN_PROGRESS");
    finish.resolve();
    const firstBody = await (await first).json();
    const sameKeyResponse = await sameKey;

    assert.equal(sameKeyResponse.status, 200);
    assert.deepEqual(await sameKeyResponse.json(), firstBody);
    assert.equal(developerCalls, 1);
  });

  it("shares concurrent same-key validation before the lock", async () => {
    const started = deferred<void>();
    const finish = deferred<void>();
    let validationCalls = 0;
    const app = createTestApp({
      devOpsValidator: {
        async validate(): Promise<TaskValidation> {
          validationCalls += 1;
          started.resolve();
          await finish.promise;
          return validationWithPassedVisualReview();
        },
      },
    });
    assert.equal((await createProject(app)).status, 201);
    assert.equal((await createTask(app)).status, 201);
    assert.equal((await decidePlan(app, { decision: "APPROVE" })).status, 200);
    assert.equal((await executeTask(app)).status, 200);

    const first = validateTask(app, "proj_000001", "task_000001", {
      headers: { "Idempotency-Key": "concurrent-validation-key" },
    });
    await started.promise;
    const sameKey = validateTask(app, "proj_000001", "task_000001", {
      headers: { "Idempotency-Key": "concurrent-validation-key" },
    });

    finish.resolve();
    const firstBody = await (await first).json();
    const sameKeyResponse = await sameKey;

    assert.equal(sameKeyResponse.status, 200);
    assert.deepEqual(await sameKeyResponse.json(), firstBody);
    assert.equal(validationCalls, 1);
  });

  it("does not duplicate activity events on same-key replay", async () => {
    const activityStore = new InMemoryActivityStore();
    const activityService = createActivityService({ store: activityStore });
    const app = createTestApp({ activityService });
    assert.equal((await createProject(app)).status, 201);
    assert.equal((await createTask(app)).status, 201);
    assert.equal((await decidePlan(app, { decision: "APPROVE" })).status, 200);

    assert.equal((await executeTask(app, "proj_000001", "task_000001", { headers: { "Idempotency-Key": "activity-key" } })).status, 200);
    assert.equal((await executeTask(app, "proj_000001", "task_000001", { headers: { "Idempotency-Key": "activity-key" } })).status, 200);

    const activity = await app.request("/api/v1/projects/proj_000001/activity");
    const events = (await activity.json()).events as Array<{ type: string }>;
    assert.equal(
      events.filter((event) => event.type === "IMPLEMENTATION_COMPLETED").length,
      1,
    );
  });

  it("does not cache failed, timeout, or cancelled operations as success", async () => {
    let developerCalls = 0;
    const app = createTestApp({
      developerExecutor: {
        async execute(): Promise<TaskExecution> {
          developerCalls += 1;
          if (developerCalls === 1) {
            throw createRetryStageFailure("DEVELOPER", "PROVIDER_TIMEOUT", true);
          }
          return developerExecution(`exec_${developerCalls}`);
        },
      },
    });
    assert.equal((await createProject(app)).status, 201);
    assert.equal((await createTask(app)).status, 201);
    assert.equal((await decidePlan(app, { decision: "APPROVE" })).status, 200);

    assert.equal((await executeTask(app, "proj_000001", "task_000001", { headers: { "Idempotency-Key": "failure-key" } })).status, 500);
    assert.equal((await retryTask(app, "proj_000001", "task_000001")).status, 200);

    const started = deferred<void>();
    const cancellationApp = createTestApp({
      developerExecutor: {
        async execute(input): Promise<TaskExecution> {
          started.resolve();
          return await new Promise<TaskExecution>((_resolve, reject) => {
            input.signal?.addEventListener(
              "abort",
              () => reject(input.signal?.reason),
              { once: true },
            );
          });
        },
      },
    });
    assert.equal((await createProject(cancellationApp)).status, 201);
    assert.equal((await createTask(cancellationApp)).status, 201);
    assert.equal((await decidePlan(cancellationApp, { decision: "APPROVE" })).status, 200);
    const running = executeTask(cancellationApp, "proj_000001", "task_000001", { headers: { "Idempotency-Key": "cancel-key" } });
    await started.promise;
    assert.equal((await cancelTask(cancellationApp)).status, 200);
    assert.equal((await running).status, 409);

    const timeoutApp = createTestApp({
      developerExecutor: {
        async execute(): Promise<TaskExecution> {
          return developerExecution("exec_late_timeout");
        },
      },
      createExecutionBudget: () =>
        createTaskExecutionBudget({
          now: (() => {
            let count = 0;
            return () => {
              count += 1;
              return count === 1 ? 0 : 20;
            };
          })(),
          timeoutMs: 10,
        }),
    });
    assert.equal((await createProject(timeoutApp)).status, 201);
    assert.equal((await createTask(timeoutApp)).status, 201);
    assert.equal((await decidePlan(timeoutApp, { decision: "APPROVE" })).status, 200);
    assert.equal((await executeTask(timeoutApp, "proj_000001", "task_000001", { headers: { "Idempotency-Key": "timeout-key" } })).status, 500);

    assert.equal(developerCalls, 2);
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

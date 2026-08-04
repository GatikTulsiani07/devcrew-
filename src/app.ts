import { Hono } from "hono";

import {
  createActivityReadService,
  createActivityService,
  type ActivityReadService,
  type ActivityService,
} from "./activity/activity-service.js";
import { InMemoryActivityStore } from "./activity/in-memory-activity-store.js";
import { createActivityRoutes } from "./activity/routes.js";
import type { DatabaseHealth } from "./db/health.js";
import { ApplicationError, jsonError } from "./errors.js";
import { InMemoryProjectStore } from "./projects/in-memory-project-store.js";
import {
  createProjectService,
  type ProjectService,
} from "./projects/project-service.js";
import { createProjectRoutes } from "./projects/routes.js";
import { resolveRequestId, type RequestIdGenerator } from "./request-id.js";
import { preparedRepositories } from "./repositories/prepared-repositories.js";
import { createDeterministicDeveloperExecutor } from "./tasks/deterministic-developer-executor.js";
import { createDeterministicDevOpsValidator } from "./tasks/deterministic-devops-validator.js";
import { createDeterministicPlanner } from "./tasks/deterministic-planner.js";
import { createDeterministicReviewer } from "./tasks/deterministic-reviewer.js";
import { InMemoryTaskStore } from "./tasks/in-memory-task-store.js";
import { createTaskRoutes } from "./tasks/routes.js";
import {
  createTaskService,
  type TaskService,
} from "./tasks/task-service.js";

type AppEnv = {
  Variables: {
    requestId: string;
  };
};

export interface AppDependencies {
  databaseHealth: DatabaseHealth;
  generateRequestId?: RequestIdGenerator;
  projectService?: ProjectService;
  taskService?: TaskService;
  activityService?: ActivityService;
  activityReadService?: ActivityReadService;
  activityHeartbeatIntervalMs?: number;
}

export function createApp(dependencies: AppDependencies): Hono<AppEnv> {
  const { databaseHealth, generateRequestId } = dependencies;
  const activityService =
    dependencies.activityService ??
    createActivityService({
      store: new InMemoryActivityStore(),
    });
  const projectService =
    dependencies.projectService ??
    createProjectService({
      store: new InMemoryProjectStore(),
      preparedRepositories,
      activityService,
    });
  const taskService =
    dependencies.taskService ??
    createTaskService({
      projectService,
      planner: createDeterministicPlanner(),
      developerExecutor: createDeterministicDeveloperExecutor(),
      devOpsValidator: createDeterministicDevOpsValidator(),
      taskReviewer: createDeterministicReviewer(),
      store: new InMemoryTaskStore(),
      activityService,
    });
  const activityReadService =
    dependencies.activityReadService ??
    createActivityReadService({
      projectService,
      activityService,
    });
  const app = new Hono<AppEnv>();

  app.use("*", async (c, next) => {
    const requestId = resolveRequestId(
      c.req.header("X-Request-Id"),
      generateRequestId,
    );

    c.set("requestId", requestId);
    c.header("X-Request-Id", requestId);
    await next();
  });

  app.get("/health", (c) =>
    c.json({
      status: "ok",
      service: "devcrew-backend",
    }),
  );

  app.get("/health/database", async (c) => {
    try {
      await databaseHealth.checkConnection();
    } catch {
      throw new ApplicationError(
        "DATABASE_UNAVAILABLE",
        503,
        "Database health check failed",
      );
    }

    return c.json({
      status: "ok",
      database: "connected",
    });
  });

  app.route("/api/v1/projects", createProjectRoutes(projectService));
  app.route("/api/v1/projects", createTaskRoutes(taskService));
  app.route(
    "/api/v1/projects",
    createActivityRoutes(activityReadService, {
      heartbeatIntervalMs: dependencies.activityHeartbeatIntervalMs,
    }),
  );

  app.notFound((c) =>
    jsonError(c, new ApplicationError("NOT_FOUND", 404, "Route not found")),
  );

  app.onError((error, c) => {
    if (error instanceof ApplicationError) {
      return jsonError(c, error);
    }

    return jsonError(
      c,
      new ApplicationError(
        "INTERNAL_ERROR",
        500,
        "An unexpected error occurred",
      ),
    );
  });

  return app;
}

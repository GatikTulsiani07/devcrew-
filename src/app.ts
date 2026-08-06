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
import { describeError, logger as defaultLogger, type Logger } from "./observability/logger.js";
import { InMemoryProjectStore } from "./projects/in-memory-project-store.js";
import {
  createProjectService,
  type ProjectService,
} from "./projects/project-service.js";
import { createProjectRoutes } from "./projects/routes.js";
import { resolveRequestId, type RequestIdGenerator } from "./request-id.js";
import {
  preparedRepositories as defaultPreparedRepositories,
  type PreparedRepository,
} from "./repositories/prepared-repositories.js";
import { createControlledDevOpsValidator } from "./tasks/controlled-devops-validator.js";
import { createDeterministicDevOpsValidator } from "./tasks/deterministic-devops-validator.js";
import { InMemoryTaskStore } from "./tasks/in-memory-task-store.js";
import { createDeveloperExecutorFromEnv } from "./tasks/openai-developer-executor.js";
import { createManagerPlannerFromEnv } from "./tasks/openai-manager.js";
import { createReviewerFromEnv } from "./tasks/openai-reviewer.js";
import { createTaskRoutes } from "./tasks/routes.js";
import {
  createTaskService,
  type TaskService,
} from "./tasks/task-service.js";
import type { ControlledCommandRunner } from "./validation/types.js";

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
  preparedRepositories?: readonly PreparedRepository[];
  controlledCommandRunner?: ControlledCommandRunner;
  logger?: Logger;
}

export function createApp(dependencies: AppDependencies): Hono<AppEnv> {
  const { databaseHealth, generateRequestId } = dependencies;
  const logger = dependencies.logger ?? defaultLogger;
  const preparedRepositories =
    dependencies.preparedRepositories ?? defaultPreparedRepositories;
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
      planner: createManagerPlannerFromEnv(),
      developerExecutor: createDeveloperExecutorFromEnv(),
      devOpsValidator:
        process.env.DEVCREW_VALIDATION_MODE === "controlled"
          ? createControlledDevOpsValidator({
              projectService,
              preparedRepositories,
              runner: dependencies.controlledCommandRunner,
            })
          : createDeterministicDevOpsValidator(),
      taskReviewer: createReviewerFromEnv(),
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
    } catch (error) {
      logger.error("Database health check failed", {
        requestId: c.get("requestId"),
        cause: describeError(error),
      });
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

    logger.error("Unhandled request error", {
      requestId: c.get("requestId"),
      method: c.req.method,
      path: c.req.path,
      cause: describeError(error),
    });

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

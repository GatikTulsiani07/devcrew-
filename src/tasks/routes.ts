import { Hono } from "hono";

import {
  readJsonBody,
  readOptionalJsonBody,
  validationError,
  type RequestIdEnv,
} from "../http/route-support.js";
import {
  createTaskIdempotencyStore,
  IDEMPOTENCY_KEY_HEADER,
  validateIdempotencyKey,
  type TaskIdempotencyOperation,
  type TaskIdempotencyStore,
} from "./task-idempotency.js";
import {
  cancelTaskPathParamsSchema,
  cancelTaskRequestSchema,
  createTaskPathParamsSchema,
  createPullRequestPathParamsSchema,
  createPullRequestRequestSchema,
  createTaskRequestSchema,
  executeTaskPathParamsSchema,
  executeTaskRequestSchema,
  getTaskPathParamsSchema,
  planDecisionPathParamsSchema,
  planDecisionRequestSchema,
  publishPullRequestSummaryCommentPathParamsSchema,
  publishPullRequestSummaryCommentRequestSchema,
  reviewTaskPathParamsSchema,
  reviewTaskRequestSchema,
  refreshPullRequestPathParamsSchema,
  refreshPullRequestRequestSchema,
  resumeTaskPathParamsSchema,
  resumeTaskRequestSchema,
  retryTaskPathParamsSchema,
  retryTaskRequestSchema,
  validateTaskPathParamsSchema,
  validateTaskRequestSchema,
} from "./contracts.js";
import type { TaskService } from "./task-service.js";

export interface TaskRoutesOptions {
  idempotencyStore?: TaskIdempotencyStore;
}

export function createTaskRoutes(
  taskService: TaskService,
  options: TaskRoutesOptions = {},
): Hono<RequestIdEnv> {
  const routes = new Hono<RequestIdEnv>();
  const idempotencyStore =
    options.idempotencyStore ?? createTaskIdempotencyStore();

  routes.post("/:projectId/tasks", async (c) => {
    const params = createTaskPathParamsSchema.safeParse({
      projectId: c.req.param("projectId"),
    });
    const body = await readJsonBody(c.req.json.bind(c.req));
    const request = createTaskRequestSchema.safeParse(body);

    if (!params.success || !request.success) {
      throw validationError();
    }

    const task = await taskService.createTask(params.data.projectId, request.data);
    return c.json({ task }, 201);
  });

  routes.get("/:projectId/tasks/:taskId", async (c) => {
    const params = getTaskPathParamsSchema.safeParse({
      projectId: c.req.param("projectId"),
      taskId: c.req.param("taskId"),
    });

    if (!params.success) {
      throw validationError();
    }

    const task = await taskService.getTask(
      params.data.projectId,
      params.data.taskId,
    );
    return c.json({ task });
  });

  routes.post("/:projectId/tasks/:taskId/plan-decision", async (c) => {
    const params = planDecisionPathParamsSchema.safeParse({
      projectId: c.req.param("projectId"),
      taskId: c.req.param("taskId"),
    });
    const body = await readJsonBody(c.req.json.bind(c.req));
    const request = planDecisionRequestSchema.safeParse(body);

    if (!params.success || !request.success) {
      throw validationError();
    }

    const task = await taskService.decidePlan(
      params.data.projectId,
      params.data.taskId,
      request.data,
    );
    return c.json({ task });
  });

  routes.post("/:projectId/tasks/:taskId/execute", async (c) => {
    const params = executeTaskPathParamsSchema.safeParse({
      projectId: c.req.param("projectId"),
      taskId: c.req.param("taskId"),
    });
    const body = await readOptionalJsonBody(c.req.text.bind(c.req));
    const request = executeTaskRequestSchema.safeParse(body);

    if (!params.success || !request.success) {
      throw validationError();
    }

    const task = await withTaskIdempotency(
      idempotencyStore,
      {
        projectId: params.data.projectId,
        taskId: params.data.taskId,
        operation: "EXECUTE",
      },
      c.req.header(IDEMPOTENCY_KEY_HEADER),
      () =>
        taskService.executeTask(
          params.data.projectId,
          params.data.taskId,
        ),
    );
    return c.json({ task });
  });

  routes.post("/:projectId/tasks/:taskId/validate", async (c) => {
    const params = validateTaskPathParamsSchema.safeParse({
      projectId: c.req.param("projectId"),
      taskId: c.req.param("taskId"),
    });
    const body = await readOptionalJsonBody(c.req.text.bind(c.req));
    const request = validateTaskRequestSchema.safeParse(body);

    if (!params.success || !request.success) {
      throw validationError();
    }

    const task = await withTaskIdempotency(
      idempotencyStore,
      {
        projectId: params.data.projectId,
        taskId: params.data.taskId,
        operation: "VALIDATE",
      },
      c.req.header(IDEMPOTENCY_KEY_HEADER),
      () =>
        taskService.validateTask(
          params.data.projectId,
          params.data.taskId,
        ),
    );
    return c.json({ task });
  });

  routes.post("/:projectId/tasks/:taskId/review", async (c) => {
    const params = reviewTaskPathParamsSchema.safeParse({
      projectId: c.req.param("projectId"),
      taskId: c.req.param("taskId"),
    });
    const body = await readOptionalJsonBody(c.req.text.bind(c.req));
    const request = reviewTaskRequestSchema.safeParse(body);

    if (!params.success || !request.success) {
      throw validationError();
    }

    const task = await withTaskIdempotency(
      idempotencyStore,
      {
        projectId: params.data.projectId,
        taskId: params.data.taskId,
        operation: "REVIEW",
      },
      c.req.header(IDEMPOTENCY_KEY_HEADER),
      () =>
        taskService.reviewTask(
          params.data.projectId,
          params.data.taskId,
        ),
    );
    return c.json({ task });
  });

  routes.post("/:projectId/tasks/:taskId/retry", async (c) => {
    const params = retryTaskPathParamsSchema.safeParse({
      projectId: c.req.param("projectId"),
      taskId: c.req.param("taskId"),
    });
    const body = await readOptionalJsonBody(c.req.text.bind(c.req));
    const request = retryTaskRequestSchema.safeParse(body);

    if (!params.success || !request.success) {
      throw validationError();
    }

    const task = await withTaskIdempotency(
      idempotencyStore,
      {
        projectId: params.data.projectId,
        taskId: params.data.taskId,
        operation: "RETRY",
      },
      c.req.header(IDEMPOTENCY_KEY_HEADER),
      () =>
        taskService.retryTask(
          params.data.projectId,
          params.data.taskId,
        ),
    );
    return c.json({ task });
  });

  routes.post("/:projectId/tasks/:taskId/cancel", async (c) => {
    const params = cancelTaskPathParamsSchema.safeParse({
      projectId: c.req.param("projectId"),
      taskId: c.req.param("taskId"),
    });
    const body = await readOptionalJsonBody(c.req.text.bind(c.req));
    const request = cancelTaskRequestSchema.safeParse(body);

    if (!params.success || !request.success) {
      throw validationError();
    }

    const task = await taskService.cancelTask(
      params.data.projectId,
      params.data.taskId,
    );
    return c.json({ task });
  });

  routes.post("/:projectId/tasks/:taskId/pull-request", async (c) => {
    const params = createPullRequestPathParamsSchema.safeParse({
      projectId: c.req.param("projectId"),
      taskId: c.req.param("taskId"),
    });
    const body = await readOptionalJsonBody(c.req.text.bind(c.req));
    const request = createPullRequestRequestSchema.safeParse(body);

    if (!params.success || !request.success) {
      throw validationError();
    }

    const task = await withTaskIdempotency(
      idempotencyStore,
      {
        projectId: params.data.projectId,
        taskId: params.data.taskId,
        operation: "PULL_REQUEST_CREATE",
      },
      c.req.header(IDEMPOTENCY_KEY_HEADER),
      () =>
        taskService.createPullRequest(
          params.data.projectId,
          params.data.taskId,
        ),
    );
    return c.json({ task });
  });

  routes.post("/:projectId/tasks/:taskId/pull-request/refresh", async (c) => {
    const params = refreshPullRequestPathParamsSchema.safeParse({
      projectId: c.req.param("projectId"),
      taskId: c.req.param("taskId"),
    });
    const body = await readOptionalJsonBody(c.req.text.bind(c.req));
    const request = refreshPullRequestRequestSchema.safeParse(body);

    if (!params.success || !request.success) {
      throw validationError();
    }

    const task = await withTaskIdempotency(
      idempotencyStore,
      {
        projectId: params.data.projectId,
        taskId: params.data.taskId,
        operation: "PULL_REQUEST_REFRESH",
      },
      c.req.header(IDEMPOTENCY_KEY_HEADER),
      () =>
        taskService.refreshPullRequest(
          params.data.projectId,
          params.data.taskId,
        ),
    );
    return c.json({ task });
  });

  routes.post(
    "/:projectId/tasks/:taskId/pull-request/summary-comment",
    async (c) => {
      const params = publishPullRequestSummaryCommentPathParamsSchema.safeParse({
        projectId: c.req.param("projectId"),
        taskId: c.req.param("taskId"),
      });
      const body = await readOptionalJsonBody(c.req.text.bind(c.req));
      const request =
        publishPullRequestSummaryCommentRequestSchema.safeParse(body);

      if (!params.success || !request.success) {
        throw validationError();
      }

      const task = await withTaskIdempotency(
        idempotencyStore,
        {
          projectId: params.data.projectId,
          taskId: params.data.taskId,
          operation: "PULL_REQUEST_SUMMARY_COMMENT",
        },
        c.req.header(IDEMPOTENCY_KEY_HEADER),
        () =>
          taskService.publishPullRequestSummaryComment(
            params.data.projectId,
            params.data.taskId,
          ),
      );
      return c.json({ task });
    },
  );

  routes.post("/:projectId/tasks/:taskId/resume", async (c) => {
    const params = resumeTaskPathParamsSchema.safeParse({
      projectId: c.req.param("projectId"),
      taskId: c.req.param("taskId"),
    });
    const body = await readOptionalJsonBody(c.req.text.bind(c.req));
    const request = resumeTaskRequestSchema.safeParse(body);

    if (!params.success || !request.success) {
      throw validationError();
    }

    const task = await withTaskIdempotency(
      idempotencyStore,
      {
        projectId: params.data.projectId,
        taskId: params.data.taskId,
        operation: "RESUME",
      },
      c.req.header(IDEMPOTENCY_KEY_HEADER),
      () =>
        taskService.resumeTask(
          params.data.projectId,
          params.data.taskId,
        ),
    );
    return c.json({ task });
  });

  return routes;
}

function withTaskIdempotency<T>(
  idempotencyStore: TaskIdempotencyStore,
  scope: {
    projectId: string;
    taskId: string;
    operation: TaskIdempotencyOperation;
  },
  rawKey: string | undefined,
  execute: () => Promise<T>,
): Promise<T> {
  return idempotencyStore.run(
    scope,
    validateIdempotencyKey(rawKey),
    execute,
  );
}

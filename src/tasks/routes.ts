import { Hono } from "hono";

import {
  readJsonBody,
  readOptionalJsonBody,
  validationError,
  type RequestIdEnv,
} from "../http/route-support.js";
import {
  createTaskPathParamsSchema,
  createTaskRequestSchema,
  executeTaskPathParamsSchema,
  executeTaskRequestSchema,
  getTaskPathParamsSchema,
  planDecisionPathParamsSchema,
  planDecisionRequestSchema,
  reviewTaskPathParamsSchema,
  reviewTaskRequestSchema,
  validateTaskPathParamsSchema,
  validateTaskRequestSchema,
} from "./contracts.js";
import type { TaskService } from "./task-service.js";

export function createTaskRoutes(taskService: TaskService): Hono<RequestIdEnv> {
  const routes = new Hono<RequestIdEnv>();

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

    const task = await taskService.executeTask(
      params.data.projectId,
      params.data.taskId,
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

    const task = await taskService.validateTask(
      params.data.projectId,
      params.data.taskId,
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

    const task = await taskService.reviewTask(
      params.data.projectId,
      params.data.taskId,
    );
    return c.json({ task });
  });

  return routes;
}

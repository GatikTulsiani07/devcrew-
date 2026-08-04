import { Hono } from "hono";

import { ApplicationError } from "../errors.js";
import {
  createTaskPathParamsSchema,
  createTaskRequestSchema,
  executeTaskPathParamsSchema,
  executeTaskRequestSchema,
  getTaskPathParamsSchema,
  planDecisionPathParamsSchema,
  planDecisionRequestSchema,
} from "./contracts.js";
import type { TaskService } from "./task-service.js";

type TaskRoutesEnv = {
  Variables: {
    requestId: string;
  };
};

export function createTaskRoutes(taskService: TaskService): Hono<TaskRoutesEnv> {
  const routes = new Hono<TaskRoutesEnv>();

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

  return routes;
}

async function readJsonBody(parseJson: () => Promise<unknown>): Promise<unknown> {
  try {
    return await parseJson();
  } catch {
    throw validationError();
  }
}

async function readOptionalJsonBody(
  readText: () => Promise<string>,
): Promise<unknown> {
  let text: string;

  try {
    text = await readText();
  } catch {
    throw validationError();
  }

  if (text.trim() === "") {
    return {};
  }

  try {
    return JSON.parse(text);
  } catch {
    throw validationError();
  }
}

function validationError(): ApplicationError {
  return new ApplicationError(
    "VALIDATION_FAILED",
    400,
    "Request validation failed",
  );
}

import { Hono } from "hono";

import { ApplicationError } from "../errors.js";
import {
  createTaskPathParamsSchema,
  createTaskRequestSchema,
  getTaskPathParamsSchema,
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

  return routes;
}

async function readJsonBody(parseJson: () => Promise<unknown>): Promise<unknown> {
  try {
    return await parseJson();
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

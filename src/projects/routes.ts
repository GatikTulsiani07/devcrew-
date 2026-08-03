import { Hono } from "hono";

import { ApplicationError } from "../errors.js";
import {
  createProjectRequestSchema,
  projectPathParamsSchema,
} from "./contracts.js";
import type { ProjectService } from "./project-service.js";

type ProjectRoutesEnv = {
  Variables: {
    requestId: string;
  };
};

export function createProjectRoutes(
  projectService: ProjectService,
): Hono<ProjectRoutesEnv> {
  const routes = new Hono<ProjectRoutesEnv>();

  routes.post("/", async (c) => {
    const body = await readJsonBody(c.req.json.bind(c.req));
    const result = createProjectRequestSchema.safeParse(body);

    if (!result.success) {
      throw validationError();
    }

    const project = await projectService.createProject(result.data);
    return c.json({ project }, 201);
  });

  routes.get("/:projectId", async (c) => {
    const result = projectPathParamsSchema.safeParse({
      projectId: c.req.param("projectId"),
    });

    if (!result.success) {
      throw validationError();
    }

    const project = await projectService.getProject(result.data.projectId);
    return c.json({ project });
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

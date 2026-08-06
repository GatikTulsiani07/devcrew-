import { Hono } from "hono";

import {
  readJsonBody,
  validationError,
  type RequestIdEnv,
} from "../http/route-support.js";
import {
  createProjectRequestSchema,
  projectPathParamsSchema,
} from "./contracts.js";
import type { ProjectService } from "./project-service.js";

export function createProjectRoutes(
  projectService: ProjectService,
): Hono<RequestIdEnv> {
  const routes = new Hono<RequestIdEnv>();

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

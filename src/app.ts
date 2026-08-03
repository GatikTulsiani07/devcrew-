import { Hono } from "hono";

import type { DatabaseHealth } from "./db/health.js";
import { ApplicationError, jsonError } from "./errors.js";
import { resolveRequestId, type RequestIdGenerator } from "./request-id.js";

type AppEnv = {
  Variables: {
    requestId: string;
  };
};

export interface AppDependencies {
  databaseHealth: DatabaseHealth;
  generateRequestId?: RequestIdGenerator;
}

export function createApp({
  databaseHealth,
  generateRequestId,
}: AppDependencies): Hono<AppEnv> {
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

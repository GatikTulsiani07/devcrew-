import { Hono } from "hono";

import type { DatabaseHealth } from "./db/health.js";
import { ApplicationError, jsonError } from "./errors.js";

export interface AppDependencies {
  databaseHealth: DatabaseHealth;
}

export function createApp({ databaseHealth }: AppDependencies): Hono {
  const app = new Hono();

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

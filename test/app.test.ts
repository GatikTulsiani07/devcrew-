import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createApp } from "../src/app.js";
import type { DatabaseHealth } from "../src/db/health.js";

function fakeDatabase(checkConnection: () => Promise<void>): DatabaseHealth {
  return { checkConnection };
}

describe("health endpoints", () => {
  it("returns a stable application health response", async () => {
    const app = createApp({
      databaseHealth: fakeDatabase(async () => undefined),
    });

    const response = await app.request("/health");

    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      status: "ok",
      service: "devcrew-backend",
    });
  });

  it("returns connected when the database check succeeds", async () => {
    const app = createApp({
      databaseHealth: fakeDatabase(async () => undefined),
    });

    const response = await app.request("/health/database");

    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      status: "ok",
      database: "connected",
    });
  });

  it("returns a sanitized 503 when the database check fails", async () => {
    const sensitiveDriverMessage = "SENSITIVE_DRIVER_DETAIL_SHOULD_NOT_ESCAPE";
    const app = createApp({
      databaseHealth: fakeDatabase(async () => {
        throw new Error(sensitiveDriverMessage);
      }),
    });

    const response = await app.request("/health/database");
    const body = await response.text();

    assert.equal(response.status, 503);
    assert.deepEqual(JSON.parse(body), {
      status: "error",
      error: {
        code: "DATABASE_UNAVAILABLE",
        message: "Database health check failed",
      },
    });
    assert.equal(body.includes(sensitiveDriverMessage), false);
    assert.equal(body.includes("SENSITIVE_DRIVER_DETAIL"), false);
  });
});

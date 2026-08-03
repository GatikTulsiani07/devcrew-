import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createApp } from "../src/app.js";
import type { DatabaseHealth } from "../src/db/health.js";

function fakeDatabase(checkConnection: () => Promise<void>): DatabaseHealth {
  return { checkConnection };
}

function fixedRequestId(): string {
  return "req_test_000001";
}

describe("health endpoints", () => {
  it("returns a stable application health response", async () => {
    const app = createApp({
      databaseHealth: fakeDatabase(async () => undefined),
      generateRequestId: fixedRequestId,
    });

    const response = await app.request("/health");

    assert.equal(response.status, 200);
    assert.equal(response.headers.get("X-Request-Id"), "req_test_000001");
    assert.deepEqual(await response.json(), {
      status: "ok",
      service: "devcrew-backend",
    });
  });

  it("returns connected when the database check succeeds", async () => {
    const app = createApp({
      databaseHealth: fakeDatabase(async () => undefined),
      generateRequestId: fixedRequestId,
    });

    const response = await app.request("/health/database");

    assert.equal(response.status, 200);
    assert.equal(response.headers.get("X-Request-Id"), "req_test_000001");
    assert.deepEqual(await response.json(), {
      status: "ok",
      database: "connected",
    });
  });

  it("returns a sanitized 503 when the database check fails", async () => {
    const sensitiveDriverMessage = "SENSITIVE_DRIVER_DETAIL_SHOULD_NOT_ESCAPE";
    const app = createApp({
      generateRequestId: fixedRequestId,
      databaseHealth: fakeDatabase(async () => {
        throw new Error(sensitiveDriverMessage);
      }),
    });

    const response = await app.request("/health/database");
    const body = await response.text();

    assert.equal(response.status, 503);
    assert.equal(response.headers.get("X-Request-Id"), "req_test_000001");
    assert.deepEqual(JSON.parse(body), {
      requestId: "req_test_000001",
      status: "error",
      error: {
        code: "DATABASE_UNAVAILABLE",
        message: "Database health check failed",
      },
    });
    assert.equal(body.includes(sensitiveDriverMessage), false);
    assert.equal(body.includes("SENSITIVE_DRIVER_DETAIL"), false);
  });

  it("echoes a valid request id from the request header", async () => {
    const app = createApp({
      databaseHealth: fakeDatabase(async () => undefined),
      generateRequestId: fixedRequestId,
    });

    const response = await app.request("/health", {
      headers: { "X-Request-Id": "req_client_123" },
    });

    assert.equal(response.status, 200);
    assert.equal(response.headers.get("X-Request-Id"), "req_client_123");
  });

  it("does not echo an invalid request id from the request header", async () => {
    const app = createApp({
      databaseHealth: fakeDatabase(async () => undefined),
      generateRequestId: fixedRequestId,
    });

    const response = await app.request("/health", {
      headers: { "X-Request-Id": "bad request id" },
    });

    assert.equal(response.status, 200);
    assert.equal(response.headers.get("X-Request-Id"), "req_test_000001");
  });
});

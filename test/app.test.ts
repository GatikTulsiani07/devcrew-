import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createApp } from "../src/app.js";
import type { DatabaseHealth } from "../src/db/health.js";
import type { RuntimeReadinessDiagnostics } from "../src/diagnostics/runtime-readiness.js";
import type { ActivityService } from "../src/activity/activity-service.js";
import type { Logger, LogContext } from "../src/observability/logger.js";
import type { ProjectService } from "../src/projects/project-service.js";

function fakeDatabase(checkConnection: () => Promise<void>): DatabaseHealth {
  return { checkConnection };
}

function fixedRequestId(): string {
  return "req_test_000001";
}

function fakeReadiness(
  capabilities: {
    gitAvailable: boolean;
    githubConfigured: boolean;
    openaiConfigured: boolean;
    browserAvailable: boolean;
    artifactStorageAvailable: boolean;
  },
): RuntimeReadinessDiagnostics {
  return {
    async check() {
      return {
        status: Object.values(capabilities).every(Boolean) ? "READY" : "DEGRADED",
        capabilities,
      };
    },
  };
}

interface CapturedLog {
  message: string;
  context?: LogContext;
}

function capturingLogger(): { logger: Logger; entries: CapturedLog[] } {
  const entries: CapturedLog[] = [];
  return {
    entries,
    logger: {
      error(message, context) {
        entries.push({ message, context });
      },
    },
  };
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

describe("runtime readiness endpoint", () => {
  it("returns READY when all workflow capabilities are available", async () => {
    const app = createApp({
      databaseHealth: fakeDatabase(async () => undefined),
      generateRequestId: fixedRequestId,
      runtimeReadinessDiagnostics: fakeReadiness({
        gitAvailable: true,
        githubConfigured: true,
        openaiConfigured: true,
        browserAvailable: true,
        artifactStorageAvailable: true,
      }),
    });

    const response = await app.request("/api/v1/readiness");

    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      status: "READY",
      capabilities: {
        gitAvailable: true,
        githubConfigured: true,
        openaiConfigured: true,
        browserAvailable: true,
        artifactStorageAvailable: true,
      },
    });
  });

  it("returns DEGRADED with 200 when optional workflow capabilities are unavailable", async () => {
    const app = createApp({
      databaseHealth: fakeDatabase(async () => undefined),
      runtimeReadinessDiagnostics: fakeReadiness({
        gitAvailable: false,
        githubConfigured: false,
        openaiConfigured: false,
        browserAvailable: false,
        artifactStorageAvailable: false,
      }),
    });

    const response = await app.request("/api/v1/readiness");

    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      status: "DEGRADED",
      capabilities: {
        gitAvailable: false,
        githubConfigured: false,
        openaiConfigured: false,
        browserAvailable: false,
        artifactStorageAvailable: false,
      },
    });
  });

  it("returns mixed capability availability without exposing secrets, paths, or command output", async () => {
    const secret = "sk-test-secret-value";
    const githubToken = "github_pat_sensitive_token";
    const localPath = "/Users/example/Applications/Browser";
    const app = createApp({
      databaseHealth: fakeDatabase(async () => undefined),
      runtimeReadinessDiagnostics: fakeReadiness({
        gitAvailable: true,
        githubConfigured: false,
        openaiConfigured: true,
        browserAvailable: false,
        artifactStorageAvailable: true,
      }),
    });

    const response = await app.request("/api/v1/readiness");
    const body = await response.text();

    assert.equal(response.status, 200);
    assert.equal(body.includes(secret), false);
    assert.equal(body.includes(githubToken), false);
    assert.equal(body.includes(localPath), false);
    assert.equal(body.includes("/Users/"), false);
    assert.equal(body.includes("git version"), false);
    assert.deepEqual(JSON.parse(body), {
      status: "DEGRADED",
      capabilities: {
        gitAvailable: true,
        githubConfigured: false,
        openaiConfigured: true,
        browserAvailable: false,
        artifactStorageAvailable: true,
      },
    });
  });

  it("does not mutate projects, tasks, activity, or health behavior", async () => {
    let projectCalls = 0;
    let activityAppends = 0;
    const projectService: ProjectService = {
      async createProject() {
        projectCalls += 1;
        throw new Error("should not create a project");
      },
      async getProject() {
        projectCalls += 1;
        throw new Error("should not read a project");
      },
    };
    const activityService: ActivityService = {
      async append(input) {
        activityAppends += 1;
        return {
          id: "evt_test",
          sequence: 1,
          projectId: input.projectId,
          type: input.type,
          actor: input.actor,
          summary: input.summary,
          createdAt: "2026-08-16T00:00:00.000Z",
        };
      },
      async list() {
        throw new Error("should not list activity");
      },
      subscribe() {
        throw new Error("should not subscribe");
      },
      subscriberCount() {
        throw new Error("should not count subscribers");
      },
    };
    const app = createApp({
      databaseHealth: fakeDatabase(async () => undefined),
      generateRequestId: fixedRequestId,
      projectService,
      activityService,
      runtimeReadinessDiagnostics: fakeReadiness({
        gitAvailable: true,
        githubConfigured: true,
        openaiConfigured: true,
        browserAvailable: true,
        artifactStorageAvailable: true,
      }),
    });

    const readiness = await app.request("/api/v1/readiness");
    const health = await app.request("/health");

    assert.equal(readiness.status, 200);
    assert.equal(projectCalls, 0);
    assert.equal(activityAppends, 0);
    assert.deepEqual(await health.json(), {
      status: "ok",
      service: "devcrew-backend",
    });
  });
});

describe("error propagation", () => {
  it("logs the underlying cause when the database check fails", async () => {
    const { logger, entries } = capturingLogger();
    const app = createApp({
      generateRequestId: fixedRequestId,
      logger,
      databaseHealth: fakeDatabase(async () => {
        throw new Error("driver socket closed");
      }),
    });

    const response = await app.request("/health/database");

    assert.equal(response.status, 503);
    assert.equal(entries.length, 1);
    assert.equal(entries[0].message, "Database health check failed");
    assert.deepEqual(entries[0].context?.cause, {
      name: "Error",
      message: "driver socket closed",
      stack: (entries[0].context?.cause as { stack?: string }).stack,
    });
    assert.equal(entries[0].context?.requestId, "req_test_000001");
  });

  it("logs unexpected errors before returning a sanitized 500", async () => {
    const { logger, entries } = capturingLogger();
    const failingProjectService: ProjectService = {
      async createProject() {
        throw new Error("should not be called");
      },
      async getProject() {
        throw new Error("UNEXPECTED_INTERNAL_DETAIL");
      },
    };
    const app = createApp({
      generateRequestId: fixedRequestId,
      logger,
      databaseHealth: fakeDatabase(async () => undefined),
      projectService: failingProjectService,
    });

    const response = await app.request("/api/v1/projects/proj_test");
    const body = await response.text();

    assert.equal(response.status, 500);
    assert.deepEqual(JSON.parse(body), {
      requestId: "req_test_000001",
      status: "error",
      error: {
        code: "INTERNAL_ERROR",
        message: "An unexpected error occurred",
      },
    });
    assert.equal(body.includes("UNEXPECTED_INTERNAL_DETAIL"), false);

    assert.equal(entries.length, 1);
    assert.equal(entries[0].message, "Unhandled request error");
    assert.equal(entries[0].context?.method, "GET");
    assert.equal(entries[0].context?.path, "/api/v1/projects/proj_test");
    assert.equal(
      (entries[0].context?.cause as { message?: string }).message,
      "UNEXPECTED_INTERNAL_DETAIL",
    );
  });
});

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createApp } from "../src/app.js";
import { readRuntimeEnv } from "../src/config/env.js";
import { readAllowedOrigins } from "../src/config/security.js";
import type { DatabaseHealth } from "../src/db/health.js";

const databaseHealth: DatabaseHealth = { checkConnection: async () => undefined };

function testApp() {
  return createApp({
    databaseHealth,
    generateRequestId: () => "req_test_000001",
    allowedOrigins: ["http://localhost:3000"],
    maxRequestBodyBytes: 64,
  });
}

describe("cross-origin access", () => {
  it("allows a configured origin", async () => {
    const response = await testApp().request("/health", {
      headers: { Origin: "http://localhost:3000" },
    });

    assert.equal(
      response.headers.get("Access-Control-Allow-Origin"),
      "http://localhost:3000",
    );
  });

  it("does not echo an unknown origin", async () => {
    const response = await testApp().request("/health", {
      headers: { Origin: "https://attacker.example" },
    });

    assert.equal(response.headers.get("Access-Control-Allow-Origin"), null);
  });

  it("defaults to the local UI origins", () => {
    assert.deepEqual(readAllowedOrigins({}), [
      "http://localhost:3000",
      "http://127.0.0.1:3000",
    ]);
  });

  it("reads a configured origin allowlist", () => {
    assert.deepEqual(
      readAllowedOrigins({ DEVCREW_ALLOWED_ORIGINS: "https://a.example, https://b.example" }),
      ["https://a.example", "https://b.example"],
    );
  });
});

describe("request body limits", () => {
  it("rejects an oversized request body", async () => {
    const response = await testApp().request("/api/v1/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "x".repeat(200) }),
    });

    assert.equal(response.status, 413);
    assert.deepEqual(await response.json(), {
      requestId: "req_test_000001",
      status: "error",
      error: {
        code: "REQUEST_BODY_TOO_LARGE",
        message: "Request body is too large",
      },
    });
  });
});

describe("response hardening", () => {
  it("sets secure response headers", async () => {
    const response = await testApp().request("/health");

    assert.equal(response.headers.get("X-Content-Type-Options"), "nosniff");
    assert.equal(response.headers.get("X-Frame-Options"), "SAMEORIGIN");
  });

  it("binds to loopback by default", () => {
    const env = readRuntimeEnv({ DATABASE_URL: "postgresql://localhost/test" });

    assert.equal(env.HOST, "127.0.0.1");
  });
});

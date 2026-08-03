import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createApp } from "../src/app.js";
import type { DatabaseHealth } from "../src/db/health.js";
import { InMemoryProjectStore } from "../src/projects/in-memory-project-store.js";
import { createProjectService } from "../src/projects/project-service.js";
import type { ProjectService } from "../src/projects/project-service.js";
import type { PreparedRepository } from "../src/repositories/prepared-repositories.js";

const preparedRepositories: readonly PreparedRepository[] = [
  {
    id: "prepared_devcrew_main",
    publicRepositoryUrl: "https://github.com/example/devcrew",
  },
  {
    id: "prepared_devcrew_duplicate_url",
    publicRepositoryUrl: "https://github.com/example/devcrew",
  },
  {
    id: "prepared_other",
    publicRepositoryUrl: "https://github.com/example/other",
  },
];

function fakeDatabase(): DatabaseHealth {
  return { checkConnection: async () => undefined };
}

function fixedRequestId(): string {
  return "req_project_test";
}

function createDeterministicProjectService(): ProjectService {
  let projectCount = 0;
  let repositoryCount = 0;

  return createProjectService({
    store: new InMemoryProjectStore(),
    preparedRepositories,
    generateProjectId: () => {
      projectCount += 1;
      return `proj_${String(projectCount).padStart(6, "0")}`;
    },
    generateRepositoryId: () => {
      repositoryCount += 1;
      return `repo_${String(repositoryCount).padStart(6, "0")}`;
    },
    now: () => new Date("2026-08-03T00:00:00.000Z"),
  });
}

function createTestApp(projectService = createDeterministicProjectService()) {
  return createApp({
    databaseHealth: fakeDatabase(),
    generateRequestId: fixedRequestId,
    projectService,
  });
}

async function createProject(app: ReturnType<typeof createTestApp>) {
  return app.request("/api/v1/projects", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: "Devcrew",
      publicRepositoryUrl: "https://github.com/example/devcrew",
      preparedRepositoryId: "prepared_devcrew_main",
    }),
  });
}

describe("project repository API", () => {
  it("creates a project with a connected repository snapshot", async () => {
    const app = createTestApp();

    const response = await createProject(app);

    assert.equal(response.status, 201);
    assert.equal(response.headers.get("X-Request-Id"), "req_project_test");
    assert.deepEqual(await response.json(), {
      project: {
        id: "proj_000001",
        name: "Devcrew",
        status: "REPOSITORY_CONNECTED",
        repository: {
          id: "repo_000001",
          publicRepositoryUrl: "https://github.com/example/devcrew",
          preparedRepositoryId: "prepared_devcrew_main",
        },
        createdAt: "2026-08-03T00:00:00.000Z",
        updatedAt: "2026-08-03T00:00:00.000Z",
      },
    });
  });

  it("trims names and returns canonical repository URLs", async () => {
    const app = createTestApp();

    const response = await app.request("/api/v1/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "  Devcrew  ",
        publicRepositoryUrl:
          "https://github.com/example/devcrew/?utm_source=test#readme",
        preparedRepositoryId: "prepared_devcrew_main",
      }),
    });

    assert.equal(response.status, 201);
    assert.deepEqual(await response.json(), {
      project: {
        id: "proj_000001",
        name: "Devcrew",
        status: "REPOSITORY_CONNECTED",
        repository: {
          id: "repo_000001",
          publicRepositoryUrl: "https://github.com/example/devcrew",
          preparedRepositoryId: "prepared_devcrew_main",
        },
        createdAt: "2026-08-03T00:00:00.000Z",
        updatedAt: "2026-08-03T00:00:00.000Z",
      },
    });
  });

  it("rejects malformed JSON with a stable validation error", async () => {
    const app = createTestApp();

    const response = await app.request("/api/v1/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{",
    });

    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), {
      requestId: "req_project_test",
      status: "error",
      error: {
        code: "VALIDATION_FAILED",
        message: "Request validation failed",
      },
    });
  });

  it("rejects invalid project input", async () => {
    const app = createTestApp();

    const response = await app.request("/api/v1/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "",
        publicRepositoryUrl: "http://github.com/example/devcrew",
        preparedRepositoryId: "bad id with spaces",
      }),
    });

    assert.equal(response.status, 400);
    assert.equal((await response.json()).error.code, "VALIDATION_FAILED");
  });

  it("rejects unknown prepared repositories", async () => {
    const app = createTestApp();

    const response = await app.request("/api/v1/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Devcrew",
        publicRepositoryUrl: "https://github.com/example/devcrew",
        preparedRepositoryId: "prepared_missing",
      }),
    });

    assert.equal(response.status, 422);
    assert.equal(
      (await response.json()).error.code,
      "PREPARED_REPOSITORY_NOT_APPROVED",
    );
  });

  it("rejects repository URL mismatches", async () => {
    const app = createTestApp();

    const response = await app.request("/api/v1/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Devcrew",
        publicRepositoryUrl: "https://github.com/example/other",
        preparedRepositoryId: "prepared_devcrew_main",
      }),
    });

    assert.equal(response.status, 422);
    assert.equal((await response.json()).error.code, "REPOSITORY_URL_MISMATCH");
  });

  it("rejects duplicate prepared repository associations", async () => {
    const app = createTestApp();
    assert.equal((await createProject(app)).status, 201);

    const response = await createProject(app);

    assert.equal(response.status, 409);
    assert.equal(
      (await response.json()).error.code,
      "PROJECT_REPOSITORY_ALREADY_ASSOCIATED",
    );
  });

  it("rejects duplicate canonical repository URLs", async () => {
    const app = createTestApp();
    assert.equal((await createProject(app)).status, 201);

    const response = await app.request("/api/v1/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Devcrew duplicate",
        publicRepositoryUrl: "https://github.com/example/devcrew/",
        preparedRepositoryId: "prepared_devcrew_duplicate_url",
      }),
    });

    assert.equal(response.status, 409);
    assert.equal(
      (await response.json()).error.code,
      "PROJECT_REPOSITORY_ALREADY_ASSOCIATED",
    );
  });

  it("reads an existing project by project id", async () => {
    const app = createTestApp();
    assert.equal((await createProject(app)).status, 201);

    const response = await app.request("/api/v1/projects/proj_000001");

    assert.equal(response.status, 200);
    assert.equal(response.headers.get("X-Request-Id"), "req_project_test");
    assert.equal((await response.json()).project.id, "proj_000001");
  });

  it("returns not found for an unknown project id", async () => {
    const app = createTestApp();

    const response = await app.request("/api/v1/projects/proj_missing");

    assert.equal(response.status, 404);
    assert.deepEqual(await response.json(), {
      requestId: "req_project_test",
      status: "error",
      error: {
        code: "PROJECT_NOT_FOUND",
        message: "Project not found",
      },
    });
  });

  it("rejects invalid project id path parameters", async () => {
    const app = createTestApp();

    const response = await app.request("/api/v1/projects/not a project");

    assert.equal(response.status, 400);
    assert.equal((await response.json()).error.code, "VALIDATION_FAILED");
  });

  it("sanitizes unexpected project service failures", async () => {
    const sensitiveMessage = "SENSITIVE_PROJECT_STORE_DETAIL";
    const projectService: ProjectService = {
      async createProject() {
        throw new Error(sensitiveMessage);
      },
      async getProject() {
        throw new Error(sensitiveMessage);
      },
    };
    const app = createTestApp(projectService);

    const response = await app.request("/api/v1/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Devcrew",
        publicRepositoryUrl: "https://github.com/example/devcrew",
        preparedRepositoryId: "prepared_devcrew_main",
      }),
    });
    const body = await response.text();

    assert.equal(response.status, 500);
    assert.deepEqual(JSON.parse(body), {
      requestId: "req_project_test",
      status: "error",
      error: {
        code: "INTERNAL_ERROR",
        message: "An unexpected error occurred",
      },
    });
    assert.equal(body.includes(sensitiveMessage), false);
  });

  it("does not return local filesystem paths in project snapshots", async () => {
    const app = createTestApp();

    const response = await createProject(app);
    const body = await response.text();

    assert.equal(response.status, 201);
    assert.equal(body.includes("/Users/"), false);
    assert.equal(body.includes("private/tmp"), false);
    assert.equal(body.includes("preparedRepositoryPath"), false);
  });
});

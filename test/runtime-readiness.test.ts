import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type {
  LoadedScreenshotArtifact,
  ManagedScreenshotArtifactStore,
  ScreenshotArtifactMetadata,
  StoredScreenshotArtifact,
} from "../src/browser/browser-types.js";
import {
  checkArtifactStorageAvailable,
  createRuntimeReadinessDiagnostics,
  hasConfiguredSecret,
} from "../src/diagnostics/runtime-readiness.js";

const allAvailable = {
  gitProbe: async () => true,
  browserProbe: async () => true,
  artifactStorageProbe: async () => true,
};

describe("runtime readiness diagnostics", () => {
  it("reports READY when all capabilities are available", async () => {
    const diagnostics = createRuntimeReadinessDiagnostics({
      environment: {
        GITHUB_TOKEN: "github-token",
        OPENAI_API_KEY: "openai-key",
      },
      ...allAvailable,
    });

    assert.deepEqual(await diagnostics.check(), {
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

  it("reports DEGRADED for missing OpenAI configuration", async () => {
    const diagnostics = createRuntimeReadinessDiagnostics({
      environment: {
        GITHUB_TOKEN: "github-token",
        OPENAI_API_KEY: " ",
      },
      ...allAvailable,
    });

    const readiness = await diagnostics.check();

    assert.equal(readiness.status, "DEGRADED");
    assert.equal(readiness.capabilities.openaiConfigured, false);
  });

  it("reports DEGRADED for missing GitHub configuration", async () => {
    const diagnostics = createRuntimeReadinessDiagnostics({
      environment: {
        GITHUB_TOKEN: "",
        OPENAI_API_KEY: "openai-key",
      },
      ...allAvailable,
    });

    const readiness = await diagnostics.check();

    assert.equal(readiness.status, "DEGRADED");
    assert.equal(readiness.capabilities.githubConfigured, false);
  });

  it("reports unavailable Git, browser, and artifact storage independently", async () => {
    const diagnostics = createRuntimeReadinessDiagnostics({
      environment: {
        GITHUB_TOKEN: "github-token",
        OPENAI_API_KEY: "openai-key",
      },
      gitProbe: async () => false,
      browserProbe: async () => false,
      artifactStorageProbe: async () => false,
    });

    const readiness = await diagnostics.check();

    assert.equal(readiness.status, "DEGRADED");
    assert.equal(readiness.capabilities.gitAvailable, false);
    assert.equal(readiness.capabilities.browserAvailable, false);
    assert.equal(readiness.capabilities.artifactStorageAvailable, false);
  });

  it("bounds slow capability checks and fails them closed", async () => {
    const diagnostics = createRuntimeReadinessDiagnostics({
      environment: {
        GITHUB_TOKEN: "github-token",
        OPENAI_API_KEY: "openai-key",
      },
      timeoutMs: 1,
      gitProbe: () => new Promise<boolean>(() => undefined),
      browserProbe: async () => true,
      artifactStorageProbe: async () => true,
    });

    const readiness = await diagnostics.check();

    assert.equal(readiness.status, "DEGRADED");
    assert.equal(readiness.capabilities.gitAvailable, false);
  });

  it("uses config presence only for OpenAI and GitHub without network/provider calls", async () => {
    let probes = 0;
    const diagnostics = createRuntimeReadinessDiagnostics({
      environment: {
        GITHUB_TOKEN: "github-token",
        OPENAI_API_KEY: "openai-key",
      },
      gitProbe: async () => {
        probes += 1;
        return true;
      },
      browserProbe: async () => {
        probes += 1;
        return true;
      },
      artifactStorageProbe: async () => {
        probes += 1;
        return true;
      },
    });

    const readiness = await diagnostics.check();

    assert.equal(readiness.capabilities.githubConfigured, true);
    assert.equal(readiness.capabilities.openaiConfigured, true);
    assert.equal(probes, 3);
  });

  it("treats blank secrets as unconfigured", () => {
    assert.equal(hasConfiguredSecret(undefined), false);
    assert.equal(hasConfiguredSecret(" "), false);
    assert.equal(hasConfiguredSecret(" value "), true);
  });

  it("is idempotent across repeated readiness calls", async () => {
    const diagnostics = createRuntimeReadinessDiagnostics({
      environment: {
        GITHUB_TOKEN: "github-token",
        OPENAI_API_KEY: "openai-key",
      },
      ...allAvailable,
    });

    assert.deepEqual(await diagnostics.check(), await diagnostics.check());
  });

  it("cleans up the artifact storage probe after success", async () => {
    const store = fakeStore({
      store: async () => ({
        artifactId: "shot_00000001-1234-4234-9234-123456789abc",
        absolutePath: "/internal/not-returned.png",
        byteCount: 9,
      }),
      delete: async () => "DELETED",
    });

    assert.equal(await checkArtifactStorageAvailable(store), true);
    assert.equal(store.calls.store, 1);
    assert.equal(store.calls.delete, 2);
  });

  it("cleans up the artifact storage probe after deletion failure", async () => {
    let deleteCalls = 0;
    const store = fakeStore({
      store: async () => ({
        artifactId: "shot_00000002-1234-4234-9234-123456789abc",
        absolutePath: "/internal/not-returned.png",
        byteCount: 9,
      }),
      delete: async () => {
        deleteCalls += 1;
        if (deleteCalls === 1) {
          throw new Error("delete failed");
        }
        return "DELETED";
      },
    });

    assert.equal(await checkArtifactStorageAvailable(store), false);
    assert.equal(store.calls.store, 1);
    assert.equal(store.calls.delete, 2);
  });
});

function fakeStore(overrides: {
  store: ManagedScreenshotArtifactStore["store"];
  delete: ManagedScreenshotArtifactStore["delete"];
}): ManagedScreenshotArtifactStore & { calls: { store: number; delete: number } } {
  const calls = { store: 0, delete: 0 };

  return {
    calls,
    async store(input): Promise<StoredScreenshotArtifact> {
      calls.store += 1;
      return overrides.store(input);
    },
    async load(): Promise<LoadedScreenshotArtifact> {
      throw new Error("load should not be called");
    },
    async list(): Promise<ScreenshotArtifactMetadata[]> {
      throw new Error("list should not be called");
    },
    async delete(input): Promise<"DELETED" | "MISSING" | "FAILED"> {
      calls.delete += 1;
      return overrides.delete(input);
    },
  };
}

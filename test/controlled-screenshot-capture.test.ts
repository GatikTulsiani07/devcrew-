import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  createControlledScreenshotCapture,
  ControlledScreenshotCaptureError,
  SCREENSHOT_VIEWPORT,
} from "../src/browser/controlled-screenshot-capture.js";
import type {
  BrowserRenderer,
  BrowserScreenshotEvidence,
  BrowserVerificationProfile,
  ScreenshotArtifactStore,
  ScreenshotViewport,
} from "../src/browser/browser-types.js";

const profile: BrowserVerificationProfile = {
  id: "test_frontend",
  executable: "npm",
  args: ["run", "dev:ui", "--", "--hostname", "127.0.0.1", "--port", "43119"],
  host: "127.0.0.1",
  port: 43119,
  path: "/",
  startupTimeoutMs: 100,
  pollIntervalMs: 5,
  navigationTimeoutMs: 100,
  shutdownTimeoutMs: 10,
};

const pngBytes = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00,
]);

function verification(url = "http://127.0.0.1:43119/") {
  return {
    status: "PASSED" as const,
    url,
    verifiedAt: "2026-08-03T08:00:00.000Z",
  };
}

describe("controlled screenshot capture", () => {
  it("captures a rendered PNG from the approved localhost URL and returns public evidence only", async () => {
    const calls: Array<{
      url: string;
      expectedOrigin: string;
      viewport: ScreenshotViewport;
      timeoutMs: number;
      maxBytes: number;
    }> = [];
    const renderer: BrowserRenderer = {
      async captureScreenshot(input) {
        calls.push(input);
        return {
          url: "http://127.0.0.1:43119/",
          pngBytes,
        };
      },
    };
    const storeCalls: Array<{
      projectId: string;
      taskId: string;
      pngBytes: Uint8Array;
      repositoryRoot?: string;
    }> = [];
    const store: ScreenshotArtifactStore = {
      async store(input) {
        storeCalls.push(input);
        return {
          artifactId: "shot_123e4567-e89b-42d3-a456-426614174000",
          absolutePath: "/private/tmp/devcrew/screenshots/secret.png",
          byteCount: input.pngBytes.byteLength,
        };
      },
      async load() {
        throw new Error("unused");
      },
    };

    const evidence = await createControlledScreenshotCapture({
      renderer,
      store,
      now: () => new Date("2026-08-03T09:00:00.000Z"),
    }).capture({
      projectId: "proj_000001",
      taskId: "task_000001",
      profile,
      browserVerification: verification(),
      repositoryRoot: "/private/tmp/devcrew-prepared-repo",
    });

    assert.deepEqual(calls, [
      {
        url: "http://127.0.0.1:43119/",
        expectedOrigin: "http://127.0.0.1:43119",
        viewport: SCREENSHOT_VIEWPORT,
        timeoutMs: 100,
        maxBytes: 8 * 1024 * 1024,
      },
    ]);
    assert.equal(storeCalls[0]?.projectId, "proj_000001");
    assert.equal(storeCalls[0]?.taskId, "task_000001");
    assert.equal(storeCalls[0]?.repositoryRoot, "/private/tmp/devcrew-prepared-repo");
    assert.deepEqual(storeCalls[0]?.pngBytes, pngBytes);
    assert.deepEqual(evidence, {
      status: "CAPTURED",
      id: "shot_123e4567-e89b-42d3-a456-426614174000",
      url: "http://127.0.0.1:43119/",
      viewport: { width: 1440, height: 900 },
      capturedAt: "2026-08-03T09:00:00.000Z",
    });
    assert.equal(JSON.stringify(evidence).includes("/private/tmp"), false);
  });

  it("requires passed browser verification before capture", async () => {
    let called = false;
    const renderer: BrowserRenderer = {
      async captureScreenshot() {
        called = true;
        return { url: "http://127.0.0.1:43119/", pngBytes };
      },
    };

    await assert.rejects(
      createControlledScreenshotCapture({ renderer }).capture({
        projectId: "proj_000001",
        taskId: "task_000001",
        profile,
        browserVerification: {
          status: "FAILED" as never,
          url: "http://127.0.0.1:43119/",
          verifiedAt: "2026-08-03T08:00:00.000Z",
        },
        repositoryRoot: "/private/tmp/devcrew-prepared-repo",
      }),
      (error: unknown) =>
        error instanceof ControlledScreenshotCaptureError &&
        error.reason === "browser verification is not passed",
    );
    assert.equal(called, false);
  });

  it("rejects unapproved targets and external redirects", async () => {
    await assert.rejects(
      createControlledScreenshotCapture({
        renderer: {
          async captureScreenshot() {
            throw new Error("unused");
          },
        },
      }).capture({
        projectId: "proj_000001",
        taskId: "task_000001",
        profile,
        browserVerification: verification("https://example.com/"),
        repositoryRoot: "/private/tmp/devcrew-prepared-repo",
      }),
      (error: unknown) =>
        error instanceof ControlledScreenshotCaptureError &&
        error.reason === "localhost URL is not approved",
    );

    await assert.rejects(
      createControlledScreenshotCapture({
        renderer: {
          async captureScreenshot() {
            return {
              url: "https://example.com/",
              pngBytes,
            };
          },
        },
      }).capture({
        projectId: "proj_000001",
        taskId: "task_000001",
        profile,
        browserVerification: verification(),
        repositoryRoot: "/private/tmp/devcrew-prepared-repo",
      }),
      (error: unknown) =>
        error instanceof ControlledScreenshotCaptureError &&
        error.reason === "localhost URL is not approved",
    );
  });

  it("rejects empty and oversized screenshot bytes before storage", async () => {
    let storeCalls = 0;
    const store: ScreenshotArtifactStore = {
      async store() {
        storeCalls += 1;
        throw new Error("unused");
      },
      async load() {
        throw new Error("unused");
      },
    };

    await assert.rejects(
      createControlledScreenshotCapture({
        renderer: {
          async captureScreenshot() {
            return {
              url: "http://127.0.0.1:43119/",
              pngBytes: new Uint8Array(),
            };
          },
        },
        store,
      }).capture({
        projectId: "proj_000001",
        taskId: "task_000001",
        profile,
        browserVerification: verification(),
        repositoryRoot: "/private/tmp/devcrew-prepared-repo",
      }),
      (error: unknown) =>
        error instanceof ControlledScreenshotCaptureError &&
        error.reason === "screenshot is empty",
    );

    await assert.rejects(
      createControlledScreenshotCapture({
        maxBytes: 8,
        renderer: {
          async captureScreenshot() {
            return {
              url: "http://127.0.0.1:43119/",
              pngBytes,
            };
          },
        },
        store,
      }).capture({
        projectId: "proj_000001",
        taskId: "task_000001",
        profile,
        browserVerification: verification(),
        repositoryRoot: "/private/tmp/devcrew-prepared-repo",
      }),
      (error: unknown) =>
        error instanceof ControlledScreenshotCaptureError &&
        error.reason === "screenshot exceeds size limit",
    );
    assert.equal(storeCalls, 0);
  });

  it("sanitizes renderer and storage failures", async () => {
    await assert.rejects(
      createControlledScreenshotCapture({
        renderer: {
          async captureScreenshot() {
            throw new Error("secret token at /Users/example/repo");
          },
        },
      }).capture({
        projectId: "proj_000001",
        taskId: "task_000001",
        profile,
        browserVerification: verification(),
        repositoryRoot: "/private/tmp/devcrew-prepared-repo",
      }),
      (error: unknown) =>
        error instanceof ControlledScreenshotCaptureError &&
        error.reason === "screenshot capture failed" &&
        !String(error).includes("/Users/"),
    );

    await assert.rejects(
      createControlledScreenshotCapture({
        renderer: {
          async captureScreenshot() {
            return {
              url: "http://127.0.0.1:43119/",
              pngBytes,
            };
          },
        },
        store: {
          async store() {
            throw new Error("secret path /Users/example/screenshots");
          },
          async load() {
            throw new Error("unused");
          },
        },
      }).capture({
        projectId: "proj_000001",
        taskId: "task_000001",
        profile,
        browserVerification: verification(),
        repositoryRoot: "/private/tmp/devcrew-prepared-repo",
      }),
      (error: unknown) =>
        error instanceof ControlledScreenshotCaptureError &&
        error.reason === "screenshot storage failed" &&
        !String(error).includes("/Users/"),
    );
  });

  it("reuses existing evidence for the same approved URL and viewport", async () => {
    const existing: BrowserScreenshotEvidence = {
      status: "CAPTURED",
      id: "shot_123e4567-e89b-42d3-a456-426614174000",
      url: "http://127.0.0.1:43119/",
      viewport: { width: 1440, height: 900 },
      capturedAt: "2026-08-03T09:00:00.000Z",
    };
    let calls = 0;

    const evidence = await createControlledScreenshotCapture({
      renderer: {
        async captureScreenshot() {
          calls += 1;
          throw new Error("unused");
        },
      },
    }).capture({
      projectId: "proj_000001",
      taskId: "task_000001",
      profile,
      browserVerification: verification(),
      repositoryRoot: "/private/tmp/devcrew-prepared-repo",
      existingEvidence: existing,
    });

    assert.deepEqual(evidence, existing);
    assert.notEqual(evidence.viewport, existing.viewport);
    assert.equal(calls, 0);
  });

  it("does not accept caller-controlled viewport dimensions", () => {
    assert.throws(
      () =>
        createControlledScreenshotCapture({
          viewport: { width: 390, height: 844 },
        }),
      (error: unknown) =>
        error instanceof ControlledScreenshotCaptureError &&
        error.reason === "screenshot viewport is not approved",
    );
  });

  it("delegates browser cleanup to renderer adapters on success and failure", async () => {
    let successClosed = false;
    const successRenderer: BrowserRenderer = {
      async captureScreenshot() {
        try {
          return { url: "http://127.0.0.1:43119/", pngBytes };
        } finally {
          successClosed = true;
        }
      },
    };

    await createControlledScreenshotCapture({
      renderer: successRenderer,
      store: {
        async store() {
          return {
            artifactId: "shot_123e4567-e89b-42d3-a456-426614174000",
            absolutePath: "/private/tmp/devcrew/screenshots/secret.png",
            byteCount: pngBytes.byteLength,
          };
        },
        async load() {
          throw new Error("unused");
        },
      },
    }).capture({
      projectId: "proj_000001",
      taskId: "task_000001",
      profile,
      browserVerification: verification(),
      repositoryRoot: "/private/tmp/devcrew-prepared-repo",
    });
    assert.equal(successClosed, true);

    let failureClosed = false;
    const failureRenderer: BrowserRenderer = {
      async captureScreenshot() {
        try {
          throw new Error("capture failed");
        } finally {
          failureClosed = true;
        }
      },
    };

    await assert.rejects(
      createControlledScreenshotCapture({ renderer: failureRenderer }).capture({
        projectId: "proj_000001",
        taskId: "task_000001",
        profile,
        browserVerification: verification(),
        repositoryRoot: "/private/tmp/devcrew-prepared-repo",
      }),
      ControlledScreenshotCaptureError,
    );
    assert.equal(failureClosed, true);
  });
});

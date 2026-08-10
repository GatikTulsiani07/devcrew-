import assert from "node:assert/strict";
import { mkdtemp, readFile, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { describe, it } from "node:test";

import {
  createScreenshotArtifactStore,
  ScreenshotArtifactStoreError,
} from "../src/browser/screenshot-store.js";

const pngBytes = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00,
]);

describe("screenshot artifact store", () => {
  it("stores server-generated PNG artifacts under project and task isolation", async () => {
    const artifactRoot = await mkdtemp(join(tmpdir(), "devcrew-shot-store-"));
    const repositoryRoot = await mkdtemp(join(tmpdir(), "devcrew-prepared-repo-"));

    const artifact = await createScreenshotArtifactStore({
      artifactRoot,
      generateArtifactId: () => "shot_123e4567-e89b-42d3-a456-426614174000",
    }).store({
      projectId: "proj_000001",
      taskId: "task_000001",
      pngBytes,
      repositoryRoot,
    });

    assert.equal(artifact.artifactId, "shot_123e4567-e89b-42d3-a456-426614174000");
    assert.equal(artifact.absolutePath.endsWith(".png"), true);
    assert.equal(relative(artifactRoot, artifact.absolutePath).startsWith(".."), false);
    assert.equal(relative(repositoryRoot, artifact.absolutePath).startsWith(".."), true);
    assert.equal(artifact.byteCount, pngBytes.byteLength);
    assert.deepEqual(new Uint8Array(await readFile(artifact.absolutePath)), pngBytes);
    assert.match(relative(artifactRoot, artifact.absolutePath), /proj_000001[/\\]task_000001[/\\]shot_/);
  });

  it("rejects traversal, unsafe generated ids, and repository-overlapping roots", async () => {
    const artifactRoot = await mkdtemp(join(tmpdir(), "devcrew-shot-store-"));

    await assert.rejects(
      createScreenshotArtifactStore({ artifactRoot }).store({
        projectId: "../proj_000001",
        taskId: "task_000001",
        pngBytes,
      }),
      (error: unknown) =>
        error instanceof ScreenshotArtifactStoreError &&
        error.reason === "project id is unsafe",
    );

    await assert.rejects(
      createScreenshotArtifactStore({
        artifactRoot,
        generateArtifactId: () => "../secret" as never,
      }).store({
        projectId: "proj_000001",
        taskId: "task_000001",
        pngBytes,
      }),
      (error: unknown) =>
        error instanceof ScreenshotArtifactStoreError &&
        error.reason === "artifact id is unsafe",
    );

    await assert.rejects(
      createScreenshotArtifactStore({
        artifactRoot,
        generateArtifactId: () => "shot_123e4567-e89b-42d3-a456-426614174000",
      }).store({
        projectId: "proj_000001",
        taskId: "task_000001",
        pngBytes,
        repositoryRoot: artifactRoot,
      }),
      (error: unknown) =>
        error instanceof ScreenshotArtifactStoreError &&
        error.reason === "artifact path overlaps repository",
    );
  });

  it("rejects empty, non-PNG, and oversized artifacts without persisting them", async () => {
    const artifactRoot = await mkdtemp(join(tmpdir(), "devcrew-shot-store-"));
    const store = createScreenshotArtifactStore({
      artifactRoot,
      maxBytes: 8,
      generateArtifactId: () => "shot_123e4567-e89b-42d3-a456-426614174000",
    });

    await assert.rejects(
      store.store({
        projectId: "proj_000001",
        taskId: "task_000001",
        pngBytes: new Uint8Array(),
      }),
      (error: unknown) =>
        error instanceof ScreenshotArtifactStoreError &&
        error.reason === "screenshot is empty",
    );

    await assert.rejects(
      store.store({
        projectId: "proj_000001",
        taskId: "task_000001",
        pngBytes: new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]),
      }),
      (error: unknown) =>
        error instanceof ScreenshotArtifactStoreError &&
        error.reason === "screenshot is not a PNG",
    );

    await assert.rejects(
      store.store({
        projectId: "proj_000001",
        taskId: "task_000001",
        pngBytes,
      }),
      (error: unknown) =>
        error instanceof ScreenshotArtifactStoreError &&
        error.reason === "screenshot exceeds size limit",
    );

    await assert.rejects(stat(join(artifactRoot, "proj_000001")), {
      code: "ENOENT",
    });
  });

  it("sanitizes artifact write failures", async () => {
    const artifactRoot = await mkdtemp(join(tmpdir(), "devcrew-shot-store-"));
    const first = await createScreenshotArtifactStore({
      artifactRoot,
      generateArtifactId: () => "shot_123e4567-e89b-42d3-a456-426614174000",
    }).store({
      projectId: "proj_000001",
      taskId: "task_000001",
      pngBytes,
    });

    assert.equal(first.artifactId, "shot_123e4567-e89b-42d3-a456-426614174000");

    await assert.rejects(
      createScreenshotArtifactStore({
        artifactRoot,
        generateArtifactId: () => "shot_123e4567-e89b-42d3-a456-426614174000",
      }).store({
        projectId: "proj_000001",
        taskId: "task_000001",
        pngBytes,
      }),
      (error: unknown) =>
        error instanceof ScreenshotArtifactStoreError &&
        error.reason === "artifact write failed" &&
        !String(error).includes(artifactRoot),
    );
  });
});

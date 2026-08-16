import assert from "node:assert/strict";
import {
  mkdtemp,
  readFile,
  rm,
  stat,
  symlink,
  unlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";

import {
  cleanupExpiredScreenshotArtifacts,
  DEFAULT_SCREENSHOT_RETENTION_MS,
  referencedScreenshotKeys,
} from "../src/browser/screenshot-artifact-cleanup.js";
import { createScreenshotArtifactStore } from "../src/browser/screenshot-store.js";
import type { TaskSnapshot } from "../src/tasks/types.js";

const pngBytes = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00,
]);
const oldDate = "2026-08-01T00:00:00.000Z";
const freshDate = "2026-08-07T12:00:00.000Z";
const now = () => new Date("2026-08-09T00:00:00.000Z");

describe("screenshot artifact cleanup", () => {
  it("deletes expired unreferenced screenshots and preserves fresh screenshots", async () => {
    await withArtifactRoot(async (artifactRoot) => {
      const oldArtifact = await storeArtifact(artifactRoot, {
        artifactId: shot(1),
        createdAt: oldDate,
      });
      const freshArtifact = await storeArtifact(artifactRoot, {
        artifactId: shot(2),
        createdAt: freshDate,
      });

      const result = await cleanupExpiredScreenshotArtifacts({
        store: createScreenshotArtifactStore({ artifactRoot }),
        tasks: [],
        now,
      });

      assert.deepEqual(result, {
        examined: 2,
        deleted: 1,
        preservedReferenced: 0,
        preservedFresh: 1,
        missing: 0,
        failed: 0,
      });
      await assert.rejects(readFile(oldArtifact.absolutePath));
      assert.deepEqual(new Uint8Array(await readFile(freshArtifact.absolutePath)), pngBytes);
    });
  });

  it("preserves expired screenshots referenced by validation and visual review evidence", async () => {
    await withArtifactRoot(async (artifactRoot) => {
      const validationShot = await storeArtifact(artifactRoot, {
        artifactId: shot(3),
        createdAt: oldDate,
      });
      const visualReviewShot = await storeArtifact(artifactRoot, {
        artifactId: shot(4),
        createdAt: oldDate,
      });
      const task = taskWithEvidence({
        validationScreenshotId: validationShot.artifactId,
        visualReviewScreenshotId: visualReviewShot.artifactId,
      });

      const result = await cleanupExpiredScreenshotArtifacts({
        store: createScreenshotArtifactStore({ artifactRoot }),
        tasks: [task],
        now,
      });

      assert.equal(result.deleted, 0);
      assert.equal(result.preservedReferenced, 2);
      assert.equal((await stat(validationShot.absolutePath)).isFile(), true);
      assert.equal((await stat(visualReviewShot.absolutePath)).isFile(), true);
    });
  });

  it("preserves every visual repair source and attempt screenshot reference", async () => {
    await withArtifactRoot(async (artifactRoot) => {
      const ids = [shot(5), shot(6), shot(7), shot(8)];
      for (const artifactId of ids) {
        await storeArtifact(artifactRoot, { artifactId, createdAt: oldDate });
      }
      const task = taskWithEvidence({
        repairAttempts: [
          { sourceScreenshotId: ids[0], screenshotId: ids[1] },
          { sourceScreenshotId: ids[2], screenshotId: ids[3] },
        ],
      });

      const result = await cleanupExpiredScreenshotArtifacts({
        store: createScreenshotArtifactStore({ artifactRoot }),
        tasks: [task],
        now,
      });

      assert.equal(result.deleted, 0);
      assert.equal(result.preservedReferenced, 4);
      for (const artifactId of ids) {
        assert.equal(
          (await stat(join(artifactRoot, "proj_000001", "task_000001", `${artifactId}.png`))).isFile(),
          true,
        );
      }
    });
  });

  it("handles missing backing files idempotently and removes stale metadata", async () => {
    await withArtifactRoot(async (artifactRoot) => {
      const artifact = await storeArtifact(artifactRoot, {
        artifactId: shot(9),
        createdAt: oldDate,
      });
      await unlink(artifact.absolutePath);

      const result = await cleanupExpiredScreenshotArtifacts({
        store: createScreenshotArtifactStore({ artifactRoot }),
        tasks: [],
        now,
      });
      const second = await cleanupExpiredScreenshotArtifacts({
        store: createScreenshotArtifactStore({ artifactRoot }),
        tasks: [],
        now,
      });

      assert.equal(result.missing, 1);
      assert.equal(result.deleted, 0);
      assert.equal(second.examined, 0);
    });
  });

  it("preserves project and task isolation for same-looking screenshot ids", async () => {
    await withArtifactRoot(async (artifactRoot) => {
      const artifactId = shot(10);
      const protectedArtifact = await storeArtifact(artifactRoot, {
        projectId: "proj_000001",
        taskId: "task_000001",
        artifactId,
        createdAt: oldDate,
      });
      const otherTaskArtifact = await storeArtifact(artifactRoot, {
        projectId: "proj_000001",
        taskId: "task_000002",
        artifactId,
        createdAt: oldDate,
      });
      const otherProjectArtifact = await storeArtifact(artifactRoot, {
        projectId: "proj_000002",
        taskId: "task_000001",
        artifactId,
        createdAt: oldDate,
      });
      const freshCrossMetadataTarget = await storeArtifact(artifactRoot, {
        projectId: "proj_000002",
        taskId: "task_000002",
        artifactId: shot(18),
        createdAt: freshDate,
      });
      await writeFile(
        join(artifactRoot, "proj_000001", "task_000001", `${freshCrossMetadataTarget.artifactId}.json`),
        JSON.stringify({
          artifactId: freshCrossMetadataTarget.artifactId,
          projectId: "proj_000002",
          taskId: "task_000002",
          createdAt: oldDate,
          byteCount: 9,
        }),
      );
      const task = taskWithEvidence({ validationScreenshotId: artifactId });

      const result = await cleanupExpiredScreenshotArtifacts({
        store: createScreenshotArtifactStore({ artifactRoot }),
        tasks: [task],
        now,
      });

      assert.equal(result.preservedReferenced, 1);
      assert.equal(result.deleted, 2);
      assert.equal((await stat(protectedArtifact.absolutePath)).isFile(), true);
      assert.equal((await stat(freshCrossMetadataTarget.absolutePath)).isFile(), true);
      await assert.rejects(readFile(otherTaskArtifact.absolutePath));
      await assert.rejects(readFile(otherProjectArtifact.absolutePath));
    });
  });

  it("does not delete repository or outside-root files through symlink/traversal metadata", async () => {
    await withArtifactRoot(async (artifactRoot) => {
      const repositoryRoot = await mkdtemp(join(tmpdir(), "devcrew-repo-safe-"));
      const outsideRoot = await mkdtemp(join(tmpdir(), "devcrew-outside-safe-"));
      try {
        const repositoryFile = join(repositoryRoot, "kept.png");
        const outsideFile = join(outsideRoot, "kept.png");
        await writeFile(repositoryFile, pngBytes);
        await writeFile(outsideFile, pngBytes);

        const artifactId = shot(11);
        const taskDir = join(artifactRoot, "proj_000001", "task_000001");
        await storeArtifact(artifactRoot, { artifactId, createdAt: oldDate });
        await unlink(join(taskDir, `${artifactId}.png`));
        await symlink(repositoryFile, join(taskDir, `${artifactId}.png`));
        await writeFile(
          join(taskDir, "shot_not-a-valid-id.json"),
          JSON.stringify({
            artifactId: "../outside",
            projectId: "proj_000001",
            taskId: "task_000001",
            createdAt: oldDate,
            byteCount: 9,
            absolutePath: outsideFile,
          }),
        );

        const result = await cleanupExpiredScreenshotArtifacts({
          store: createScreenshotArtifactStore({ artifactRoot }),
          tasks: [],
          now,
        });

        assert.equal(result.failed, 1);
        assert.deepEqual(new Uint8Array(await readFile(repositoryFile)), pngBytes);
        assert.deepEqual(new Uint8Array(await readFile(outsideFile)), pngBytes);
      } finally {
        await rm(repositoryRoot, { recursive: true, force: true });
        await rm(outsideRoot, { recursive: true, force: true });
      }
    });
  });

  it("returns safe counts only and uses server-owned retention", async () => {
    await withArtifactRoot(async (artifactRoot) => {
      await storeArtifact(artifactRoot, {
        artifactId: shot(12),
        createdAt: new Date(now().getTime() - DEFAULT_SCREENSHOT_RETENTION_MS - 1).toISOString(),
      });

      const result = await cleanupExpiredScreenshotArtifacts({
        store: createScreenshotArtifactStore({ artifactRoot }),
        tasks: [],
        now,
      });

      assert.deepEqual(Object.keys(result).sort(), [
        "deleted",
        "examined",
        "failed",
        "missing",
        "preservedFresh",
        "preservedReferenced",
      ]);
      assert.equal(JSON.stringify(result).includes(artifactRoot), false);
      assert.equal(result.deleted, 1);
    });
  });

  it("collects authoritative screenshot references without activity or path inference", () => {
    const references = referencedScreenshotKeys([
      taskWithEvidence({
        validationScreenshotId: shot(13),
        visualReviewScreenshotId: shot(14),
        repairAttempts: [{ sourceScreenshotId: shot(15), screenshotId: shot(16) }],
      }),
    ]);

    assert.equal(references.size, 4);
    assert.equal(references.has(`proj_000001\0task_000001\0${shot(13)}`), true);
    assert.equal(references.has(`proj_000001\0task_000001\0${shot(16)}`), true);
  });
});

async function withArtifactRoot(
  callback: (artifactRoot: string) => Promise<void>,
): Promise<void> {
  const artifactRoot = await mkdtemp(join(tmpdir(), "devcrew-shot-cleanup-"));
  try {
    await callback(artifactRoot);
  } finally {
    await rm(artifactRoot, { recursive: true, force: true });
  }
}

async function storeArtifact(
  artifactRoot: string,
  {
    projectId = "proj_000001",
    taskId = "task_000001",
    artifactId,
    createdAt,
  }: {
    projectId?: string;
    taskId?: string;
    artifactId: string;
    createdAt: string;
  },
) {
  return createScreenshotArtifactStore({
    artifactRoot,
    generateArtifactId: () => artifactId,
    now: () => new Date(createdAt),
  }).store({ projectId, taskId, pngBytes });
}

function taskWithEvidence({
  validationScreenshotId,
  visualReviewScreenshotId = validationScreenshotId,
  repairAttempts = [],
}: {
  validationScreenshotId?: string;
  visualReviewScreenshotId?: string;
  repairAttempts?: Array<{ sourceScreenshotId: string; screenshotId: string }>;
}): TaskSnapshot {
  return {
    id: "task_000001",
    projectId: "proj_000001",
    title: "Task",
    description: "Task",
    status: "VALIDATION_COMPLETED",
    plan: { summary: "Plan", steps: [] },
    validation: {
      id: "val_000001",
      role: "DEVOPS_ENGINEER",
      status: "PASSED",
      attempt: 1,
      startedAt: "2026-08-01T00:00:00.000Z",
      completedAt: "2026-08-01T00:01:00.000Z",
      checks: [],
      summary: "Validation passed.",
      ...(validationScreenshotId === undefined
        ? {}
        : {
            browserScreenshot: {
              status: "CAPTURED",
              id: validationScreenshotId,
              url: "http://127.0.0.1:43117/",
              viewport: { width: 1440, height: 900 },
              capturedAt: "2026-08-01T00:01:00.000Z",
            },
          }),
      ...(visualReviewScreenshotId === undefined
        ? {}
        : {
            visualReview: {
              status: "PASSED",
              summary: "Passed.",
              findings: [],
              screenshotId: visualReviewScreenshotId,
              reviewedAt: "2026-08-01T00:01:00.000Z",
            },
          }),
    },
    ...(repairAttempts.length === 0
      ? {}
      : {
          visualRepair: {
            maxAttempts: 2,
            attempts: repairAttempts.map((attempt, index) => ({
              attempt: index + 1,
              startedAt: "2026-08-01T00:02:00.000Z",
              completedAt: "2026-08-01T00:03:00.000Z",
              sourceScreenshotId: attempt.sourceScreenshotId,
              sourceVisualReview: {
                status: "FAILED",
                summary: "Failed.",
                findingCount: 1,
              },
              screenshotId: attempt.screenshotId,
            })),
          },
        }),
    createdAt: "2026-08-01T00:00:00.000Z",
    updatedAt: "2026-08-01T00:01:00.000Z",
  };
}

function shot(index: number): string {
  return `shot_${String(index).padStart(8, "0")}-1234-4234-9234-123456789abc`;
}

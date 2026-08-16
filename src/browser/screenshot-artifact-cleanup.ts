import type { ManagedScreenshotArtifactStore } from "./browser-types.js";
import type { TaskSnapshot } from "../tasks/types.js";

export const DEFAULT_SCREENSHOT_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;

export interface ScreenshotArtifactCleanupResult {
  examined: number;
  deleted: number;
  preservedReferenced: number;
  preservedFresh: number;
  missing: number;
  failed: number;
}

export interface ScreenshotArtifactCleanupDependencies {
  store: ManagedScreenshotArtifactStore;
  tasks: readonly TaskSnapshot[];
  now?: () => Date;
  retentionMs?: number;
}

export async function cleanupExpiredScreenshotArtifacts({
  store,
  tasks,
  now = () => new Date(),
  retentionMs = DEFAULT_SCREENSHOT_RETENTION_MS,
}: ScreenshotArtifactCleanupDependencies): Promise<ScreenshotArtifactCleanupResult> {
  const result: ScreenshotArtifactCleanupResult = {
    examined: 0,
    deleted: 0,
    preservedReferenced: 0,
    preservedFresh: 0,
    missing: 0,
    failed: 0,
  };
  const referenced = referencedScreenshotKeys(tasks);
  const cutoff = now().getTime() - retentionMs;

  for (const artifact of await store.list()) {
    result.examined += 1;
    const key = screenshotKey(artifact.projectId, artifact.taskId, artifact.artifactId);

    if (referenced.has(key)) {
      result.preservedReferenced += 1;
      continue;
    }

    if (Date.parse(artifact.createdAt) > cutoff) {
      result.preservedFresh += 1;
      continue;
    }

    const deleted = await store.delete({
      projectId: artifact.projectId,
      taskId: artifact.taskId,
      artifactId: artifact.artifactId,
    });

    switch (deleted) {
      case "DELETED":
        result.deleted += 1;
        break;
      case "MISSING":
        result.missing += 1;
        break;
      case "FAILED":
        result.failed += 1;
        break;
    }
  }

  return result;
}

export function referencedScreenshotKeys(
  tasks: readonly TaskSnapshot[],
): Set<string> {
  const references = new Set<string>();

  for (const task of tasks) {
    addReference(references, task, task.validation?.browserScreenshot?.id);
    addReference(references, task, task.validation?.visualReview?.screenshotId);

    for (const attempt of task.visualRepair?.attempts ?? []) {
      addReference(references, task, attempt.sourceScreenshotId);
      addReference(references, task, attempt.screenshotId);
    }
  }

  return references;
}

function addReference(
  references: Set<string>,
  task: TaskSnapshot,
  screenshotId?: string,
): void {
  if (screenshotId !== undefined) {
    references.add(screenshotKey(task.projectId, task.id, screenshotId));
  }
}

function screenshotKey(projectId: string, taskId: string, artifactId: string): string {
  return `${projectId}\0${taskId}\0${artifactId}`;
}

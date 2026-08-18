import { ApplicationError } from "../errors.js";

export const IDEMPOTENCY_KEY_HEADER = "Idempotency-Key";
export const MAX_IDEMPOTENCY_KEY_LENGTH = 128;
export const DEFAULT_TASK_IDEMPOTENCY_MAX_ENTRIES = 1_000;
export const DEFAULT_TASK_IDEMPOTENCY_COMPLETED_TTL_MS = 15 * 60 * 1_000;

export type TaskIdempotencyOperation =
  | "EXECUTE"
  | "VALIDATE"
  | "REVIEW"
  | "RETRY"
  | "RESUME"
  | "PULL_REQUEST_CREATE"
  | "PULL_REQUEST_REFRESH"
  | "PULL_REQUEST_SUMMARY_COMMENT";

export interface TaskIdempotencyScope {
  projectId: string;
  taskId: string;
  operation: TaskIdempotencyOperation;
}

export interface TaskIdempotencyStore {
  run<T>(
    scope: TaskIdempotencyScope,
    key: string | undefined,
    execute: () => Promise<T>,
  ): Promise<T>;
  size(): number;
  snapshot(): readonly TaskIdempotencyEntrySnapshot[];
}

export interface TaskIdempotencyEntrySnapshot {
  projectId: string;
  taskId: string;
  operation: TaskIdempotencyOperation;
  status: "IN_FLIGHT" | "COMPLETED";
  completedAt?: number;
}

export interface TaskIdempotencyStoreOptions {
  maxEntries?: number;
  completedTtlMs?: number;
  now?: () => number;
}

type Entry<T = unknown> =
  | {
      status: "IN_FLIGHT";
      projectId: string;
      taskId: string;
      operation: TaskIdempotencyOperation;
      promise: Promise<T>;
      createdAt: number;
    }
  | {
      status: "COMPLETED";
      projectId: string;
      taskId: string;
      operation: TaskIdempotencyOperation;
      result: T;
      completedAt: number;
    };

export function validateIdempotencyKey(
  rawKey: string | undefined,
): string | undefined {
  if (rawKey === undefined) {
    return undefined;
  }

  if (!/^[A-Za-z0-9._:-]{1,128}$/.test(rawKey)) {
    throw invalidIdempotencyKeyError();
  }

  return rawKey;
}

export function createTaskIdempotencyStore({
  maxEntries = DEFAULT_TASK_IDEMPOTENCY_MAX_ENTRIES,
  completedTtlMs = DEFAULT_TASK_IDEMPOTENCY_COMPLETED_TTL_MS,
  now = () => Date.now(),
}: TaskIdempotencyStoreOptions = {}): TaskIdempotencyStore {
  if (!Number.isInteger(maxEntries) || maxEntries <= 0) {
    throw new Error("maxEntries must be a positive integer");
  }

  if (!Number.isInteger(completedTtlMs) || completedTtlMs <= 0) {
    throw new Error("completedTtlMs must be a positive integer");
  }

  const entries = new Map<string, Entry>();

  return {
    async run<T>(
      scope: TaskIdempotencyScope,
      key: string | undefined,
      execute: () => Promise<T>,
    ) {
      if (key === undefined) {
        return execute();
      }

      const entryKey = scopedEntryKey(scope, key);
      const existing = entries.get(entryKey) as Entry<T> | undefined;

      if (existing?.status === "IN_FLIGHT") {
        return cloneSafeResult(await existing.promise);
      }

      const currentTime = now();

      if (
        existing?.status === "COMPLETED" &&
        currentTime - existing.completedAt <= completedTtlMs
      ) {
        return cloneSafeResult(existing.result);
      }

      if (existing?.status === "COMPLETED") {
        entries.delete(entryKey);
      }

      evictCompletedEntries(entries, currentTime, completedTtlMs, maxEntries);

      while (entries.size >= maxEntries) {
        const oldestCompleted = oldestCompletedEntryKey(entries);

        if (oldestCompleted === undefined) {
          break;
        }

        entries.delete(oldestCompleted);
      }

      if (entries.size >= maxEntries) {
        throw new ApplicationError(
          "IDEMPOTENCY_STORE_FULL",
          503,
          "Idempotency capacity reached",
        );
      }

      const promise = Promise.resolve().then(execute);
      entries.set(entryKey, {
        status: "IN_FLIGHT",
        projectId: scope.projectId,
        taskId: scope.taskId,
        operation: scope.operation,
        promise,
        createdAt: currentTime,
      });

      try {
        const result = await promise;
        entries.set(entryKey, {
          status: "COMPLETED",
          projectId: scope.projectId,
          taskId: scope.taskId,
          operation: scope.operation,
          result: cloneSafeResult(result),
          completedAt: now(),
        });
        evictCompletedEntries(entries, now(), completedTtlMs, maxEntries);
        return cloneSafeResult(result);
      } catch (error) {
        entries.delete(entryKey);
        throw error;
      }
    },

    size() {
      evictCompletedEntries(entries, now(), completedTtlMs, maxEntries);
      return entries.size;
    },

    snapshot() {
      evictCompletedEntries(entries, now(), completedTtlMs, maxEntries);

      return [...entries.values()].map((entry) => ({
        projectId: entry.projectId,
        taskId: entry.taskId,
        operation: entry.operation,
        status: entry.status,
        ...(entry.status === "COMPLETED"
          ? { completedAt: entry.completedAt }
          : {}),
      }));
    },
  };
}

function invalidIdempotencyKeyError(): ApplicationError {
  return new ApplicationError(
    "INVALID_IDEMPOTENCY_KEY",
    400,
    "Invalid idempotency key",
  );
}

function scopedEntryKey(scope: TaskIdempotencyScope, key: string): string {
  return `${scope.projectId}\0${scope.taskId}\0${scope.operation}\0${key}`;
}

function evictCompletedEntries(
  entries: Map<string, Entry>,
  now: number,
  completedTtlMs: number,
  maxEntries: number,
): void {
  for (const [key, entry] of entries) {
    if (
      entry.status === "COMPLETED" &&
      now - entry.completedAt > completedTtlMs
    ) {
      entries.delete(key);
    }
  }

  while (entries.size > maxEntries) {
    const oldestCompleted = oldestCompletedEntryKey(entries);

    if (oldestCompleted === undefined) {
      return;
    }

    entries.delete(oldestCompleted);
  }
}

function oldestCompletedEntryKey(
  entries: Map<string, Entry>,
): string | undefined {
  let oldestKey: string | undefined;
  let oldestCompletedAt = Number.POSITIVE_INFINITY;

  for (const [key, entry] of entries) {
    if (entry.status !== "COMPLETED") {
      continue;
    }

    if (entry.completedAt < oldestCompletedAt) {
      oldestKey = key;
      oldestCompletedAt = entry.completedAt;
    }
  }

  return oldestKey;
}

function cloneSafeResult<T>(value: T): T {
  return structuredClone(value);
}

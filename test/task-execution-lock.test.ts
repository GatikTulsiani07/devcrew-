import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { ApplicationError } from "../src/errors.js";
import { createTaskExecutionLock } from "../src/tasks/task-execution-lock.js";

describe("task execution lock", () => {
  it("rejects concurrent mutations for the same project/task and releases after success", async () => {
    const lock = createTaskExecutionLock();
    const held = deferred<void>();

    const first = lock.withLock("proj_1", "task_1", async () => {
      await held.promise;
      return "done";
    });

    await assert.rejects(
      () => lock.withLock("proj_1", "task_1", async () => "second"),
      (error: unknown) =>
        error instanceof ApplicationError &&
        error.status === 409 &&
        error.code === "TASK_EXECUTION_IN_PROGRESS" &&
        error.message === "Task execution is already in progress",
    );

    held.resolve();
    assert.equal(await first, "done");
    assert.equal(
      await lock.withLock("proj_1", "task_1", async () => "after"),
      "after",
    );
  });

  it("releases after a thrown operation failure", async () => {
    const lock = createTaskExecutionLock();

    await assert.rejects(
      () =>
        lock.withLock("proj_1", "task_1", async () => {
          throw new Error("operation failed");
        }),
      /operation failed/,
    );

    assert.equal(
      await lock.withLock("proj_1", "task_1", async () => "released"),
      "released",
    );
  });

  it("allows different tasks and different projects to run concurrently", async () => {
    const lock = createTaskExecutionLock();
    const held = deferred<void>();
    const events: string[] = [];

    const first = lock.withLock("proj_1", "task_1", async () => {
      events.push("first:start");
      await held.promise;
      events.push("first:end");
    });

    await lock.withLock("proj_1", "task_2", async () => {
      events.push("different-task");
    });
    await lock.withLock("proj_2", "task_1", async () => {
      events.push("different-project");
    });

    held.resolve();
    await first;

    assert.deepEqual(events, [
      "first:start",
      "different-task",
      "different-project",
      "first:end",
    ]);
  });
});

interface Deferred<T> {
  promise: Promise<T>;
  resolve(value: T | PromiseLike<T>): void;
  reject(reason?: unknown): void;
}

function deferred<T = void>(): Deferred<T> {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });

  return { promise, resolve, reject };
}

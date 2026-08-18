import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { ApplicationError } from "../src/errors.js";
import {
  createTaskIdempotencyStore,
  validateIdempotencyKey,
  type TaskIdempotencyScope,
} from "../src/tasks/task-idempotency.js";

const scope: TaskIdempotencyScope = {
  projectId: "proj_000001",
  taskId: "task_000001",
  operation: "EXECUTE",
};

describe("task idempotency key validation", () => {
  it("accepts a bounded safe key and preserves missing keys as optional", () => {
    assert.equal(validateIdempotencyKey("task-105_key.001:retry"), "task-105_key.001:retry");
    assert.equal(validateIdempotencyKey(undefined), undefined);
  });

  it("rejects empty, whitespace-only, overlong, control-character, and CR/LF keys", () => {
    for (const key of ["", "   ", "a".repeat(129), "abc\tdef", "abc\ndef", "abc\rdef", "abc def"]) {
      assert.throws(
        () => validateIdempotencyKey(key),
        (error: unknown) =>
          error instanceof ApplicationError &&
          error.code === "INVALID_IDEMPOTENCY_KEY" &&
          error.status === 400 &&
          (key.trim() === "" || !error.message.includes(key)),
      );
    }
  });
});

describe("task idempotency store", () => {
  it("runs normally when the optional key is missing", async () => {
    const store = createTaskIdempotencyStore();
    let calls = 0;

    await store.run(scope, undefined, async () => {
      calls += 1;
      return { task: { id: "task_000001", attempt: calls } };
    });
    await store.run(scope, undefined, async () => {
      calls += 1;
      return { task: { id: "task_000001", attempt: calls } };
    });

    assert.equal(calls, 2);
    assert.equal(store.size(), 0);
  });

  it("reuses an in-flight same-key operation without running it twice", async () => {
    const store = createTaskIdempotencyStore();
    const finish = deferred<{ task: { id: string; status: string } }>();
    let calls = 0;

    const first = store.run(scope, "same-key", async () => {
      calls += 1;
      return finish.promise;
    });
    const second = store.run(scope, "same-key", async () => {
      calls += 1;
      return { task: { id: "task_000001", status: "duplicate" } };
    });

    await Promise.resolve();
    assert.equal(calls, 1);
    finish.resolve({ task: { id: "task_000001", status: "done" } });
    assert.deepEqual(await first, { task: { id: "task_000001", status: "done" } });
    assert.deepEqual(await second, { task: { id: "task_000001", status: "done" } });
    assert.equal(calls, 1);
  });

  it("returns a cloned original success snapshot on replay", async () => {
    const store = createTaskIdempotencyStore();
    let calls = 0;

    const first = await store.run(scope, "snapshot-key", async () => {
      calls += 1;
      return { task: { id: "task_000001", status: "IMPLEMENTATION_COMPLETED" } };
    });
    first.task.status = "MUTATED_BY_CALLER";
    const second = await store.run(scope, "snapshot-key", async () => {
      calls += 1;
      return { task: { id: "task_000001", status: "REVIEW_COMPLETED" } };
    });

    assert.equal(calls, 1);
    assert.deepEqual(second, {
      task: { id: "task_000001", status: "IMPLEMENTATION_COMPLETED" },
    });
  });

  it("does not cache failed operations as completed success", async () => {
    const store = createTaskIdempotencyStore();
    let calls = 0;

    await assert.rejects(
      () =>
        store.run(scope, "failure-key", async () => {
          calls += 1;
          throw new ApplicationError("INTERNAL_ERROR", 500, "failed");
        }),
      ApplicationError,
    );
    const retried = await store.run(scope, "failure-key", async () => {
      calls += 1;
      return { task: { id: "task_000001", status: "IMPLEMENTATION_COMPLETED" } };
    });

    assert.equal(calls, 2);
    assert.deepEqual(retried, {
      task: { id: "task_000001", status: "IMPLEMENTATION_COMPLETED" },
    });
  });

  it("scopes the same literal key by project, task, and operation", async () => {
    const store = createTaskIdempotencyStore();
    const key = "shared-key";

    const execute = await store.run(scope, key, async () => "execute-result");
    const sameOperation = await store.run(scope, key, async () => "duplicate");
    const otherOperation = await store.run(
      { ...scope, operation: "VALIDATE" },
      key,
      async () => "validate-result",
    );
    const otherTask = await store.run(
      { ...scope, taskId: "task_000002" },
      key,
      async () => "other-task-result",
    );
    const otherProject = await store.run(
      { ...scope, projectId: "proj_000002" },
      key,
      async () => "other-project-result",
    );

    assert.equal(execute, "execute-result");
    assert.equal(sameOperation, "execute-result");
    assert.equal(otherOperation, "validate-result");
    assert.equal(otherTask, "other-task-result");
    assert.equal(otherProject, "other-project-result");
  });

  it("stores only safe scope metadata in snapshots", async () => {
    const store = createTaskIdempotencyStore();

    await store.run(scope, "safe-metadata", async () => ({
      task: { id: "task_000001" },
      requestBody: "should stay inside cached result only",
      authorization: "Bearer sk-sensitive",
    }));

    const serialized = JSON.stringify(store.snapshot());
    assert.equal(serialized.includes("safe-metadata"), false);
    assert.equal(serialized.includes("requestBody"), false);
    assert.equal(serialized.includes("authorization"), false);
    assert.equal(serialized.includes("Bearer"), false);
    assert.equal(store.snapshot()[0]?.operation, "EXECUTE");
  });

  it("bounds completed entries and expires them after the server-owned TTL", async () => {
    let time = 0;
    const store = createTaskIdempotencyStore({
      maxEntries: 2,
      completedTtlMs: 10,
      now: () => time,
    });

    await store.run(scope, "one", async () => "one");
    time = 1;
    await store.run({ ...scope, taskId: "task_000002" }, "two", async () => "two");
    time = 2;
    await store.run({ ...scope, taskId: "task_000003" }, "three", async () => "three");

    assert.equal(store.size(), 2);
    assert.deepEqual(
      store.snapshot().map((entry) => entry.taskId),
      ["task_000002", "task_000003"],
    );

    time = 20;
    assert.equal(store.size(), 0);
    const afterExpiry = await store.run(scope, "one", async () => "fresh-one");
    assert.equal(afterExpiry, "fresh-one");
  });

  it("fails safely when capacity is saturated by in-flight entries", async () => {
    const store = createTaskIdempotencyStore({ maxEntries: 1 });
    const finish = deferred<string>();
    const first = store.run(scope, "held", async () => finish.promise);

    await assert.rejects(
      () =>
        store.run(
          { ...scope, taskId: "task_000002" },
          "other-held",
          async () => "should not run",
        ),
      (error: unknown) =>
        error instanceof ApplicationError &&
        error.code === "IDEMPOTENCY_STORE_FULL" &&
        error.status === 503,
    );

    finish.resolve("done");
    assert.equal(await first, "done");
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

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  appendCommandAudit,
  CommandAuditDurationError,
  type CommandAuditEntry,
  MAX_TASK_COMMAND_AUDIT_ENTRIES,
} from "../src/tasks/task-command-audit.js";
import type { TaskSnapshot } from "../src/tasks/types.js";
import { MAX_WORKFLOW_DURATION_MS } from "../src/tasks/workflow-duration.js";

const task: TaskSnapshot = {
  id: "task_000001",
  projectId: "proj_000001",
  title: "Task",
  description: "Description",
  status: "PLAN_APPROVED",
  plan: { summary: "Plan", steps: [] },
  createdAt: "2026-08-03T00:00:00.000Z",
  updatedAt: "2026-08-03T00:00:00.000Z",
};

function auditEntry(
  overrides: Partial<CommandAuditEntry> = {},
): CommandAuditEntry {
  return {
    operation: "EXECUTE",
    workflowCorrelationId: "correlation-1",
    status: "SUCCEEDED",
    startedAt: "2026-08-03T00:00:00.000Z",
    completedAt: "2026-08-03T00:00:01.000Z",
    durationMs: 1,
    ...overrides,
  };
}

describe("task command audit history", () => {
  it("appends the first audit entry normally", () => {
    const entry = auditEntry();
    const current = appendCommandAudit(task, entry);

    assert.deepEqual(current.commandAudit, [entry]);
  });

  it("accepts zero, positive, and exact maximum durations", () => {
    const entries = [
      auditEntry({ workflowCorrelationId: "correlation-zero", durationMs: 0 }),
      auditEntry({
        workflowCorrelationId: "correlation-positive",
        durationMs: 1,
      }),
      auditEntry({
        workflowCorrelationId: "correlation-maximum",
        durationMs: MAX_WORKFLOW_DURATION_MS,
      }),
    ];

    const current = entries.reduce(appendCommandAudit, task);

    assert.deepEqual(current.commandAudit, entries);
  });

  it("rejects invalid durations before appending", () => {
    for (const durationMs of [
      -1,
      Number.NaN,
      Number.POSITIVE_INFINITY,
      Number.NEGATIVE_INFINITY,
      1.5,
      MAX_WORKFLOW_DURATION_MS + 1,
    ]) {
      assert.throws(
        () => appendCommandAudit(task, auditEntry({ durationMs })),
        CommandAuditDurationError,
      );
    }
  });

  it("retains only the newest bounded entries in chronological order", () => {
    let current = task;

    for (let index = 0; index < MAX_TASK_COMMAND_AUDIT_ENTRIES + 1; index += 1) {
      current = appendCommandAudit(current, auditEntry({
        workflowCorrelationId: `correlation-${index}`,
        startedAt: `2026-08-03T00:00:${String(index).padStart(2, "0")}.000Z`,
        completedAt: `2026-08-03T00:01:${String(index).padStart(2, "0")}.000Z`,
        durationMs: index,
      }));
    }

    assert.equal(current.commandAudit?.length, MAX_TASK_COMMAND_AUDIT_ENTRIES);
    assert.equal(current.commandAudit?.[0].workflowCorrelationId, "correlation-1");
    assert.equal(
      current.commandAudit?.at(-1)?.workflowCorrelationId,
      `correlation-${MAX_TASK_COMMAND_AUDIT_ENTRIES}`,
    );
  });

  it("ignores duplicate workflowCorrelationIds without changing the original entry", () => {
    const original = auditEntry({
      operation: "VALIDATE",
      workflowCorrelationId: "correlation-duplicate",
      status: "FAILED",
      startedAt: "2026-08-03T00:00:00.000Z",
      completedAt: "2026-08-03T00:00:01.000Z",
      durationMs: 1,
      failureCategory: "REPOSITORY_MISMATCH",
    });
    const duplicate = auditEntry({
      operation: "VALIDATE",
      workflowCorrelationId: "correlation-duplicate",
      status: "SUCCEEDED",
      startedAt: "2026-08-03T00:10:00.000Z",
      completedAt: "2026-08-03T00:10:30.000Z",
      durationMs: 30_000,
    });

    const first = appendCommandAudit(task, original);
    const second = appendCommandAudit(first, duplicate);

    assert.deepEqual(second.commandAudit, [original]);
  });

  it("keeps otherwise identical entries separate when workflowCorrelationIds differ", () => {
    const first = auditEntry({ workflowCorrelationId: "correlation-1" });
    const second = auditEntry({ workflowCorrelationId: "correlation-2" });
    const current = appendCommandAudit(appendCommandAudit(task, first), second);

    assert.deepEqual(current.commandAudit, [first, second]);
  });

  it("treats duplicate workflowCorrelationIds as task-local", () => {
    const entry = auditEntry({ workflowCorrelationId: "shared-correlation" });
    const otherTask = { ...task, id: "task_000002" };

    const first = appendCommandAudit(task, entry);
    const second = appendCommandAudit(otherTask, entry);

    assert.deepEqual(first.commandAudit, [entry]);
    assert.deepEqual(second.commandAudit, [entry]);
  });

  it("does not evict legitimate history for a duplicate at capacity", () => {
    let current = task;

    for (let index = 0; index < MAX_TASK_COMMAND_AUDIT_ENTRIES; index += 1) {
      current = appendCommandAudit(current, auditEntry({
        workflowCorrelationId: `correlation-${index}`,
        startedAt: `2026-08-03T00:00:${String(index).padStart(2, "0")}.000Z`,
        completedAt: `2026-08-03T00:01:${String(index).padStart(2, "0")}.000Z`,
        durationMs: index,
      }));
    }

    const duplicate = auditEntry({
      workflowCorrelationId: "correlation-0",
      status: "FAILED",
      failureCategory: "UNKNOWN_FAILURE",
    });

    assert.deepEqual(appendCommandAudit(current, duplicate), current);
  });

  it("preserves existing history and capacity when rejecting an invalid duration", () => {
    let current = task;

    for (let index = 0; index < MAX_TASK_COMMAND_AUDIT_ENTRIES; index += 1) {
      current = appendCommandAudit(current, auditEntry({
        workflowCorrelationId: `correlation-${index}`,
        startedAt: `2026-08-03T00:00:${String(index).padStart(2, "0")}.000Z`,
        completedAt: `2026-08-03T00:01:${String(index).padStart(2, "0")}.000Z`,
        durationMs: index,
      }));
    }

    const before = structuredClone(current.commandAudit);

    assert.throws(
      () =>
        appendCommandAudit(current, auditEntry({
          workflowCorrelationId: "correlation-invalid",
          durationMs: MAX_WORKFLOW_DURATION_MS + 1,
        })),
      CommandAuditDurationError,
    );
    assert.deepEqual(current.commandAudit, before);
    assert.equal(current.commandAudit?.length, MAX_TASK_COMMAND_AUDIT_ENTRIES);
    assert.equal(current.commandAudit?.[0].workflowCorrelationId, "correlation-0");
  });

  it("copies entries and does not mutate the source task history", () => {
    const first = appendCommandAudit(task, auditEntry({
      operation: "VALIDATE",
      workflowCorrelationId: "correlation-1",
      status: "FAILED",
      failureCategory: "REPOSITORY_MISMATCH",
    }));
    const second = appendCommandAudit(first, auditEntry({
      operation: "VALIDATE",
      workflowCorrelationId: "correlation-2",
      startedAt: "2026-08-03T00:00:02.000Z",
      completedAt: "2026-08-03T00:00:03.000Z",
    }));

    assert.equal(task.commandAudit, undefined);
    assert.equal(first.commandAudit?.length, 1);
    assert.equal(second.commandAudit?.length, 2);
    assert.equal(first.commandAudit?.[0].status, "FAILED");
    assert.equal(first.commandAudit?.[0].failureCategory, "REPOSITORY_MISMATCH");
  });
});

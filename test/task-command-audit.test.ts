import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  appendCommandAudit,
  MAX_TASK_COMMAND_AUDIT_ENTRIES,
} from "../src/tasks/task-command-audit.js";
import type { TaskSnapshot } from "../src/tasks/types.js";

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

describe("task command audit history", () => {
  it("retains only the newest bounded entries in chronological order", () => {
    let current = task;

    for (let index = 0; index < MAX_TASK_COMMAND_AUDIT_ENTRIES + 1; index += 1) {
      current = appendCommandAudit(current, {
        operation: "EXECUTE",
        workflowCorrelationId: `correlation-${index}`,
        status: "SUCCEEDED",
        startedAt: `2026-08-03T00:00:${String(index).padStart(2, "0")}.000Z`,
        completedAt: `2026-08-03T00:01:${String(index).padStart(2, "0")}.000Z`,
        durationMs: index,
      });
    }

    assert.equal(current.commandAudit?.length, MAX_TASK_COMMAND_AUDIT_ENTRIES);
    assert.equal(current.commandAudit?.[0].workflowCorrelationId, "correlation-1");
    assert.equal(
      current.commandAudit?.at(-1)?.workflowCorrelationId,
      `correlation-${MAX_TASK_COMMAND_AUDIT_ENTRIES}`,
    );
  });

  it("copies entries and does not mutate the source task history", () => {
    const first = appendCommandAudit(task, {
      operation: "VALIDATE",
      workflowCorrelationId: "correlation-1",
      status: "FAILED",
      startedAt: "2026-08-03T00:00:00.000Z",
      completedAt: "2026-08-03T00:00:01.000Z",
      durationMs: 1,
      failureCategory: "REPOSITORY_MISMATCH",
    });
    const second = appendCommandAudit(first, {
      operation: "VALIDATE",
      workflowCorrelationId: "correlation-2",
      status: "SUCCEEDED",
      startedAt: "2026-08-03T00:00:02.000Z",
      completedAt: "2026-08-03T00:00:03.000Z",
      durationMs: 1,
    });

    assert.equal(task.commandAudit, undefined);
    assert.equal(first.commandAudit?.length, 1);
    assert.equal(second.commandAudit?.length, 2);
    assert.equal(first.commandAudit?.[0].status, "FAILED");
    assert.equal(first.commandAudit?.[0].failureCategory, "REPOSITORY_MISMATCH");
  });
});

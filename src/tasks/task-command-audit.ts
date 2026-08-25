import type { TaskIdempotencyOperation } from "./task-idempotency.js";
import type { RetryFailureCategory, TaskSnapshot } from "./types.js";

export const MAX_TASK_COMMAND_AUDIT_ENTRIES = 50;

export type CommandAuditOperation = TaskIdempotencyOperation;
export type CommandAuditStatus =
  | "SUCCEEDED"
  | "FAILED"
  | "CANCELLED"
  | "TIMED_OUT";

export interface CommandAuditEntry {
  operation: CommandAuditOperation;
  workflowCorrelationId: string;
  status: CommandAuditStatus;
  startedAt: string;
  completedAt: string;
  durationMs: number;
  failureCategory?: RetryFailureCategory;
}

export function appendCommandAudit(
  task: TaskSnapshot,
  entry: CommandAuditEntry,
): TaskSnapshot {
  const existingCommandAudit = task.commandAudit ?? [];

  if (
    existingCommandAudit.some(
      (existingEntry) =>
        existingEntry.workflowCorrelationId === entry.workflowCorrelationId,
    )
  ) {
    return {
      ...task,
      commandAudit: existingCommandAudit.map(copyCommandAuditEntry),
    };
  }

  const commandAudit = [
    ...existingCommandAudit,
    copyCommandAuditEntry(entry),
  ].slice(-MAX_TASK_COMMAND_AUDIT_ENTRIES);

  return {
    ...task,
    commandAudit,
  };
}

export function copyCommandAuditEntry(
  entry: CommandAuditEntry,
): CommandAuditEntry {
  return {
    operation: entry.operation,
    workflowCorrelationId: entry.workflowCorrelationId,
    status: entry.status,
    startedAt: entry.startedAt,
    completedAt: entry.completedAt,
    durationMs: entry.durationMs,
    ...(entry.failureCategory === undefined
      ? {}
      : { failureCategory: entry.failureCategory }),
  };
}

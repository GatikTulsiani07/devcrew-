import { ApplicationError } from "../errors.js";
import type { TaskIdempotencyOperation } from "./task-idempotency.js";
import type { RetryFailureCategory, TaskSnapshot } from "./types.js";
import { MAX_WORKFLOW_DURATION_MS } from "./workflow-duration.js";

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

export class CommandAuditDurationError extends ApplicationError {
  constructor() {
    super(
      "INVALID_COMMAND_AUDIT_DURATION",
      500,
      "Invalid command audit duration",
    );
    this.name = "CommandAuditDurationError";
  }
}

export class CommandAuditTimestampError extends ApplicationError {
  constructor() {
    super(
      "INVALID_COMMAND_AUDIT_TIMESTAMP",
      500,
      "Invalid command audit timestamp.",
    );
    this.name = "CommandAuditTimestampError";
  }
}

export function appendCommandAudit(
  task: TaskSnapshot,
  entry: CommandAuditEntry,
): TaskSnapshot {
  assertValidCommandAuditDuration(entry.durationMs);
  assertValidCommandAuditTimestamp(entry.startedAt);
  assertValidCommandAuditTimestamp(entry.completedAt);

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

function assertValidCommandAuditDuration(durationMs: number): void {
  if (
    !Number.isFinite(durationMs) ||
    !Number.isInteger(durationMs) ||
    durationMs < 0 ||
    durationMs > MAX_WORKFLOW_DURATION_MS
  ) {
    throw new CommandAuditDurationError();
  }
}

function assertValidCommandAuditTimestamp(value: unknown): void {
  if (
    typeof value !== "string" ||
    value.trim().length === 0 ||
    !Number.isFinite(Date.parse(value)) ||
    new Date(Date.parse(value)).toISOString() !== value
  ) {
    throw new CommandAuditTimestampError();
  }
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

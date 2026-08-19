import { randomUUID } from "node:crypto";

export type WorkflowCorrelationId = string;

export interface WorkflowCommandContext {
  workflowCorrelationId: WorkflowCorrelationId;
}

export type WorkflowCorrelationIdFactory = () => WorkflowCorrelationId;

export function createWorkflowCorrelationId(): WorkflowCorrelationId {
  return randomUUID();
}

export function workflowCommandContext(
  workflowCorrelationId: WorkflowCorrelationId,
): WorkflowCommandContext {
  return { workflowCorrelationId };
}

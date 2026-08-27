import type { TaskSnapshot, TaskValidation } from "./types.js";

export interface ValidationEvidencePersistenceInput {
  currentTask: TaskSnapshot;
  validation: TaskValidation;
  updatedAt: string;
  allowSameWorkflowCorrelationReplacement?: boolean;
}

export interface ValidationEvidencePersistenceResult {
  task: TaskSnapshot;
  persisted: boolean;
}

export function prepareValidationEvidencePersistence({
  currentTask,
  validation,
  updatedAt,
  allowSameWorkflowCorrelationReplacement = false,
}: ValidationEvidencePersistenceInput): ValidationEvidencePersistenceResult {
  if (
    !allowSameWorkflowCorrelationReplacement &&
    currentTask.validation?.workflowCorrelationId !== undefined &&
    validation.workflowCorrelationId !== undefined &&
    currentTask.validation.workflowCorrelationId ===
      validation.workflowCorrelationId
  ) {
    return {
      task: structuredClone(currentTask),
      persisted: false,
    };
  }

  return {
    task: {
      ...structuredClone(currentTask),
      status: "VALIDATION_COMPLETED",
      validation: structuredClone(validation),
      workflowFailure: undefined,
      updatedAt,
    },
    persisted: true,
  };
}

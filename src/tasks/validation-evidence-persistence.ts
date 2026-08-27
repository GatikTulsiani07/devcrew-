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
  screenshotEvidenceAttached: boolean;
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
      screenshotEvidenceAttached: false,
    };
  }

  const validationToPersist = prepareScreenshotEvidencePersistence(
    currentTask.validation,
    validation,
  );

  return {
    task: {
      ...structuredClone(currentTask),
      status: "VALIDATION_COMPLETED",
      validation: validationToPersist.validation,
      workflowFailure: undefined,
      updatedAt,
    },
    persisted: true,
    screenshotEvidenceAttached: validationToPersist.screenshotEvidenceAttached,
  };
}

interface ScreenshotEvidencePersistenceResult {
  validation: TaskValidation;
  screenshotEvidenceAttached: boolean;
}

function prepareScreenshotEvidencePersistence(
  currentValidation: TaskSnapshot["validation"],
  validation: TaskValidation,
): ScreenshotEvidencePersistenceResult {
  const browserScreenshot = validation.browserScreenshot;
  const currentScreenshot = currentValidation?.browserScreenshot;

  if (
    currentValidation !== undefined &&
    currentScreenshot !== undefined &&
    browserScreenshot !== undefined &&
    currentScreenshot.id === browserScreenshot.id &&
    sameValidationCommand(currentValidation, validation)
  ) {
    const nextValidation = structuredClone(validation);
    nextValidation.browserScreenshot = structuredClone(currentScreenshot);

    if (
      currentValidation.visualReview?.screenshotId === currentScreenshot.id &&
      validation.visualReview?.screenshotId === browserScreenshot.id
    ) {
      nextValidation.visualReview = structuredClone(currentValidation.visualReview);
    }

    return {
      validation: nextValidation,
      screenshotEvidenceAttached: false,
    };
  }

  return {
    validation: structuredClone(validation),
    screenshotEvidenceAttached: browserScreenshot !== undefined,
  };
}

function sameValidationCommand(
  currentValidation: TaskValidation,
  validation: TaskValidation,
): boolean {
  const currentCommand =
    currentValidation.browserScreenshot?.workflowCorrelationId ??
    currentValidation.workflowCorrelationId;
  const nextCommand =
    validation.browserScreenshot?.workflowCorrelationId ??
    validation.workflowCorrelationId;

  return (
    currentCommand !== undefined &&
    nextCommand !== undefined &&
    currentCommand === nextCommand
  );
}

import type { TaskReview, TaskSnapshot } from "./types.js";

export interface ReviewEvidencePersistenceInput {
  currentTask: TaskSnapshot;
  review: TaskReview;
  updatedAt: string;
}

export interface ReviewEvidencePersistenceResult {
  task: TaskSnapshot;
  persisted: boolean;
}

export function prepareReviewEvidencePersistence({
  currentTask,
  review,
  updatedAt,
}: ReviewEvidencePersistenceInput): ReviewEvidencePersistenceResult {
  if (
    currentTask.review?.workflowCorrelationId !== undefined &&
    review.workflowCorrelationId !== undefined &&
    currentTask.review.workflowCorrelationId === review.workflowCorrelationId
  ) {
    return {
      task: structuredClone(currentTask),
      persisted: false,
    };
  }

  return {
    task: {
      ...structuredClone(currentTask),
      status: "REVIEW_COMPLETED",
      review: structuredClone(review),
      workflowFailure: undefined,
      updatedAt,
    },
    persisted: true,
  };
}

import type { TaskSnapshot } from "./types.js";

export type WorkflowResumeStage =
  | "PLAN"
  | "DEVELOPER"
  | "VALIDATION"
  | "VISUAL_REPAIR"
  | "CHECKPOINT"
  | "PUSH"
  | "REVIEWER"
  | "PULL_REQUEST"
  | "COMPLETED";

export type WorkflowResumeReason =
  | "PLAN_APPROVED"
  | "DEVELOPER_COMPLETED"
  | "VALIDATION_COMPLETED"
  | "CHECKPOINT_PENDING"
  | "PUSH_PENDING"
  | "REVIEWER_APPROVED"
  | "ALREADY_COMPLETED"
  | "CANCELLED"
  | "RETRY_EXHAUSTED"
  | "UNRESOLVED_FAILURE"
  | "MISSING_EVIDENCE"
  | "INCONSISTENT_EVIDENCE"
  | "VISUAL_REPAIR_REQUIRED"
  | "VISUAL_REPAIR_EXHAUSTED"
  | "REPOSITORY_STATE_MISMATCH";

export interface WorkflowResumeMetadata {
  resumable: boolean;
  lastCompletedStage: WorkflowResumeStage | null;
  nextStage: WorkflowResumeStage | null;
  reason: WorkflowResumeReason;
}

export interface WorkflowResumeInput {
  task: TaskSnapshot;
  publisherAvailable: boolean;
}

export function deriveWorkflowResumeMetadata({
  task,
  publisherAvailable,
}: WorkflowResumeInput): WorkflowResumeMetadata {
  if (task.cancellation?.status === "REQUESTED" || task.cancellation?.status === "CANCELLED") {
    return blocked(lastCompletedStage(task), "CANCELLED");
  }

  if (task.retryRecovery?.exhausted === true) {
    return blocked(lastCompletedStage(task), "RETRY_EXHAUSTED");
  }

  if (task.retryRecovery?.failedStage !== undefined || task.workflowFailure !== undefined) {
    return blocked(lastCompletedStage(task), "UNRESOLVED_FAILURE");
  }

  if (task.pullRequest !== undefined) {
    return blocked("COMPLETED", "ALREADY_COMPLETED");
  }

  if (task.status === "WAITING_FOR_APPROVAL" || task.status === "PLAN_REJECTED") {
    return blocked(lastCompletedStage(task), "MISSING_EVIDENCE");
  }

  if (task.status === "PLAN_APPROVED") {
    if (task.planDecision?.decision !== "APPROVE" || task.execution !== undefined) {
      return blocked(lastCompletedStage(task), "INCONSISTENT_EVIDENCE");
    }

    return resumable("PLAN", "DEVELOPER", "PLAN_APPROVED");
  }

  if (task.status === "IMPLEMENTATION_COMPLETED") {
    if (!hasCompletedDeveloperEvidence(task)) {
      return blocked(lastCompletedStage(task), "MISSING_EVIDENCE");
    }

    if (task.validation !== undefined || task.review !== undefined) {
      return blocked(lastCompletedStage(task), "INCONSISTENT_EVIDENCE");
    }

    return resumable("DEVELOPER", "VALIDATION", "DEVELOPER_COMPLETED");
  }

  if (task.status === "VALIDATION_COMPLETED") {
    if (!hasCompletedDeveloperEvidence(task) || !hasCompletedValidationEvidence(task)) {
      return blocked(lastCompletedStage(task), "MISSING_EVIDENCE");
    }

    if (task.review !== undefined) {
      return blocked(lastCompletedStage(task), "INCONSISTENT_EVIDENCE");
    }

    const visualBlock = visualRepairBlock(task);
    if (visualBlock !== undefined) {
      return visualBlock;
    }

    const publication = publicationState(task);
    if (publication === "INCONSISTENT") {
      return blocked("VALIDATION", "INCONSISTENT_EVIDENCE");
    }

    if (publisherAvailable && publication === "MISSING_CHECKPOINT") {
      return resumable("VALIDATION", "CHECKPOINT", "CHECKPOINT_PENDING");
    }

    if (publisherAvailable && publication === "MISSING_REMOTE") {
      return resumable("CHECKPOINT", "PUSH", "PUSH_PENDING");
    }

    return resumable("VALIDATION", "REVIEWER", "VALIDATION_COMPLETED");
  }

  if (task.status === "REVIEW_COMPLETED") {
    if (
      !hasCompletedDeveloperEvidence(task) ||
      !hasCompletedValidationEvidence(task) ||
      !hasCompletedReviewEvidence(task)
    ) {
      return blocked(lastCompletedStage(task), "MISSING_EVIDENCE");
    }

    const visualBlock = visualRepairBlock(task);
    if (visualBlock !== undefined) {
      return visualBlock;
    }

    if (publicationState(task) === "INCONSISTENT") {
      return blocked("REVIEWER", "INCONSISTENT_EVIDENCE");
    }

    return resumable("REVIEWER", "PULL_REQUEST", "REVIEWER_APPROVED");
  }

  return blocked(lastCompletedStage(task), "INCONSISTENT_EVIDENCE");
}

function hasCompletedDeveloperEvidence(task: TaskSnapshot): boolean {
  return (
    task.execution?.status === "COMPLETED" &&
    task.execution.role === "FULL_STACK_DEVELOPER" &&
    task.execution.result.repositoryChanges !== undefined
  );
}

function hasCompletedValidationEvidence(task: TaskSnapshot): boolean {
  return task.validation?.status === "PASSED" && task.validation.role === "DEVOPS_ENGINEER";
}

function hasCompletedReviewEvidence(task: TaskSnapshot): boolean {
  return (
    task.review?.status === "COMPLETED" &&
    task.review.role === "REVIEWER" &&
    task.review.verdict === "APPROVED"
  );
}

function visualRepairBlock(task: TaskSnapshot): WorkflowResumeMetadata | undefined {
  if (task.visualRepair?.outcome === "EXHAUSTED") {
    return blocked("VISUAL_REPAIR", "VISUAL_REPAIR_EXHAUSTED");
  }

  if (task.validation?.visualReview?.status === "FAILED") {
    return blocked("VALIDATION", "VISUAL_REPAIR_REQUIRED");
  }

  return undefined;
}

type PublicationState =
  | "NONE"
  | "MISSING_CHECKPOINT"
  | "MISSING_REMOTE"
  | "PUBLISHED"
  | "INCONSISTENT";

function publicationState(task: TaskSnapshot): PublicationState {
  const checkpoint = task.validation?.checkpoint;
  const remoteBranch = task.validation?.remoteBranch;

  if (checkpoint === undefined && remoteBranch === undefined) {
    return "MISSING_CHECKPOINT";
  }

  if (checkpoint === undefined && remoteBranch !== undefined) {
    return "INCONSISTENT";
  }

  if (checkpoint !== undefined && remoteBranch === undefined) {
    return "MISSING_REMOTE";
  }

  if (checkpoint === undefined || remoteBranch === undefined) {
    return "INCONSISTENT";
  }

  if (
    !isSha(checkpoint.sha) ||
    !isSha(remoteBranch.commitSha) ||
    checkpoint.sha.toLowerCase() !== remoteBranch.commitSha.toLowerCase()
  ) {
    return "INCONSISTENT";
  }

  return "PUBLISHED";
}

function lastCompletedStage(task: TaskSnapshot): WorkflowResumeStage | null {
  if (task.pullRequest !== undefined) return "COMPLETED";
  if (task.review?.status === "COMPLETED") return "REVIEWER";
  if (task.validation?.remoteBranch !== undefined) return "PUSH";
  if (task.validation?.checkpoint !== undefined) return "CHECKPOINT";
  if (task.visualRepair?.outcome === "PASSED" || task.visualRepair?.outcome === "EXHAUSTED") {
    return "VISUAL_REPAIR";
  }
  if (task.validation?.status === "PASSED") return "VALIDATION";
  if (task.execution?.status === "COMPLETED") return "DEVELOPER";
  if (task.planDecision?.decision === "APPROVE") return "PLAN";
  return null;
}

function resumable(
  lastCompletedStage: WorkflowResumeStage,
  nextStage: WorkflowResumeStage,
  reason: WorkflowResumeReason,
): WorkflowResumeMetadata {
  return {
    resumable: true,
    lastCompletedStage,
    nextStage,
    reason,
  };
}

function blocked(
  lastCompletedStage: WorkflowResumeStage | null,
  reason: WorkflowResumeReason,
): WorkflowResumeMetadata {
  return {
    resumable: false,
    lastCompletedStage,
    nextStage: null,
    reason,
  };
}

function isSha(value: string): boolean {
  return /^[0-9a-f]{40}$/i.test(value);
}

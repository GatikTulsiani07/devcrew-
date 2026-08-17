import type {
  TaskOutcome,
  TaskOutcomeStatus,
  TaskPullRequestEvidence,
  TaskSnapshot,
} from "./types.js";

export function deriveTaskOutcome(task: TaskSnapshot): TaskOutcome {
  const implementationCompleted = hasCompletedImplementation(task);
  const validationPassed = hasPassedValidation(task);
  const visualReviewPassed = deriveVisualReviewPassed(task);
  const reviewerPassed = hasApprovedReviewerEvidence(task);
  const pullRequestCreated = hasValidPullRequestEvidence(task.pullRequest);
  const outcome = deriveOutcome(task, {
    implementationCompleted,
    validationPassed,
    visualReviewPassed,
    reviewerPassed,
    pullRequestCreated,
  });

  return {
    outcome,
    implementationCompleted,
    validationPassed,
    visualReviewPassed,
    reviewerPassed,
    pullRequestCreated,
    repairAttempts: task.visualRepair?.attempts.length ?? 0,
    retryAttempts: task.retryRecovery?.attempts.length ?? 0,
    changedFileCount:
      task.execution?.result.repositoryChanges?.totalFilesChanged ?? null,
    completedAt: deriveCompletedAt(task, outcome),
  };
}

function deriveOutcome(
  task: TaskSnapshot,
  evidence: {
    implementationCompleted: boolean;
    validationPassed: boolean;
    visualReviewPassed: boolean | null;
    reviewerPassed: boolean;
    pullRequestCreated: boolean;
  },
): TaskOutcomeStatus {
  if (task.cancellation?.status === "CANCELLED") {
    return "CANCELLED";
  }

  if (task.cancellation?.status === "REQUESTED") {
    return "IN_PROGRESS";
  }

  if (task.retryRecovery?.exhausted === true) {
    return "FAILED";
  }

  if (task.visualRepair?.outcome === "EXHAUSTED") {
    return "FAILED";
  }

  if (task.workflowFailure !== undefined) {
    return task.retryRecovery?.retryAvailable === true
      ? "IN_PROGRESS"
      : "FAILED";
  }

  if (task.review !== undefined && !evidence.reviewerPassed) {
    return "FAILED";
  }

  if (
    task.validation?.validationSelection?.browserVerificationSelected === true &&
    evidence.visualReviewPassed !== true
  ) {
    return "IN_PROGRESS";
  }

  if (
    evidence.implementationCompleted &&
    evidence.validationPassed &&
    evidence.visualReviewPassed !== false &&
    evidence.reviewerPassed &&
    evidence.pullRequestCreated
  ) {
    return "SUCCEEDED";
  }

  return "IN_PROGRESS";
}

function hasCompletedImplementation(task: TaskSnapshot): boolean {
  return (
    task.execution?.role === "FULL_STACK_DEVELOPER" &&
    task.execution.status === "COMPLETED"
  );
}

function hasPassedValidation(task: TaskSnapshot): boolean {
  return (
    task.validation?.role === "DEVOPS_ENGINEER" &&
    task.validation.status === "PASSED" &&
    task.validation.checks.every((check) => check.status === "PASSED")
  );
}

function deriveVisualReviewPassed(task: TaskSnapshot): boolean | null {
  if (task.validation?.visualReview !== undefined) {
    return task.validation.visualReview.status === "PASSED";
  }

  if (
    task.validation?.validationSelection?.browserVerificationSelected === true
  ) {
    return false;
  }

  return null;
}

function hasApprovedReviewerEvidence(task: TaskSnapshot): boolean {
  return (
    task.review?.role === "REVIEWER" &&
    task.review.status === "COMPLETED" &&
    task.review.verdict === "APPROVED"
  );
}

function hasValidPullRequestEvidence(
  pullRequest: TaskPullRequestEvidence | undefined,
): boolean {
  if (pullRequest === undefined) {
    return false;
  }

  return (
    Number.isInteger(pullRequest.number) &&
    pullRequest.number > 0 &&
    isHttpsUrl(pullRequest.url) &&
    pullRequest.headBranch.length > 0 &&
    pullRequest.baseBranch.length > 0 &&
    /^[0-9a-f]{40}$/i.test(pullRequest.commitSha) &&
    pullRequest.createdAt.length > 0
  );
}

function deriveCompletedAt(
  task: TaskSnapshot,
  outcome: TaskOutcomeStatus,
): string | null {
  switch (outcome) {
    case "CANCELLED":
      return task.cancellation?.cancelledAt ?? null;
    case "SUCCEEDED":
      return task.pullRequest?.createdAt ?? null;
    case "FAILED":
      return failedCompletedAt(task);
    case "IN_PROGRESS":
      return null;
  }
}

function failedCompletedAt(task: TaskSnapshot): string | null {
  if (task.workflowFailure !== undefined) {
    return task.workflowFailure.failedAt;
  }

  if (task.visualRepair?.outcome === "EXHAUSTED") {
    return task.visualRepair.attempts.at(-1)?.completedAt ?? null;
  }

  if (task.retryRecovery?.exhausted === true) {
    return task.retryRecovery.attempts.at(-1)?.completedAt ?? null;
  }

  if (task.review !== undefined && !hasApprovedReviewerEvidence(task)) {
    return task.review.completedAt;
  }

  return null;
}

function isHttpsUrl(value: string): boolean {
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}

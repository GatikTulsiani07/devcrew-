export type ViolationCode =
  | "VALIDATION_WITHOUT_EXECUTION"
  | "REVIEW_WITHOUT_VALIDATION"
  | "PULL_REQUEST_WITHOUT_REVIEW"
  | "REMOTE_BRANCH_WITHOUT_CHECKPOINT"
  | "CHECKPOINT_SHA_MISMATCH";

export interface VerificationResult {
  consistent: boolean;
  violations: Array<{ code: ViolationCode; message: string }>;
}

export interface WorkflowEvidence {
  developerExecutionEvidence?: {
    completed: boolean;
  };
  validationEvidence?: {
    exists: boolean;
  };
  reviewEvidence?: {
    approved: boolean;
  };
  pullRequestEvidence?: {
    exists: boolean;
  };
  remoteBranchEvidence?: {
    exists: boolean;
    sha?: string;
  };
  checkpointEvidence?: {
    sha?: string;
  };
}

/**
 * Verifies basic workflow evidence consistency according to minimum relationships:
 * - validation before execution
 * - review after validation
 * - pull request after review
 * - remote branch requires checkpoint
 * - checkpoint and remote branch SHA must match
 *
 * @param evidence WorkflowEvidence object containing the evidence fields
 * @returns VerificationResult with consistent flag and violations
 */
export function verifyWorkflowEvidenceConsistency(
  evidence: WorkflowEvidence
): VerificationResult {
  const violations: VerificationResult['violations'] = [];

  if (
    evidence.validationEvidence?.exists &&
    !evidence.developerExecutionEvidence?.completed
  ) {
    violations.push({
      code: "VALIDATION_WITHOUT_EXECUTION",
      message:
        "Validation evidence exists without completed developer execution evidence.",
    });
  }

  if (
    evidence.reviewEvidence?.approved &&
    !evidence.validationEvidence?.exists
  ) {
    violations.push({
      code: "REVIEW_WITHOUT_VALIDATION",
      message: "Review approval exists without successful validation evidence.",
    });
  }

  if (
    evidence.pullRequestEvidence?.exists &&
    !evidence.reviewEvidence?.approved
  ) {
    violations.push({
      code: "PULL_REQUEST_WITHOUT_REVIEW",
      message: "Pull request evidence exists without approved review evidence.",
    });
  }

  if (
    evidence.remoteBranchEvidence?.exists &&
    !evidence.checkpointEvidence?.sha
  ) {
    violations.push({
      code: "REMOTE_BRANCH_WITHOUT_CHECKPOINT",
      message: "Remote branch evidence exists without checkpoint evidence.",
    });
  }

  if (
    evidence.remoteBranchEvidence?.exists &&
    evidence.checkpointEvidence?.sha &&
    evidence.remoteBranchEvidence.sha !== evidence.checkpointEvidence.sha
  ) {
    violations.push({
      code: "CHECKPOINT_SHA_MISMATCH",
      message:
        "Checkpoint SHA and remote branch SHA do not match when both are present.",
    });
  }

  return {
    consistent: violations.length === 0,
    violations,
  };
}

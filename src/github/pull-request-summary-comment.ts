import type { TaskSnapshot } from "../tasks/types.js";

export const PULL_REQUEST_SUMMARY_COMMENT_MARKER =
  "<!-- devcrew-validation-summary -->";
export const MAX_PULL_REQUEST_SUMMARY_COMMENT_LENGTH = 8 * 1024;

export class PullRequestSummaryCommentError extends Error {
  constructor(readonly reason: string) {
    super(`Pull request summary comment failed: ${reason}`);
    this.name = "PullRequestSummaryCommentError";
  }
}

export function buildPullRequestValidationSummary(task: TaskSnapshot): string {
  const lines = [
    PULL_REQUEST_SUMMARY_COMMENT_MARKER,
    "",
    "### Devcrew validation summary",
    "",
    "- Implementation: completed",
    `- Files changed: ${changedFileCount(task)}`,
    "- Validation: passed",
    ...browserVerificationLines(task),
    ...visualReviewLines(task),
    ...visualRepairLines(task),
    "- Reviewer: approved",
    `- Retry attempts: ${task.retryRecovery?.attempts.length ?? 0}`,
    ...implementationDurationLines(task),
    "",
    "Generated from authoritative Devcrew workflow evidence.",
  ];

  const body = lines.join("\n");

  if (body.length > MAX_PULL_REQUEST_SUMMARY_COMMENT_LENGTH) {
    throw new PullRequestSummaryCommentError("summary comment is too large");
  }

  return body;
}

export function formatSummaryDuration(durationMs: number): string {
  if (!Number.isFinite(durationMs) || durationMs < 0) {
    throw new PullRequestSummaryCommentError("invalid duration");
  }

  const wholeMs = Math.floor(durationMs);

  if (wholeMs < 1_000) {
    return `${wholeMs}ms`;
  }

  const totalSeconds = Math.floor(wholeMs / 1_000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  if (minutes === 0) {
    return `${seconds}s`;
  }

  return seconds === 0 ? `${minutes}m` : `${minutes}m ${seconds}s`;
}

function changedFileCount(task: TaskSnapshot): number {
  const count = task.execution?.result.repositoryChanges?.totalFilesChanged;

  if (typeof count !== "number" || !Number.isInteger(count) || count < 0) {
    throw new PullRequestSummaryCommentError(
      "authoritative repository change evidence is required",
    );
  }

  return count;
}

function browserVerificationLines(task: TaskSnapshot): string[] {
  const evidence = task.validation?.browserVerification;

  if (evidence === undefined) {
    return [];
  }

  return [`- Browser verification: ${statusLabel(evidence.status)}`];
}

function visualReviewLines(task: TaskSnapshot): string[] {
  const evidence = task.validation?.visualReview;

  if (evidence === undefined) {
    return [];
  }

  return [`- Visual Review: ${statusLabel(evidence.status)}`];
}

function visualRepairLines(task: TaskSnapshot): string[] {
  const attempts = task.visualRepair?.attempts.length ?? 0;

  if (task.visualRepair === undefined && attempts === 0) {
    return [];
  }

  return [`- Visual repair attempts: ${attempts}`];
}

function implementationDurationLines(task: TaskSnapshot): string[] {
  const durationMs = task.execution?.durationMs;

  if (durationMs === undefined) {
    return [];
  }

  return [`- Implementation duration: ${formatSummaryDuration(durationMs)}`];
}

function statusLabel(status: string): string {
  return status.toLowerCase();
}

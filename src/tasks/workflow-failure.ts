import type {
  RetryClassification,
} from "../orchestration/retry-orchestrator.js";
import type {
  RetryStage,
  WorkflowFailureEvidence,
  WorkflowFailureStage,
} from "./types.js";

export const MAX_WORKFLOW_FAILURE_SUMMARY_LENGTH = 300;

export function createWorkflowFailureEvidence(
  classification: RetryClassification,
  failedAt: string,
  stageOverride?: WorkflowFailureStage,
): WorkflowFailureEvidence {
  return {
    stage: stageOverride ?? workflowFailureStageForRetryStage(classification.stage),
    category: classification.category,
    summary: safeWorkflowFailureSummary(classification.summary),
    failedAt,
  };
}

export function workflowFailureStageForRetryStage(
  stage: RetryStage,
): WorkflowFailureStage {
  switch (stage) {
    case "DEVELOPER":
      return "DEVELOPER";
    case "DEVOPS":
      return "DEVOPS";
    case "BROWSER":
      return "BROWSER_VERIFICATION";
    case "SCREENSHOT":
      return "SCREENSHOT_CAPTURE";
    case "VISUAL_REVIEW":
      return "VISUAL_REVIEW_PROVIDER";
    case "CHECKPOINT":
      return "GIT_CHECKPOINT";
    case "REMOTE_PUSH":
      return "GIT_PUSH";
    case "REVIEWER":
      return "REVIEWER";
    case "PULL_REQUEST":
      return "GITHUB_PULL_REQUEST";
  }
}

export function safeWorkflowFailureSummary(value: string): string {
  const sanitized = value
    .replace(
      /(?:^|[\s:])(?:\/(?:Users|private\/tmp|tmp|var|etc)\/|[A-Za-z]:\\|\\\\)[^\s]*/g,
      " [redacted path]",
    )
    .replace(
      /(?:OPENAI_API_KEY|DATABASE_URL|DIRECT_URL|GITHUB_TOKEN|sk-[A-Za-z0-9_-]+|ghp_[A-Za-z0-9_]+)/g,
      "[redacted secret]",
    )
    .replace(/(?:Authorization:\s*\S+|Bearer\s+[A-Za-z0-9._~+/=-]+)/gi, "[redacted secret]")
    .replace(/\b(?:stdout|stderr)\b\s*[:=][^\n\r]*/gi, "[redacted output]")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_WORKFLOW_FAILURE_SUMMARY_LENGTH);

  return sanitized === "" ? "Workflow stage failed." : sanitized;
}

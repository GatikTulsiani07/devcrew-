import { RefreshCw } from "lucide-react";
import type { RetryRecoveryEvidence, RetryStage, TaskSnapshot } from "@/lib/api-types";
import {
  EvidencePanel,
  EvidenceSection,
  EvidenceSummary,
  StatusText,
} from "@/components/activity/evidence-panel-primitives";

export function RetryRecoveryEvidencePanel({ task }: { task?: TaskSnapshot }) {
  const retryRecovery = task?.retryRecovery;

  if (!retryRecovery) {
    return null;
  }

  const presentation = retryRecoveryPresentation(retryRecovery);
  const attemptCount = retryRecovery.attempts.length;

  return (
    <EvidencePanel icon={RefreshCw} title="Retry recovery" status={presentation.status}>
      <div className="min-w-0 space-y-4">
        <div className="flex min-w-0 flex-wrap items-start justify-between gap-3">
          <EvidenceSummary>{presentation.summary}</EvidenceSummary>
          <StatusText>{presentation.status}</StatusText>
        </div>

        <div className="flex min-w-0 flex-wrap gap-2 text-[0.8rem] leading-5 text-ink-secondary">
          <span className="break-words rounded-[var(--radius-small)] bg-canvas/45 px-3 py-2">
            {attemptCountLabel(attemptCount)}
          </span>
          {retryRecovery.failedStage && (
            <span className="break-words rounded-[var(--radius-small)] bg-canvas/45 px-3 py-2">
              Failed stage: {retryStageLabel(retryRecovery.failedStage)}
            </span>
          )}
        </div>

        <EvidenceSection title="Retry availability">
          <p className="mt-2 break-words text-[0.8rem] leading-5 text-ink-secondary">
            {retryRecovery.retryAvailable ? "A retry is available from backend recovery evidence." : "No retry is currently available from backend recovery evidence."}
          </p>
        </EvidenceSection>
      </div>
    </EvidencePanel>
  );
}

function retryRecoveryPresentation(retryRecovery: RetryRecoveryEvidence): { status: string; summary: string } {
  if (retryRecovery.exhausted === true) {
    return {
      status: "Retry exhausted",
      summary: "Backend retry evidence shows the retry limit was exhausted.",
    };
  }

  if (retryRecovery.retryAvailable === true) {
    return {
      status: "Retry available",
      summary: "Backend retry evidence shows a retry is available.",
    };
  }

  if (latestAttemptSucceeded(retryRecovery)) {
    return {
      status: "Recovered after retry",
      summary: "Backend retry evidence shows the latest retry succeeded.",
    };
  }

  return {
    status: "Retry evidence recorded",
    summary: "Backend retry evidence is present without an available, exhausted, or recovered retry state.",
  };
}

function latestAttemptSucceeded(retryRecovery: RetryRecoveryEvidence): boolean {
  const latestAttempt = retryRecovery.attempts.at(-1);
  return latestAttempt?.status === "SUCCEEDED";
}

function attemptCountLabel(count: number): string {
  return `${count} ${count === 1 ? "attempt" : "attempts"}`;
}

function retryStageLabel(stage: RetryStage): string {
  const labels: Record<RetryStage, string> = {
    DEVELOPER: "Developer",
    DEVOPS: "DevOps",
    BROWSER: "Browser verification",
    SCREENSHOT: "Screenshot capture",
    VISUAL_REVIEW: "Visual Review",
    REVIEWER: "Reviewer",
    CHECKPOINT: "Checkpoint",
    REMOTE_PUSH: "Remote push",
    PULL_REQUEST: "Pull Request",
  };

  return labels[stage] ?? "Unknown stage";
}

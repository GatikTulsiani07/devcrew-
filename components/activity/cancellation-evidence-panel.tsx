import { Ban } from "lucide-react";
import type { TaskCancellationEvidence, TaskSnapshot } from "@/lib/api-types";
import {
  EvidencePanel,
  EvidenceSummary,
  EvidenceTimestamp,
  StatusText,
} from "@/components/activity/evidence-panel-primitives";

export function CancellationEvidencePanel({ task }: { task?: TaskSnapshot }) {
  const cancellation = task?.cancellation;

  if (!cancellation) {
    return null;
  }

  const presentation = cancellationPresentation(cancellation.status);
  const timestamp = cancellation.cancelledAt ?? cancellation.requestedAt;

  return (
    <EvidencePanel icon={Ban} title="Cancellation" status={presentation.status}>
      <div className="min-w-0 space-y-4">
        <div className="flex min-w-0 flex-wrap items-start justify-between gap-3">
          <EvidenceSummary>{presentation.summary}</EvidenceSummary>
          <StatusText>{presentation.status}</StatusText>
        </div>

        {cancellation.summary && (
          <p className="min-w-0 break-words rounded-[var(--radius-small)] bg-canvas/45 px-3 py-2 text-[0.82rem] leading-5 text-ink-secondary">
            {cancellation.summary}
          </p>
        )}

        <EvidenceTimestamp
          label={cancellation.cancelledAt ? "Cancellation completed" : "Cancellation requested"}
          value={timestamp}
        />
      </div>
    </EvidencePanel>
  );
}

function cancellationPresentation(
  status: TaskCancellationEvidence["status"] | string,
): { status: string; summary: string } {
  if (status === "REQUESTED") {
    return {
      status: "Cancellation requested",
      summary: "Cancellation requested",
    };
  }

  if (status === "CANCELLED") {
    return {
      status: "Task cancelled",
      summary: "Task cancelled",
    };
  }

  if (status === "FAILED") {
    return {
      status: "Cancellation state needs review",
      summary: "Cancellation could not be completed safely.",
    };
  }

  return {
    status: "Cancellation state unavailable",
    summary: "Cancellation state is unavailable.",
  };
}

import { Wrench } from "lucide-react";
import type { VisualRepairAttempt, VisualRepairEvidence, TaskSnapshot } from "@/lib/api-types";
import {
  EvidenceList,
  EvidenceListItem,
  EvidencePanel,
  EvidenceSection,
  EvidenceSummary,
  EvidenceTimestamp,
  StatusText,
} from "@/components/activity/evidence-panel-primitives";

export function VisualRepairEvidencePanel({ task }: { task?: TaskSnapshot }) {
  const visualRepair = task?.visualRepair;

  if (!visualRepair) {
    return null;
  }

  const presentation = visualRepairPresentation(visualRepair);
  const attemptCount = visualRepair.attempts.length;

  return (
    <EvidencePanel icon={Wrench} title="Visual Repair" status={presentation.status}>
      <div className="min-w-0 space-y-4">
        <div className="flex min-w-0 flex-wrap items-start justify-between gap-3">
          <EvidenceSummary>{presentation.summary}</EvidenceSummary>
          <StatusText>{presentation.status}</StatusText>
        </div>

        <div className="flex min-w-0 flex-wrap gap-2 text-[0.8rem] leading-5 text-ink-secondary">
          <span className="break-words rounded-[var(--radius-small)] bg-canvas/45 px-3 py-2">
            {attemptCountLabel(attemptCount)}
          </span>
        </div>

        {visualRepair.attempts.length > 0 && (
          <EvidenceSection title="Attempt history">
            <EvidenceList label="Visual Repair attempts">
              {visualRepair.attempts.map((attempt, index) => (
                <EvidenceListItem key={`${attempt.attempt}-${attempt.startedAt}-${index}`}>
                  <VisualRepairAttemptEvidence attempt={attempt} />
                </EvidenceListItem>
              ))}
            </EvidenceList>
          </EvidenceSection>
        )}
      </div>
    </EvidencePanel>
  );
}

function VisualRepairAttemptEvidence({ attempt }: { attempt: VisualRepairAttempt }) {
  return (
    <div className="min-w-0 space-y-3">
      <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
        <h4 className="break-words text-[0.84rem] font-medium text-ink">Attempt {attempt.attempt}</h4>
        <StatusText>{attemptResultLabel(attempt)}</StatusText>
      </div>

      <div className="grid min-w-0 gap-2 text-[0.78rem] leading-5 text-ink-secondary sm:grid-cols-2">
        <EvidenceValue label="Source screenshot" value={attempt.sourceScreenshotId} />
        {attempt.screenshotId && <EvidenceValue label="Repair screenshot" value={attempt.screenshotId} />}
        <EvidenceValue label="Source Visual Review" value={attempt.sourceVisualReview.status} />
        {attempt.visualReview && <EvidenceValue label="Visual Review" value={attempt.visualReview.status} />}
        {attempt.validation && <EvidenceValue label="Validation" value={attempt.validation.status} />}
      </div>

      <p className="break-words text-[0.8rem] leading-5 text-ink-secondary">
        {attempt.sourceVisualReview.summary}
      </p>

      {attempt.developer?.summary && (
        <p className="break-words rounded-[var(--radius-small)] bg-panel/55 px-3 py-2 text-[0.8rem] leading-5 text-ink-secondary">
          {attempt.developer.summary}
        </p>
      )}

      {attempt.visualReview?.summary && (
        <p className="break-words text-[0.8rem] leading-5 text-ink-secondary">
          {attempt.visualReview.summary}
          <span className="ml-2 font-mono text-[0.66rem] text-ink-muted">
            {findingCountLabel(attempt.visualReview.findingCount)}
          </span>
        </p>
      )}

      <EvidenceTimestamp
        label={attempt.completedAt ? "Attempt completed" : "Attempt started"}
        value={attempt.completedAt ?? attempt.startedAt}
      />
    </div>
  );
}

function EvidenceValue({ label, value }: { label: string; value: string }) {
  return (
    <p className="min-w-0 break-words rounded-[var(--radius-small)] bg-canvas/45 px-3 py-2">
      <span className="block font-mono text-[0.64rem] uppercase tracking-[0.08em] text-ink-muted">{label}</span>
      <span className="mt-1 block break-all font-mono text-[0.76rem] text-ink-secondary">{value}</span>
    </p>
  );
}

function visualRepairPresentation(visualRepair: VisualRepairEvidence): { status: string; summary: string } {
  if (visualRepair.outcome === "PASSED") {
    return {
      status: "Visual repair passed",
      summary: "Backend visual repair evidence shows the repair passed.",
    };
  }

  if (visualRepair.outcome === "EXHAUSTED") {
    return {
      status: "Visual repair exhausted",
      summary: "Backend visual repair evidence shows repair attempts were exhausted.",
    };
  }

  return {
    status: "Visual repair recorded",
    summary: "Backend visual repair evidence is present without a passed or exhausted outcome.",
  };
}

function attemptResultLabel(attempt: VisualRepairAttempt): string {
  if (attempt.visualReview?.status === "PASSED") return "Visual Review PASSED";
  if (attempt.visualReview?.status === "FAILED") return "Visual Review FAILED";
  if (attempt.validation?.status === "PASSED") return "Validation PASSED";
  if (attempt.completedAt) return "Attempt completed";
  return "Attempt recorded";
}

function attemptCountLabel(count: number): string {
  return `${count} ${count === 1 ? "attempt" : "attempts"}`;
}

function findingCountLabel(count: number): string {
  return `${count} ${count === 1 ? "finding" : "findings"}`;
}

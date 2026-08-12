import { CloudCog, Copy } from "lucide-react";
import type { TaskSnapshot } from "@/lib/api-types";
import {
  EmptyEvidenceState,
  EvidenceList,
  EvidenceListItem,
  EvidencePanel,
  EvidenceSection,
  EvidenceSummary,
  EvidenceTimestamp,
  StatusText,
} from "@/components/activity/evidence-panel-primitives";

export function DevopsEvidencePanel({ task }: { task?: TaskSnapshot }) {
  const validation = task?.validation;
  const screenshot = validation?.browserScreenshot;
  const screenshotId = screenshot?.id;

  return (
    <EvidencePanel icon={CloudCog} title="DevOps evidence" status={validation ? `Validation ${validation.status.toLowerCase()}` : "Not run"}>
      {!validation ? (
        <EmptyEvidenceState>Validation has not run yet.</EmptyEvidenceState>
      ) : (
        <>
          <EvidenceSummary>{validation.summary}</EvidenceSummary>

          {validation.checks.length > 0 && (
            <EvidenceSection title="Validation checks">
              <EvidenceList label="Validation checks">
                {validation.checks.map((check) => (
                  <EvidenceListItem key={check.name}>
                    <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
                      <span className="break-words font-medium text-ink">{check.name}</span>
                      <StatusText>{check.status}</StatusText>
                    </div>
                    <p className="mt-1 break-words text-ink-secondary">{check.summary}</p>
                  </EvidenceListItem>
                ))}
              </EvidenceList>
            </EvidenceSection>
          )}

          {screenshot && (
            <EvidenceSection title="Screenshot evidence">
              <div className="mt-2 flex min-w-0 flex-wrap items-center gap-2">
                <p className="min-w-0 break-all font-mono text-[0.8rem] leading-5 text-ink-secondary">{screenshot.id}</p>
                {screenshotId && (
                  <button
                    type="button"
                    aria-label="Copy screenshot ID"
                    onClick={() => void navigator.clipboard.writeText(screenshotId)}
                    className="inline-grid size-7 shrink-0 place-items-center rounded-[var(--radius-small)] bg-panel-strong text-ink-muted outline-none transition-colors hover:bg-surface-hover hover:text-accent focus-visible:ring-2 focus-visible:ring-focus"
                  >
                    <Copy aria-hidden="true" className="size-3.5" />
                  </button>
                )}
              </div>
              <p className="mt-1 break-words text-[0.8rem] leading-5 text-ink-muted">
                {screenshot.viewport.width}x{screenshot.viewport.height}
              </p>
              <EvidenceTimestamp label="Screenshot captured" value={screenshot.capturedAt} />
            </EvidenceSection>
          )}

          <EvidenceTimestamp label="Validation completed" value={validation.completedAt} />
        </>
      )}
    </EvidencePanel>
  );
}

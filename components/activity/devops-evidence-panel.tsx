import { CloudCog } from "lucide-react";
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

          <EvidenceTimestamp label="Validation completed" value={validation.completedAt} />
        </>
      )}
    </EvidencePanel>
  );
}

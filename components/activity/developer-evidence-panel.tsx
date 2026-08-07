import { Code2 } from "lucide-react";
import type { TaskSnapshot } from "@/lib/api-types";
import {
  EmptyEvidenceState,
  EvidenceList,
  EvidenceListItem,
  EvidencePanel,
  EvidenceSection,
  EvidenceSummary,
  EvidenceTimestamp,
} from "@/components/activity/evidence-panel-primitives";

export function DeveloperEvidencePanel({ task }: { task?: TaskSnapshot }) {
  const execution = task?.execution;
  const proposedFiles = execution?.result.changedFiles.filter(isSafeRelativePath) ?? [];

  return (
    <EvidencePanel icon={Code2} title="Developer evidence" status={execution ? "Implementation proposal completed" : "Not run"}>
      {!execution ? (
        <EmptyEvidenceState>Developer has not run yet.</EmptyEvidenceState>
      ) : (
        <>
          <EvidenceSummary>{execution.result.summary}</EvidenceSummary>

          {proposedFiles.length > 0 && (
            <EvidenceSection title="Proposed files">
              <EvidenceList label="Proposed files">
                {proposedFiles.map((file) => (
                  <EvidenceListItem key={file}>
                    <span className="block break-all font-mono text-[0.76rem] text-ink-secondary">{file}</span>
                  </EvidenceListItem>
                ))}
              </EvidenceList>
            </EvidenceSection>
          )}

          {execution.result.verification.length > 0 && (
            <EvidenceSection title="Verification steps">
              <EvidenceList label="Developer verification steps">
                {execution.result.verification.map((step) => (
                  <EvidenceListItem key={step}>
                    <span className="break-words">{step}</span>
                  </EvidenceListItem>
                ))}
              </EvidenceList>
            </EvidenceSection>
          )}

          <EvidenceTimestamp label="Execution completed" value={execution.completedAt} />
        </>
      )}
    </EvidencePanel>
  );
}

function isSafeRelativePath(path: string): boolean {
  return path.trim() !== "" && !path.startsWith("/") && !/^[a-zA-Z]:[\\/]/.test(path);
}

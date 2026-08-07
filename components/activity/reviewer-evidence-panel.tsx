import { SearchCheck } from "lucide-react";
import type { ReviewFinding, TaskSnapshot } from "@/lib/api-types";
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

export function ReviewerEvidencePanel({ task }: { task?: TaskSnapshot }) {
  const review = task?.review;

  return (
    <EvidencePanel icon={SearchCheck} title="Reviewer evidence" status={review ? `Verdict ${review.verdict.toLowerCase()}` : "Not run"}>
      {!review ? (
        <EmptyEvidenceState>Review has not run yet.</EmptyEvidenceState>
      ) : (
        <>
          <EvidenceSummary>{review.summary}</EvidenceSummary>

          {review.findings.length > 0 && (
            <EvidenceSection title="Findings">
              <EvidenceList label="Reviewer findings">
                {review.findings.map((finding, index) => (
                  <EvidenceListItem key={`${finding.title}-${index}`}>
                    <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
                      <span className="break-words font-medium text-ink">{finding.title}</span>
                      <StatusText>{severityLabel(finding)}</StatusText>
                    </div>
                    <p className="mt-1 break-words text-ink-secondary">{finding.description}</p>
                  </EvidenceListItem>
                ))}
              </EvidenceList>
            </EvidenceSection>
          )}

          <EvidenceTimestamp label="Review completed" value={review.completedAt} />
        </>
      )}
    </EvidencePanel>
  );
}

function severityLabel(finding: ReviewFinding): string {
  if (finding.severity === "INFO") return "INFO";
  return "Severity unknown";
}

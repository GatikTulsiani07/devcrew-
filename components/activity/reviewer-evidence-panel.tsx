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
  const groupedFindings = review ? groupReviewFindings(review.findings) : [];

  return (
    <EvidencePanel icon={SearchCheck} title="Reviewer evidence" status={review ? `Verdict ${review.verdict.toLowerCase()}` : "Not run"}>
      {!review ? (
        <EmptyEvidenceState>Review has not run yet.</EmptyEvidenceState>
      ) : (
        <>
          <EvidenceSummary>{review.summary}</EvidenceSummary>

          {groupedFindings.length > 0 && (
            <EvidenceSection title="Findings">
              <div className="mt-2 grid min-w-0 gap-4">
                {groupedFindings.map((group) => (
                  <div key={group.key} className="min-w-0">
                    <h4 className="font-mono text-[0.64rem] uppercase tracking-[0.08em] text-ink-muted">{group.heading}</h4>
                    <EvidenceList label={`Reviewer ${group.heading} findings`}>
                      {group.findings.map(({ finding, index }) => (
                        <EvidenceListItem key={`${finding.title}-${index}`}>
                          <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
                            <span className="break-words font-medium text-ink">{finding.title}</span>
                            <StatusText>{severityLabel(finding)}</StatusText>
                          </div>
                          <p className="mt-1 break-words text-ink-secondary">{finding.description}</p>
                        </EvidenceListItem>
                      ))}
                    </EvidenceList>
                  </div>
                ))}
              </div>
            </EvidenceSection>
          )}

          <EvidenceTimestamp label="Review completed" value={review.completedAt} />
        </>
      )}
    </EvidencePanel>
  );
}

type ReviewSeverityGroupKey = "ERROR" | "WARNING" | "INFO" | "UNKNOWN";

interface GroupedReviewFinding {
  finding: ReviewFinding;
  index: number;
}

interface ReviewFindingGroup {
  key: ReviewSeverityGroupKey;
  heading: string;
  findings: GroupedReviewFinding[];
}

const reviewFindingGroupDefinitions: readonly { key: ReviewSeverityGroupKey; heading: string }[] = [
  { key: "ERROR", heading: "Errors" },
  { key: "WARNING", heading: "Warnings" },
  { key: "INFO", heading: "Info" },
  { key: "UNKNOWN", heading: "Other" },
];

function groupReviewFindings(findings: readonly ReviewFinding[]): ReviewFindingGroup[] {
  const groups = new Map<ReviewSeverityGroupKey, GroupedReviewFinding[]>(
    reviewFindingGroupDefinitions.map(({ key }) => [key, []]),
  );

  findings.forEach((finding, index) => {
    groups.get(severityGroupKey(finding))?.push({ finding, index });
  });

  return reviewFindingGroupDefinitions
    .map(({ key, heading }) => ({ key, heading, findings: groups.get(key) ?? [] }))
    .filter((group) => group.findings.length > 0);
}

function severityGroupKey(finding: ReviewFinding): ReviewSeverityGroupKey {
  const severity = runtimeSeverity(finding);
  if (severity === "ERROR") return "ERROR";
  if (severity === "WARNING") return "WARNING";
  if (severity === "INFO") return "INFO";
  return "UNKNOWN";
}

function severityLabel(finding: ReviewFinding): string {
  const severity = runtimeSeverity(finding);
  if (severity === "ERROR") return "ERROR";
  if (severity === "WARNING") return "WARNING";
  if (severity === "INFO") return "INFO";
  return "Severity unknown";
}

function runtimeSeverity(finding: ReviewFinding): string {
  return (finding as ReviewFinding & { severity: string }).severity;
}

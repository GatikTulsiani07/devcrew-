import { Copy, ExternalLink, GitPullRequest } from "lucide-react";
import type { TaskPullRequestEvidence, TaskSnapshot } from "@/lib/api-types";
import {
  EmptyEvidenceState,
  EvidencePanel,
  EvidenceSection,
  EvidenceTimestamp,
  StatusText,
} from "@/components/activity/evidence-panel-primitives";

export function PullRequestEvidencePanel({ task }: { task?: TaskSnapshot }) {
  const pullRequest = task?.pullRequest;

  return (
    <EvidencePanel icon={GitPullRequest} title="Pull Request" status={pullRequest ? stateLabel(pullRequest.state) : "Not created"}>
      {!pullRequest ? (
        <EmptyEvidenceState>Pull request has not been created yet.</EmptyEvidenceState>
      ) : (
        <PullRequestEvidenceContent pullRequest={pullRequest} />
      )}
    </EvidencePanel>
  );
}

function PullRequestEvidenceContent({ pullRequest }: { pullRequest: TaskPullRequestEvidence }) {
  const title = optionalTitle(pullRequest);
  const safeUrl = safeGitHubUrl(pullRequest.url);

  return (
    <div className="min-w-0 space-y-4">
      <div className="flex min-w-0 flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="break-words font-mono text-[1.2rem] font-semibold leading-tight text-ink">#{pullRequest.number}</p>
          {title && <p className="mt-2 break-words text-[0.88rem] leading-6 text-ink-secondary">{title}</p>}
        </div>
        <StatusText>{stateLabel(pullRequest.state)}</StatusText>
      </div>

      <EvidenceSection title="Branches">
        <p className="mt-2 min-w-0 break-words font-mono text-[0.8rem] leading-5 text-ink-secondary">
          <span className="break-all">{pullRequest.headBranch}</span>
          <span className="px-2 text-ink-muted">-&gt;</span>
          <span className="break-all">{pullRequest.baseBranch}</span>
        </p>
      </EvidenceSection>

      <EvidenceSection title="Commit">
        <div className="mt-2 flex min-w-0 flex-wrap items-center gap-2">
          <p className="min-w-0 break-all font-mono text-[0.8rem] leading-5 text-ink-secondary">{pullRequest.commitSha}</p>
          {pullRequest.commitSha && (
            <button
              type="button"
              aria-label="Copy commit SHA"
              onClick={() => void navigator.clipboard.writeText(pullRequest.commitSha)}
              className="inline-grid size-7 shrink-0 place-items-center rounded-[var(--radius-small)] bg-panel-strong text-ink-muted outline-none transition-colors hover:bg-surface-hover hover:text-accent focus-visible:ring-2 focus-visible:ring-focus"
            >
              <Copy aria-hidden="true" className="size-3.5" />
            </button>
          )}
        </div>
      </EvidenceSection>

      <EvidenceTimestamp label="PR created" value={pullRequest.createdAt} />

      {safeUrl && (
        <a
          href={safeUrl}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`View pull request #${pullRequest.number} on GitHub`}
          className="inline-flex max-w-full items-center gap-2 rounded-[var(--radius-small)] bg-panel-strong px-3 py-2 text-[0.8rem] font-medium text-accent outline-none transition-colors hover:bg-surface-hover focus-visible:ring-2 focus-visible:ring-focus"
        >
          <span className="min-w-0 truncate">View on GitHub</span>
          <ExternalLink aria-hidden="true" className="size-3.5 shrink-0" />
        </a>
      )}
    </div>
  );
}

function optionalTitle(pullRequest: TaskPullRequestEvidence): string | undefined {
  const title = (pullRequest as TaskPullRequestEvidence & { title?: unknown }).title;
  return typeof title === "string" && title.trim() ? title : undefined;
}

function stateLabel(state: TaskPullRequestEvidence["state"] | string): string {
  if (state === "OPEN") return "Open";
  if (state === "CLOSED") return "Closed";
  if (state === "MERGED") return "Merged";
  return "PR state unavailable";
}

function safeGitHubUrl(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;

  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.hostname !== "github.com") return undefined;
    return url.toString();
  } catch {
    return undefined;
  }
}

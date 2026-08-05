"use client";

import { Activity, GitBranch } from "lucide-react";
import { agents, project } from "@/lib/mock-data";
import { AgentAvatar } from "@/components/ui/agent-avatar";
import { useWorkspaceState } from "@/components/shell/workspace-state";

export function WorkshopRail({ compact = false }: { compact?: boolean }) {
  const { crewOnline, selectedAgentId } = useWorkspaceState();
  const selectedAgent = agents.find((agent) => agent.id === selectedAgentId) ?? agents[0];

  if (compact) {
    return (
      <section className="rounded-[var(--radius-standard)] bg-panel/40 px-4 py-4 shadow-[inset_0_1px_0_rgb(255_255_255/0.025)]">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-[0.9rem] font-medium text-ink">Project context</p>
            <p className="mt-1 text-[0.78rem] text-ink-muted">{project.repository}</p>
          </div>
          <span className={`text-[0.8rem] ${crewOnline ? "text-accent" : "text-ink-muted"}`}>{crewOnline ? "Crew online" : "Crew offline"}</span>
        </div>
      </section>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col px-5 py-6">
      <header className="pb-7">
        <p className="text-[0.8rem] text-ink-muted">Context</p>
        <h2 className="mt-2 font-display text-[1.65rem] leading-tight text-ink">Current run</h2>
      </header>

      <div className="scrollbar-subtle min-h-0 flex-1 overflow-y-auto">
        <section aria-labelledby="project-context-heading">
          <h3 id="project-context-heading" className="text-[0.95rem] font-medium text-ink">Project</h3>
          <div className="mt-4 space-y-4 text-[0.82rem] text-ink-muted">
            <p className="leading-6 text-ink-secondary">{project.name} is connected through the backend workflow. No browser action executes shell or Git.</p>
            <div className="flex items-center gap-2 font-mono text-[0.72rem]">
              <GitBranch aria-hidden="true" className="size-3.5" />
              <span className="min-w-0 truncate">{project.branch}</span>
            </div>
          </div>
        </section>

        <section aria-labelledby="selected-agent-heading" className="mt-9 border-t border-border/45 pt-7">
          <h3 id="selected-agent-heading" className="text-[0.95rem] font-medium text-ink">Lead now</h3>
          <div className="mt-4 flex items-center gap-3">
            <AgentAvatar agent={selectedAgent} size="medium" />
            <div className="min-w-0">
              <p className="truncate text-[0.9rem] font-medium text-ink">{selectedAgent.name}</p>
              <p className="mt-1 truncate text-[0.76rem] text-ink-muted">{crewOnline ? selectedAgent.statusLabel : "Offline"}</p>
            </div>
          </div>
        </section>

        <section aria-labelledby="key-activity-heading" className="mt-9 border-t border-border/45 pt-7">
          <h3 id="key-activity-heading" className="text-[0.95rem] font-medium text-ink">Key activity</h3>
          <ul className="mt-3 space-y-3">
            <li className="flex gap-3 py-1">
              <Activity aria-hidden="true" className="mt-1 size-3.5 shrink-0 text-ink-muted" />
              <p className="text-[0.8rem] leading-5 text-ink-muted"><span className="text-ink-secondary">Timeline</span> · Backend events appear in the Activity timeline.</p>
            </li>
            <li className="flex gap-3 py-1">
              <Activity aria-hidden="true" className="mt-1 size-3.5 shrink-0 text-ink-muted" />
              <p className="text-[0.8rem] leading-5 text-ink-muted"><span className="text-ink-secondary">State</span> · Lifecycle actions follow the authoritative task status.</p>
            </li>
          </ul>
        </section>
      </div>

      <footer className="border-t border-border/45 pt-4 text-[0.76rem] text-ink-muted">
        <div className="flex items-center justify-between gap-3">
          <span>Local environment</span>
          <span className={crewOnline ? "text-accent" : "text-ink-muted"}>{crewOnline ? "Online" : "Offline"}</span>
        </div>
      </footer>
    </div>
  );
}

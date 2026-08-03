"use client";

import { Activity, Bot, Boxes, GitBranch } from "lucide-react";
import { agents, project, recentEvents } from "@/lib/mock-data";
import { AgentAvatar } from "@/components/ui/agent-avatar";
import { useWorkspaceState } from "@/components/shell/workspace-state";

function OfficePreview() {
  return (
    <div className="relative h-28 overflow-hidden rounded-[var(--radius-small)] border border-border bg-canvas" aria-label="Abstract Devcrew office preview">
      <div className="absolute inset-3 grid grid-cols-4 grid-rows-3 gap-px border border-border bg-border">
        {Array.from({ length: 12 }, (_, index) => <span key={index} className="bg-panel" />)}
      </div>
      <span className="absolute left-[30%] top-[32%] size-2 rounded-full border border-canvas bg-accent" />
      <span className="absolute left-[53%] top-[46%] size-2 rounded-full border border-canvas bg-success" />
      <span className="absolute left-[67%] top-[28%] size-2 rounded-full border border-canvas bg-warning" />
      <span className="absolute bottom-3 left-3 rounded-[var(--radius-small)] bg-canvas/90 px-1.5 py-1 font-mono text-[0.48rem] uppercase tracking-[0.08em] text-ink-muted">Local floor · fixture</span>
    </div>
  );
}

export function WorkshopRail({ compact = false }: { compact?: boolean }) {
  const { crewOnline, selectedAgentId } = useWorkspaceState();
  const selectedAgent = agents.find((agent) => agent.id === selectedAgentId) ?? agents[0];

  if (compact) {
    return (
      <section className="border-t border-border px-3.5 py-3">
        <div className="flex items-center justify-between">
          <div><p className="text-[0.68rem] font-semibold text-ink">Workshop</p><p className="text-[0.56rem] text-ink-muted">Local team context</p></div>
          <span className={`text-[0.58rem] ${crewOnline ? "text-success" : "text-ink-muted"}`}>{crewOnline ? "Crew online" : "Crew offline"}</span>
        </div>
      </section>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="border-b border-border px-3.5 py-3">
        <p className="font-mono text-[0.51rem] uppercase tracking-[0.14em] text-ink-muted">Workshop</p>
        <h2 className="mt-1 font-display text-[1.18rem] leading-tight text-ink">What the crew is doing</h2>
      </header>

      <div className="scrollbar-subtle min-h-0 flex-1 overflow-y-auto px-2.5 py-3">
        <section aria-labelledby="office-heading">
          <div className="mb-2 flex items-center justify-between px-1">
            <h3 id="office-heading" className="font-mono text-[0.51rem] uppercase tracking-[0.13em] text-ink-muted">Office</h3>
            <span className="font-mono text-[0.49rem] text-ink-muted">4 seats</span>
          </div>
          <div className="rounded-[var(--radius-standard)] border border-border bg-panel/60 p-2">
            <div className="mb-2 flex items-center gap-2"><Boxes aria-hidden="true" className="size-3 text-accent" /><span className="text-[0.65rem] font-medium text-ink">Devcrew floor</span><span className="ml-auto font-mono text-[0.5rem] text-ink-muted">LOCAL</span></div>
            <OfficePreview />
          </div>
        </section>

        <section aria-labelledby="activity-heading" className="mt-4">
          <h3 id="activity-heading" className="mb-2 px-1 font-mono text-[0.51rem] uppercase tracking-[0.13em] text-ink-muted">Activity</h3>
          <div className="space-y-1.5">
            <div className="flex min-h-10 items-center gap-2 rounded-[var(--radius-small)] border border-border bg-panel/60 px-2">
              <span className="grid size-6 place-items-center rounded-[var(--radius-small)] bg-accent-soft text-accent"><Activity aria-hidden="true" className="size-3" /></span>
              <div className="min-w-0 flex-1"><p className="text-[0.63rem] font-medium text-ink">System</p><p className="truncate text-[0.52rem] text-ink-muted">Fixture workspace</p></div>
              <span className={`size-1.5 rounded-full ${crewOnline ? "bg-success" : "bg-ink-muted"}`} aria-label={crewOnline ? "Online" : "Offline"} />
            </div>
            <div className="flex min-h-10 items-center gap-2 rounded-[var(--radius-small)] border border-border bg-panel/60 px-2">
              <AgentAvatar agent={selectedAgent} size="small" />
              <div className="min-w-0 flex-1"><p className="truncate text-[0.63rem] font-medium text-ink">{selectedAgent.name}</p><p className="truncate font-mono text-[0.5rem] text-ink-muted">@{selectedAgent.handle}</p></div>
              <span className="text-[0.52rem] text-ink-muted">{crewOnline ? selectedAgent.statusLabel : "Offline"}</span>
            </div>
          </div>
          <ul className="mt-2 divide-y divide-border border-y border-border">
            {recentEvents.slice(0, 3).map((event) => (
              <li key={event.actor} className="flex gap-2 px-1 py-2">
                <Bot aria-hidden="true" className="mt-0.5 size-2.5 shrink-0 text-ink-muted" />
                <p className="text-[0.56rem] leading-4 text-ink-muted"><span className="text-ink-secondary">{event.actor}</span> · {event.detail}</p>
              </li>
            ))}
          </ul>
        </section>
      </div>

      <footer className="border-t border-border px-3.5 py-2.5">
        <div className="flex items-center gap-2"><GitBranch aria-hidden="true" className="size-3 text-ink-muted" /><span className="min-w-0 flex-1 truncate font-mono text-[0.52rem] text-ink-muted">{project.branch}</span><span className={`size-1.5 rounded-full ${crewOnline ? "bg-success" : "bg-ink-muted"}`} /></div>
      </footer>
    </div>
  );
}

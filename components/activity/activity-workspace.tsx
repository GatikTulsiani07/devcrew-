"use client";

import { useMemo, useState, type FormEvent } from "react";
import { AlertCircle, Check, Clock3, Radio, Send, Sparkles, UserCheck } from "lucide-react";
import { agents, queuedWork, timelineEvents, type Agent, type TimelineEvent } from "@/lib/mock-data";
import { AgentAvatar } from "@/components/ui/agent-avatar";
import { StatusBadge } from "@/components/ui/status-badge";
import { WorkshopRail } from "@/components/shell/workshop-rail";
import { useWorkspaceState } from "@/components/shell/workspace-state";

const eventStyles: Record<TimelineEvent["kind"], { className: string; icon: typeof Check }> = {
  progress: { className: "bg-panel-strong text-accent", icon: Sparkles },
  success: { className: "bg-panel-strong text-success", icon: Check },
  warning: { className: "bg-panel-strong text-warning", icon: AlertCircle },
  error: { className: "bg-panel-strong text-error", icon: AlertCircle },
  queued: { className: "bg-panel-strong text-ink-muted", icon: Clock3 },
};

function visibleStatus(agent: Agent, online: boolean) {
  return online ? { status: agent.status, label: agent.statusLabel } : { status: "idle" as const, label: "Offline" };
}

function AgentSwitcher({ selectedId, onSelect, online }: { selectedId: Agent["id"]; onSelect: (id: Agent["id"]) => void; online: boolean }) {
  return (
    <section aria-labelledby="crew-strip-heading" className="min-w-0">
      <div className="mb-5 flex items-end justify-between gap-4">
        <div>
          <h2 id="crew-strip-heading" className="text-[0.95rem] font-medium text-ink">Crew state</h2>
          <p className="mt-1 text-[0.82rem] text-ink-muted">The active plan stays centered; other roles wait in context.</p>
        </div>
        <span className={`shrink-0 text-[0.78rem] ${online ? "text-accent" : "text-ink-muted"}`}>{online ? "Crew online" : "Crew offline"}</span>
      </div>
      <div className="scrollbar-subtle flex max-w-full gap-3.5 overflow-x-auto pb-1">
        {agents.map((agent) => {
          const selected = agent.id === selectedId;
          const state = visibleStatus(agent, online);
          return (
            <button
              key={agent.id}
              type="button"
              onClick={() => onSelect(agent.id)}
              aria-pressed={selected}
              className={`group flex min-w-[13.5rem] items-center gap-3 rounded-[var(--radius-small)] px-3.5 py-3 text-left transition-colors ${
                selected ? "bg-panel-strong text-ink shadow-[inset_0_1px_0_rgb(255_255_255/0.03)]" : "bg-panel/35 text-ink-secondary hover:bg-panel/65"
              }`}
            >
              <AgentAvatar agent={agent} size="medium" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[0.88rem] font-medium">{agent.name}</span>
                <span className="mt-1 flex items-center gap-2 text-[0.74rem] text-ink-muted">
                  <span aria-hidden="true" className={`size-1.5 rounded-full ${selected && online ? "bg-accent" : online ? agent.status === "active" ? "bg-success" : agent.status === "queued" ? "bg-warning" : agent.status === "stopped" ? "bg-error" : "bg-ink-muted" : "bg-ink-muted"}`} />
                  {state.label}
                </span>
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

function TimelineEntry({ event, last }: { event: TimelineEvent; last: boolean }) {
  const style = eventStyles[event.kind];
  const Icon = style.icon;
  return (
    <li className="grid grid-cols-[2.25rem_minmax(0,1fr)] gap-4 py-6">
      <div className="relative flex justify-center">
        {!last && <span aria-hidden="true" className="absolute bottom-[-1.5rem] top-9 w-px bg-border/45" />}
        <span className={`relative grid size-8 place-items-center rounded-full ${style.className}`}><Icon aria-hidden="true" className="size-4" /></span>
      </div>
      <div className="min-w-0">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <h3 className="text-[0.98rem] font-medium text-ink">{event.title}</h3>
          <time className="font-mono text-[0.68rem] text-ink-muted">{event.time}</time>
        </div>
        <p className="mt-2 max-w-3xl text-[0.88rem] leading-6 text-ink-secondary">{event.detail}</p>
        {event.output && <p className="mt-4 rounded-[var(--radius-small)] bg-canvas/70 px-4 py-3 font-mono text-[0.76rem] leading-5 text-ink-secondary shadow-[inset_0_1px_0_rgb(255_255_255/0.025)]">{event.output}</p>}
      </div>
    </li>
  );
}

function ApprovalGate() {
  return (
    <section aria-labelledby="approval-heading" className="rounded-[var(--radius-standard)] bg-panel-strong/80 p-5 shadow-[inset_0_1px_0_rgb(255_255_255/0.035)] sm:p-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="max-w-2xl">
          <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-canvas/60 px-3 py-1 text-[0.78rem] text-accent">
            <UserCheck aria-hidden="true" className="size-4" />
            Awaiting approval
          </div>
          <h2 id="approval-heading" className="font-display text-[1.55rem] leading-tight text-ink sm:text-[1.9rem]">Manager plan is ready for a human checkpoint.</h2>
          <p className="mt-2 text-[0.92rem] leading-6 text-ink-secondary">Implementation is intentionally paused while a person reviews scope, boundary, and next ownership.</p>
        </div>
        <button type="button" disabled title="Preview only" className="inline-flex min-h-10 shrink-0 cursor-not-allowed items-center justify-center rounded-[var(--radius-small)] bg-accent px-4 text-[0.86rem] font-medium text-[#140d08] opacity-60">
          Approve plan · Preview only
        </button>
      </div>
    </section>
  );
}

function Composer({ disabled }: { disabled: boolean }) {
  const [task, setTask] = useState("");
  const [message, setMessage] = useState("");
  function submit(event: FormEvent) {
    event.preventDefault();
    if (!task.trim()) return setMessage("Describe a task before queueing it.");
    setMessage("Task staged in this fixture preview. No execution started.");
    setTask("");
  }
  return (
    <form onSubmit={submit} className="rounded-[var(--radius-standard)] bg-panel/60 p-3 shadow-[inset_0_1px_0_rgb(255_255_255/0.025)]">
      <label htmlFor="activity-composer" className="sr-only">Queue a message for the selected agent</label>
      <div className="flex items-end gap-3 rounded-[var(--radius-small)] bg-canvas/70 px-4 py-3 focus-within:shadow-[inset_0_0_0_1px_var(--focus-ring)]">
        <textarea
          id="activity-composer"
          rows={2}
          value={task}
          disabled={disabled}
          onChange={(event) => { setTask(event.target.value); setMessage(""); }}
          placeholder={disabled ? "Bring the crew online to queue work" : "Queue a task or message..."}
          className="min-h-12 min-w-0 flex-1 resize-none bg-transparent text-[0.95rem] leading-6 text-ink placeholder:text-ink-muted disabled:cursor-not-allowed"
        />
        <button type="submit" disabled={disabled} className="inline-flex min-h-10 items-center gap-2 rounded-[var(--radius-small)] bg-panel-strong px-4 text-[0.86rem] font-medium text-ink-secondary transition-colors hover:bg-surface-hover hover:text-ink disabled:cursor-not-allowed disabled:opacity-40">Queue <Send aria-hidden="true" className="size-4" /></button>
      </div>
      <p aria-live="polite" className="mt-2 min-h-4 px-1 text-[0.76rem] text-ink-muted">{message || "Fixture only. Messages are not persisted."}</p>
    </form>
  );
}

export function ActivityWorkspace() {
  const { crewOnline, selectedAgentId, setSelectedAgentId } = useWorkspaceState();
  const selectedAgent = agents.find((agent) => agent.id === selectedAgentId) ?? agents[0];
  const events = useMemo(() => timelineEvents.filter((event) => event.agentId === selectedAgentId), [selectedAgentId]);
  const state = visibleStatus(selectedAgent, crewOnline);

  return (
    <div className="mx-auto flex min-h-full w-full max-w-[78rem] flex-col px-5 py-8 sm:px-8 lg:px-10 lg:py-10">
      <header className="mb-9 max-w-4xl">
        <p className="text-[0.82rem] text-ink-muted">Devcrew MVP</p>
        <h1 className="mt-2 font-display text-[3rem] leading-[0.95] text-ink sm:text-[4rem]">Activity</h1>
        <p className="mt-4 max-w-2xl text-[0.98rem] leading-7 text-ink-secondary">A quiet view of the current run: who owns the plan, what changed, and where human approval is required before implementation proceeds.</p>
      </header>

      <div className="space-y-7">
        <AgentSwitcher selectedId={selectedAgentId} onSelect={setSelectedAgentId} online={crewOnline} />

        <section aria-label={`${selectedAgent.name} execution workspace`} className="overflow-hidden rounded-[var(--radius-standard)] bg-panel/75 shadow-[inset_0_1px_0_rgb(255_255_255/0.035),var(--shadow-raised)]">
          <div className="p-6 sm:p-7 lg:p-8">
            <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
              <div className="flex min-w-0 items-start gap-4">
                <AgentAvatar agent={selectedAgent} size="large" />
                <div className="min-w-0">
                  <p className="font-mono text-[0.74rem] text-ink-muted">@{selectedAgent.handle}</p>
                  <h2 className="mt-1 font-display text-[2rem] leading-tight text-ink sm:text-[2.6rem]">{selectedAgent.name}</h2>
                  <p className="mt-2 max-w-2xl text-[0.95rem] leading-6 text-ink-secondary">{selectedAgent.role}. {crewOnline ? selectedAgent.currentFocus : "Crew power is off."}</p>
                </div>
              </div>
              <StatusBadge status={state.status} label={state.label} />
            </div>

            <div className="mt-8 grid gap-5 border-t border-border/40 pt-5 text-[0.82rem] text-ink-muted sm:grid-cols-3">
              <div><span className="font-mono text-[0.7rem] text-ink-muted">MODEL</span><p className="mt-1 text-ink-secondary">{selectedAgent.model}</p></div>
              <div><span className="font-mono text-[0.7rem] text-ink-muted">WORKSPACE</span><p className="mt-1 text-ink-secondary">DEV-MVP fixture</p></div>
              <div><span className="font-mono text-[0.7rem] text-ink-muted">BOUNDARY</span><p className="mt-1 text-ink-secondary">No execution started</p></div>
            </div>
          </div>

          <div className="space-y-6 bg-canvas/28 px-5 pb-5 pt-2 sm:px-7 sm:pb-7 lg:px-8 lg:pb-8">
            <ApprovalGate />

            <section aria-labelledby="timeline-heading" className="rounded-[var(--radius-standard)] bg-canvas/55 px-5 py-5 sm:px-6">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 id="timeline-heading" className="text-[1.08rem] font-medium text-ink">Run timeline</h2>
                  <p className="mt-1 text-[0.82rem] text-ink-muted">Plan, context, and progress are separated from human action.</p>
                </div>
                <span className="flex items-center gap-2 text-[0.78rem] text-ink-muted"><Radio aria-hidden="true" className="size-3.5 text-accent" /> Fixture state</span>
              </div>
              {!crewOnline && <div className="mt-5 rounded-[var(--radius-small)] bg-panel/70 px-4 py-3"><p className="text-[0.9rem] font-medium text-ink">All agents are offline</p><p className="mt-1 text-[0.82rem] leading-5 text-ink-muted">Use the power control beside Settings to restore the fixture crew. Existing history remains visible.</p></div>}
              {events.length > 0 ? <ol className="mt-3">{events.map((event, index) => <TimelineEntry key={event.id} event={event} last={index === events.length - 1} />)}</ol> : <div className="mt-6 rounded-[var(--radius-standard)] bg-panel px-6 py-10 text-center"><p className="font-display text-[1.6rem] text-ink">No recent activity</p><p className="mx-auto mt-2 max-w-sm text-[0.9rem] leading-6 text-ink-muted">This fixture agent has not started work. Select the Manager to inspect the active plan.</p></div>}
            </section>

            <section aria-labelledby="queue-heading" className="rounded-[var(--radius-standard)] bg-canvas/45 px-5 py-5 sm:px-6">
              <div className="mb-3 flex items-center justify-between gap-3">
                <h2 id="queue-heading" className="text-[1rem] font-medium text-ink">After approval</h2>
                <span className="text-[0.8rem] text-ink-muted">{queuedWork.length} queued</span>
              </div>
              <ul className="space-y-2">
                {queuedWork.map((item) => (
                  <li key={item.id} className="grid gap-1 rounded-[var(--radius-small)] px-1 py-2 sm:grid-cols-[5rem_minmax(0,1fr)_9rem] sm:items-center">
                    <span className="font-mono text-[0.76rem] text-accent">{item.id}</span>
                    <span className="text-[0.88rem] text-ink-secondary">{item.title}</span>
                    <span className="text-[0.78rem] text-ink-muted sm:text-right">{item.dependency}</span>
                  </li>
                ))}
              </ul>
            </section>

            <Composer disabled={!crewOnline} />
          </div>
        </section>
      </div>

      <section aria-label="Workshop summary" className="mt-8 xl:hidden"><WorkshopRail compact /></section>
    </div>
  );
}

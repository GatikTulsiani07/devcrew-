"use client";

import { useMemo, useState, type FormEvent } from "react";
import { AlertCircle, Check, Clock3, Radio, Send, Sparkles } from "lucide-react";
import { agents, queuedWork, timelineEvents, type Agent, type TimelineEvent } from "@/lib/mock-data";
import { AgentAvatar } from "@/components/ui/agent-avatar";
import { StatusBadge } from "@/components/ui/status-badge";
import { WorkshopRail } from "@/components/shell/workshop-rail";
import { useWorkspaceState } from "@/components/shell/workspace-state";

const eventStyles: Record<TimelineEvent["kind"], { className: string; icon: typeof Check }> = {
  progress: { className: "border-accent/30 bg-accent-soft text-accent", icon: Sparkles },
  success: { className: "border-success/30 bg-success-soft text-success", icon: Check },
  warning: { className: "border-warning/30 bg-warning-soft text-warning", icon: AlertCircle },
  error: { className: "border-error/30 bg-error-soft text-error", icon: AlertCircle },
  queued: { className: "border-border-strong bg-panel text-ink-muted", icon: Clock3 },
};

function visibleStatus(agent: Agent, online: boolean) {
  return online ? { status: agent.status, label: agent.statusLabel } : { status: "idle" as const, label: "Offline" };
}

function AgentList({ selectedId, onSelect, online }: { selectedId: Agent["id"]; onSelect: (id: Agent["id"]) => void; online: boolean }) {
  return (
    <aside className="min-h-0 min-w-0 max-w-full rounded-[var(--radius-standard)] border border-border bg-panel/60 lg:overflow-hidden">
      <div className="flex min-h-11 items-center justify-between border-b border-border px-3">
        <div><h2 className="font-mono text-[0.53rem] uppercase tracking-[0.13em] text-ink-muted">Agents</h2><p className="mt-0.5 text-[0.54rem] text-ink-muted">Select a teammate</p></div>
        <span className="rounded-full border border-border px-1.5 py-0.5 font-mono text-[0.5rem] text-ink-muted">{online ? "1 active" : "0 online"}</span>
      </div>
      <div className="scrollbar-subtle flex max-w-full gap-1 overflow-x-auto p-1.5 lg:block lg:overflow-y-auto">
        {agents.map((agent) => {
          const selected = agent.id === selectedId;
          const state = visibleStatus(agent, online);
          return (
            <button key={agent.id} type="button" onClick={() => onSelect(agent.id)} aria-pressed={selected} className={`relative flex min-w-[12rem] items-center gap-2.5 rounded-[var(--radius-small)] px-2 py-2 text-left lg:min-w-0 lg:w-full ${selected ? "bg-canvas" : "hover:bg-surface-hover/60"}`}>
              {selected && <span aria-hidden="true" className="absolute inset-y-2 left-0 w-px bg-accent" />}
              <AgentAvatar agent={agent} size="medium" />
              <span className="min-w-0 flex-1"><span className="block truncate text-[0.68rem] font-semibold text-ink">{agent.name}</span><span className="mt-0.5 flex items-center gap-1 text-[0.56rem] text-ink-muted"><span className={`size-1.5 rounded-full ${online ? agent.status === "active" ? "bg-success" : agent.status === "queued" ? "bg-warning" : agent.status === "stopped" ? "bg-error" : "bg-ink-muted" : "bg-ink-muted"}`} />{state.label}</span></span>
            </button>
          );
        })}
      </div>
    </aside>
  );
}

function TimelineEntry({ event, last }: { event: TimelineEvent; last: boolean }) {
  const style = eventStyles[event.kind];
  const Icon = style.icon;
  return (
    <li className="grid grid-cols-[1.75rem_minmax(0,1fr)] gap-2.5 py-3">
      <div className="relative flex justify-center">
        {!last && <span aria-hidden="true" className="absolute bottom-[-0.75rem] top-6 w-px bg-border" />}
        <span className={`relative grid size-5 place-items-center rounded-full border ${style.className}`}><Icon aria-hidden="true" className="size-2.5" /></span>
      </div>
      <div className="min-w-0">
        <div className="flex items-baseline justify-between gap-3"><h3 className="text-[0.68rem] font-semibold text-ink">{event.title}</h3><time className="font-mono text-[0.51rem] text-ink-muted">{event.time}</time></div>
        <p className="mt-1 text-[0.64rem] leading-4.5 text-ink-secondary">{event.detail}</p>
        {event.output && <pre className="mt-2 overflow-x-auto rounded-[var(--radius-small)] border border-border bg-canvas px-3 py-2 font-mono text-[0.56rem] leading-4 text-ink-secondary whitespace-pre-wrap">{event.output}</pre>}
      </div>
    </li>
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
    <form onSubmit={submit} className="border-t border-border bg-panel/40 p-3">
      <label htmlFor="activity-composer" className="sr-only">Queue a message for the selected agent</label>
      <div className="flex items-end gap-2 rounded-[var(--radius-small)] border border-border bg-canvas px-3 py-2 focus-within:border-accent/60">
        <textarea id="activity-composer" rows={1} value={task} disabled={disabled} onChange={(event) => { setTask(event.target.value); setMessage(""); }} placeholder={disabled ? "Bring the crew online to queue work" : "Queue a task or message…"} className="min-h-6 min-w-0 flex-1 resize-none bg-transparent text-[0.67rem] leading-5 text-ink placeholder:text-ink-muted disabled:cursor-not-allowed" />
        <button type="submit" disabled={disabled} className="inline-flex min-h-7 items-center gap-1.5 rounded-[var(--radius-small)] border border-border bg-panel px-2.5 text-[0.61rem] font-medium text-ink-secondary hover:border-border-strong hover:text-ink disabled:cursor-not-allowed disabled:opacity-40">Queue <Send aria-hidden="true" className="size-3" /></button>
      </div>
      <p aria-live="polite" className="mt-1.5 min-h-3 font-mono text-[0.49rem] text-ink-muted">{message || "Fixture only · messages are not persisted"}</p>
    </form>
  );
}

export function ActivityWorkspace() {
  const { crewOnline, selectedAgentId, setSelectedAgentId } = useWorkspaceState();
  const selectedAgent = agents.find((agent) => agent.id === selectedAgentId) ?? agents[0];
  const events = useMemo(() => timelineEvents.filter((event) => event.agentId === selectedAgentId), [selectedAgentId]);
  const state = visibleStatus(selectedAgent, crewOnline);

  return (
    <div className="flex min-h-full min-w-0 w-full max-w-full flex-col px-3 py-3 sm:px-4 sm:py-4">
      <header className="mb-3 shrink-0 border-b border-border pb-3">
        <p className="font-mono text-[0.52rem] uppercase tracking-[0.14em] text-accent">Devcrew MVP · Activity</p>
        <h1 className="mt-1 font-display text-[1.65rem] leading-tight text-ink">Activity</h1>
        <p className="mt-1 text-[0.68rem] text-ink-muted">See what each teammate is doing now, what is queued, and where a person is needed.</p>
      </header>

      <div className="grid min-h-0 min-w-0 max-w-full flex-1 grid-cols-[minmax(0,1fr)] gap-2.5 lg:grid-cols-[13rem_minmax(0,1fr)]">
        <AgentList selectedId={selectedAgentId} onSelect={setSelectedAgentId} online={crewOnline} />

        <section aria-label={`${selectedAgent.name} execution workspace`} className="flex min-h-[36rem] min-w-0 flex-col overflow-hidden rounded-[var(--radius-standard)] border border-border bg-panel/60 lg:min-h-0">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
            <div className="flex min-w-0 items-center gap-3"><AgentAvatar agent={selectedAgent} size="large" /><div className="min-w-0"><h2 className="truncate text-[0.82rem] font-semibold text-ink">{selectedAgent.name}</h2><p className="mt-0.5 truncate text-[0.58rem] text-ink-muted">{selectedAgent.role} · <span className="font-mono">@{selectedAgent.handle}</span></p></div></div>
            <StatusBadge status={state.status} label={state.label} />
          </div>

          <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] border-b border-border bg-panel-strong/35 sm:grid-cols-3">
            {[{ label: "Current focus", value: crewOnline ? selectedAgent.currentFocus : "Crew power is off" }, { label: "Model", value: selectedAgent.model }, { label: "Workspace", value: "DEV-MVP · fixture" }].map((item) => <div key={item.label} className="border-b border-border px-3 py-2.5 last:border-b-0 sm:border-b-0 sm:border-r sm:last:border-r-0"><p className="font-mono text-[0.49rem] uppercase tracking-[0.11em] text-ink-muted">{item.label}</p><p className="mt-1 truncate text-[0.61rem] text-ink-secondary">{item.value}</p></div>)}
          </div>

          <div className="scrollbar-subtle min-h-0 min-w-0 flex-1 overflow-y-auto px-4">
            <div className="flex items-center justify-between border-b border-border py-2.5"><h3 className="font-mono text-[0.53rem] uppercase tracking-[0.13em] text-ink-muted">Live timeline</h3><span className="flex items-center gap-1 text-[0.52rem] text-success"><Radio aria-hidden="true" className="size-2.5" /> Fixture</span></div>
            {!crewOnline && <div className="my-3 rounded-[var(--radius-small)] border border-border bg-canvas px-3 py-2.5"><p className="text-[0.66rem] font-medium text-ink">All agents are offline</p><p className="mt-1 text-[0.59rem] leading-4 text-ink-muted">Use the power control beside Settings to restore the fixture crew. Existing history remains visible.</p></div>}
            {events.length > 0 ? <ol>{events.map((event, index) => <TimelineEntry key={event.id} event={event} last={index === events.length - 1} />)}</ol> : <div className="py-8 text-center"><p className="text-[0.67rem] text-ink-secondary">No recent activity recorded.</p><p className="mt-1 text-[0.57rem] text-ink-muted">This fixture agent has not started work.</p></div>}

            <section className="border-t border-border py-3">
              <div className="mb-2 flex items-center gap-2"><h3 className="font-mono text-[0.53rem] uppercase tracking-[0.13em] text-ink-muted">Up next</h3><span className="rounded-full border border-border px-1.5 py-0.5 font-mono text-[0.49rem] text-ink-muted">{queuedWork.length} queued</span></div>
              <ul className="divide-y divide-border border-y border-border">
                {queuedWork.map((item) => <li key={item.id} className="grid gap-1 py-2.5 sm:grid-cols-[4rem_minmax(0,1fr)_8rem_5rem] sm:items-center"><span className="font-mono text-[0.52rem] text-accent">{item.id}</span><span className="text-[0.63rem] font-medium text-ink-secondary">{item.title}</span><span className="text-[0.54rem] text-ink-muted">{item.owner}</span><span className="text-[0.51rem] text-ink-muted sm:text-right">{item.dependency}</span></li>)}
              </ul>
            </section>
          </div>

          <Composer disabled={!crewOnline} />
        </section>
      </div>

      <section aria-label="Workshop summary" className="mt-3 xl:hidden"><WorkshopRail compact /></section>
    </div>
  );
}

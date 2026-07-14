"use client";

import { useMemo, useState, type FormEvent } from "react";
import Link from "next/link";
import {
  AlertCircle,
  ArrowRight,
  Check,
  CircleDashed,
  Clock3,
  ListTodo,
  Radio,
  Send,
  Sparkles,
} from "lucide-react";
import {
  agents,
  queuedWork,
  timelineEvents,
  type Agent,
  type TimelineEvent,
} from "@/lib/mock-data";
import { WorkshopRail } from "@/components/shell/workshop-rail";
import { AgentAvatar } from "@/components/ui/agent-avatar";
import { PageHeader } from "@/components/ui/page-header";
import { Panel } from "@/components/ui/panel";
import { StatusBadge } from "@/components/ui/status-badge";

const eventStyles: Record<
  TimelineEvent["kind"],
  { dot: string; icon: typeof Check }
> = {
  progress: { dot: "border-accent/30 bg-accent-soft text-accent", icon: Sparkles },
  success: { dot: "border-success/30 bg-success-soft text-success", icon: Check },
  warning: { dot: "border-warning/30 bg-warning-soft text-warning", icon: AlertCircle },
  error: { dot: "border-error/30 bg-error-soft text-error", icon: AlertCircle },
  queued: { dot: "border-border-strong bg-panel-strong text-ink-muted", icon: Clock3 },
};

function AgentList({
  selectedId,
  onSelect,
}: {
  selectedId: Agent["id"];
  onSelect: (id: Agent["id"]) => void;
}) {
  return (
    <Panel title="Team" description="Select an agent to inspect its work." className="min-w-0">
      <div className="p-1.5">
        <div className="scrollbar-subtle flex gap-1 overflow-x-auto lg:block lg:space-y-0.5 lg:overflow-visible">
          {agents.map((agent) => {
            const selected = agent.id === selectedId;
            return (
              <button
                key={agent.id}
                type="button"
                onClick={() => onSelect(agent.id)}
                aria-pressed={selected}
                className={`flex min-w-[11rem] items-center gap-2 rounded-[var(--radius-small)] border px-2 py-1.5 text-left transition-colors duration-[var(--motion-fast)] lg:min-w-0 lg:w-full ${
                  selected
                    ? "border-accent/25 bg-accent-soft"
                    : "border-transparent hover:border-border hover:bg-surface-hover"
                }`}
              >
                <AgentAvatar agent={agent} size="small" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[0.68rem] font-medium text-ink">{agent.name}</span>
                  <span className="flex items-center gap-1 truncate text-[0.57rem] text-ink-muted">
                    <span
                      aria-hidden="true"
                      className={`size-1.5 shrink-0 rounded-full ${
                        agent.status === "active"
                          ? "bg-success"
                          : agent.status === "queued"
                            ? "bg-warning"
                            : agent.status === "stopped"
                              ? "bg-error"
                              : "bg-ink-muted"
                      }`}
                    />
                    {agent.statusLabel}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </Panel>
  );
}

function AgentSummary({ agent }: { agent: Agent }) {
  return (
    <Panel className="min-w-0">
      <div className="p-3.5 sm:p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <AgentAvatar agent={agent} size="large" />
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-ink">{agent.name}</p>
              <p className="mt-0.5 text-[0.66rem] text-ink-muted">{agent.role}</p>
            </div>
          </div>
          <StatusBadge status={agent.status} label={agent.statusLabel} />
        </div>

        <div className="mt-3.5 border-l border-accent/50 pl-3">
          <p className="font-mono text-[0.53rem] uppercase tracking-[0.12em] text-ink-muted">Current focus</p>
          <p className="mt-1 text-xs leading-5 text-ink-secondary">{agent.currentFocus}</p>
        </div>

        <div className="mt-3.5 grid gap-px overflow-hidden rounded-[var(--radius-small)] border border-border bg-border sm:grid-cols-3">
          <div className="bg-panel-strong/75 px-2.5 py-2">
            <p className="font-mono text-[0.51rem] uppercase tracking-[0.11em] text-ink-muted">Model</p>
            <p className="mt-0.5 font-mono text-[0.61rem] text-ink-secondary">{agent.model}</p>
          </div>
          <div className="bg-panel-strong/75 px-2.5 py-2">
            <p className="font-mono text-[0.51rem] uppercase tracking-[0.11em] text-ink-muted">Workspace</p>
            <p className="mt-0.5 font-mono text-[0.61rem] text-ink-secondary">DEV-MVP</p>
          </div>
          <div className="bg-panel-strong/75 px-2.5 py-2">
            <p className="font-mono text-[0.51rem] uppercase tracking-[0.11em] text-ink-muted">Last update</p>
            <p className="mt-0.5 font-mono text-[0.61rem] text-ink-secondary">2 min ago</p>
          </div>
        </div>
      </div>
    </Panel>
  );
}

function Timeline({ events }: { events: TimelineEvent[] }) {
  return (
    <Panel
      title="Live timeline"
      description="A chronological view of the selected agent's work."
      action={
        <span className="flex items-center gap-1 rounded-full border border-success/15 bg-success-soft px-1.5 py-1 text-[0.56rem] font-medium text-success">
          <Radio aria-hidden="true" className="size-2.5" />
          Preview
        </span>
      }
    >
      {events.length === 0 ? (
        <div className="flex min-h-44 flex-col items-center justify-center px-4 py-8 text-center">
          <span className="grid size-8 place-items-center rounded-[var(--radius-small)] border border-border bg-panel-strong text-ink-muted">
            <CircleDashed aria-hidden="true" className="size-4" />
          </span>
          <h3 className="mt-3 text-xs font-semibold text-ink">No activity yet</h3>
          <p className="mt-1.5 max-w-sm text-xs leading-5 text-ink-secondary">
            This agent is ready. Its first attributable event will appear here when work begins.
          </p>
        </div>
      ) : (
        <ol className="divide-y divide-border px-3.5 sm:px-4">
          {events.map((event, index) => {
            const agent = agents.find((item) => item.id === event.agentId)!;
            const style = eventStyles[event.kind];
            const Icon = style.icon;
            return (
              <li key={event.id} className="grid grid-cols-[1.75rem_minmax(0,1fr)] gap-2.5 py-3">
                <div className="relative flex justify-center">
                  {index !== events.length - 1 && (
                    <span aria-hidden="true" className="absolute bottom-[-0.75rem] top-6 w-px bg-border" />
                  )}
                  <span className={`relative grid size-6 place-items-center rounded-full border ${style.dot}`}>
                    <Icon aria-hidden="true" className="size-2.5" strokeWidth={2} />
                  </span>
                </div>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                    <h3 className="text-[0.7rem] font-semibold text-ink">{event.title}</h3>
                    <time className="font-mono text-[0.55rem] text-ink-muted">{event.time}</time>
                  </div>
                  <p className="mt-1 text-[0.68rem] leading-4.5 text-ink-secondary">{event.detail}</p>
                  <p className="mt-1.5 font-mono text-[0.51rem] uppercase tracking-[0.1em] text-ink-muted">
                    {agent.name}
                  </p>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </Panel>
  );
}

function WorkQueue() {
  return (
    <Panel
      title="Queued work"
      description="Planned tasks waiting for their accountable stage."
      action={<span className="font-mono text-[0.55rem] text-ink-muted">3 ITEMS</span>}
    >
      <ul className="divide-y divide-border">
        {queuedWork.map((item) => (
          <li key={item.id} className="flex flex-col gap-2 px-3.5 py-2.5 sm:flex-row sm:items-center sm:px-4">
            <span className="w-16 shrink-0 font-mono text-[0.57rem] text-accent">{item.id}</span>
            <div className="min-w-0 flex-1">
              <p className="text-[0.68rem] font-medium leading-4.5 text-ink">{item.title}</p>
              <p className="text-[0.58rem] text-ink-muted">{item.owner}</p>
            </div>
            <div className="flex items-center gap-3 sm:justify-end">
              <span className="rounded-full border border-border px-1.5 py-0.5 font-mono text-[0.52rem] text-ink-secondary">
                {item.priority}
              </span>
              <span className="text-[0.57rem] text-ink-muted">{item.estimate}</span>
            </div>
          </li>
        ))}
      </ul>
    </Panel>
  );
}

function TaskComposer() {
  const [task, setTask] = useState("");
  const [message, setMessage] = useState("");

  function submitTask(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = task.trim();
    if (!trimmed) {
      setMessage("Describe the engineering task before sending it to the Manager.");
      return;
    }
    setMessage("Task staged in this UI preview. No agent execution was started.");
    setTask("");
  }

  return (
    <Panel title="Give the team a task" description="The Manager will turn your request into an approval-ready plan.">
      <form onSubmit={submitTask} className="p-3.5 sm:p-4">
        <label htmlFor="task-input" className="sr-only">Engineering task</label>
        <textarea
          id="task-input"
          value={task}
          onChange={(event) => {
            setTask(event.target.value);
            if (message) setMessage("");
          }}
          rows={3}
          placeholder="Describe an engineering task, its constraints, and the result you need…"
          className="min-h-20 w-full resize-y rounded-[var(--radius-small)] border border-border bg-panel-strong/75 px-3 py-2.5 text-xs leading-5 text-ink placeholder:text-ink-muted hover:border-border-strong focus:border-accent/60"
        />
        <div className="mt-2.5 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <p className="min-h-4 text-[0.61rem] text-ink-muted" aria-live="polite">{message || "Local preview · input is not persisted"}</p>
          <button
            type="submit"
            className="inline-flex min-h-8 items-center justify-center gap-1.5 rounded-[var(--radius-small)] bg-accent px-3 text-[0.68rem] font-semibold text-[#1c1008] transition-colors hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50"
          >
            Send to Manager
            <Send aria-hidden="true" className="size-3.5" />
          </button>
        </div>
      </form>
    </Panel>
  );
}

export function ActivityWorkspace() {
  const [selectedAgentId, setSelectedAgentId] = useState<Agent["id"]>("manager");
  const selectedAgent = agents.find((agent) => agent.id === selectedAgentId) ?? agents[0];
  const selectedEvents = useMemo(
    () => timelineEvents.filter((event) => event.agentId === selectedAgentId),
    [selectedAgentId],
  );

  return (
    <div className="mx-auto min-h-full w-full max-w-[96rem] px-[var(--space-page)] py-4 sm:py-5">
      <PageHeader
        eyebrow="Devcrew MVP · Activity"
        title="Engineering, in motion."
        description="Follow the team from planning through implementation, validation, and independent review—without losing the project context."
        action={
          <Link
            href="/tickets"
            className="inline-flex min-h-8 w-fit items-center gap-1.5 rounded-[var(--radius-small)] border border-border bg-panel/70 px-3 text-[0.68rem] font-medium text-ink-secondary transition-colors hover:bg-surface-hover hover:text-ink"
          >
            <ListTodo aria-hidden="true" className="size-3" />
            View work queue
            <ArrowRight aria-hidden="true" className="size-3" />
          </Link>
        }
      />

      <div className="mt-4 grid min-w-0 gap-2 lg:grid-cols-[13rem_minmax(0,1fr)]">
        <AgentList selectedId={selectedAgentId} onSelect={setSelectedAgentId} />
        <AgentSummary agent={selectedAgent} />
      </div>

      <div className="mt-2 grid min-w-0 gap-2 lg:grid-cols-[minmax(0,1.35fr)_minmax(17rem,0.65fr)]">
        <Timeline events={selectedEvents} />
        <div className="min-w-0 space-y-2">
          <WorkQueue />
          <TaskComposer />
        </div>
      </div>

      <section aria-label="Workshop summary" className="mt-2 xl:hidden">
        <WorkshopRail compact />
      </section>
    </div>
  );
}

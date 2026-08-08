"use client";

import { Radio, Send, UserCheck } from "lucide-react";
import { useProjectActivity } from "@/hooks/use-project-activity";
import type { TaskSnapshot, TaskStatus } from "@/lib/api-types";
import { agents, type Agent, type AgentStatus } from "@/lib/mock-data";
import { AgentAvatar } from "@/components/ui/agent-avatar";
import { StatusBadge } from "@/components/ui/status-badge";
import { WorkshopRail } from "@/components/shell/workshop-rail";
import { useWorkspaceState } from "@/components/shell/workspace-state";
import { ActivityTimeline } from "@/components/activity/activity-timeline";
import { DeveloperEvidencePanel } from "@/components/activity/developer-evidence-panel";
import { DevopsEvidencePanel } from "@/components/activity/devops-evidence-panel";
import { OrchestrationProgress } from "@/components/activity/orchestration-progress";
import { PullRequestEvidencePanel } from "@/components/activity/pull-request-evidence-panel";
import { ReviewerEvidencePanel } from "@/components/activity/reviewer-evidence-panel";

function visibleStatus(agent: Agent, online: boolean, task?: TaskSnapshot) {
  if (!online) return { status: "idle" as const, label: "Offline" };

  const derived = task ? agentStatusForTask(agent.id, task.status) : undefined;
  return derived ?? { status: agent.status, label: agent.statusLabel };
}

function agentStatusForTask(agentId: Agent["id"], status: TaskStatus): { status: AgentStatus; label: string } {
  if (agentId === "manager") {
    if (status === "WAITING_FOR_APPROVAL") return { status: "active", label: "Plan ready" };
    if (status === "PLAN_REJECTED") return { status: "stopped", label: "Rejected" };
    return { status: "idle", label: "Plan decided" };
  }

  if (agentId === "full-stack") {
    if (status === "PLAN_APPROVED") return { status: "queued", label: "Ready" };
    if (["IMPLEMENTATION_COMPLETED", "VALIDATION_COMPLETED", "REVIEW_COMPLETED"].includes(status)) return { status: "idle", label: "Complete" };
    return { status: "idle", label: "Waiting" };
  }

  if (agentId === "devops") {
    if (status === "IMPLEMENTATION_COMPLETED") return { status: "queued", label: "Ready" };
    if (["VALIDATION_COMPLETED", "REVIEW_COMPLETED"].includes(status)) return { status: "idle", label: "Complete" };
    return { status: "idle", label: "Waiting" };
  }

  if (status === "VALIDATION_COMPLETED") return { status: "queued", label: "Ready" };
  if (status === "REVIEW_COMPLETED") return { status: "idle", label: "Approved" };
  return { status: "idle", label: "Waiting" };
}

function AgentSwitcher({ selectedId, onSelect, online, task }: { selectedId: Agent["id"]; onSelect: (id: Agent["id"]) => void; online: boolean; task?: TaskSnapshot }) {
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
          const state = visibleStatus(agent, online, task);
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

function ApprovalGate({
  task,
  error,
  pendingAction,
  onApprove,
  onReject,
}: {
  task?: TaskSnapshot;
  error?: string;
  pendingAction?: string;
  onApprove: () => Promise<void>;
  onReject: () => Promise<void>;
}) {
  const waiting = task?.status === "WAITING_FOR_APPROVAL";
  return (
    <section aria-labelledby="approval-heading" className="rounded-[var(--radius-standard)] bg-panel-strong/80 p-5 shadow-[inset_0_1px_0_rgb(255_255_255/0.035)] sm:p-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="max-w-2xl">
          <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-canvas/60 px-3 py-1 text-[0.78rem] text-accent">
            <UserCheck aria-hidden="true" className="size-4" />
            {task ? statusLabel(task.status) : "Preparing workflow"}
          </div>
          <h2 id="approval-heading" className="font-display text-[1.55rem] leading-tight text-ink sm:text-[1.9rem]">Manager plan is ready for a human checkpoint.</h2>
          <p className="mt-2 text-[0.92rem] leading-6 text-ink-secondary">{task?.plan.summary ?? "Creating the project and task with the backend."}</p>
          {task && (
            <ol className="mt-4 grid gap-2 text-[0.86rem] leading-5 text-ink-secondary">
              {task.plan.steps.map((step, index) => (
                <li key={step} className="flex gap-2">
                  <span className="font-mono text-[0.72rem] text-accent">{index + 1}</span>
                  <span>{step}</span>
                </li>
              ))}
            </ol>
          )}
          {error && <p role="alert" className="mt-4 rounded-[var(--radius-small)] bg-error/10 px-3 py-2 text-[0.82rem] leading-5 text-error">{error}</p>}
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          <button type="button" disabled={!waiting || pendingAction !== undefined} onClick={() => void onApprove()} className="inline-flex min-h-10 items-center justify-center rounded-[var(--radius-small)] bg-accent px-4 text-[0.86rem] font-medium text-[#140d08] transition-opacity disabled:cursor-not-allowed disabled:opacity-40">
            {pendingAction === "approve" ? "Approving" : "Approve"}
          </button>
          <button type="button" disabled={!waiting || pendingAction !== undefined} onClick={() => void onReject()} className="inline-flex min-h-10 items-center justify-center rounded-[var(--radius-small)] bg-panel px-4 text-[0.86rem] font-medium text-ink-secondary transition-colors hover:bg-surface-hover hover:text-ink disabled:cursor-not-allowed disabled:opacity-40">
            {pendingAction === "reject" ? "Rejecting" : "Reject"}
          </button>
        </div>
      </div>
    </section>
  );
}

function WorkflowActions({
  task,
  pendingAction,
  onExecute,
  onValidate,
  onReview,
}: {
  task?: TaskSnapshot;
  pendingAction?: string;
  onExecute: () => Promise<void>;
  onValidate: () => Promise<void>;
  onReview: () => Promise<void>;
}) {
  const canExecute = task?.status === "PLAN_APPROVED";
  const canValidate = task?.status === "IMPLEMENTATION_COMPLETED";
  const canReview = task?.status === "VALIDATION_COMPLETED";

  return (
    <section aria-labelledby="queue-heading" className="rounded-[var(--radius-standard)] bg-canvas/45 px-5 py-5 sm:px-6">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 id="queue-heading" className="text-[1rem] font-medium text-ink">After approval</h2>
        <span className="text-[0.8rem] text-ink-muted">{task ? statusLabel(task.status) : "Not ready"}</span>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <button type="button" disabled={!canExecute || pendingAction !== undefined} onClick={() => void onExecute()} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-[var(--radius-small)] bg-panel-strong px-4 text-[0.86rem] font-medium text-ink-secondary transition-colors hover:bg-surface-hover hover:text-ink disabled:cursor-not-allowed disabled:opacity-40">
          Execute <Send aria-hidden="true" className="size-4" />
        </button>
        <button type="button" disabled={!canValidate || pendingAction !== undefined} onClick={() => void onValidate()} className="inline-flex min-h-10 items-center justify-center rounded-[var(--radius-small)] bg-panel-strong px-4 text-[0.86rem] font-medium text-ink-secondary transition-colors hover:bg-surface-hover hover:text-ink disabled:cursor-not-allowed disabled:opacity-40">
          Validate
        </button>
        <button type="button" disabled={!canReview || pendingAction !== undefined} onClick={() => void onReview()} className="inline-flex min-h-10 items-center justify-center rounded-[var(--radius-small)] bg-panel-strong px-4 text-[0.86rem] font-medium text-ink-secondary transition-colors hover:bg-surface-hover hover:text-ink disabled:cursor-not-allowed disabled:opacity-40">
          Review
        </button>
      </div>
      {task && <TaskResult task={task} />}
    </section>
  );
}

function TaskResult({ task }: { task: TaskSnapshot }) {
  return (
    <div className="mt-5 space-y-3 text-[0.84rem] leading-5 text-ink-secondary">
      <p><span className="font-mono text-[0.72rem] text-ink-muted">TASK</span> {task.title}</p>
      {task.planDecision && <p><span className="font-mono text-[0.72rem] text-ink-muted">DECISION</span> {task.planDecision.decision}{task.planDecision.reason ? ` · ${task.planDecision.reason}` : ""}</p>}
      {task.execution && <p><span className="font-mono text-[0.72rem] text-ink-muted">IMPLEMENTATION</span> {task.execution.result.summary}</p>}
      {task.validation && <p><span className="font-mono text-[0.72rem] text-ink-muted">VALIDATION</span> {task.validation.summary}</p>}
      {task.review && <p><span className="font-mono text-[0.72rem] text-ink-muted">REVIEW</span> {task.review.verdict} · {task.review.summary}</p>}
    </div>
  );
}

export function ActivityWorkspace() {
  const { crewOnline, selectedAgentId, setSelectedAgentId, workflow } = useWorkspaceState();
  const activity = useProjectActivity(workflow.project?.id);
  const selectedAgent = agents.find((agent) => agent.id === selectedAgentId) ?? agents[0];
  const state = visibleStatus(selectedAgent, crewOnline, workflow.task);

  return (
    <div className="mx-auto flex min-h-full w-full max-w-[78rem] flex-col px-5 py-8 sm:px-8 lg:px-10 lg:py-10">
      <header className="mb-9 max-w-4xl">
        <p className="text-[0.82rem] text-ink-muted">{workflow.project ? workflow.project.name : "Fixture setup fallback"}</p>
        <h1 className="mt-2 font-display text-[3rem] leading-[0.95] text-ink sm:text-[4rem]">Activity</h1>
        <p className="mt-4 max-w-2xl text-[0.98rem] leading-7 text-ink-secondary">A quiet view of the current run: who owns the plan, what changed, and where human approval is required before implementation proceeds.</p>
      </header>

      <OrchestrationProgress task={workflow.task} fixtureFallback={!workflow.project} />

      <div className="space-y-7">
        <AgentSwitcher selectedId={selectedAgentId} onSelect={setSelectedAgentId} online={crewOnline} task={workflow.task} />

        <section aria-label={`${selectedAgent.name} execution workspace`} className="overflow-hidden rounded-[var(--radius-standard)] bg-panel/75 shadow-[inset_0_1px_0_rgb(255_255_255/0.035),var(--shadow-raised)]">
          <div className="p-6 sm:p-7 lg:p-8">
            <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
              <div className="flex min-w-0 items-start gap-4">
                <AgentAvatar agent={selectedAgent} size="large" />
                <div className="min-w-0">
                  <p className="font-mono text-[0.74rem] text-ink-muted">@{selectedAgent.handle}</p>
                  <h2 className="mt-1 font-display text-[2rem] leading-tight text-ink sm:text-[2.6rem]">{selectedAgent.name}</h2>
                  <p className="mt-2 max-w-2xl text-[0.95rem] leading-6 text-ink-secondary">{selectedAgent.role}. {crewOnline ? agentFocus(selectedAgent, workflow.task, workflow.initializing) : "Crew power is off."}</p>
                </div>
              </div>
              <StatusBadge status={state.status} label={state.label} />
            </div>

            <div className="mt-8 grid gap-5 border-t border-border/40 pt-5 text-[0.82rem] text-ink-muted sm:grid-cols-2 lg:grid-cols-4">
              <div><span className="font-mono text-[0.7rem] text-ink-muted">MODEL</span><p className="mt-1 text-ink-secondary">{selectedAgent.model}</p></div>
              <div><span className="font-mono text-[0.7rem] text-ink-muted">WORKSPACE</span><p className="mt-1 break-words text-ink-secondary">{workflow.project?.name ?? "Creating backend project"}</p></div>
              <div><span className="font-mono text-[0.7rem] text-ink-muted">PROJECT ID</span><p className="mt-1 truncate font-mono text-ink-secondary">{workflow.project?.id ?? "Pending"}</p></div>
              <div><span className="font-mono text-[0.7rem] text-ink-muted">BOUNDARY</span><p className="mt-1 text-ink-secondary">Backend authoritative</p></div>
            </div>
          </div>

          <div className="space-y-6 bg-canvas/28 px-5 pb-5 pt-2 sm:px-7 sm:pb-7 lg:px-8 lg:pb-8">
            <ApprovalGate task={workflow.task} error={workflow.error} pendingAction={workflow.pendingAction} onApprove={workflow.approve} onReject={workflow.reject} />

            <section aria-labelledby="evidence-heading" className="min-w-0 rounded-[var(--radius-standard)] bg-canvas/55 px-5 py-5 sm:px-6">
              <div className="min-w-0">
                <h2 id="evidence-heading" className="text-[1.08rem] font-medium text-ink">Structured evidence</h2>
                <p className="mt-1 break-words text-[0.82rem] text-ink-muted">
                  {workflow.project ? "Authoritative stage output from the backend task snapshot." : "Fixture setup fallback: evidence panels are waiting for a backend task snapshot."}
                </p>
              </div>
              <div className="mt-5 grid min-w-0 gap-4 md:grid-cols-2 xl:grid-cols-4">
                <DeveloperEvidencePanel task={workflow.task} />
                <DevopsEvidencePanel task={workflow.task} />
                <ReviewerEvidencePanel task={workflow.task} />
                <PullRequestEvidencePanel task={workflow.task} />
              </div>
            </section>

            <section aria-labelledby="timeline-heading" className="rounded-[var(--radius-standard)] bg-canvas/55 px-5 py-5 sm:px-6">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 id="timeline-heading" className="text-[1.08rem] font-medium text-ink">Run timeline</h2>
                  <p className="mt-1 text-[0.82rem] text-ink-muted">Plan, context, and progress are separated from human action.</p>
                </div>
                <span className="flex items-center gap-2 text-[0.78rem] text-ink-muted"><Radio aria-hidden="true" className="size-3.5 text-accent" /> {activity.connection === "connected" ? "Live backend" : activity.connection}</span>
              </div>
              {!crewOnline && <div className="mt-5 rounded-[var(--radius-small)] bg-panel/70 px-4 py-3"><p className="text-[0.9rem] font-medium text-ink">All agents are offline</p><p className="mt-1 text-[0.82rem] leading-5 text-ink-muted">Use the power control beside Settings to restore the crew. Backend history remains visible.</p></div>}
              {activity.error && <p role="alert" className="mt-5 rounded-[var(--radius-small)] bg-error/10 px-4 py-3 text-[0.82rem] leading-5 text-error">{activity.error}</p>}
              {workflow.project ? <ActivityTimeline events={activity.events} /> : <div className="mt-6 rounded-[var(--radius-standard)] bg-panel px-6 py-10 text-center"><p className="font-display text-[1.6rem] text-ink">Fixture setup fallback</p><p className="mx-auto mt-2 max-w-sm text-[0.9rem] leading-6 text-ink-muted">Backend activity will appear after a real project is created.</p></div>}
            </section>

            <WorkflowActions task={workflow.task} pendingAction={workflow.pendingAction} onExecute={workflow.execute} onValidate={workflow.validate} onReview={workflow.review} />
          </div>
        </section>
      </div>

      <section aria-label="Workshop summary" className="mt-8 xl:hidden"><WorkshopRail compact /></section>
    </div>
  );
}

function statusLabel(status: TaskStatus): string {
  const labels: Record<TaskStatus, string> = {
    WAITING_FOR_APPROVAL: "Waiting",
    PLAN_APPROVED: "Approved",
    PLAN_REJECTED: "Rejected",
    IMPLEMENTATION_COMPLETED: "Implementation completed",
    VALIDATION_COMPLETED: "Validation completed",
    REVIEW_COMPLETED: "Review completed",
  };

  return labels[status];
}

function agentFocus(agent: Agent, task: TaskSnapshot | undefined, initializing: boolean): string {
  if (initializing) return "Creating the backend workflow.";
  if (!task) return agent.currentFocus;

  if (agent.id === "manager") return task.plan.summary;
  if (agent.id === "full-stack" && task.execution) return task.execution.result.summary;
  if (agent.id === "devops" && task.validation) return task.validation.summary;
  if (agent.id === "reviewer" && task.review) return task.review.summary;

  return agent.currentFocus;
}

"use client";

import { AlertCircle, Check, Circle, Clock3, UserCheck } from "lucide-react";
import type { TaskSnapshot } from "@/lib/api-types";
import {
  getOrchestrationProgress,
  type OrchestrationStage,
  type OrchestrationStageState,
} from "@/components/activity/orchestration-progress-model";

const stateIcons: Readonly<Record<OrchestrationStageState, typeof Check>> = {
  completed: Check,
  current: Clock3,
  upcoming: Circle,
  stopped: AlertCircle,
};

const stateClasses: Readonly<Record<OrchestrationStageState, string>> = {
  completed: "bg-panel-strong text-success",
  current: "bg-panel-strong text-accent",
  upcoming: "bg-panel text-ink-muted",
  stopped: "bg-panel-strong text-error",
};

export function OrchestrationProgress({
  task,
  fixtureFallback = false,
}: {
  task?: TaskSnapshot;
  fixtureFallback?: boolean;
}) {
  const model = getOrchestrationProgress(task);

  if (!model.hasTask) {
    return (
      <section aria-labelledby="orchestration-progress-heading" className="rounded-[var(--radius-standard)] bg-panel/55 px-5 py-4 sm:px-6">
        <div className="flex min-w-0 items-start gap-3">
          <UserCheck aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-ink-muted" />
          <div className="min-w-0">
            <h2 id="orchestration-progress-heading" className="text-[0.95rem] font-medium text-ink">Orchestration progress</h2>
            <p className="mt-1 break-words text-[0.8rem] leading-5 text-ink-muted">
              {fixtureFallback ? "Fixture setup fallback: waiting for an authoritative backend task." : "Waiting for an authoritative backend task."}
            </p>
          </div>
        </div>
      </section>
    );
  }

  if (model.fallback) {
    return (
      <section aria-labelledby="orchestration-progress-heading" className="rounded-[var(--radius-standard)] bg-panel/55 px-5 py-4 sm:px-6">
        <h2 id="orchestration-progress-heading" className="text-[0.95rem] font-medium text-ink">Orchestration progress</h2>
        <p className="mt-1 break-words text-[0.8rem] leading-5 text-ink-muted" role="status">Workflow status unavailable. No stage is marked current.</p>
      </section>
    );
  }

  const currentLabel = model.currentStageId ? model.stages.find((stage) => stage.id === model.currentStageId)?.label : undefined;
  const completed = model.stages.length > 0 && model.stages.every((stage) => stage.state === "completed");
  const headingLabel = model.cancelled ? "Workflow cancelled" : completed ? "Workflow complete" : currentLabel ? `Current stage: ${currentLabel}` : "Workflow stopped at Human Approval";

  return (
    <section aria-labelledby="orchestration-progress-heading" aria-label={`Orchestration progress. ${headingLabel}.`} className="min-w-0 rounded-[var(--radius-standard)] bg-panel/55 px-5 py-4 sm:px-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 id="orchestration-progress-heading" className="text-[0.95rem] font-medium text-ink">Orchestration progress</h2>
          <p className="mt-1 text-[0.8rem] text-ink-muted">{headingLabel}</p>
        </div>
        {model.status && <span className="max-w-full break-words font-mono text-[0.64rem] text-ink-muted">{model.status}</span>}
      </div>

      <ol aria-label="Orchestration stages" className="mt-4 grid min-w-0 gap-3 md:grid-cols-3 xl:grid-cols-6">
        {model.stages.map((stage, index) => (
          <ProgressStage key={stage.id} stage={stage} last={index === model.stages.length - 1} />
        ))}
      </ol>

      {model.rejectionReason && (
        <p className="mt-4 break-words rounded-[var(--radius-small)] bg-error/10 px-3 py-2 text-[0.8rem] leading-5 text-error">
          <span className="font-mono text-[0.64rem] uppercase tracking-[0.08em]">Stopped at Human Approval</span>{" "}
          {model.rejectionReason}
        </p>
      )}
    </section>
  );
}

function ProgressStage({ stage, last }: { stage: OrchestrationStage; last: boolean }) {
  const Icon = stateIcons[stage.state];
  return (
    <li className="flex min-w-0 items-start gap-2" aria-label={stage.accessibleLabel}>
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-center gap-2">
          <span aria-hidden="true" className={`grid size-7 shrink-0 place-items-center rounded-full ${stateClasses[stage.state]}`}>
            <Icon className="size-3.5" />
          </span>
          <span className="min-w-0 break-words text-[0.75rem] font-medium text-ink">{stage.label}</span>
        </div>
        <span className="ml-9 mt-1 block text-[0.66rem] text-ink-muted">{stage.state}</span>
      </div>
      {!last && <span aria-hidden="true" className="mt-3 hidden h-px min-w-2 flex-1 bg-border/50 xl:block" />}
    </li>
  );
}

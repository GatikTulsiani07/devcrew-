"use client";

import type { ActivityEvent } from "@/lib/api-types";
import {
  activityToneIcons,
  formatActivityTimestamp,
  presentActor,
  presentEventType,
} from "@/components/activity/activity-event-presentation";

export function ActivityTimelineItem({ event, last }: { event: ActivityEvent; last: boolean }) {
  const actor = presentActor(event.actor);
  const presentation = presentEventType(event.type);
  const timestamp = formatActivityTimestamp(event.createdAt);
  const Icon = actor.icon;
  const MarkerIcon = activityToneIcons[presentation.tone];

  return (
    <li className="grid min-w-0 grid-cols-[2.25rem_minmax(0,1fr)] gap-3 py-5 sm:gap-4" aria-label={`${actor.label}: ${presentation.title}`}>
      <div className="relative flex justify-center">
        {!last && <span aria-hidden="true" className="absolute bottom-[-1.25rem] top-9 w-px bg-border/45" />}
        <span aria-hidden="true" className="relative grid size-8 shrink-0 place-items-center rounded-full bg-panel-strong text-accent">
          <MarkerIcon className="size-4" />
        </span>
      </div>
      <div className="min-w-0">
        <div className="flex min-w-0 flex-wrap items-start justify-between gap-x-4 gap-y-2">
          <div className="flex min-w-0 items-center gap-2">
            <span aria-hidden="true" className="grid size-6 shrink-0 place-items-center rounded-full bg-panel-strong text-ink-muted">
              <Icon className="size-3.5" />
            </span>
            <p className="min-w-0 break-words text-[0.78rem] font-medium text-ink-secondary">{actor.label}</p>
          </div>
          <time dateTime={timestamp.dateTime} title={event.createdAt} className="shrink-0 font-mono text-[0.68rem] text-ink-muted">
            {timestamp.label}
          </time>
        </div>
        <h3 className="mt-2 break-words text-[0.98rem] font-medium text-ink">{presentation.title}</h3>
        <p className="mt-1 break-words text-[0.88rem] leading-6 text-ink-secondary">{event.summary}</p>
        <p className="mt-3 flex flex-wrap gap-x-3 gap-y-1 font-mono text-[0.66rem] text-ink-muted">
          <span>Sequence {event.sequence}</span>
          {event.taskId && <span className="break-all">Task {event.taskId}</span>}
        </p>
      </div>
    </li>
  );
}

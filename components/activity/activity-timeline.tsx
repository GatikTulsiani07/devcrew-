"use client";

import type { ActivityEvent } from "@/lib/api-types";
import { ActivityTimelineItem } from "@/components/activity/activity-timeline-item";

export function ActivityTimeline({ events }: { events: readonly ActivityEvent[] }) {
  if (events.length === 0) {
    return (
      <div className="mt-6 rounded-[var(--radius-standard)] bg-panel px-6 py-10 text-center">
        <p className="font-display text-[1.6rem] text-ink">No backend activity yet</p>
        <p className="mx-auto mt-2 max-w-sm text-[0.9rem] leading-6 text-ink-muted">Events will appear here when the backend records progress for this workflow.</p>
      </div>
    );
  }

  const orderedEvents = [...events].sort((first, second) => first.sequence - second.sequence);

  return (
    <ol aria-label="Backend activity events" className="mt-3 min-w-0">
      {orderedEvents.map((event, index) => (
        <ActivityTimelineItem key={event.id} event={event} last={index === orderedEvents.length - 1} />
      ))}
    </ol>
  );
}

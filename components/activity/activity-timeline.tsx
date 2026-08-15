"use client";

import { useState } from "react";
import type { ActivityEvent, ActivityEventType } from "@/lib/api-types";
import { ActivityTimelineItem } from "@/components/activity/activity-timeline-item";

type ActivityTimelineFilter = "All" | "Developer" | "DevOps" | "Visual" | "Review" | "System";

const activityTimelineFilters: readonly ActivityTimelineFilter[] = ["All", "Developer", "DevOps", "Visual", "Review", "System"];

const eventFilterCategories: Partial<Record<ActivityEventType, Exclude<ActivityTimelineFilter, "All">>> = {
  PROJECT_CREATED: "System",
  TASK_CREATED: "System",
  PLAN_CREATED: "System",
  PLAN_APPROVED: "System",
  PLAN_REJECTED: "System",
  IMPLEMENTATION_COMPLETED: "Developer",
  VALIDATION_COMPLETED: "DevOps",
  BROWSER_VERIFICATION_COMPLETED: "DevOps",
  SCREENSHOT_CAPTURED: "DevOps",
  VISUAL_REVIEW_COMPLETED: "Visual",
  VISUAL_REPAIR_STARTED: "Visual",
  VISUAL_REPAIR_COMPLETED: "Visual",
  VISUAL_REPAIR_EXHAUSTED: "Visual",
  REVIEW_COMPLETED: "Review",
  PULL_REQUEST_CREATED: "Review",
  RETRY_STARTED: "System",
  RETRY_COMPLETED: "System",
  RETRY_EXHAUSTED: "System",
  TASK_CANCELLED: "System",
};

export function ActivityTimeline({ events }: { events: readonly ActivityEvent[] }) {
  const [selectedFilter, setSelectedFilter] = useState<ActivityTimelineFilter>("All");

  if (events.length === 0) {
    return (
      <div className="mt-6 rounded-[var(--radius-standard)] bg-panel px-6 py-10 text-center">
        <p className="font-display text-[1.6rem] text-ink">No backend activity yet</p>
        <p className="mx-auto mt-2 max-w-sm text-[0.9rem] leading-6 text-ink-muted">Events will appear here when the backend records progress for this workflow.</p>
      </div>
    );
  }

  const visibleEvents = selectedFilter === "All"
    ? events
    : events.filter((event) => eventFilterCategories[event.type] === selectedFilter);

  return (
    <div className="mt-5 min-w-0">
      <div className="flex min-w-0 flex-wrap gap-2" aria-label="Activity timeline filters">
        {activityTimelineFilters.map((filter) => {
          const selected = filter === selectedFilter;
          return (
            <button
              key={filter}
              type="button"
              aria-pressed={selected}
              onClick={() => setSelectedFilter(filter)}
              className={`min-h-9 rounded-[var(--radius-small)] px-3 text-[0.78rem] font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-focus ${
                selected
                  ? "bg-accent text-[#140d08]"
                  : "bg-panel/70 text-ink-secondary hover:bg-surface-hover hover:text-ink"
              }`}
            >
              {filter}
              {selected && <span className="sr-only"> selected</span>}
            </button>
          );
        })}
      </div>

      {visibleEvents.length === 0 ? (
        <p role="status" className="mt-4 break-words rounded-[var(--radius-small)] bg-panel px-4 py-3 text-[0.82rem] leading-5 text-ink-muted">
          No events in this category.
        </p>
      ) : (
        <ol aria-label="Backend activity events" className="mt-3 min-w-0">
          {visibleEvents.map((event, index) => (
            <ActivityTimelineItem key={event.id} event={event} last={index === visibleEvents.length - 1} />
          ))}
        </ol>
      )}
    </div>
  );
}

import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { ActivityTimeline } from "@/components/activity/activity-timeline";
import {
  formatActivityTimestamp,
  presentActor,
  presentEventType,
} from "@/components/activity/activity-event-presentation";
import { mergeActivityEvents } from "@/hooks/use-project-activity";
import type { ActivityEvent, ActivityEventType } from "@/lib/api-types";

let root: Root | undefined;
let container: HTMLDivElement | undefined;

beforeAll(() => {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

afterEach(async () => {
  if (root) await act(async () => root?.unmount());
  container?.remove();
  root = undefined;
  container = undefined;
});

function event(overrides: Partial<ActivityEvent> = {}): ActivityEvent {
  return {
    id: "evt_1",
    sequence: 1,
    projectId: "proj_1",
    type: "PROJECT_CREATED",
    actor: { kind: "SYSTEM" },
    summary: "Project connected to the prepared repository.",
    createdAt: "2026-08-03T12:00:00.000Z",
    ...overrides,
  };
}

describe("activity event presentation", () => {
  it("renders backend events as an ascending semantic timeline", async () => {
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    await act(async () => root?.render(<ActivityTimeline events={[event({ sequence: 2, id: "evt_2" }), event({ sequence: 1 })]} />));

    expect(container.querySelector("ol")?.getAttribute("aria-label")).toBe("Backend activity events");
    expect(container.querySelectorAll("li")).toHaveLength(2);
    expect(container.textContent).toContain("Sequence 1");
    expect(container.textContent).toContain("Sequence 2");
  });

  it("maps every known backend event type", () => {
    const knownTypes: readonly ActivityEventType[] = [
      "PROJECT_CREATED",
      "TASK_CREATED",
      "PLAN_CREATED",
      "PLAN_APPROVED",
      "PLAN_REJECTED",
      "IMPLEMENTATION_COMPLETED",
      "VALIDATION_COMPLETED",
      "REVIEW_COMPLETED",
    ];

    for (const type of knownTypes) {
      const presentation = presentEventType(type);
      expect(presentation.title).not.toBe("");
    }
  });

  it("maps all supported actors and safely falls back for unknown actors", () => {
    expect(presentActor({ kind: "HUMAN" }).label).toBe("Human approval");
    expect(presentActor({ kind: "AGENT", role: "MANAGER" }).label).toBe("Manager");
    expect(presentActor({ kind: "AGENT", role: "FULL_STACK_DEVELOPER" }).label).toBe("Full Stack Developer");
    expect(presentActor({ kind: "AGENT", role: "DEVOPS_ENGINEER" }).label).toBe("DevOps Engineer");
    expect(presentActor({ kind: "AGENT", role: "REVIEWER" }).label).toBe("Reviewer");
    expect(presentActor({ kind: "SYSTEM" }).label).toBe("System");
    expect(presentActor({ kind: "UNKNOWN" } as never).label).toBe("Unknown actor");
  });

  it("uses a neutral readable fallback for unknown event types", () => {
    const presentation = presentEventType("BACKEND_STEP_RECORDED");
    expect(presentation.title).toBe("Event: backend step recorded");
    expect(presentation.tone).toBe("neutral");
  });

  it("handles invalid timestamps without using the browser clock", () => {
    expect(formatActivityTimestamp("not-a-timestamp")).toEqual({ label: "Timestamp unavailable" });
    expect(formatActivityTimestamp("2026-08-03T12:00:00.000Z").dateTime).toBe("2026-08-03T12:00:00.000Z");
  });

  it("deduplicates by event identity and sequence while sorting out-of-order input", () => {
    const result = mergeActivityEvents(
      [event({ id: "evt_2", sequence: 2 })],
      [
        event({ id: "evt_4", sequence: 4 }),
        event({ id: "evt_1", sequence: 1 }),
        event({ id: "evt_2_duplicate", sequence: 2 }),
        event({ id: "evt_4", sequence: 4, summary: "Duplicate delivery" }),
      ],
    );

    expect(result.map((item) => item.sequence)).toEqual([1, 2, 4]);
    expect(result.find((item) => item.sequence === 2)?.id).toBe("evt_2");
    expect(result.find((item) => item.sequence === 4)?.summary).not.toBe("Duplicate delivery");
  });

  it("renders safe summary, technical metadata, and long content without raw JSON", async () => {
    const eventWithLongContent = event({
      actor: { kind: "UNKNOWN" } as never,
      sequence: 18,
      summary: "A very long backend summary with an identifier_that_must_wrap_safely_at_mobile_width.",
      taskId: "task_with_a_long_authoritative_identifier_1234567890",
      createdAt: "not-a-timestamp",
      type: "BACKEND_STEP_RECORDED" as ActivityEventType,
    });
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    await act(async () => root?.render(<ActivityTimeline events={[eventWithLongContent]} />));

    expect(container.textContent).toContain("Unknown actor");
    expect(container.textContent).toContain("Event: backend step recorded");
    expect(container.textContent).toContain(eventWithLongContent.summary);
    expect(container.textContent).toContain("Timestamp unavailable");
    expect(container.textContent).toContain("Sequence 18");
    expect(container.textContent).toContain(eventWithLongContent.taskId!);
    expect(container.querySelector("p")?.className).toMatch(/break-words/);
    expect(container.textContent).not.toContain("{\"id\"");
  });

  it("defines a deliberate empty state for an active workflow with no events", () => {
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    act(() => root?.render(<ActivityTimeline events={[]} />));
    expect(container.textContent).toContain("No backend activity yet");
    expect(container.querySelector("ol")).toBeNull();
  });
});

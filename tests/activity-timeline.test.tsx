import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { ActivityTimeline } from "@/components/activity/activity-timeline";
import {
  formatActivityTimestamp,
  presentActor,
  presentEventEmphasis,
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

async function renderTimeline(events: readonly ActivityEvent[]) {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () => root?.render(<ActivityTimeline events={events} />));
  return container;
}

async function selectFilter(label: string) {
  const button = [...container!.querySelectorAll("button")].find((item) => item.textContent?.includes(label));
  await act(async () => button?.dispatchEvent(new MouseEvent("click", { bubbles: true })));
}

function timelineTitles(view: HTMLDivElement): string[] {
  return [...view.querySelectorAll("li h3")].map((item) => item.textContent ?? "");
}

function eventStateLabels(view: HTMLDivElement): string[] {
  return [...view.querySelectorAll('[aria-label="Workflow event state"]')].map((item) => item.textContent ?? "");
}

function representativeEvents(): ActivityEvent[] {
  return [
    event({ id: "evt_system", sequence: 1, type: "PROJECT_CREATED", actor: { kind: "SYSTEM" }, summary: "Project connected." }),
    event({ id: "evt_developer", sequence: 2, type: "IMPLEMENTATION_COMPLETED", actor: { kind: "AGENT", role: "FULL_STACK_DEVELOPER" }, summary: "Implementation completed." }),
    event({ id: "evt_devops", sequence: 3, type: "VALIDATION_COMPLETED", actor: { kind: "AGENT", role: "DEVOPS_ENGINEER" }, summary: "Validation completed." }),
    event({ id: "evt_visual", sequence: 4, type: "VISUAL_REPAIR_COMPLETED", actor: { kind: "SYSTEM" }, summary: "Visual repair completed." }),
    event({ id: "evt_review", sequence: 5, type: "REVIEW_COMPLETED", actor: { kind: "AGENT", role: "REVIEWER" }, summary: "Review completed." }),
    event({ id: "evt_retry", sequence: 6, type: "RETRY_STARTED", actor: { kind: "SYSTEM" }, summary: "Retry started." }),
  ];
}

describe("activity event presentation", () => {
  it("renders backend events as a semantic timeline in the provided authoritative order", async () => {
    const view = await renderTimeline([event({ sequence: 2, id: "evt_2" }), event({ sequence: 1 })]);

    expect(view.querySelector("ol")?.getAttribute("aria-label")).toBe("Backend activity events");
    expect(view.querySelectorAll("li")).toHaveLength(2);
    expect([...view.querySelectorAll("li")].map((item) => item.textContent)).toEqual([
      expect.stringContaining("Sequence 2"),
      expect.stringContaining("Sequence 1"),
    ]);
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
      "BROWSER_VERIFICATION_COMPLETED",
      "SCREENSHOT_CAPTURED",
      "VISUAL_REVIEW_COMPLETED",
      "VISUAL_REPAIR_STARTED",
      "VISUAL_REPAIR_COMPLETED",
      "VISUAL_REPAIR_EXHAUSTED",
      "RETRY_STARTED",
      "RETRY_COMPLETED",
      "RETRY_EXHAUSTED",
      "TASK_CANCELLED",
      "PULL_REQUEST_CREATED",
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
    expect(presentEventEmphasis("BACKEND_STEP_RECORDED")).toBeUndefined();
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
    const view = await renderTimeline([eventWithLongContent]);

    expect(view.textContent).toContain("Unknown actor");
    expect(view.textContent).toContain("Event: backend step recorded");
    expect(view.textContent).toContain(eventWithLongContent.summary);
    expect(view.textContent).toContain("Timestamp unavailable");
    expect(view.textContent).toContain("Sequence 18");
    expect(view.textContent).toContain(eventWithLongContent.taskId!);
    expect(view.querySelector("p")?.className).toMatch(/break-words/);
    expect(view.textContent).not.toContain("{\"id\"");
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

describe("activity timeline failure event emphasis", () => {
  it("emphasizes RETRY_EXHAUSTED as an exhausted workflow event", async () => {
    const view = await renderTimeline([
      event({ id: "evt_retry_exhausted", sequence: 1, type: "RETRY_EXHAUSTED", summary: "Retry limit reached." }),
    ]);

    expect(presentEventEmphasis("RETRY_EXHAUSTED")).toEqual({ label: "Exhausted" });
    expect(timelineTitles(view)).toEqual(["Retry exhausted"]);
    expect(eventStateLabels(view)).toEqual(["Exhausted"]);
  });

  it("emphasizes VISUAL_REPAIR_EXHAUSTED as an exhausted workflow event", async () => {
    const view = await renderTimeline([
      event({ id: "evt_visual_exhausted", sequence: 1, type: "VISUAL_REPAIR_EXHAUSTED", summary: "Visual repair limit reached." }),
    ]);

    expect(presentEventEmphasis("VISUAL_REPAIR_EXHAUSTED")).toEqual({ label: "Exhausted" });
    expect(timelineTitles(view)).toEqual(["Visual repair exhausted"]);
    expect(eventStateLabels(view)).toEqual(["Exhausted"]);
  });

  it("keeps RETRY_COMPLETED normal", async () => {
    const view = await renderTimeline([
      event({ id: "evt_retry_completed", sequence: 1, type: "RETRY_COMPLETED", summary: "Retry recovered." }),
    ]);

    expect(presentEventEmphasis("RETRY_COMPLETED")).toBeUndefined();
    expect(timelineTitles(view)).toEqual(["Retry completed"]);
    expect(eventStateLabels(view)).toEqual([]);
  });

  it("keeps VISUAL_REPAIR_COMPLETED normal", async () => {
    const view = await renderTimeline([
      event({ id: "evt_visual_completed", sequence: 1, type: "VISUAL_REPAIR_COMPLETED", summary: "Visual repair passed." }),
    ]);

    expect(presentEventEmphasis("VISUAL_REPAIR_COMPLETED")).toBeUndefined();
    expect(timelineTitles(view)).toEqual(["Visual repair completed"]);
    expect(eventStateLabels(view)).toEqual([]);
  });

  it("keeps normal successful event presentation unchanged", async () => {
    const view = await renderTimeline([
      event({
        id: "evt_validation",
        sequence: 7,
        taskId: "task_success",
        type: "VALIDATION_COMPLETED",
        actor: { kind: "AGENT", role: "DEVOPS_ENGINEER" },
        summary: "Validation passed.",
        createdAt: "2026-08-03T12:14:00.000Z",
      }),
    ]);

    expect(view.textContent).toContain("DevOps Engineer");
    expect(view.textContent).toContain("Validation completed");
    expect(view.textContent).toContain("Validation passed.");
    expect(view.textContent).toContain("Aug 3, 2026, 12:14 PM");
    expect(view.textContent).toContain("Sequence 7");
    expect(view.textContent).toContain("Task task_success");
    expect(eventStateLabels(view)).toEqual([]);
  });

  it("keeps unknown runtime events neutral without failure emphasis", async () => {
    const view = await renderTimeline([
      event({
        id: "evt_unknown",
        sequence: 1,
        type: "BACKEND_STEP_RECORDED" as ActivityEventType,
        summary: "Unknown runtime event.",
      }),
    ]);

    expect(timelineTitles(view)).toEqual(["Event: backend step recorded"]);
    expect(eventStateLabels(view)).toEqual([]);
  });

  it("does not infer failure emphasis from summary words", async () => {
    const view = await renderTimeline([
      event({
        id: "evt_summary_words",
        sequence: 1,
        type: "VALIDATION_COMPLETED",
        summary: "The summary mentions failed, error, and exhausted but the event type completed successfully.",
      }),
    ]);

    expect(view.textContent).toContain("failed, error, and exhausted");
    expect(eventStateLabels(view)).toEqual([]);
  });

  it("classifies failure emphasis only from event type", async () => {
    const view = await renderTimeline([
      event({
        id: "evt_retry_exhausted",
        sequence: 1,
        type: "RETRY_EXHAUSTED",
        summary: "Neutral summary without failure keywords.",
      }),
    ]);

    expect(view.textContent).toContain("Neutral summary without failure keywords.");
    expect(eventStateLabels(view)).toEqual(["Exhausted"]);
  });

  it("keeps existing title, summary, timestamp, actor, sequence, and task metadata visible", async () => {
    const view = await renderTimeline([
      event({
        id: "evt_retry_exhausted",
        sequence: 12,
        taskId: "task_retry_12",
        type: "RETRY_EXHAUSTED",
        actor: { kind: "SYSTEM" },
        summary: "Retry attempts were exhausted by backend authority.",
        createdAt: "2026-08-03T12:19:00.000Z",
      }),
    ]);

    expect(view.textContent).toContain("System");
    expect(view.textContent).toContain("Retry exhausted");
    expect(view.textContent).toContain("Retry attempts were exhausted by backend authority.");
    expect(view.textContent).toContain("Aug 3, 2026, 12:19 PM");
    expect(view.textContent).toContain("Sequence 12");
    expect(view.textContent).toContain("Task task_retry_12");
    expect(eventStateLabels(view)).toEqual(["Exhausted"]);
  });

  it("preserves filtering while showing failure emphasis in the active category", async () => {
    const view = await renderTimeline([
      event({ id: "evt_retry_exhausted", sequence: 1, type: "RETRY_EXHAUSTED", summary: "Retry exhausted." }),
      event({ id: "evt_visual_exhausted", sequence: 2, type: "VISUAL_REPAIR_EXHAUSTED", summary: "Visual repair exhausted." }),
      event({ id: "evt_success", sequence: 3, type: "REVIEW_COMPLETED", summary: "Review completed." }),
    ]);

    await selectFilter("System");
    expect(timelineTitles(view)).toEqual(["Retry exhausted"]);
    expect(eventStateLabels(view)).toEqual(["Exhausted"]);

    await selectFilter("Visual");
    expect(timelineTitles(view)).toEqual(["Visual repair exhausted"]);
    expect(eventStateLabels(view)).toEqual(["Exhausted"]);
  });
});

describe("activity timeline filters", () => {
  it("selects All by default and exposes accessible selected state", async () => {
    const view = await renderTimeline(representativeEvents());

    expect(view.querySelector<HTMLButtonElement>('button[aria-pressed="true"]')?.textContent).toContain("All");
    expect(view.querySelector<HTMLButtonElement>('button[aria-pressed="true"]')?.textContent).toContain("selected");
  });

  it("shows every existing event under All", async () => {
    const view = await renderTimeline([
      ...representativeEvents(),
      event({ id: "evt_unknown", sequence: 7, type: "BACKEND_STEP_RECORDED" as ActivityEventType, summary: "Unknown runtime event." }),
    ]);

    expect(view.querySelectorAll("li")).toHaveLength(7);
    expect(timelineTitles(view)).toEqual([
      "Project connected",
      "Implementation completed",
      "Validation completed",
      "Visual repair completed",
      "Review completed",
      "Retry started",
      "Event: backend step recorded",
    ]);
  });

  it("shows only mapped Developer events", async () => {
    const view = await renderTimeline(representativeEvents());

    await selectFilter("Developer");

    expect(timelineTitles(view)).toEqual(["Implementation completed"]);
    expect(view.textContent).not.toContain("Validation completed.");
    expect(view.textContent).not.toContain("Review completed.");
  });

  it("shows only mapped DevOps events", async () => {
    const view = await renderTimeline([
      ...representativeEvents(),
      event({ id: "evt_browser", sequence: 7, type: "BROWSER_VERIFICATION_COMPLETED", actor: { kind: "AGENT", role: "DEVOPS_ENGINEER" }, summary: "Browser verified." }),
      event({ id: "evt_screenshot", sequence: 8, type: "SCREENSHOT_CAPTURED", actor: { kind: "AGENT", role: "DEVOPS_ENGINEER" }, summary: "Screenshot captured." }),
    ]);

    await selectFilter("DevOps");

    expect(timelineTitles(view)).toEqual(["Validation completed", "Browser verification completed", "Frontend screenshot captured"]);
  });

  it("shows only mapped Visual events", async () => {
    const view = await renderTimeline([
      ...representativeEvents(),
      event({ id: "evt_visual_review", sequence: 7, type: "VISUAL_REVIEW_COMPLETED", actor: { kind: "SYSTEM" }, summary: "Visual review completed." }),
      event({ id: "evt_visual_started", sequence: 8, type: "VISUAL_REPAIR_STARTED", actor: { kind: "SYSTEM" }, summary: "Visual repair started." }),
      event({ id: "evt_visual_exhausted", sequence: 9, type: "VISUAL_REPAIR_EXHAUSTED", actor: { kind: "SYSTEM" }, summary: "Visual repair exhausted." }),
    ]);

    await selectFilter("Visual");

    expect(timelineTitles(view)).toEqual(["Visual repair completed", "Visual review completed", "Visual repair started", "Visual repair exhausted"]);
  });

  it("shows only mapped Review events", async () => {
    const view = await renderTimeline([
      ...representativeEvents(),
      event({ id: "evt_pr", sequence: 7, type: "PULL_REQUEST_CREATED", actor: { kind: "SYSTEM" }, summary: "Pull request created." }),
    ]);

    await selectFilter("Review");

    expect(timelineTitles(view)).toEqual(["Review completed", "Pull request created"]);
  });

  it("shows only mapped System events", async () => {
    const view = await renderTimeline([
      ...representativeEvents(),
      event({ id: "evt_task", sequence: 7, type: "TASK_CREATED", actor: { kind: "SYSTEM" }, summary: "Task created." }),
      event({ id: "evt_plan", sequence: 8, type: "PLAN_CREATED", actor: { kind: "AGENT", role: "MANAGER" }, summary: "Plan created." }),
      event({ id: "evt_approved", sequence: 9, type: "PLAN_APPROVED", actor: { kind: "HUMAN" }, summary: "Plan approved." }),
      event({ id: "evt_rejected", sequence: 10, type: "PLAN_REJECTED", actor: { kind: "HUMAN" }, summary: "Plan rejected." }),
      event({ id: "evt_retry_completed", sequence: 11, type: "RETRY_COMPLETED", actor: { kind: "SYSTEM" }, summary: "Retry completed." }),
      event({ id: "evt_retry_exhausted", sequence: 12, type: "RETRY_EXHAUSTED", actor: { kind: "SYSTEM" }, summary: "Retry exhausted." }),
      event({ id: "evt_cancelled", sequence: 13, type: "TASK_CANCELLED", actor: { kind: "SYSTEM" }, summary: "Task cancelled." }),
    ]);

    await selectFilter("System");

    expect(timelineTitles(view)).toEqual([
      "Project connected",
      "Retry started",
      "Task created",
      "Manager plan created",
      "Plan approved",
      "Plan rejected",
      "Retry completed",
      "Retry exhausted",
      "Task cancelled",
    ]);
  });

  it("preserves event order after filtering", async () => {
    const events = [
      event({ id: "evt_visual_completed", sequence: 30, type: "VISUAL_REPAIR_COMPLETED", summary: "Second visible visual event." }),
      event({ id: "evt_system", sequence: 10, type: "PROJECT_CREATED", summary: "Intervening system event." }),
      event({ id: "evt_visual_review", sequence: 20, type: "VISUAL_REVIEW_COMPLETED", summary: "First visible visual event." }),
    ];
    const view = await renderTimeline(events);

    await selectFilter("Visual");

    expect(timelineTitles(view)).toEqual(["Visual repair completed", "Visual review completed"]);
    expect([...view.querySelectorAll("li")].map((item) => item.textContent)).toEqual([
      expect.stringContaining("Sequence 30"),
      expect.stringContaining("Sequence 20"),
    ]);
  });

  it("switching filters updates visible events correctly", async () => {
    const view = await renderTimeline(representativeEvents());

    await selectFilter("Developer");
    expect(timelineTitles(view)).toEqual(["Implementation completed"]);

    await selectFilter("Visual");
    expect(timelineTitles(view)).toEqual(["Visual repair completed"]);

    await selectFilter("All");
    expect(view.querySelectorAll("li")).toHaveLength(6);
  });

  it("does not mutate the source events array", async () => {
    const events = representativeEvents();
    const before = events.map((item) => item.id);
    const view = await renderTimeline(events);

    await selectFilter("Review");
    await selectFilter("DevOps");
    await selectFilter("All");

    expect(events.map((item) => item.id)).toEqual(before);
    expect(view.querySelectorAll("li")).toHaveLength(events.length);
  });

  it("keeps unknown runtime event types visible under All", async () => {
    const view = await renderTimeline([
      event({ id: "evt_known", sequence: 1, type: "IMPLEMENTATION_COMPLETED", summary: "Known event." }),
      event({ id: "evt_unknown", sequence: 2, type: "BACKEND_STEP_RECORDED" as ActivityEventType, summary: "Unknown runtime event." }),
    ]);

    expect(timelineTitles(view)).toEqual(["Implementation completed", "Event: backend step recorded"]);
    expect(view.textContent).toContain("Unknown runtime event.");
  });

  it("does not assign unknown runtime event types to a category filter", async () => {
    const view = await renderTimeline([
      event({ id: "evt_known", sequence: 1, type: "IMPLEMENTATION_COMPLETED", summary: "Known event." }),
      event({ id: "evt_unknown", sequence: 2, type: "BACKEND_STEP_RECORDED" as ActivityEventType, summary: "Unknown runtime event." }),
    ]);

    await selectFilter("Developer");
    expect(timelineTitles(view)).toEqual(["Implementation completed"]);
    expect(view.textContent).not.toContain("Unknown runtime event.");

    await selectFilter("System");
    expect(view.textContent).toContain("No events in this category.");
    expect(view.textContent).not.toContain("Unknown runtime event.");
  });

  it("renders a safe empty state when the selected filter has no events", async () => {
    const view = await renderTimeline([event({ id: "evt_developer", sequence: 1, type: "IMPLEMENTATION_COMPLETED" })]);

    await selectFilter("Visual");

    expect(view.textContent).toContain("No events in this category.");
    expect(view.querySelector("ol")).toBeNull();
  });

  it("keeps existing event presentation unchanged while filters are visible", async () => {
    const detailedEvent = event({
      id: "evt_review",
      sequence: 42,
      taskId: "task_42",
      type: "REVIEW_COMPLETED",
      actor: { kind: "AGENT", role: "REVIEWER" },
      summary: "Reviewer approved the workflow evidence.",
      createdAt: "2026-08-03T12:20:00.000Z",
    });
    const view = await renderTimeline([detailedEvent]);

    expect(view.textContent).toContain("Reviewer");
    expect(view.textContent).toContain("Review completed");
    expect(view.textContent).toContain("Reviewer approved the workflow evidence.");
    expect(view.textContent).toContain("Aug 3, 2026, 12:20 PM");
    expect(view.textContent).toContain("Sequence 42");
    expect(view.textContent).toContain("Task task_42");
    expect(view.querySelector('button[aria-pressed="true"]')?.textContent).toContain("All");
  });
});

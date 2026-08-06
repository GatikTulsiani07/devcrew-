import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { OrchestrationProgress } from "@/components/activity/orchestration-progress";
import { getOrchestrationProgress } from "@/components/activity/orchestration-progress-model";
import type { TaskSnapshot, TaskStatus } from "@/lib/api-types";

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

function task(status: TaskStatus | string, reason?: string): TaskSnapshot {
  return {
    id: "task_1",
    projectId: "proj_1",
    title: "Authoritative task",
    description: "Run the workflow.",
    status: status as TaskStatus,
    plan: { summary: "A backend plan.", steps: ["Inspect", "Implement"] },
    ...(reason === undefined ? {} : { planDecision: { decision: "REJECT" as const, reason, decidedAt: "2026-08-03T00:00:00.000Z" } }),
    createdAt: "2026-08-03T00:00:00.000Z",
    updatedAt: "2026-08-03T00:00:00.000Z",
  };
}

async function render(taskSnapshot?: TaskSnapshot, fixtureFallback = false) {
  if (root) await act(async () => root?.unmount());
  container?.remove();
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () => root?.render(<OrchestrationProgress task={taskSnapshot} fixtureFallback={fixtureFallback} />));
  return container;
}

describe("orchestration progress model", () => {
  it("renders a deliberate no-task state without fake progress", async () => {
    const view = await render();
    expect(view.textContent).toContain("Waiting for an authoritative backend task.");
    expect(view.textContent).not.toContain("Manager Plan: completed");
    expect(view.querySelector('ol[aria-label="Orchestration stages"]')).toBeNull();
  });

  it("distinguishes fixture fallback from an authoritative task", async () => {
    const fallbackView = await render(undefined, true);
    expect(fallbackView.textContent).toContain("Fixture setup fallback");

    const activeView = await render(task("WAITING_FOR_APPROVAL"));
    expect(activeView.textContent).not.toContain("Fixture setup fallback");
    expect(activeView.textContent).toContain("Manager Plan");
  });

  it.each([
    ["WAITING_FOR_APPROVAL", ["completed", "current", "upcoming", "upcoming", "upcoming", "upcoming"]],
    ["PLAN_APPROVED", ["completed", "completed", "current", "upcoming", "upcoming", "upcoming"]],
    ["PLAN_REJECTED", ["completed", "stopped", "upcoming", "upcoming", "upcoming", "upcoming"]],
    ["IMPLEMENTATION_COMPLETED", ["completed", "completed", "completed", "current", "upcoming", "upcoming"]],
    ["VALIDATION_COMPLETED", ["completed", "completed", "completed", "completed", "current", "upcoming"]],
    ["REVIEW_COMPLETED", ["completed", "completed", "completed", "completed", "completed", "completed"]],
  ] as const)("maps %s to the exact stage states", (status, states) => {
    const model = getOrchestrationProgress(task(status));
    expect(model.stages.map((stage) => stage.state)).toEqual(states);
    expect(model.stages[0]?.state).toBe("completed");
  });

  it("has one current stage for active non-final statuses", () => {
    for (const status of ["WAITING_FOR_APPROVAL", "PLAN_APPROVED", "IMPLEMENTATION_COMPLETED", "VALIDATION_COMPLETED"] as const) {
      const model = getOrchestrationProgress(task(status));
      expect(model.stages.filter((stage) => stage.state === "current")).toHaveLength(1);
    }
  });

  it("stops at Human Approval and renders only an authoritative rejection reason", async () => {
    const reason = "Please revise the acceptance criteria before implementation.";
    const view = await render(task("PLAN_REJECTED", reason));
    expect(view.textContent).toContain("Workflow stopped at Human Approval");
    expect(view.textContent).toContain("Stopped at Human Approval");
    expect(view.textContent).toContain(reason);
    expect(view.textContent).not.toContain("Developer: current");
    expect(view.textContent).not.toContain("Complete: current");
  });

  it("handles a missing rejection reason safely", async () => {
    const view = await render(task("PLAN_REJECTED"));
    expect(view.textContent).toContain("Workflow stopped at Human Approval");
    expect(view.textContent).not.toContain("undefined");
  });

  it("uses a neutral fallback for unknown statuses", async () => {
    const model = getOrchestrationProgress(task("UNKNOWN_STATUS"));
    expect(model.fallback).toBe(true);
    expect(model.currentStageId).toBeUndefined();

    const view = await render(task("UNKNOWN_STATUS"));
    expect(view.textContent).toContain("Workflow status unavailable");
    expect(view.textContent).not.toContain("Manager Plan");
  });

  it("renders semantic and accessible stage state labels without relying on color", async () => {
    const view = await render(task("PLAN_APPROVED"));
    const list = view.querySelector('ol[aria-label="Orchestration stages"]');
    expect(list).not.toBeNull();
    expect(list?.querySelectorAll("li")).toHaveLength(6);
    expect(list?.querySelector('[aria-label="Developer: Current"]')).not.toBeNull();
    expect(view.textContent).toContain("completed");
    expect(view.textContent).toContain("current");
    expect(view.textContent).toContain("upcoming");
  });

  it("keeps long rejection content wrapped", async () => {
    const reason = "A very long rejection reason that explains several review boundaries and should remain readable at a narrow mobile width without forcing the tracker wider.";
    const view = await render(task("PLAN_REJECTED", reason));
    expect(view.textContent).toContain(reason);
    expect([...view.querySelectorAll("p")].find((item) => item.textContent?.includes(reason))?.className).toMatch(/break-words/);
  });
});

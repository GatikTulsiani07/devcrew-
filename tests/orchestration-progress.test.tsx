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

function taskWithPullRequest(): TaskSnapshot {
  return {
    ...task("REVIEW_COMPLETED"),
    pullRequest: {
      number: 42,
      url: "https://github.com/acme/backend-project/pull/42",
      state: "OPEN",
      headBranch: "devcrew/task-task_123",
      baseBranch: "main",
      commitSha: "a84f72c",
      createdAt: "2026-08-03T12:25:00.000Z",
    },
  };
}

function taskWithCancellation(status: TaskStatus, cancellationStatus: NonNullable<TaskSnapshot["cancellation"]>["status"]): TaskSnapshot {
  return {
    ...task(status),
    cancellation: {
      status: cancellationStatus,
      requestedAt: "2026-08-03T12:30:00.000Z",
      ...(cancellationStatus === "CANCELLED" ? { cancelledAt: "2026-08-03T12:31:00.000Z" } : {}),
      summary: `Cancellation ${cancellationStatus.toLowerCase()}.`,
    },
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
    ["REVIEW_COMPLETED", ["completed", "completed", "completed", "completed", "completed", "current"]],
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
    expect(view.textContent).not.toContain("Pull Request: current");
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

  it("represents the final workflow stage as Pull Request and completes it only from pull request evidence", async () => {
    const withoutPullRequest = getOrchestrationProgress(task("REVIEW_COMPLETED"));
    expect(withoutPullRequest.stages.at(-1)?.label).toBe("Pull Request");
    expect(withoutPullRequest.stages.at(-1)?.state).toBe("current");

    const withPullRequest = getOrchestrationProgress(taskWithPullRequest());
    expect(withPullRequest.stages.at(-1)?.state).toBe("completed");

    const view = await render(taskWithPullRequest());
    expect(view.textContent).toContain("Workflow complete");
    expect(view.querySelector('[aria-label="Pull Request: Completed"]')).not.toBeNull();
  });

  it("renders Workflow cancelled only from authoritative CANCELLED cancellation evidence", async () => {
    const view = await render(taskWithCancellation("PLAN_APPROVED", "CANCELLED"));
    expect(view.textContent).toContain("Workflow cancelled");
  });

  it("preserves completed stages and leaves remaining stages incomplete after cancellation", () => {
    const model = getOrchestrationProgress(taskWithCancellation("IMPLEMENTATION_COMPLETED", "CANCELLED"));
    expect(model.cancelled).toBe(true);
    expect(model.stages.map((stage) => [stage.id, stage.state])).toEqual([
      ["manager", "completed"],
      ["approval", "completed"],
      ["developer", "completed"],
      ["devops", "upcoming"],
      ["reviewer", "upcoming"],
      ["pullRequest", "upcoming"],
    ]);
  });

  it("suppresses later active stages after cancellation", async () => {
    const model = getOrchestrationProgress(taskWithCancellation("VALIDATION_COMPLETED", "CANCELLED"));
    expect(model.currentStageId).toBeUndefined();
    expect(model.stages.some((stage) => stage.state === "current")).toBe(false);
    expect(model.stages.find((stage) => stage.id === "reviewer")?.state).toBe("upcoming");

    const view = await render(taskWithCancellation("VALIDATION_COMPLETED", "CANCELLED"));
    expect(view.textContent).toContain("Workflow cancelled");
    expect(view.querySelector('[aria-label="Reviewer: Current"]')).toBeNull();
  });

  it("does not render REQUESTED cancellation as Workflow cancelled", async () => {
    const model = getOrchestrationProgress(taskWithCancellation("PLAN_APPROVED", "REQUESTED"));
    expect(model.cancelled).toBe(false);
    expect(model.currentStageId).toBe("developer");

    const view = await render(taskWithCancellation("PLAN_APPROVED", "REQUESTED"));
    expect(view.textContent).not.toContain("Workflow cancelled");
    expect(view.textContent).toContain("Current stage: Developer");
  });

  it("does not render FAILED cancellation as successfully cancelled", async () => {
    const model = getOrchestrationProgress(taskWithCancellation("IMPLEMENTATION_COMPLETED", "FAILED"));
    expect(model.cancelled).toBe(false);
    expect(model.currentStageId).toBe("devops");

    const view = await render(taskWithCancellation("IMPLEMENTATION_COMPLETED", "FAILED"));
    expect(view.textContent).not.toContain("Workflow cancelled");
    expect(view.textContent).toContain("Current stage: DevOps");
  });

  it("preserves existing behavior when cancellation evidence is absent", async () => {
    const model = getOrchestrationProgress(task("PLAN_APPROVED"));
    expect(model.cancelled).toBe(false);
    expect(model.stages.map((stage) => stage.state)).toEqual(["completed", "completed", "current", "upcoming", "upcoming", "upcoming"]);

    const view = await render(task("PLAN_APPROVED"));
    expect(view.textContent).toContain("Current stage: Developer");
    expect(view.querySelector('[aria-label="Developer: Current"]')).not.toBeNull();
  });

  it("does not infer cancelled progress from TASK_CANCELLED event text alone", async () => {
    const taskWithCancelledEventText = {
      ...task("PLAN_APPROVED"),
      events: [{ type: "TASK_CANCELLED", message: "Task cancelled" }],
    } as TaskSnapshot & { events: readonly { type: "TASK_CANCELLED"; message: string }[] };

    const view = await render(taskWithCancelledEventText);
    expect(view.textContent).not.toContain("Workflow cancelled");
    expect(view.textContent).toContain("Current stage: Developer");
  });
});

import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { ActivityWorkspace } from "@/components/activity/activity-workspace";
import { WorkspaceStateProvider } from "@/components/shell/workspace-state";
import type { ProjectWorkflowState } from "@/hooks/use-project-workflow";
import type { ProjectActivityState } from "@/hooks/use-project-activity";
import type { TaskSnapshot, TaskStatus } from "@/lib/api-types";

vi.mock("@/hooks/use-project-workflow", () => ({
  useProjectWorkflow: () => workflowState,
}));

vi.mock("@/hooks/use-project-activity", () => ({
  useProjectActivity: () => activityState,
}));

let root: Root | undefined;
let container: HTMLDivElement | undefined;
let workflowState: ProjectWorkflowState;
let activityState: ProjectActivityState;

beforeAll(() => {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

afterEach(async () => {
  if (root) await act(async () => root?.unmount());
  container?.remove();
  root = undefined;
  container = undefined;
  vi.restoreAllMocks();
});

function task(status: TaskStatus): TaskSnapshot {
  return {
    id: "task_1",
    projectId: "proj_1",
    title: "Focused task",
    description: "Run the workflow.",
    status,
    plan: { summary: "Implement requested engineering task.", steps: ["Inspect", "Implement"] },
    createdAt: "2026-08-03T00:00:00.000Z",
    updatedAt: "2026-08-03T00:00:00.000Z",
  };
}

async function render(status: TaskStatus, error?: string) {
  workflowState = {
    project: {
      id: "proj_1",
      name: "Devcrew MVP",
      status: "REPOSITORY_CONNECTED",
      repository: {
        id: "repo_1",
        publicRepositoryUrl: "https://github.com/example/devcrew",
        preparedRepositoryId: "prepared_devcrew_main",
      },
      createdAt: "2026-08-03T00:00:00.000Z",
      updatedAt: "2026-08-03T00:00:00.000Z",
    },
    task: task(status),
    initializing: false,
    error,
    approve: vi.fn(),
    reject: vi.fn(),
    execute: vi.fn(),
    validate: vi.fn(),
    review: vi.fn(),
    fetchTask: vi.fn(),
  };
  activityState = {
    events: [
      {
        id: "evt_1",
        sequence: 1,
        projectId: "proj_1",
        type: "PROJECT_CREATED",
        actor: { kind: "HUMAN" },
        summary: "Project connected to a prepared repository.",
        createdAt: "2026-08-03T00:00:00.000Z",
      },
    ],
    connection: "connected",
    lastSequence: 1,
  };

  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () =>
    root?.render(
      <WorkspaceStateProvider>
        <ActivityWorkspace />
      </WorkspaceStateProvider>,
    ),
  );
  return container;
}

function button(view: HTMLElement, label: string) {
  const found = [...view.querySelectorAll("button")].find((item) =>
    item.getAttribute("aria-pressed") === null &&
    item.textContent?.trim().startsWith(label),
  );
  expect(found).toBeDefined();
  return found as HTMLButtonElement;
}

describe("Activity workflow buttons", () => {
  it("enables only approve and reject while waiting", async () => {
    const view = await render("WAITING_FOR_APPROVAL");
    expect(button(view, "Approve").disabled).toBe(false);
    expect(button(view, "Reject").disabled).toBe(false);
    expect(button(view, "Execute").disabled).toBe(true);
    expect(button(view, "Validate").disabled).toBe(true);
    expect(button(view, "Review").disabled).toBe(true);
  });

  it("enables Execute only after approval", async () => {
    const view = await render("PLAN_APPROVED");
    expect(button(view, "Approve").disabled).toBe(true);
    expect(button(view, "Reject").disabled).toBe(true);
    expect(button(view, "Execute").disabled).toBe(false);
    expect(button(view, "Validate").disabled).toBe(true);
    expect(button(view, "Review").disabled).toBe(true);
  });

  it("enables Validate only after implementation", async () => {
    const view = await render("IMPLEMENTATION_COMPLETED");
    expect(button(view, "Execute").disabled).toBe(true);
    expect(button(view, "Validate").disabled).toBe(false);
    expect(button(view, "Review").disabled).toBe(true);
  });

  it("enables Review only after validation and disables everything after review", async () => {
    const validationView = await render("VALIDATION_COMPLETED");
    expect(button(validationView, "Validate").disabled).toBe(true);
    expect(button(validationView, "Review").disabled).toBe(false);

    await act(async () => root?.unmount());
    root = undefined;
    container?.remove();
    container = undefined;

    const reviewView = await render("REVIEW_COMPLETED");
    expect(button(reviewView, "Approve").disabled).toBe(true);
    expect(button(reviewView, "Reject").disabled).toBe(true);
    expect(button(reviewView, "Execute").disabled).toBe(true);
    expect(button(reviewView, "Validate").disabled).toBe(true);
    expect(button(reviewView, "Review").disabled).toBe(true);
  });

  it("surfaces backend errors", async () => {
    const view = await render("PLAN_APPROVED", "INVALID_TASK_TRANSITION: Task is not approved");
    expect(view.textContent).toContain("INVALID_TASK_TRANSITION: Task is not approved");
  });
});

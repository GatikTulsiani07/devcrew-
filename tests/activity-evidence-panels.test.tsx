import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { DeveloperEvidencePanel } from "@/components/activity/developer-evidence-panel";
import { DevopsEvidencePanel } from "@/components/activity/devops-evidence-panel";
import { ReviewerEvidencePanel } from "@/components/activity/reviewer-evidence-panel";
import { ActivityWorkspace } from "@/components/activity/activity-workspace";
import { WorkspaceStateProvider } from "@/components/shell/workspace-state";
import type { ProjectWorkflowState } from "@/hooks/use-project-workflow";
import type { ProjectActivityState } from "@/hooks/use-project-activity";
import type { ProjectSnapshot, TaskSnapshot } from "@/lib/api-types";

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

async function render(node: React.ReactNode) {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () => root?.render(node));
  return container;
}

function project(): ProjectSnapshot {
  return {
    id: "proj_1",
    name: "Backend Project",
    status: "REPOSITORY_CONNECTED",
    repository: {
      id: "repo_1",
      publicRepositoryUrl: "https://github.com/acme/backend-project",
      preparedRepositoryId: "prepared_backend_project",
    },
    createdAt: "2026-08-03T00:00:00.000Z",
    updatedAt: "2026-08-03T00:00:00.000Z",
  };
}

function task(overrides: Partial<TaskSnapshot> = {}): TaskSnapshot {
  return {
    id: "task_1",
    projectId: "proj_1",
    title: "Structured evidence task",
    description: "Render stage evidence.",
    status: "REVIEW_COMPLETED",
    plan: { summary: "Build evidence panels.", steps: ["Inspect", "Render"] },
    createdAt: "2026-08-03T00:00:00.000Z",
    updatedAt: "2026-08-03T00:00:00.000Z",
    ...overrides,
  };
}

function taskWithAllEvidence(): TaskSnapshot {
  return task({
    execution: {
      id: "exec_1",
      role: "FULL_STACK_DEVELOPER",
      status: "COMPLETED",
      attempt: 1,
      startedAt: "2026-08-03T12:00:00.000Z",
      completedAt: "2026-08-03T12:08:00.000Z",
      result: {
        summary: "Prepared an implementation proposal for structured evidence panels.",
        changedFiles: [
          "components/activity/developer-evidence-panel.tsx",
          "components/activity/a/very/long/path/that/should/wrap/safely/without/forcing/mobile/overflow/developer-evidence-panel.tsx",
        ],
        verification: ["npm run typecheck", "npm test"],
      },
    },
    validation: {
      id: "validation_1",
      role: "DEVOPS_ENGINEER",
      status: "PASSED",
      attempt: 1,
      startedAt: "2026-08-03T12:10:00.000Z",
      completedAt: "2026-08-03T12:14:00.000Z",
      summary: "Validation passed for the proposed UI evidence panels.",
      checks: [
        { name: "typecheck", status: "PASSED", summary: "TypeScript completed without contract errors." },
        { name: "tests", status: "PASSED", summary: "Focused evidence panel tests passed." },
        { name: "build", status: "PASSED", summary: "Production build completed." },
      ],
    },
    review: {
      id: "review_1",
      role: "REVIEWER",
      status: "COMPLETED",
      verdict: "APPROVED",
      attempt: 1,
      startedAt: "2026-08-03T12:15:00.000Z",
      completedAt: "2026-08-03T12:20:00.000Z",
      summary: "Review approved the structured evidence presentation.",
      findings: [
        {
          severity: "INFO",
          title: "Evidence panels are presentation-only",
          description: "The panels consume the task snapshot and do not introduce backend mutations.",
        },
      ],
    },
  });
}

describe("Developer evidence panel", () => {
  it("renders implementation summary, proposed files, verification steps, and timestamp with proposal language", async () => {
    const view = await render(<DeveloperEvidencePanel task={taskWithAllEvidence()} />);

    expect(view.querySelector("h2")?.textContent).toBe("Developer evidence");
    expect(view.textContent).toContain("Implementation proposal completed");
    expect(view.textContent).toContain("Prepared an implementation proposal");
    expect(view.textContent).toContain("Proposed files");
    expect(view.textContent).toContain("components/activity/developer-evidence-panel.tsx");
    expect(view.textContent).toContain("npm run typecheck");
    expect(view.textContent).toContain("Execution completed");
    expect(view.textContent).toContain("Aug 3, 2026, 12:08 PM");
    expect(view.textContent).not.toContain("Files changed");
    expect(view.textContent).not.toContain("Applied changes");
    expect(view.querySelector('ul[aria-label="Proposed files"]')).not.toBeNull();
    expect(view.querySelector('ul[aria-label="Developer verification steps"]')).not.toBeNull();
  });

  it("shows a safe not-run state and handles missing optional arrays without crashing", async () => {
    const emptyView = await render(<DeveloperEvidencePanel task={task()} />);
    expect(emptyView.textContent).toContain("Developer has not run yet.");

    await act(async () => root?.unmount());
    root = undefined;
    container?.remove();
    container = undefined;

    const missingArrays = taskWithAllEvidence();
    missingArrays.execution = {
      ...missingArrays.execution!,
      result: { summary: "Proposal summary only.", changedFiles: [], verification: [] },
    };
    const view = await render(<DeveloperEvidencePanel task={missingArrays} />);
    expect(view.textContent).toContain("Proposal summary only.");
    expect(view.textContent).not.toContain("undefined");
  });

  it("wraps long proposed paths safely", async () => {
    const view = await render(<DeveloperEvidencePanel task={taskWithAllEvidence()} />);
    const longPath = view.textContent?.includes("very/long/path");
    expect(longPath).toBe(true);
    expect(view.querySelector('ul[aria-label="Proposed files"] span')?.className).toMatch(/break-all/);
  });

  it("omits obvious local absolute paths from proposed files", async () => {
    const pathTask = taskWithAllEvidence();
    pathTask.execution = {
      ...pathTask.execution!,
      result: {
        ...pathTask.execution!.result,
        changedFiles: ["/Users/suniltulsiani/Desktop/devcrew-ui/secret.ts", "components/activity/safe-panel.tsx"],
      },
    };
    const view = await render(<DeveloperEvidencePanel task={pathTask} />);
    expect(view.textContent).toContain("components/activity/safe-panel.tsx");
    expect(view.textContent).not.toContain("/Users/suniltulsiani/Desktop/devcrew-ui/secret.ts");
  });
});

describe("DevOps evidence panel", () => {
  it("renders validation status, dynamic checks, summaries, and timestamp", async () => {
    const view = await render(<DevopsEvidencePanel task={taskWithAllEvidence()} />);

    expect(view.querySelector("h2")?.textContent).toBe("DevOps evidence");
    expect(view.textContent).toContain("Validation passed");
    expect(view.textContent).toContain("typecheck");
    expect(view.textContent).toContain("tests");
    expect(view.textContent).toContain("build");
    expect(view.textContent).toContain("TypeScript completed without contract errors.");
    expect(view.textContent).toContain("Validation completed");
    expect(view.textContent).toContain("Aug 3, 2026, 12:14 PM");
    expect(view.querySelector('ul[aria-label="Validation checks"]')?.querySelectorAll("li")).toHaveLength(3);
  });

  it("shows a safe not-run state and never renders raw stdout or stderr fields", async () => {
    const emptyView = await render(<DevopsEvidencePanel task={task()} />);
    expect(emptyView.textContent).toContain("Validation has not run yet.");

    await act(async () => root?.unmount());
    root = undefined;
    container?.remove();
    container = undefined;

    const unsafeTask = taskWithAllEvidence();
    unsafeTask.validation = {
      ...unsafeTask.validation!,
      checks: [
        {
          name: "tests",
          status: "PASSED",
          summary: "Safe test summary.",
          stdout: "SECRET_STDOUT_SHOULD_NOT_RENDER",
          stderr: "SECRET_STDERR_SHOULD_NOT_RENDER",
        } as never,
      ],
    };
    const view = await render(<DevopsEvidencePanel task={unsafeTask} />);
    expect(view.textContent).toContain("Safe test summary.");
    expect(view.textContent).not.toContain("SECRET_STDOUT_SHOULD_NOT_RENDER");
    expect(view.textContent).not.toContain("SECRET_STDERR_SHOULD_NOT_RENDER");
  });
});

describe("Reviewer evidence panel", () => {
  it("renders verdict, summary, findings, severity, and timestamp", async () => {
    const view = await render(<ReviewerEvidencePanel task={taskWithAllEvidence()} />);

    expect(view.querySelector("h2")?.textContent).toBe("Reviewer evidence");
    expect(view.textContent).toContain("Verdict approved");
    expect(view.textContent).toContain("Review approved the structured evidence presentation.");
    expect(view.textContent).toContain("Evidence panels are presentation-only");
    expect(view.textContent).toContain("INFO");
    expect(view.textContent).toContain("The panels consume the task snapshot");
    expect(view.textContent).toContain("Review completed");
    expect(view.textContent).toContain("Aug 3, 2026, 12:20 PM");
    expect(view.querySelector('ul[aria-label="Reviewer findings"]')).not.toBeNull();
  });

  it("uses a neutral fallback for unknown severities and wraps long finding descriptions", async () => {
    const reviewTask = taskWithAllEvidence();
    reviewTask.review = {
      ...reviewTask.review!,
      findings: [
        {
          severity: "BLOCKER",
          title: "Unexpected severity",
          description: "A very long finding description with an identifier_that_should_wrap_safely_at_mobile_width_without_forcing_the_document_wider.",
        } as never,
      ],
    };
    const view = await render(<ReviewerEvidencePanel task={reviewTask} />);

    expect(view.textContent).toContain("Severity unknown");
    expect(view.textContent).toContain("identifier_that_should_wrap_safely");
    expect(view.querySelector('ul[aria-label="Reviewer findings"] p')?.className).toMatch(/break-words/);
  });

  it("shows a safe not-run state and handles missing findings without crashing", async () => {
    const emptyView = await render(<ReviewerEvidencePanel task={task()} />);
    expect(emptyView.textContent).toContain("Review has not run yet.");

    await act(async () => root?.unmount());
    root = undefined;
    container?.remove();
    container = undefined;

    const noFindings = taskWithAllEvidence();
    noFindings.review = { ...noFindings.review!, findings: [] };
    const view = await render(<ReviewerEvidencePanel task={noFindings} />);
    expect(view.textContent).toContain("Review approved the structured evidence presentation.");
    expect(view.textContent).not.toContain("undefined");
  });
});

describe("Activity structured evidence placement", () => {
  it("renders semantic panel headings and does not mix fixture evidence into an active backend task", async () => {
    const backendProject = project();
    workflowState = {
      project: backendProject,
      task: taskWithAllEvidence(),
      initializing: false,
      approve: vi.fn(),
      reject: vi.fn(),
      execute: vi.fn(),
      validate: vi.fn(),
      review: vi.fn(),
      fetchTask: vi.fn(),
    };
    activityState = { events: [], connection: "connected", lastSequence: 0 };

    const view = await render(
      <WorkspaceStateProvider>
        <ActivityWorkspace />
      </WorkspaceStateProvider>,
    );

    expect(view.textContent).toContain("Structured evidence");
    expect(view.textContent).toContain("Authoritative stage output from the backend task snapshot.");
    expect(view.textContent).not.toContain("Fixture setup fallback: evidence panels");
    expect([...view.querySelectorAll("h2")].map((heading) => heading.textContent)).toEqual(
      expect.arrayContaining(["Developer evidence", "DevOps evidence", "Reviewer evidence"]),
    );
    expect(view.querySelector('ul[aria-label="Proposed files"]')).not.toBeNull();
    expect(view.querySelector('ul[aria-label="Validation checks"]')).not.toBeNull();
    expect(view.querySelector('ul[aria-label="Reviewer findings"]')).not.toBeNull();
  });

  it("clearly labels fixture setup mode without fabricating stage evidence", async () => {
    workflowState = {
      initializing: true,
      approve: vi.fn(),
      reject: vi.fn(),
      execute: vi.fn(),
      validate: vi.fn(),
      review: vi.fn(),
      fetchTask: vi.fn(),
    };
    activityState = { events: [], connection: "idle", lastSequence: 0 };

    const view = await render(
      <WorkspaceStateProvider>
        <ActivityWorkspace />
      </WorkspaceStateProvider>,
    );

    expect(view.textContent).toContain("Fixture setup fallback: evidence panels are waiting for a backend task snapshot.");
    expect(view.textContent).toContain("Developer has not run yet.");
    expect(view.textContent).toContain("Validation has not run yet.");
    expect(view.textContent).toContain("Review has not run yet.");
    expect(view.textContent).not.toContain("Prepared an implementation proposal");
  });
});

import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { CancellationEvidencePanel } from "@/components/activity/cancellation-evidence-panel";
import { DeveloperEvidencePanel } from "@/components/activity/developer-evidence-panel";
import { DevopsEvidencePanel } from "@/components/activity/devops-evidence-panel";
import { PullRequestEvidencePanel } from "@/components/activity/pull-request-evidence-panel";
import { RetryRecoveryEvidencePanel } from "@/components/activity/retry-recovery-evidence-panel";
import { ReviewerEvidencePanel } from "@/components/activity/reviewer-evidence-panel";
import { VisualRepairEvidencePanel } from "@/components/activity/visual-repair-evidence-panel";
import { ActivityWorkspace } from "@/components/activity/activity-workspace";
import { WorkspaceStateProvider } from "@/components/shell/workspace-state";
import type { ProjectWorkflowState } from "@/hooks/use-project-workflow";
import type { ProjectActivityState } from "@/hooks/use-project-activity";
import type { ProjectSnapshot, RetryAttemptEvidence, TaskSnapshot, VisualRepairAttempt, VisualReviewFinding } from "@/lib/api-types";

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

function taskWithAllEvidence(overrides: Partial<TaskSnapshot> = {}): TaskSnapshot {
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
    pullRequest: {
      number: 42,
      url: "https://github.com/acme/backend-project/pull/42",
      state: "OPEN",
      headBranch: "devcrew/task-task_123",
      baseBranch: "main",
      commitSha: "a84f72c",
      createdAt: "2026-08-03T12:25:00.000Z",
    },
    ...overrides,
  });
}

function taskWithScreenshotEvidence(id = "shot_123e4567-e89b-42d3-a456-426614174000"): TaskSnapshot {
  const screenshotTask = taskWithAllEvidence();
  screenshotTask.validation = {
    ...screenshotTask.validation!,
    browserScreenshot: {
      status: "CAPTURED",
      id,
      url: "http://127.0.0.1:43117/",
      viewport: { width: 1440, height: 900 },
      capturedAt: "2026-08-03T12:13:00.000Z",
    },
  };
  return screenshotTask;
}

function taskWithVisualReview(findings: readonly VisualReviewFinding[]): TaskSnapshot {
  const visualReviewTask = taskWithAllEvidence();
  visualReviewTask.validation = {
    ...visualReviewTask.validation!,
    visualReview: {
      status: "FAILED",
      summary: "Visual Review checked the captured browser state.",
      findings,
      screenshotId: "shot_visual_review",
      reviewedAt: "2026-08-03T12:13:30.000Z",
    },
  };
  return visualReviewTask;
}

function retryAttempt(overrides: Partial<RetryAttemptEvidence> = {}): RetryAttemptEvidence {
  return {
    stage: "REVIEWER",
    attempt: 1,
    status: "FAILED",
    category: "PROVIDER_TIMEOUT",
    startedAt: "2026-08-03T12:16:00.000Z",
    completedAt: "2026-08-03T12:17:00.000Z",
    retryable: true,
    summary: "Provider request failed at /Users/suniltulsiani/Desktop/devcrew-ui with TOKEN_SHOULD_NOT_RENDER and stack trace details.",
    ...overrides,
  };
}

function visualRepairAttempt(overrides: Partial<VisualRepairAttempt> = {}): VisualRepairAttempt {
  return {
    attempt: 1,
    startedAt: "2026-08-03T12:14:00.000Z",
    completedAt: "2026-08-03T12:18:00.000Z",
    sourceScreenshotId: "shot_source_1",
    sourceVisualReview: {
      status: "FAILED",
      summary: "Visual Review found layout issues before repair.",
      findingCount: 2,
    },
    developer: {
      summary: "Adjusted spacing and panel wrapping for the visual repair.",
      changedFiles: ["components/activity/unsafe-file-path-should-not-render.tsx"],
    },
    validation: {
      status: "PASSED",
    },
    screenshotId: "shot_repair_1",
    visualReview: {
      status: "PASSED",
      summary: "Visual Review passed after the repair.",
      findingCount: 0,
    },
    ...overrides,
  };
}

function visualReviewFindingTitles(view: HTMLDivElement): string[] {
  return [...view.querySelectorAll('ul[aria-label="Visual Review findings"] li')].map((item) => item.querySelector("span")?.textContent ?? "");
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

  it("renders a copy action when screenshot ID exists", async () => {
    const view = await render(<DevopsEvidencePanel task={taskWithScreenshotEvidence()} />);

    expect(view.textContent).toContain("shot_123e4567-e89b-42d3-a456-426614174000");
    expect(view.querySelector('button[aria-label="Copy screenshot ID"]')).not.toBeNull();
  });

  it("copies the exact authoritative screenshot ID", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
    const view = await render(<DevopsEvidencePanel task={taskWithScreenshotEvidence("shot_authoritative_exact")} />);

    view.querySelector<HTMLButtonElement>('button[aria-label="Copy screenshot ID"]')?.click();

    expect(writeText).toHaveBeenCalledWith("shot_authoritative_exact");
  });

  it("does not render a screenshot ID copy action when screenshot evidence is missing", async () => {
    const view = await render(<DevopsEvidencePanel task={taskWithAllEvidence()} />);

    expect(view.querySelector('button[aria-label="Copy screenshot ID"]')).toBeNull();
  });

  it("does not render a screenshot ID copy action when screenshot ID is empty", async () => {
    const view = await render(<DevopsEvidencePanel task={taskWithScreenshotEvidence("")} />);

    expect(view.querySelector('button[aria-label="Copy screenshot ID"]')).toBeNull();
  });

  it("keeps screenshot evidence content visible beside the copy action", async () => {
    const view = await render(<DevopsEvidencePanel task={taskWithScreenshotEvidence()} />);

    expect(view.textContent).toContain("Screenshot evidence");
    expect(view.textContent).toContain("shot_123e4567-e89b-42d3-a456-426614174000");
    expect(view.textContent).toContain("1440x900");
    expect(view.textContent).toContain("Screenshot captured");
    expect(view.textContent).toContain("Aug 3, 2026, 12:13 PM");
    expect(view.textContent).toContain("Validation passed");
  });

  it("renders Visual Review ERROR findings before WARNING and INFO findings", async () => {
    const view = await render(
      <DevopsEvidencePanel
        task={taskWithVisualReview([
          { severity: "INFO", category: "typography", title: "Info finding", description: "Informational detail remains visible." },
          { severity: "WARNING", category: "spacing", title: "Warning finding", description: "Warning detail remains visible." },
          { severity: "ERROR", category: "layout", title: "Error finding", description: "Error detail remains visible." },
        ])}
      />,
    );

    expect(visualReviewFindingTitles(view)).toEqual(["Error finding", "Warning finding", "Info finding"]);
  });

  it("renders Visual Review WARNING findings before INFO findings", async () => {
    const view = await render(
      <DevopsEvidencePanel
        task={taskWithVisualReview([
          { severity: "INFO", category: "typography", title: "Info finding", description: "Informational detail remains visible." },
          { severity: "WARNING", category: "spacing", title: "Warning finding", description: "Warning detail remains visible." },
        ])}
      />,
    );

    expect(visualReviewFindingTitles(view)).toEqual(["Warning finding", "Info finding"]);
  });

  it("preserves original order among Visual Review findings with the same severity", async () => {
    const view = await render(
      <DevopsEvidencePanel
        task={taskWithVisualReview([
          { severity: "WARNING", category: "spacing", title: "First warning", description: "First warning detail." },
          { severity: "ERROR", category: "layout", title: "First error", description: "First error detail." },
          { severity: "ERROR", category: "responsive", title: "Second error", description: "Second error detail." },
          { severity: "WARNING", category: "accessibility", title: "Second warning", description: "Second warning detail." },
        ])}
      />,
    );

    expect(visualReviewFindingTitles(view)).toEqual(["First error", "Second error", "First warning", "Second warning"]);
  });

  it("does not mutate the source Visual Review findings array while sorting for display", async () => {
    const findings: VisualReviewFinding[] = [
      { severity: "INFO", category: "typography", title: "Info finding", description: "Informational detail remains visible." },
      { severity: "ERROR", category: "layout", title: "Error finding", description: "Error detail remains visible." },
      { severity: "WARNING", category: "spacing", title: "Warning finding", description: "Warning detail remains visible." },
    ];

    const view = await render(<DevopsEvidencePanel task={taskWithVisualReview(findings)} />);

    expect(visualReviewFindingTitles(view)).toEqual(["Error finding", "Warning finding", "Info finding"]);
    expect(findings.map((finding) => finding.title)).toEqual(["Info finding", "Error finding", "Warning finding"]);
  });

  it("renders unknown Visual Review severities after known severities without crashing", async () => {
    const view = await render(
      <DevopsEvidencePanel
        task={taskWithVisualReview([
          {
            severity: "CRITICAL",
            category: "layout",
            title: "Unexpected severity finding",
            description: "Unknown severity detail remains visible.",
          } as never,
          { severity: "INFO", category: "other", title: "Info finding", description: "Known severity detail remains visible." },
          { severity: "ERROR", category: "layout", title: "Error finding", description: "Error detail remains visible." },
        ])}
      />,
    );

    expect(visualReviewFindingTitles(view)).toEqual(["Error finding", "Info finding", "Unexpected severity finding"]);
    expect(view.textContent).toContain("Severity unknown");
    expect(view.textContent).toContain("Unknown severity detail remains visible.");
  });

  it("keeps existing Visual Review finding content visible after presentation sorting", async () => {
    const view = await render(
      <DevopsEvidencePanel
        task={taskWithVisualReview([
          { severity: "WARNING", category: "spacing", title: "Crowded controls", description: "Toolbar controls need more spacing." },
          { severity: "ERROR", category: "layout", title: "Panel overlap", description: "The evidence panel overlaps adjacent content." },
        ])}
      />,
    );

    expect(view.textContent).toContain("Panel overlap");
    expect(view.textContent).toContain("ERROR");
    expect(view.textContent).toContain("The evidence panel overlaps adjacent content.");
    expect(view.textContent).toContain("Crowded controls");
    expect(view.textContent).toContain("WARNING");
    expect(view.textContent).toContain("Toolbar controls need more spacing.");
  });

  it("renders Visual Review ERROR, WARNING, and INFO counts in severity order", async () => {
    const view = await render(
      <DevopsEvidencePanel
        task={taskWithVisualReview([
          { severity: "WARNING", category: "spacing", title: "Crowded controls", description: "Toolbar controls need more spacing." },
          { severity: "INFO", category: "typography", title: "Text rhythm", description: "Line height remains readable." },
          { severity: "ERROR", category: "layout", title: "Panel overlap", description: "The evidence panel overlaps adjacent content." },
        ])}
      />,
    );

    expect(view.textContent).toContain("Visual Review");
    expect(view.textContent).toContain("1 error · 1 warning · 1 info");
  });

  it("counts multiple Visual Review findings of the same severity", async () => {
    const view = await render(
      <DevopsEvidencePanel
        task={taskWithVisualReview([
          { severity: "ERROR", category: "layout", title: "Panel overlap", description: "The panel overlaps content." },
          { severity: "ERROR", category: "responsive", title: "Mobile overflow", description: "The panel overflows on mobile." },
          { severity: "WARNING", category: "spacing", title: "Dense controls", description: "Controls are too dense." },
          { severity: "INFO", category: "typography", title: "Readable text", description: "Text remains readable." },
          { severity: "INFO", category: "accessibility", title: "Visible label", description: "The label remains visible." },
          { severity: "INFO", category: "other", title: "Reference note", description: "The reference note is informational." },
        ])}
      />,
    );

    expect(view.textContent).toContain("2 errors · 1 warning · 3 info");
  });

  it("omits Visual Review severity groups with zero findings", async () => {
    const view = await render(
      <DevopsEvidencePanel
        task={taskWithVisualReview([
          { severity: "ERROR", category: "layout", title: "Panel overlap", description: "The panel overlaps content." },
          { severity: "INFO", category: "typography", title: "Readable text", description: "Text remains readable." },
        ])}
      />,
    );

    expect(view.textContent).toContain("1 error · 1 info");
    expect(view.textContent).not.toContain("warning");
  });

  it("does not render a Visual Review severity summary when findings are empty", async () => {
    const view = await render(<DevopsEvidencePanel task={taskWithVisualReview([])} />);

    expect(view.textContent).toContain("Visual Review checked the captured browser state.");
    expect(view.textContent).not.toContain("0 errors");
    expect(view.textContent).not.toContain("0 warnings");
    expect(view.textContent).not.toContain("0 info");
    expect(view.querySelector('ul[aria-label="Visual Review findings"]')).toBeNull();
  });

  it("renders singular Visual Review severity labels", async () => {
    const view = await render(
      <DevopsEvidencePanel
        task={taskWithVisualReview([
          { severity: "ERROR", category: "layout", title: "Panel overlap", description: "The panel overlaps content." },
          { severity: "WARNING", category: "spacing", title: "Dense controls", description: "Controls are too dense." },
          { severity: "INFO", category: "typography", title: "Readable text", description: "Text remains readable." },
        ])}
      />,
    );

    expect(view.textContent).toContain("1 error · 1 warning · 1 info");
    expect(view.textContent).not.toContain("1 errors");
    expect(view.textContent).not.toContain("1 warnings");
  });

  it("ignores unexpected Visual Review severities in the summary without crashing", async () => {
    const view = await render(
      <DevopsEvidencePanel
        task={taskWithVisualReview([
          {
            severity: "CRITICAL",
            category: "layout",
            title: "Unexpected severity remains visible",
            description: "The runtime finding should still render in the detailed list.",
          } as never,
          { severity: "INFO", category: "other", title: "Supported severity", description: "This finding is counted." },
        ])}
      />,
    );

    expect(view.textContent).toContain("1 info");
    expect(view.textContent).not.toContain("CRITICAL");
    expect(view.textContent).toContain("Severity unknown");
    expect(view.textContent).toContain("Unexpected severity remains visible");
  });

  it("keeps detailed Visual Review findings visible with severity and description", async () => {
    const view = await render(
      <DevopsEvidencePanel
        task={taskWithVisualReview([
          { severity: "ERROR", category: "layout", title: "Panel overlap", description: "The evidence panel overlaps adjacent content." },
        ])}
      />,
    );

    expect(view.querySelector('ul[aria-label="Visual Review findings"]')).not.toBeNull();
    expect(view.textContent).toContain("Panel overlap");
    expect(view.textContent).toContain("ERROR");
    expect(view.textContent).toContain("The evidence panel overlaps adjacent content.");
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

describe("Pull Request evidence panel", () => {
  it("renders authoritative pull request evidence, visible state text, branches, commit, timestamp, and a safe GitHub link", async () => {
    const view = await render(<PullRequestEvidencePanel task={taskWithAllEvidence()} />);

    expect(view.querySelector("h2")?.textContent).toBe("Pull Request");
    expect(view.textContent).toContain("#42");
    expect(view.textContent).toContain("Open");
    expect(view.textContent).toContain("devcrew/task-task_123");
    expect(view.textContent).toContain("main");
    expect(view.textContent).toContain("a84f72c");
    expect(view.textContent).toContain("PR created");
    expect(view.textContent).toContain("Aug 3, 2026, 12:25 PM");
    expect(view.querySelector('button[aria-label="Copy commit SHA"]')).not.toBeNull();

    const link = view.querySelector('a[aria-label="View pull request #42 on GitHub"]');
    expect(link?.getAttribute("href")).toBe("https://github.com/acme/backend-project/pull/42");
    expect(link?.getAttribute("target")).toBe("_blank");
    expect(link?.getAttribute("rel")).toBe("noopener noreferrer");
  });

  it("copies the exact authoritative pull request commit SHA", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
    const prTask = taskWithAllEvidence();
    prTask.pullRequest = {
      ...prTask.pullRequest!,
      commitSha: "0123456789abcdef0123456789abcdef01234567",
    };
    const view = await render(<PullRequestEvidencePanel task={prTask} />);

    view.querySelector<HTMLButtonElement>('button[aria-label="Copy commit SHA"]')?.click();

    expect(writeText).toHaveBeenCalledWith("0123456789abcdef0123456789abcdef01234567");
  });

  it("renders CLOSED pull request state as Closed", async () => {
    const closedTask = taskWithAllEvidence();
    closedTask.pullRequest = { ...closedTask.pullRequest!, state: "CLOSED" };

    const view = await render(<PullRequestEvidencePanel task={closedTask} />);

    expect(view.textContent).toContain("Closed");
    expect(view.textContent).toContain("#42");
  });

  it("renders MERGED pull request state as Merged", async () => {
    const mergedTask = taskWithAllEvidence();
    mergedTask.pullRequest = { ...mergedTask.pullRequest!, state: "MERGED" };

    const view = await render(<PullRequestEvidencePanel task={mergedTask} />);

    expect(view.textContent).toContain("Merged");
    expect(view.textContent).toContain("#42");
  });

  it("renders an optional backend title when the current contract provides one", async () => {
    const titledTask = taskWithAllEvidence();
    titledTask.pullRequest = {
      ...titledTask.pullRequest!,
      title: "A long pull request title that should wrap safely instead of forcing horizontal overflow",
    } as never;

    const view = await render(<PullRequestEvidencePanel task={titledTask} />);
    expect(view.textContent).toContain("A long pull request title");
    expect([...view.querySelectorAll("p")].find((item) => item.textContent?.includes("A long pull request title"))?.className).toMatch(/break-words/);
  });

  it("renders a deliberate no-PR state without fixture pull request data", async () => {
    const view = await render(<PullRequestEvidencePanel task={task()} />);
    expect(view.textContent).toContain("Pull request has not been created yet.");
    expect(view.textContent).not.toContain("#42");
    expect(view.textContent).not.toContain("devcrew/task-task_123");
    expect(view.querySelector("a")).toBeNull();
  });

  it("handles missing optional fields without crashing", async () => {
    const missingFields = taskWithAllEvidence();
    missingFields.pullRequest = {
      number: 7,
      url: "https://github.com/acme/backend-project/pull/7",
      state: "OPEN",
      headBranch: "",
      baseBranch: "",
      commitSha: "",
      createdAt: "",
    };

    const view = await render(<PullRequestEvidencePanel task={missingFields} />);
    expect(view.textContent).toContain("#7");
    expect(view.textContent).toContain("Open");
    expect(view.textContent).toContain("Timestamp unavailable");
    expect(view.textContent).not.toContain("undefined");
    expect(view.querySelector('button[aria-label="Copy commit SHA"]')).toBeNull();
  });

  it("does not render malformed or unsupported pull request URLs as clickable links", async () => {
    const malformed = taskWithAllEvidence();
    malformed.pullRequest = { ...malformed.pullRequest!, url: "not a url" };
    const malformedView = await render(<PullRequestEvidencePanel task={malformed} />);
    expect(malformedView.textContent).toContain("#42");
    expect(malformedView.querySelector("a")).toBeNull();

    await act(async () => root?.unmount());
    root = undefined;
    container?.remove();
    container = undefined;

    const unsupported = taskWithAllEvidence();
    unsupported.pullRequest = { ...unsupported.pullRequest!, url: "javascript:alert(1)" };
    const unsupportedView = await render(<PullRequestEvidencePanel task={unsupported} />);
    expect(unsupportedView.textContent).toContain("#42");
    expect(unsupportedView.querySelector("a")).toBeNull();
  });

  it("wraps long branch names and uses a neutral fallback for unknown pull request states", async () => {
    const longBranchTask = taskWithAllEvidence();
    longBranchTask.pullRequest = {
      ...longBranchTask.pullRequest!,
      state: "DRAFT",
      headBranch: "devcrew/task-with-a-very-long-source-branch-name-that-must-wrap-safely-at-mobile-width",
      baseBranch: "main-with-a-very-long-target-branch-name-that-must-wrap-safely",
    } as never;

    const view = await render(<PullRequestEvidencePanel task={longBranchTask} />);
    expect(view.textContent).toContain("PR state unavailable");
    expect(view.textContent).toContain("very-long-source-branch-name");
    expect(view.textContent).toContain("very-long-target-branch-name");
    expect([...view.querySelectorAll("span")].find((item) => item.textContent?.includes("very-long-source-branch-name"))?.className).toMatch(/break-all/);
  });

  it("preserves branch metadata, commit copy action, timestamp, and link while highlighting state", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
    const view = await render(<PullRequestEvidencePanel task={taskWithAllEvidence()} />);

    expect(view.textContent).toContain("Open");
    expect(view.textContent).toContain("devcrew/task-task_123");
    expect(view.textContent).toContain("main");
    expect(view.textContent).toContain("a84f72c");
    expect(view.textContent).toContain("Aug 3, 2026, 12:25 PM");
    expect(view.querySelector('a[aria-label="View pull request #42 on GitHub"]')).not.toBeNull();

    view.querySelector<HTMLButtonElement>('button[aria-label="Copy commit SHA"]')?.click();
    expect(writeText).toHaveBeenCalledWith("a84f72c");
  });
});

describe("Cancellation evidence panel", () => {
  it("renders CANCELLED as Task cancelled with cancelledAt and safe summary", async () => {
    const view = await render(
      <CancellationEvidencePanel
        task={task({
          cancellation: {
            status: "CANCELLED",
            requestedAt: "2026-08-03T12:30:00.000Z",
            cancelledAt: "2026-08-03T12:31:00.000Z",
            summary: "Task cancellation completed after active work stopped.",
          },
        })}
      />,
    );

    expect(view.querySelector("h2")?.textContent).toBe("Cancellation");
    expect(view.textContent).toContain("Task cancelled");
    expect(view.textContent).toContain("Task cancellation completed after active work stopped.");
    expect(view.textContent).toContain("Cancellation completed");
    expect(view.textContent).toContain("Aug 3, 2026, 12:31 PM");
    expect(view.querySelector("time")?.getAttribute("dateTime")).toBe("2026-08-03T12:31:00.000Z");
  });

  it("renders REQUESTED as Cancellation requested with requestedAt", async () => {
    const view = await render(
      <CancellationEvidencePanel
        task={task({
          cancellation: {
            status: "REQUESTED",
            requestedAt: "2026-08-03T12:30:00.000Z",
            summary: "Task cancellation requested.",
          },
        })}
      />,
    );

    expect(view.textContent).toContain("Cancellation requested");
    expect(view.textContent).toContain("Task cancellation requested.");
    expect(view.textContent).toContain("Aug 3, 2026, 12:30 PM");
    expect(view.querySelector("time")?.getAttribute("dateTime")).toBe("2026-08-03T12:30:00.000Z");
  });

  it("renders FAILED and unknown runtime states with neutral safe fallback text", async () => {
    const failedView = await render(
      <CancellationEvidencePanel
        task={task({
          cancellation: {
            status: "FAILED",
            requestedAt: "2026-08-03T12:30:00.000Z",
            summary: "Cancellation cleanup requires human inspection.",
          },
        })}
      />,
    );
    expect(failedView.textContent).toContain("Cancellation state needs review");
    expect(failedView.textContent).toContain("Cancellation cleanup requires human inspection.");

    await act(async () => root?.unmount());
    root = undefined;
    container?.remove();
    container = undefined;

    const unknownView = await render(
      <CancellationEvidencePanel
        task={task({
          cancellation: {
            status: "PARTIAL",
            requestedAt: "not-a-timestamp",
            summary: "Unknown public cancellation state.",
          } as never,
        })}
      />,
    );
    expect(unknownView.textContent).toContain("Cancellation state unavailable");
    expect(unknownView.textContent).toContain("Timestamp unavailable");
  });

  it("wraps long summaries and renders nothing when cancellation evidence is absent", async () => {
    const longSummary =
      "A very long cancellation summary with identifier_that_should_wrap_safely_at_mobile_width_without_forcing_horizontal_overflow.";
    const view = await render(
      <CancellationEvidencePanel
        task={task({
          cancellation: {
            status: "CANCELLED",
            requestedAt: "2026-08-03T12:30:00.000Z",
            summary: longSummary,
          },
        })}
      />,
    );

    expect(view.textContent).toContain(longSummary);
    expect([...view.querySelectorAll("p")].find((item) => item.textContent?.includes(longSummary))?.className).toMatch(/break-words/);

    await act(async () => root?.unmount());
    root = undefined;
    container?.remove();
    container = undefined;

    const emptyView = await render(<CancellationEvidencePanel task={task()} />);
    expect(emptyView.textContent).not.toContain("Cancellation");
    expect(emptyView.querySelector("section")).toBeNull();
  });
});

describe("Retry recovery evidence panel", () => {
  it("renders retry-available state from authoritative retry recovery evidence", async () => {
    const view = await render(
      <RetryRecoveryEvidencePanel
        task={task({
          retryRecovery: {
            failedStage: "REVIEWER",
            retryAvailable: true,
            exhausted: false,
            attempts: [retryAttempt()],
          },
        })}
      />,
    );

    expect(view.querySelector("h2")?.textContent).toBe("Retry recovery");
    expect(view.textContent).toContain("Retry available");
    expect(view.textContent).toContain("Backend retry evidence shows a retry is available.");
  });

  it("renders exhausted state as Retry exhausted with priority over retry availability", async () => {
    const view = await render(
      <RetryRecoveryEvidencePanel
        task={task({
          retryRecovery: {
            failedStage: "DEVOPS",
            retryAvailable: true,
            exhausted: true,
            attempts: [retryAttempt({ stage: "DEVOPS" }), retryAttempt({ stage: "DEVOPS", attempt: 2 })],
          },
        })}
      />,
    );

    expect(view.textContent).toContain("Retry exhausted");
    expect(view.textContent).not.toContain("Retry available");
  });

  it("renders recovered/succeeded retry state only when the latest authoritative attempt succeeded", async () => {
    const view = await render(
      <RetryRecoveryEvidencePanel
        task={task({
          retryRecovery: {
            retryAvailable: false,
            exhausted: false,
            attempts: [
              retryAttempt({ attempt: 1, status: "FAILED" }),
              retryAttempt({ attempt: 2, status: "SUCCEEDED", retryable: false }),
            ],
          },
        })}
      />,
    );

    expect(view.textContent).toContain("Recovered after retry");
    expect(view.textContent).toContain("Backend retry evidence shows the latest retry succeeded.");
  });

  it("renders failed stage when available using safe user-facing labels", async () => {
    const view = await render(
      <RetryRecoveryEvidencePanel
        task={task({
          retryRecovery: {
            failedStage: "VISUAL_REVIEW",
            retryAvailable: true,
            attempts: [retryAttempt({ stage: "VISUAL_REVIEW" })],
          },
        })}
      />,
    );

    expect(view.textContent).toContain("Failed stage: Visual Review");
    expect(view.textContent).not.toContain("VISUAL_REVIEW");
  });

  it("renders attempt count from the authoritative attempts array", async () => {
    const view = await render(
      <RetryRecoveryEvidencePanel
        task={task({
          retryRecovery: {
            retryAvailable: false,
            exhausted: true,
            attempts: [retryAttempt(), retryAttempt({ attempt: 2 })],
          },
        })}
      />,
    );

    expect(view.textContent).toContain("2 attempts");
  });

  it("renders singular attempt count correctly", async () => {
    const view = await render(
      <RetryRecoveryEvidencePanel
        task={task({
          retryRecovery: {
            retryAvailable: true,
            attempts: [retryAttempt()],
          },
        })}
      />,
    );

    expect(view.textContent).toContain("1 attempt");
    expect(view.textContent).not.toContain("1 attempts");
  });

  it("renders no panel when retryRecovery evidence is missing", async () => {
    const view = await render(<RetryRecoveryEvidencePanel task={task()} />);

    expect(view.textContent).not.toContain("Retry recovery");
    expect(view.querySelector("section")).toBeNull();
  });

  it("uses neutral safe retry text without fabricating success or failure", async () => {
    const view = await render(
      <RetryRecoveryEvidencePanel
        task={task({
          retryRecovery: {
            retryAvailable: false,
            exhausted: false,
            attempts: [retryAttempt({ status: "FAILED", retryable: false })],
          },
        })}
      />,
    );

    expect(view.textContent).toContain("Retry evidence recorded");
    expect(view.textContent).not.toContain("Recovered after retry");
    expect(view.textContent).not.toContain("Retry exhausted");
  });

  it("does not render raw or internal retry attempt information", async () => {
    const view = await render(
      <RetryRecoveryEvidencePanel
        task={task({
          retryRecovery: {
            failedStage: "DEVELOPER",
            retryAvailable: true,
            attempts: [
              retryAttempt({
                stage: "DEVELOPER",
                category: "MODEL_OUTPUT_SCHEMA_INVALID",
                summary: "Raw command npm run secret with /Users/suniltulsiani/Desktop/devcrew-ui and TOKEN_SHOULD_NOT_RENDER",
              }),
            ],
          },
        })}
      />,
    );

    expect(view.textContent).toContain("Failed stage: Developer");
    expect(view.textContent).not.toContain("MODEL_OUTPUT_SCHEMA_INVALID");
    expect(view.textContent).not.toContain("npm run secret");
    expect(view.textContent).not.toContain("/Users/suniltulsiani");
    expect(view.textContent).not.toContain("TOKEN_SHOULD_NOT_RENDER");
  });
});

describe("Visual Repair evidence panel", () => {
  it("renders PASSED visual repair clearly", async () => {
    const view = await render(
      <VisualRepairEvidencePanel
        task={task({
          visualRepair: {
            maxAttempts: 2,
            outcome: "PASSED",
            attempts: [visualRepairAttempt()],
          },
        })}
      />,
    );

    expect(view.querySelector("h2")?.textContent).toBe("Visual Repair");
    expect(view.textContent).toContain("Visual repair passed");
    expect(view.textContent).toContain("Backend visual repair evidence shows the repair passed.");
  });

  it("renders EXHAUSTED visual repair clearly", async () => {
    const view = await render(
      <VisualRepairEvidencePanel
        task={task({
          visualRepair: {
            maxAttempts: 2,
            outcome: "EXHAUSTED",
            attempts: [visualRepairAttempt(), visualRepairAttempt({ attempt: 2 })],
          },
        })}
      />,
    );

    expect(view.textContent).toContain("Visual repair exhausted");
    expect(view.textContent).toContain("Backend visual repair evidence shows repair attempts were exhausted.");
  });

  it("renders attempt count from the authoritative attempts array", async () => {
    const view = await render(
      <VisualRepairEvidencePanel
        task={task({
          visualRepair: {
            maxAttempts: 2,
            outcome: "EXHAUSTED",
            attempts: [visualRepairAttempt(), visualRepairAttempt({ attempt: 2 })],
          },
        })}
      />,
    );

    expect(view.textContent).toContain("2 attempts");
  });

  it("renders singular visual repair attempt count correctly", async () => {
    const view = await render(
      <VisualRepairEvidencePanel
        task={task({
          visualRepair: {
            maxAttempts: 2,
            outcome: "PASSED",
            attempts: [visualRepairAttempt()],
          },
        })}
      />,
    );

    expect(view.textContent).toContain("1 attempt");
    expect(view.textContent).not.toContain("1 attempts");
  });

  it("renders multiple attempts in authoritative order and preserves previous attempts", async () => {
    const view = await render(
      <VisualRepairEvidencePanel
        task={task({
          visualRepair: {
            maxAttempts: 2,
            outcome: "PASSED",
            attempts: [
              visualRepairAttempt({
                attempt: 1,
                sourceScreenshotId: "shot_first_source",
                screenshotId: "shot_first_repair",
                developer: { summary: "First repair summary remains visible.", changedFiles: [] },
                visualReview: { status: "FAILED", summary: "First repair still failed.", findingCount: 1 },
              }),
              visualRepairAttempt({
                attempt: 2,
                sourceScreenshotId: "shot_second_source",
                screenshotId: "shot_second_repair",
                developer: { summary: "Second repair summary remains visible.", changedFiles: [] },
                visualReview: { status: "PASSED", summary: "Second repair passed.", findingCount: 0 },
              }),
            ],
          },
        })}
      />,
    );

    expect([...view.querySelectorAll("h4")].map((heading) => heading.textContent)).toEqual(["Attempt 1", "Attempt 2"]);
    expect(view.textContent).toContain("First repair summary remains visible.");
    expect(view.textContent).toContain("Second repair summary remains visible.");
    expect(view.textContent).toContain("shot_first_repair");
    expect(view.textContent).toContain("shot_second_repair");
  });

  it("renders safe Developer summary when present", async () => {
    const view = await render(
      <VisualRepairEvidencePanel
        task={task({
          visualRepair: {
            maxAttempts: 2,
            attempts: [
              visualRepairAttempt({
                developer: {
                  summary: "Safe Developer repair summary with long_identifier_that_should_wrap_safely.",
                  changedFiles: ["components/activity/visual-repair-evidence-panel.tsx"],
                },
              }),
            ],
          },
        })}
      />,
    );

    expect(view.textContent).toContain("Safe Developer repair summary");
    expect([...view.querySelectorAll("p")].find((item) => item.textContent?.includes("Safe Developer repair summary"))?.className).toMatch(/break-words/);
  });

  it("renders screenshot references safely when present", async () => {
    const view = await render(
      <VisualRepairEvidencePanel
        task={task({
          visualRepair: {
            maxAttempts: 2,
            attempts: [visualRepairAttempt({ sourceScreenshotId: "shot_source_safe", screenshotId: "shot_repair_safe" })],
          },
        })}
      />,
    );

    expect(view.textContent).toContain("Source screenshot");
    expect(view.textContent).toContain("shot_source_safe");
    expect(view.textContent).toContain("Repair screenshot");
    expect(view.textContent).toContain("shot_repair_safe");
    expect(view.querySelector("a")).toBeNull();
  });

  it("renders Visual Review result and safe summary when present", async () => {
    const view = await render(
      <VisualRepairEvidencePanel
        task={task({
          visualRepair: {
            maxAttempts: 2,
            attempts: [
              visualRepairAttempt({
                visualReview: {
                  status: "FAILED",
                  summary: "Visual Review failed after the first repair.",
                  findingCount: 3,
                },
              }),
            ],
          },
        })}
      />,
    );

    expect(view.textContent).toContain("Visual Review FAILED");
    expect(view.textContent).toContain("Visual Review failed after the first repair.");
    expect(view.textContent).toContain("3 findings");
  });

  it("renders no panel when visualRepair evidence is missing", async () => {
    const view = await render(<VisualRepairEvidencePanel task={task()} />);

    expect(view.textContent).not.toContain("Visual Repair");
    expect(view.querySelector("section")).toBeNull();
  });

  it("does not render unsafe or internal visual repair fields", async () => {
    const view = await render(
      <VisualRepairEvidencePanel
        task={task({
          visualRepair: {
            maxAttempts: 2,
            attempts: [
              {
                ...visualRepairAttempt(),
                rawPrompt: "RAW_PROMPT_SHOULD_NOT_RENDER",
                providerPayload: "PROVIDER_PAYLOAD_SHOULD_NOT_RENDER",
                screenshotPath: "/Users/suniltulsiani/Desktop/devcrew-ui/.artifacts/shot.png",
                stdout: "STDOUT_SHOULD_NOT_RENDER",
                stderr: "STDERR_SHOULD_NOT_RENDER",
                stackTrace: "STACK_TRACE_SHOULD_NOT_RENDER",
                developer: {
                  summary: "Safe repair summary.",
                  changedFiles: ["/Users/suniltulsiani/Desktop/devcrew-ui/secret.ts"],
                  rawModelResponse: "RAW_MODEL_RESPONSE_SHOULD_NOT_RENDER",
                },
              } as never,
            ],
          },
        })}
      />,
    );

    expect(view.textContent).toContain("Safe repair summary.");
    expect(view.textContent).not.toContain("RAW_PROMPT_SHOULD_NOT_RENDER");
    expect(view.textContent).not.toContain("PROVIDER_PAYLOAD_SHOULD_NOT_RENDER");
    expect(view.textContent).not.toContain("/Users/suniltulsiani");
    expect(view.textContent).not.toContain("STDOUT_SHOULD_NOT_RENDER");
    expect(view.textContent).not.toContain("STDERR_SHOULD_NOT_RENDER");
    expect(view.textContent).not.toContain("STACK_TRACE_SHOULD_NOT_RENDER");
    expect(view.textContent).not.toContain("RAW_MODEL_RESPONSE_SHOULD_NOT_RENDER");
    expect(view.textContent).not.toContain("secret.ts");
  });

  it("uses neutral safe fallback text for unknown or missing outcome", async () => {
    const missingOutcomeView = await render(
      <VisualRepairEvidencePanel
        task={task({
          visualRepair: {
            maxAttempts: 2,
            attempts: [visualRepairAttempt()],
          },
        })}
      />,
    );
    expect(missingOutcomeView.textContent).toContain("Visual repair recorded");
    expect(missingOutcomeView.textContent).not.toContain("Visual repair passed");

    await act(async () => root?.unmount());
    root = undefined;
    container?.remove();
    container = undefined;

    const unknownOutcomeView = await render(
      <VisualRepairEvidencePanel
        task={task({
          visualRepair: {
            maxAttempts: 2,
            outcome: "PARTIAL",
            attempts: [visualRepairAttempt()],
          } as never,
        })}
      />,
    );
    expect(unknownOutcomeView.textContent).toContain("Visual repair recorded");
    expect(unknownOutcomeView.textContent).not.toContain("Visual repair exhausted");
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
      expect.arrayContaining(["Developer evidence", "DevOps evidence", "Reviewer evidence", "Pull Request"]),
    );
    expect(view.querySelector('ul[aria-label="Proposed files"]')).not.toBeNull();
    expect(view.querySelector('ul[aria-label="Validation checks"]')).not.toBeNull();
    expect(view.querySelector('ul[aria-label="Reviewer findings"]')).not.toBeNull();
    expect(view.textContent).toContain("#42");
    expect(view.textContent).toContain("devcrew/task-task_123");
  });

  it("places retry recovery evidence with existing structured evidence panels unchanged", async () => {
    workflowState = {
      project: project(),
      task: taskWithAllEvidence({
        retryRecovery: {
          failedStage: "REVIEWER",
          retryAvailable: true,
          exhausted: false,
          attempts: [retryAttempt()],
        },
      }),
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
    const headings = [...view.querySelectorAll("h2")].map((heading) => heading.textContent);

    expect(headings.indexOf("Retry recovery")).toBeGreaterThan(-1);
    expect(headings.indexOf("Retry recovery")).toBeLessThan(headings.indexOf("Developer evidence"));
    expect(headings).toEqual(expect.arrayContaining(["Developer evidence", "DevOps evidence", "Reviewer evidence", "Pull Request"]));
    expect(view.textContent).toContain("Prepared an implementation proposal");
    expect(view.textContent).toContain("Validation passed");
    expect(view.textContent).toContain("Review approved the structured evidence presentation.");
    expect(view.textContent).toContain("#42");
  });

  it("places visual repair history with existing structured evidence panels unchanged", async () => {
    workflowState = {
      project: project(),
      task: taskWithAllEvidence({
        visualRepair: {
          maxAttempts: 2,
          outcome: "PASSED",
          attempts: [
            visualRepairAttempt({
              attempt: 1,
              developer: { summary: "First repair attempt stays visible in Activity.", changedFiles: [] },
              visualReview: { status: "FAILED", summary: "First repair still had visual issues.", findingCount: 1 },
            }),
            visualRepairAttempt({
              attempt: 2,
              developer: { summary: "Second repair attempt passed in Activity.", changedFiles: [] },
              visualReview: { status: "PASSED", summary: "Second repair passed visual review.", findingCount: 0 },
            }),
          ],
        },
      }),
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
    const headings = [...view.querySelectorAll("h2")].map((heading) => heading.textContent);

    expect(headings.indexOf("Visual Repair")).toBeGreaterThan(headings.indexOf("DevOps evidence"));
    expect(headings.indexOf("Visual Repair")).toBeLessThan(headings.indexOf("Reviewer evidence"));
    expect(headings).toEqual(expect.arrayContaining(["Developer evidence", "DevOps evidence", "Reviewer evidence", "Pull Request"]));
    expect(view.textContent).toContain("Visual repair passed");
    expect(view.textContent).toContain("2 attempts");
    expect(view.textContent).toContain("First repair attempt stays visible in Activity.");
    expect(view.textContent).toContain("Second repair attempt passed in Activity.");
    expect(view.textContent).toContain("Prepared an implementation proposal");
    expect(view.textContent).toContain("Validation passed");
    expect(view.textContent).toContain("Review approved the structured evidence presentation.");
    expect(view.textContent).toContain("#42");
  });

  it("places authoritative cancellation state before existing stage evidence panels", async () => {
    workflowState = {
      project: project(),
      task: taskWithAllEvidence({
        cancellation: {
          status: "CANCELLED",
          requestedAt: "2026-08-03T12:30:00.000Z",
          cancelledAt: "2026-08-03T12:31:00.000Z",
          summary: "Task cancelled by backend authority.",
        },
      }),
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
    const headings = [...view.querySelectorAll("h2")].map((heading) => heading.textContent);

    expect(headings.indexOf("Cancellation")).toBeGreaterThan(-1);
    expect(headings.indexOf("Cancellation")).toBeLessThan(headings.indexOf("Developer evidence"));
    expect(view.textContent).toContain("Task cancelled by backend authority.");
    expect(view.textContent).toContain("Developer evidence");
    expect(view.textContent).toContain("DevOps evidence");
    expect(view.textContent).toContain("Reviewer evidence");
    expect(view.textContent).toContain("Pull Request");
  });

  it("does not infer cancellation state from TASK_CANCELLED timeline events", async () => {
    workflowState = {
      project: project(),
      task: taskWithAllEvidence(),
      initializing: false,
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
          id: "evt_cancelled",
          sequence: 1,
          projectId: "proj_1",
          taskId: "task_1",
          type: "TASK_CANCELLED",
          actor: { kind: "SYSTEM" },
          summary: "Task cancelled",
          createdAt: "2026-08-03T12:31:00.000Z",
        },
      ],
      connection: "connected",
      lastSequence: 1,
    };

    const view = await render(
      <WorkspaceStateProvider>
        <ActivityWorkspace />
      </WorkspaceStateProvider>,
    );

    expect(view.textContent).toContain("Task cancelled");
    expect([...view.querySelectorAll("h2")].map((heading) => heading.textContent)).not.toContain("Cancellation");
  });

  it("does not infer retry state from retry timeline events alone", async () => {
    workflowState = {
      project: project(),
      task: taskWithAllEvidence(),
      initializing: false,
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
          id: "evt_retry_started",
          sequence: 1,
          projectId: "proj_1",
          taskId: "task_1",
          type: "RETRY_STARTED",
          actor: { kind: "SYSTEM" },
          summary: "Retry started for reviewer.",
          createdAt: "2026-08-03T12:17:00.000Z",
        },
        {
          id: "evt_retry_completed",
          sequence: 2,
          projectId: "proj_1",
          taskId: "task_1",
          type: "RETRY_COMPLETED",
          actor: { kind: "SYSTEM" },
          summary: "Retry completed after recovery.",
          createdAt: "2026-08-03T12:18:00.000Z",
        },
        {
          id: "evt_retry_exhausted",
          sequence: 3,
          projectId: "proj_1",
          taskId: "task_1",
          type: "RETRY_EXHAUSTED",
          actor: { kind: "SYSTEM" },
          summary: "Retry exhausted.",
          createdAt: "2026-08-03T12:19:00.000Z",
        },
      ],
      connection: "connected",
      lastSequence: 3,
    };

    const view = await render(
      <WorkspaceStateProvider>
        <ActivityWorkspace />
      </WorkspaceStateProvider>,
    );

    expect(view.textContent).toContain("Retry started");
    expect(view.textContent).toContain("Retry completed");
    expect(view.textContent).toContain("Retry exhausted");
    expect([...view.querySelectorAll("h2")].map((heading) => heading.textContent)).not.toContain("Retry recovery");
  });

  it("does not infer visual repair state from visual repair timeline events alone", async () => {
    workflowState = {
      project: project(),
      task: taskWithAllEvidence(),
      initializing: false,
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
          id: "evt_visual_repair_started",
          sequence: 1,
          projectId: "proj_1",
          taskId: "task_1",
          type: "VISUAL_REPAIR_STARTED",
          actor: { kind: "SYSTEM" },
          summary: "Visual repair started.",
          createdAt: "2026-08-03T12:14:00.000Z",
        },
        {
          id: "evt_visual_repair_completed",
          sequence: 2,
          projectId: "proj_1",
          taskId: "task_1",
          type: "VISUAL_REPAIR_COMPLETED",
          actor: { kind: "SYSTEM" },
          summary: "Visual repair completed.",
          createdAt: "2026-08-03T12:18:00.000Z",
        },
        {
          id: "evt_visual_repair_exhausted",
          sequence: 3,
          projectId: "proj_1",
          taskId: "task_1",
          type: "VISUAL_REPAIR_EXHAUSTED",
          actor: { kind: "SYSTEM" },
          summary: "Visual repair exhausted.",
          createdAt: "2026-08-03T12:20:00.000Z",
        },
      ],
      connection: "connected",
      lastSequence: 3,
    };

    const view = await render(
      <WorkspaceStateProvider>
        <ActivityWorkspace />
      </WorkspaceStateProvider>,
    );

    expect(view.textContent).toContain("Visual repair started");
    expect(view.textContent).toContain("Visual repair completed");
    expect(view.textContent).toContain("Visual repair exhausted");
    expect([...view.querySelectorAll("h2")].map((heading) => heading.textContent)).not.toContain("Visual Repair");
  });

  it("does not infer pull request state from PULL_REQUEST_CREATED timeline events alone", async () => {
    workflowState = {
      project: project(),
      task: taskWithAllEvidence({ pullRequest: undefined }),
      initializing: false,
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
          id: "evt_pr_created",
          sequence: 1,
          projectId: "proj_1",
          taskId: "task_1",
          type: "PULL_REQUEST_CREATED",
          actor: { kind: "SYSTEM" },
          summary: "Pull request created with event text that says OPEN.",
          createdAt: "2026-08-03T12:25:00.000Z",
        },
      ],
      connection: "connected",
      lastSequence: 1,
    };

    const view = await render(
      <WorkspaceStateProvider>
        <ActivityWorkspace />
      </WorkspaceStateProvider>,
    );
    const pullRequestHeading = [...view.querySelectorAll("h2")].find((heading) => heading.textContent === "Pull Request");
    const pullRequestPanel = pullRequestHeading?.closest("section");

    expect(view.textContent).toContain("Pull request created with event text that says OPEN.");
    expect(pullRequestPanel?.textContent).toContain("Not created");
    expect(pullRequestPanel?.textContent).toContain("Pull request has not been created yet.");
    expect(pullRequestPanel?.textContent).not.toContain("Open");
    expect(pullRequestPanel?.textContent).not.toContain("Closed");
    expect(pullRequestPanel?.textContent).not.toContain("Merged");
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
    expect(view.textContent).toContain("Pull request has not been created yet.");
    expect(view.textContent).not.toContain("Prepared an implementation proposal");
    expect(view.textContent).not.toContain("#42");
  });
});

import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { ActivityWorkspace } from "@/components/activity/activity-workspace";
import { AppShell } from "@/components/shell/app-shell";
import { ProjectsWorkspace } from "@/components/workspace/fixture-pages";
import type { ProjectWorkflowState } from "@/hooks/use-project-workflow";
import type { ProjectActivityState } from "@/hooks/use-project-activity";
import type { ProjectSnapshot, TaskSnapshot } from "@/lib/api-types";

vi.mock("next/navigation", () => ({ usePathname: () => "/" }));
vi.mock("next/link", () => ({
  default: ({ children, href, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => <a href={String(href)} {...props}>{children}</a>,
}));
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
  window.requestAnimationFrame = (callback) => window.setTimeout(callback, 0);
});

afterEach(async () => {
  if (root) await act(async () => root?.unmount());
  container?.remove();
  root = undefined;
  container = undefined;
  document.body.style.overflow = "";
  vi.restoreAllMocks();
});

function backendProject(overrides: Partial<ProjectSnapshot> = {}): ProjectSnapshot {
  return {
    id: "proj_authoritative_123",
    name: "Customer Portal Reliability Upgrade",
    status: "REPOSITORY_CONNECTED",
    repository: {
      id: "repo_authoritative_123",
      publicRepositoryUrl: "https://github.com/acme/customer-portal-reliability-upgrade",
      preparedRepositoryId: "prepared_customer_portal",
    },
    createdAt: "2026-08-03T00:00:00.000Z",
    updatedAt: "2026-08-03T00:00:00.000Z",
    ...overrides,
  };
}

function task(projectId = "proj_authoritative_123"): TaskSnapshot {
  return {
    id: "task_1",
    projectId,
    title: "Focused task",
    description: "Run the workflow.",
    status: "WAITING_FOR_APPROVAL",
    plan: { summary: "Implement requested engineering task.", steps: ["Inspect", "Implement"] },
    createdAt: "2026-08-03T00:00:00.000Z",
    updatedAt: "2026-08-03T00:00:00.000Z",
  };
}

function workflow(project?: ProjectSnapshot): ProjectWorkflowState {
  return {
    project,
    task: project ? task(project.id) : undefined,
    initializing: project === undefined,
    approve: vi.fn(),
    reject: vi.fn(),
    execute: vi.fn(),
    validate: vi.fn(),
    review: vi.fn(),
    fetchTask: vi.fn(),
  };
}

async function render(node: React.ReactNode) {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () => root?.render(node));
  return container;
}

async function rerender(node: React.ReactNode) {
  await act(async () => root?.render(node));
  return container!;
}

function setProject(project?: ProjectSnapshot) {
  workflowState = workflow(project);
  activityState = {
    events: [],
    connection: "connected",
    lastSequence: 0,
  };
}

describe("authoritative project identity", () => {
  it("preserves a clearly labeled fixture fallback before project creation", async () => {
    setProject(undefined);
    const view = await render(<AppShell><div /></AppShell>);

    expect(view.textContent).toContain("Devcrew MVP");
    expect(view.textContent).toContain("Fixture setup fallback");
    expect(view.textContent).toContain("suniltulsiani/devcrew");
  });

  it("updates the project selector immediately when the backend project appears", async () => {
    setProject(undefined);
    let view = await render(<AppShell><div /></AppShell>);
    expect(view.textContent).toContain("Fixture setup fallback");

    const project = backendProject();
    setProject(project);
    view = await rerender(<AppShell><div /></AppShell>);

    expect(view.textContent).toContain(project.name);
    expect(view.textContent).toContain(project.repository.publicRepositoryUrl);
    expect(view.textContent).toContain(`Project ID ${project.id}`);
    expect(view.textContent).not.toContain("Devcrew MVP");
  });

  it("updates sidebar and right rail identity from the backend project without invented metadata", async () => {
    const project = backendProject();
    setProject(project);
    const view = await render(<AppShell><div /></AppShell>);

    expect(view.textContent).toContain(project.name);
    expect(view.textContent).toContain(project.repository.publicRepositoryUrl);
    expect(view.textContent).toContain(`Project ID ${project.id}`);
    expect(view.textContent).not.toContain("sprint-2-ui-fidelity");
    expect(view.textContent).not.toContain("Prepared local worktree");
    expect(view.textContent).not.toContain("4 fixed roles");
    expect(view.textContent).not.toContain("suniltulsiani/devcrew");
  });

  it("updates the Projects page from the authoritative backend project", async () => {
    const project = backendProject();
    setProject(project);
    const view = await render(<AppShell><ProjectsWorkspace /></AppShell>);

    expect(view.textContent).toContain("1 backend project · authoritative");
    expect(view.textContent).toContain(project.name);
    expect(view.textContent).toContain(project.repository.publicRepositoryUrl);
    expect(view.textContent).toContain(project.id);
    expect(view.textContent).not.toContain("Design reference");
    expect(view.textContent).not.toContain("sprint-2-ui-fidelity");
  });

  it("keeps Activity workflow controls functional while using shared project identity", async () => {
    const project = backendProject();
    setProject(project);
    const view = await render(<AppShell><ActivityWorkspace /></AppShell>);

    expect(view.textContent).toContain(project.name);
    expect(view.textContent).toContain(project.id);
    expect(view.textContent).not.toContain("Devcrew MVP");
    expect(view.querySelector<HTMLButtonElement>("button:not([aria-pressed])")?.disabled).toBe(false);
  });

  it("renders long project names and repository URLs in constrained, wrappable elements", async () => {
    const longProject = backendProject({
      id: "proj_very_long_authoritative_identifier_1234567890",
      name: "Extremely Long Customer Portal Reliability Upgrade With Several Product Boundaries",
      repository: {
        id: "repo_long",
        preparedRepositoryId: "prepared_long",
        publicRepositoryUrl: "https://github.com/acme/extremely-long-customer-portal-reliability-upgrade-with-several-product-boundaries-and-a-long-repository-name",
      },
    });
    setProject(longProject);
    const view = await render(<AppShell><ProjectsWorkspace /></AppShell>);

    const fullUrl = longProject.repository.publicRepositoryUrl;
    expect(view.textContent).toContain(longProject.name);
    expect(view.textContent).toContain(fullUrl);
    expect(view.querySelector(`[title="${fullUrl}"]`)?.className).toMatch(/break-words|break-all|truncate/);
    expect(view.textContent).toContain(longProject.id);
  });
});

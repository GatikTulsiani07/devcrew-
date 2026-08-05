import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { AppShell } from "@/components/shell/app-shell";
import { AgentsWorkspace, IdeasWorkspace } from "@/components/workspace/fixture-pages";

vi.mock("next/navigation", () => ({ usePathname: () => "/" }));
vi.mock("next/link", () => ({
  default: ({ children, href, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => <a href={String(href)} {...props}>{children}</a>,
}));

let root: Root | undefined;
let container: HTMLDivElement | undefined;

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
});

async function render(node: React.ReactNode) {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () => root?.render(node));
  return container;
}

function click(element: Element) {
  element.dispatchEvent(new MouseEvent("click", { bubbles: true }));
}

function changeInput(element: HTMLInputElement | HTMLTextAreaElement, value: string) {
  const descriptor = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(element), "value");
  descriptor?.set?.call(element, value);
  element.dispatchEvent(new Event("input", { bubbles: true }));
}

async function openDrawer(view: HTMLElement) {
  const opener = view.querySelector<HTMLButtonElement>('[aria-controls="mobile-sidebar"]');
  expect(opener).not.toBeNull();
  await act(async () => click(opener!));
  await act(async () => new Promise((resolve) => setTimeout(resolve, 1)));
  return { opener: opener!, drawer: document.getElementById("mobile-sidebar") };
}

describe("focused Sprint 2A interactions", () => {
  it("opens the mobile drawer", async () => {
    const view = await render(<AppShell><div /></AppShell>);
    const { drawer } = await openDrawer(view);
    expect(drawer).not.toBeNull();
    expect(drawer?.getAttribute("role")).toBe("dialog");
  });

  it("moves focus into the mobile drawer", async () => {
    const view = await render(<AppShell><div /></AppShell>);
    const { drawer } = await openDrawer(view);
    expect(drawer?.contains(document.activeElement)).toBe(true);
  });

  it("closes the drawer on Escape and restores focus", async () => {
    const view = await render(<AppShell><div /></AppShell>);
    const { opener } = await openDrawer(view);
    await act(async () => {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 1));
    });
    expect(document.getElementById("mobile-sidebar")).toBeNull();
    expect(document.activeElement).toBe(opener);
  });

  it("changes the agent detail panel when an agent is selected", async () => {
    const view = await render(<AgentsWorkspace />);
    const agentButton = [...view.querySelectorAll("button")].find((button) => button.textContent?.includes("Full Stack Developer"));
    expect(agentButton).toBeDefined();
    await act(async () => click(agentButton!));
    expect(view.textContent).toContain("@full-stack");
    expect(view.textContent).toContain("Implement only approved ticket scope");
    expect(agentButton?.getAttribute("aria-pressed")).toBe("true");
  });

  it("filters fixture workspace lists without losing an accessible empty state", async () => {
    const view = await render(<IdeasWorkspace />);
    const search = view.querySelector<HTMLInputElement>('input[placeholder="Search idea inbox…"]');
    expect(search).not.toBeNull();
    await act(async () => {
      changeInput(search!, "approval checkpoint");
    });
    expect(view.textContent).toContain("Add an approval checkpoint summary");
    expect(view.textContent).not.toContain("Remember the last selected agent");

    await act(async () => {
      changeInput(search!, "not in fixture data");
    });
    expect(view.textContent).toContain("No ideas match this search.");
  });

  it("labels unavailable project mutations as preview-only actions", async () => {
    const view = await render(<AppShell><div /></AppShell>);
    const projectMenu = view.querySelector("summary");
    expect(projectMenu).not.toBeNull();
    await act(async () => click(projectMenu!));
    expect(view.textContent).toContain("Create projectPreview only");
    expect(view.textContent).toContain("Connect repositoryPreview only");
    expect(view.textContent).toContain("Project settingsPreview only");
  });

  it("toggles the crew power control state", async () => {
    const view = await render(<AppShell><div /></AppShell>);
    const power = view.querySelector<HTMLButtonElement>('[aria-label="Turn the Devcrew agents offline"]');
    expect(power).not.toBeNull();
    await act(async () => click(power!));
    expect(view.querySelector<HTMLButtonElement>('[aria-label="Bring the Devcrew agents online"]')).not.toBeNull();
  });
});

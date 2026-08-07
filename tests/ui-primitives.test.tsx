import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { Boxes } from "lucide-react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { PageHeader } from "@/components/ui/page-header";
import { Panel } from "@/components/ui/panel";
import { PlaceholderPage } from "@/components/ui/placeholder-page";
import { StatePanel } from "@/components/ui/state-panel";

vi.mock("next/link", () => ({
  default: ({ children, href, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a href={String(href)} {...props}>
      {children}
    </a>
  ),
}));

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

async function render(node: React.ReactNode) {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () => root?.render(node));
  return container;
}

describe("Panel", () => {
  it("renders a section with a header when a title, description, or action is supplied", async () => {
    const view = await render(
      <Panel title="Workspace context" description="Stable context" action={<button>Refresh</button>}>
        <p>Body</p>
      </Panel>,
    );

    expect(view.firstElementChild?.tagName).toBe("SECTION");
    expect(view.querySelector("h2")?.textContent).toBe("Workspace context");
    expect(view.textContent).toContain("Stable context");
    expect(view.querySelector("button")?.textContent).toBe("Refresh");
    expect(view.textContent).toContain("Body");
  });

  it("omits the header block when no header content is supplied", async () => {
    const view = await render(
      <Panel>
        <p>Body only</p>
      </Panel>,
    );

    expect(view.querySelector("h2")).toBeNull();
    expect(view.firstElementChild?.children).toHaveLength(1);
  });

  it("renders the requested element and appends the custom class name", async () => {
    const view = await render(
      <Panel as="div" className="custom-panel">
        <p>Body</p>
      </Panel>,
    );

    const element = view.firstElementChild;
    expect(element?.tagName).toBe("DIV");
    expect(element?.className).toContain("custom-panel");
  });
});

describe("PageHeader", () => {
  it("renders the eyebrow, title, description, and optional action", async () => {
    const view = await render(
      <PageHeader
        eyebrow="Workspace"
        title="Tickets"
        description="Approved ticket scope only."
        action={<button type="button">Return</button>}
      />,
    );

    expect(view.querySelector("header")).not.toBeNull();
    expect(view.querySelector("h1")?.textContent).toBe("Tickets");
    expect(view.textContent).toContain("Workspace");
    expect(view.textContent).toContain("Approved ticket scope only.");
    expect(view.querySelector("button")?.textContent).toBe("Return");
  });

  it("renders without an action", async () => {
    const view = await render(
      <PageHeader eyebrow="Workspace" title="Docs" description="Reference material." />,
    );

    expect(view.querySelector("button")).toBeNull();
  });
});

describe("StatePanel", () => {
  it("marks error tone panels as alerts", async () => {
    const view = await render(
      <StatePanel tone="error" title="Backend unavailable" description="Retry shortly." />,
    );

    const panel = view.firstElementChild;
    expect(panel?.getAttribute("role")).toBe("alert");
    expect(panel?.getAttribute("aria-live")).toBeNull();
    expect(view.querySelector("h2")?.textContent).toBe("Backend unavailable");
  });

  it("announces loading tone panels politely with a spinning icon", async () => {
    const view = await render(
      <StatePanel tone="loading" title="Loading activity" description="Connecting." />,
    );

    const panel = view.firstElementChild;
    expect(panel?.getAttribute("aria-live")).toBe("polite");
    expect(panel?.getAttribute("role")).toBeNull();
    expect(view.querySelector("svg")?.getAttribute("class")).toContain("animate-spin");
  });

  it("defaults to a neutral tone and renders a supplied icon and action", async () => {
    const view = await render(
      <StatePanel
        icon={Boxes}
        title="No tickets yet"
        description="Create a ticket to begin."
        action={<button>Create ticket</button>}
      />,
    );

    const panel = view.firstElementChild;
    expect(panel?.getAttribute("role")).toBeNull();
    expect(panel?.getAttribute("aria-live")).toBeNull();
    expect(view.querySelector("svg")?.getAttribute("class")).not.toContain("animate-spin");
    expect(view.querySelector("button")?.textContent).toBe("Create ticket");
  });
});

describe("PlaceholderPage", () => {
  it("renders the header, empty state, and workspace context entries", async () => {
    const view = await render(
      <PlaceholderPage
        eyebrow="Workspace"
        title="Reviews"
        description="Review outcomes appear here."
        emptyTitle="No reviews yet"
        emptyDescription="Reviews appear after validation."
        icon={Boxes}
        context={[
          { label: "Project", value: "Devcrew MVP" },
          { label: "Repository", value: "example/devcrew" },
        ]}
      />,
    );

    expect(view.querySelector("h1")?.textContent).toBe("Reviews");
    expect(view.textContent).toContain("No reviews yet");
    expect([...view.querySelectorAll("dt")].map((item) => item.textContent)).toEqual([
      "Project",
      "Repository",
    ]);
    expect([...view.querySelectorAll("dd")].map((item) => item.textContent)).toEqual([
      "Devcrew MVP",
      "example/devcrew",
    ]);
    expect(view.querySelector('a[href="/"]')?.textContent).toContain("Return to Activity");
  });

  it("omits the anchor grid by default and renders focusable anchors when supplied", async () => {
    const withoutAnchors = await render(
      <PlaceholderPage
        eyebrow="Workspace"
        title="Docs"
        description="Reference material."
        emptyTitle="No docs yet"
        emptyDescription="Docs appear after approval."
        icon={Boxes}
        context={[]}
      />,
    );
    expect(withoutAnchors.querySelectorAll("section[id]")).toHaveLength(0);

    await act(async () => root?.unmount());
    container?.remove();
    root = undefined;

    const withAnchors = await render(
      <PlaceholderPage
        eyebrow="Workspace"
        title="Docs"
        description="Reference material."
        emptyTitle="No docs yet"
        emptyDescription="Docs appear after approval."
        icon={Boxes}
        context={[]}
        anchors={[
          { id: "spec", label: "Spec" },
          { id: "architecture", label: "Architecture" },
        ]}
      />,
    );

    const anchors = [...withAnchors.querySelectorAll("section[id]")];
    expect(anchors.map((section) => section.id)).toEqual(["spec", "architecture"]);
    expect(anchors.every((section) => section.getAttribute("tabindex") === "-1")).toBe(true);
    expect(withAnchors.textContent).toContain("Architecture");
  });
});

"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { LucideIcon } from "lucide-react";
import {
  Activity,
  Bot,
  BookOpenText,
  FolderKanban,
  Lightbulb,
  Menu,
  Power,
  Settings,
  ShieldCheck,
  Ticket,
  X,
} from "lucide-react";
import { agents } from "@/lib/mock-data";
import { ProjectSelector } from "@/components/shell/project-selector";
import { WorkshopRail } from "@/components/shell/workshop-rail";
import { WorkspaceStateProvider, useWorkspaceState } from "@/components/shell/workspace-state";

type NavItem = { label: string; href: string; icon: LucideIcon };

const navigation: NavItem[] = [
  { label: "Activity", href: "/", icon: Activity },
  { label: "Projects", href: "/projects", icon: FolderKanban },
  { label: "Agents", href: "/agents", icon: Bot },
  { label: "Ideas", href: "/ideas", icon: Lightbulb },
  { label: "Tickets", href: "/tickets", icon: Ticket },
  { label: "Docs", href: "/docs", icon: BookOpenText },
  { label: "Reviews", href: "/reviews", icon: ShieldCheck },
];

function isCurrentRoute(pathname: string, href: string) {
  return href === "/" ? pathname === href : pathname.startsWith(href);
}

function BrandMark({ compact = false }: { compact?: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={`inline-flex shrink-0 items-baseline justify-center rounded-[var(--radius-standard)] bg-panel font-display text-ink shadow-[inset_0_1px_0_rgb(255_255_255/0.035)] ${compact ? "size-8 text-base" : "size-10 text-xl"}`}
    >
      D<span className="ml-px font-mono text-[0.48em] text-accent">/</span>
    </span>
  );
}

function SidebarLabel({ children }: { children: ReactNode }) {
  return <p className="px-3 text-[0.74rem] text-ink-muted">{children}</p>;
}

function NavRow({ item, active }: { item: NavItem; active: boolean }) {
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      className={`group relative flex min-h-10 items-center gap-3 rounded-[var(--radius-small)] px-3 text-[0.84rem] transition-colors duration-[var(--motion-fast)] ${
        active
          ? "bg-panel-strong text-ink"
          : "text-ink-secondary hover:bg-panel/70 hover:text-ink"
      }`}
    >
      <Icon aria-hidden="true" className={`size-4 ${active ? "text-accent" : "text-ink-muted group-hover:text-ink-secondary"}`} strokeWidth={1.75} />
      <span>{item.label}</span>
      {active && <span aria-hidden="true" className="ml-auto size-1.5 rounded-full bg-accent" />}
    </Link>
  );
}

function CrewSummary({ online }: { online: boolean }) {
  const manager = agents[0];
  return (
    <Link
      href="/agents#manager"
      className="mx-3 block rounded-[var(--radius-small)] bg-panel/35 px-3.5 py-3.5 text-left transition-colors hover:bg-panel/65"
    >
      <span className="flex items-center justify-between gap-3">
        <span className="text-[0.82rem] font-medium text-ink">Current lead</span>
        <span className={`size-1.5 rounded-full ${online ? "bg-success" : "bg-ink-muted"}`} aria-hidden="true" />
      </span>
      <span className="mt-2 block font-display text-[1.25rem] leading-tight text-ink">{manager.name}</span>
      <span className="mt-1 block text-[0.76rem] leading-5 text-ink-muted">{online ? manager.currentFocus : "Crew is offline"}</span>
    </Link>
  );
}

function Sidebar({ pathname, onNavigate }: { pathname: string; onNavigate?: () => void }) {
  const { crewOnline, setCrewOnline, workflow } = useWorkspaceState();
  const repositoryLabel = workflow.project?.repository.publicRepositoryUrl ?? "Fixture setup fallback";

  return (
    <div
      className="flex h-full min-h-0 flex-col bg-elevated"
      onClick={(event) => {
        if ((event.target as HTMLElement).closest("a")) onNavigate?.();
      }}
    >
      <ProjectSelector />

      <div className="scrollbar-subtle min-h-0 flex-1 overflow-y-auto px-3 py-7">
        <nav aria-label="Workspace navigation" className="space-y-8">
          <section aria-labelledby="workspace-label">
            <SidebarLabel><span id="workspace-label">Workspace</span></SidebarLabel>
            <ul className="mt-2 space-y-1">
              {navigation.map((item) => (
                <li key={item.href}>
                  <NavRow item={item} active={isCurrentRoute(pathname, item.href)} />
                </li>
              ))}
            </ul>
          </section>

          <section aria-labelledby="crew-label" className="space-y-3">
            <SidebarLabel><span id="crew-label">Crew</span></SidebarLabel>
            <CrewSummary online={crewOnline} />
          </section>
        </nav>
      </div>

      <div className="px-4 pb-6 pt-3">
        <div className="border-t border-border/45 pt-4">
          <div className="flex items-center gap-2">
            <Link href="/projects#settings" className="flex min-h-9 flex-1 items-center gap-2 rounded-[var(--radius-small)] px-2 text-[0.78rem] text-ink-muted transition-colors hover:bg-panel/70 hover:text-ink">
              <Settings aria-hidden="true" className="size-3.5" /> Settings
            </Link>
            <button
              type="button"
              onClick={() => setCrewOnline(!crewOnline)}
              aria-pressed={crewOnline}
              aria-label={crewOnline ? "Turn the Devcrew agents offline" : "Bring the Devcrew agents online"}
              title={crewOnline ? "Turn agents offline" : "Bring agents online"}
              className={`grid size-9 place-items-center rounded-[var(--radius-small)] transition-colors ${
                crewOnline ? "bg-panel text-accent hover:bg-panel-strong" : "bg-panel/65 text-ink-muted hover:text-ink"
              }`}
            >
              <Power aria-hidden="true" className="size-4" />
            </button>
          </div>
          <div className="mt-3 flex items-center justify-between px-2 text-[0.68rem] text-ink-muted">
            <span title={repositoryLabel} className="min-w-0 truncate">{repositoryLabel}</span>
            <span className={`ml-3 shrink-0 ${crewOnline ? "text-accent" : "text-ink-muted"}`}>{crewOnline ? "Online" : "Offline"}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function ShellContent({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const openerRef = useRef<HTMLButtonElement>(null);
  const drawerRef = useRef<HTMLElement>(null);

  function closeDrawer({ restoreFocus = true } = {}) {
    setMobileOpen(false);
    if (restoreFocus) requestAnimationFrame(() => openerRef.current?.focus());
  }

  useEffect(() => {
    if (!mobileOpen) return;
    const previousOverflow = document.body.style.overflow;
    const shell = document.getElementById("workspace-shell");
    document.body.style.overflow = "hidden";
    shell?.setAttribute("inert", "");
    drawerRef.current?.querySelector<HTMLElement>("button, a")?.focus();

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        closeDrawer();
        return;
      }
      if (event.key !== "Tab" || !drawerRef.current) return;
      const focusable = [...drawerRef.current.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), summary, [tabindex]:not([tabindex="-1"])')].filter((element) => !element.hasAttribute("hidden"));
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      shell?.removeAttribute("inert");
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [mobileOpen]);

  return (
    <>
      <div id="workspace-shell" className="min-h-dvh overflow-x-hidden bg-canvas text-ink md:grid md:h-dvh md:grid-cols-[15rem_minmax(0,1fr)] md:overflow-hidden xl:grid-cols-[15rem_minmax(0,1fr)_17rem]">
        <a href="#main-content" className="fixed left-3 top-3 z-[80] -translate-y-20 rounded-[var(--radius-small)] bg-accent px-3 py-2 text-xs font-semibold text-[#1a1009] transition-transform focus:translate-y-0">Skip to content</a>

        <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-border/40 bg-elevated/95 px-4 backdrop-blur md:hidden">
          <div className="flex items-center gap-3"><BrandMark compact /><span className="font-display text-xl">Devcrew</span></div>
          <button ref={openerRef} type="button" onClick={() => setMobileOpen(true)} aria-expanded={mobileOpen} aria-controls="mobile-sidebar" className="grid size-10 place-items-center rounded-[var(--radius-small)] bg-panel/70 text-ink-secondary transition-colors hover:text-ink">
            <Menu aria-hidden="true" className="size-5" /><span className="sr-only">Open workspace navigation</span>
          </button>
        </header>

        <aside className="hidden min-h-0 bg-elevated md:block"><Sidebar pathname={pathname} /></aside>
        <main id="main-content" tabIndex={-1} className="scrollbar-subtle min-w-0 overflow-x-hidden overflow-y-auto">{children}</main>
        <aside aria-label="Workshop" className="hidden min-h-0 bg-elevated xl:block"><WorkshopRail /></aside>
      </div>

      {mobileOpen && (
        <div className="fixed inset-0 z-[70] md:hidden">
          <button type="button" aria-label="Close workspace navigation" className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => closeDrawer()} />
          <aside ref={drawerRef} id="mobile-sidebar" role="dialog" aria-modal="true" aria-label="Workspace navigation" className="relative h-full w-[min(20rem,88vw)] bg-elevated shadow-[var(--shadow-overlay)]">
            <button type="button" onClick={() => closeDrawer()} className="absolute right-3 top-3 z-10 grid size-9 place-items-center rounded-[var(--radius-standard)] text-ink-muted transition-colors hover:bg-panel hover:text-ink">
              <X aria-hidden="true" className="size-4" /><span className="sr-only">Close navigation</span>
            </button>
            <Sidebar pathname={pathname} onNavigate={() => closeDrawer({ restoreFocus: false })} />
          </aside>
        </div>
      )}
    </>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  return <WorkspaceStateProvider><ShellContent>{children}</ShellContent></WorkspaceStateProvider>;
}

"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { LucideIcon } from "lucide-react";
import {
  Activity,
  Bell,
  Bot,
  BookOpenText,
  ChevronRight,
  FolderKanban,
  Hash,
  Lightbulb,
  Menu,
  Power,
  Settings,
  ShieldCheck,
  Ticket,
  X,
} from "lucide-react";
import { agents } from "@/lib/mock-data";
import { AgentAvatar } from "@/components/ui/agent-avatar";
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
    <span aria-hidden="true" className={`inline-flex shrink-0 items-baseline justify-center rounded-[var(--radius-small)] border border-accent/30 bg-accent-soft font-display text-ink ${compact ? "size-7 text-sm" : "size-8 text-base"}`}>
      D<span className="ml-px font-mono text-[0.5em] text-accent">/</span>
    </span>
  );
}

function SectionHeading({ children, count }: { children: ReactNode; count?: number }) {
  return (
    <div className="mb-1 flex items-center justify-between px-2">
      <p className="font-mono text-[0.51rem] uppercase tracking-[0.14em] text-ink-muted">{children}</p>
      {count !== undefined && <span className="font-mono text-[0.5rem] text-ink-muted">{count}</span>}
    </div>
  );
}

function NavRow({ item, active }: { item: NavItem; active: boolean }) {
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      className={`group relative flex min-h-8 items-center gap-2 rounded-[var(--radius-small)] px-2.5 text-[0.68rem] transition-colors ${active ? "bg-surface-hover text-ink" : "text-ink-secondary hover:bg-surface-hover/70 hover:text-ink"}`}
    >
      {active && <span aria-hidden="true" className="absolute inset-y-2 left-0 w-px bg-accent" />}
      <Icon aria-hidden="true" className={`size-3 ${active ? "text-accent" : "text-ink-muted"}`} strokeWidth={1.8} />
      <span>{item.label}</span>
    </Link>
  );
}

function Sidebar({ pathname, onNavigate }: { pathname: string; onNavigate?: () => void }) {
  const { crewOnline, setCrewOnline } = useWorkspaceState();

  return (
    <div
      className="flex h-full min-h-0 flex-col bg-elevated"
      onClick={(event) => {
        if ((event.target as HTMLElement).closest("a")) onNavigate?.();
      }}
    >
      <ProjectSelector />

      <div className="scrollbar-subtle min-h-0 flex-1 overflow-y-auto px-2 py-2">
        <nav aria-label="Workspace navigation">
          <Link href="/" className="mb-3 flex min-h-8 items-center gap-2 rounded-[var(--radius-small)] px-2.5 text-[0.68rem] text-ink-secondary hover:bg-surface-hover/70 hover:text-ink">
            <Bell aria-hidden="true" className="size-3 text-ink-muted" />
            Inbox
            <span className="ml-auto font-mono text-[0.52rem] text-ink-muted">0</span>
          </Link>

          <section aria-labelledby="channels-label" className="mb-3">
            <SectionHeading count={2}><span id="channels-label">Channels</span></SectionHeading>
            <Link href="/?channel=general" className="flex min-h-8 items-center gap-2 rounded-[var(--radius-small)] px-2.5 text-[0.67rem] text-ink-secondary hover:bg-surface-hover/70 hover:text-ink">
              <Hash aria-hidden="true" className="size-3 text-ink-muted" /> general
            </Link>
            <Link href="/?channel=engineering" className="flex min-h-8 items-center gap-2 rounded-[var(--radius-small)] px-2.5 text-[0.67rem] text-ink-secondary hover:bg-surface-hover/70 hover:text-ink">
              <Hash aria-hidden="true" className="size-3 text-ink-muted" /> engineering
            </Link>
          </section>

          <section aria-labelledby="workspace-label" className="mb-3">
            <SectionHeading><span id="workspace-label">Workspace</span></SectionHeading>
            <ul>
              {navigation.map((item) => <li key={item.href}><NavRow item={item} active={isCurrentRoute(pathname, item.href)} /></li>)}
            </ul>
          </section>

          <section aria-labelledby="agents-label">
            <SectionHeading count={agents.length}><span id="agents-label">Agents</span></SectionHeading>
            <ul>
              {agents.map((agent) => (
                <li key={agent.id}>
                  <Link href={`/agents#${agent.id}`} className="flex min-h-10 items-center gap-2 rounded-[var(--radius-small)] px-2 transition-colors hover:bg-surface-hover/70">
                    <AgentAvatar agent={agent} size="small" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[0.64rem] font-medium text-ink-secondary">{agent.name}</span>
                      <span className="flex items-center gap-1 truncate text-[0.53rem] text-ink-muted">
                        <span aria-hidden="true" className={`size-1.5 rounded-full ${crewOnline ? agent.status === "active" ? "bg-success" : agent.status === "queued" ? "bg-warning" : agent.status === "stopped" ? "bg-error" : "bg-ink-muted" : "bg-ink-muted"}`} />
                        {crewOnline ? agent.statusLabel : "Offline"}
                      </span>
                    </span>
                    <ChevronRight aria-hidden="true" className="size-2.5 text-ink-muted/60" />
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        </nav>
      </div>

      <div className="border-t border-border px-2 py-2">
        <div className="flex items-center gap-1">
          <Link href="/projects#settings" className="flex min-h-8 flex-1 items-center gap-2 rounded-[var(--radius-small)] px-2 text-[0.65rem] text-ink-muted hover:bg-surface-hover hover:text-ink">
            <Settings aria-hidden="true" className="size-3" /> Settings
          </Link>
          <button
            type="button"
            onClick={() => setCrewOnline(!crewOnline)}
            aria-pressed={crewOnline}
            aria-label={crewOnline ? "Turn the Devcrew agents offline" : "Bring the Devcrew agents online"}
            title={crewOnline ? "Turn agents offline" : "Bring agents online"}
            className={`grid size-8 place-items-center rounded-[var(--radius-small)] border transition-colors ${crewOnline ? "border-success/20 bg-success-soft text-success" : "border-border bg-panel text-ink-muted hover:text-ink"}`}
          >
            <Power aria-hidden="true" className="size-3.5" />
          </button>
        </div>
        <div className="mt-1.5 flex items-center justify-between px-2 font-mono text-[0.49rem] uppercase tracking-[0.08em] text-ink-muted">
          <span>Local environment</span>
          <span className={crewOnline ? "text-success" : "text-ink-muted"}>{crewOnline ? "Crew online" : "Crew offline"}</span>
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
      <div id="workspace-shell" className="min-h-dvh overflow-x-hidden bg-canvas text-ink md:grid md:h-dvh md:grid-cols-[13.25rem_minmax(0,1fr)] md:overflow-hidden xl:grid-cols-[13.25rem_minmax(0,1fr)_16rem]">
        <a href="#main-content" className="fixed left-3 top-3 z-[80] -translate-y-20 rounded-[var(--radius-small)] bg-accent px-3 py-2 text-xs font-semibold text-[#1a1009] transition-transform focus:translate-y-0">Skip to content</a>

        <header className="sticky top-0 z-30 flex h-[3.25rem] items-center justify-between border-b border-border bg-elevated px-3.5 md:hidden">
          <div className="flex items-center gap-2.5"><BrandMark compact /><span className="font-display text-base">Devcrew</span></div>
          <button ref={openerRef} type="button" onClick={() => setMobileOpen(true)} aria-expanded={mobileOpen} aria-controls="mobile-sidebar" className="grid size-9 place-items-center rounded-[var(--radius-small)] border border-border bg-panel text-ink-secondary hover:text-ink">
            <Menu aria-hidden="true" className="size-4" /><span className="sr-only">Open workspace navigation</span>
          </button>
        </header>

        <aside className="hidden min-h-0 border-r border-border md:block"><Sidebar pathname={pathname} /></aside>
        <main id="main-content" tabIndex={-1} className="scrollbar-subtle min-w-0 overflow-x-hidden overflow-y-auto">{children}</main>
        <aside aria-label="Workshop" className="hidden min-h-0 border-l border-border bg-elevated xl:block"><WorkshopRail /></aside>
      </div>

      {mobileOpen && (
        <div className="fixed inset-0 z-[70] md:hidden">
          <button type="button" aria-label="Close workspace navigation" className="absolute inset-0 bg-black/70" onClick={() => closeDrawer()} />
          <aside ref={drawerRef} id="mobile-sidebar" role="dialog" aria-modal="true" aria-label="Workspace navigation" className="relative h-full w-[min(18rem,88vw)] border-r border-border-strong bg-elevated shadow-[var(--shadow-overlay)]">
            <button type="button" onClick={() => closeDrawer()} className="absolute right-2 top-2 z-10 grid size-8 place-items-center rounded-[var(--radius-small)] text-ink-muted hover:bg-surface-hover hover:text-ink">
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

"use client";

import { useEffect, useState, type ReactNode } from "react";
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
  ShieldCheck,
  Ticket,
  X,
} from "lucide-react";
import { agents } from "@/lib/mock-data";
import { AgentAvatar } from "@/components/ui/agent-avatar";
import { ProjectSelector } from "@/components/shell/project-selector";
import { WorkshopRail } from "@/components/shell/workshop-rail";

type NavItem = {
  label: string;
  href: string;
  icon: LucideIcon;
};

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
      className={`inline-flex shrink-0 items-baseline justify-center rounded-[var(--radius-small)] border border-border-strong bg-panel font-display text-ink ${compact ? "size-7 text-sm" : "size-7 text-[0.95rem]"}`}
    >
      D<span className="ml-px font-mono text-[0.52em] text-accent">/</span>
    </span>
  );
}

function Sidebar({ pathname }: { pathname: string }) {
  return (
    <div className="flex h-full min-h-0 flex-col bg-elevated">
      <div className="flex h-[3.75rem] items-center gap-2.5 border-b border-border px-3.5">
        <BrandMark />
        <div>
          <p className="font-display text-[1.05rem] leading-none text-ink">Devcrew</p>
          <p className="mt-0.5 font-mono text-[0.52rem] tracking-[0.1em] text-ink-muted">ENGINEERING CREW</p>
        </div>
      </div>

      <div className="px-2.5 py-2.5">
        <ProjectSelector />
      </div>

      <nav aria-label="Workspace" className="px-2.5">
        <p className="mb-1 px-2 font-mono text-[0.53rem] uppercase tracking-[0.14em] text-ink-muted">Workspace</p>
        <ul>
          {navigation.map(({ label, href, icon: Icon }) => {
            const active = isCurrentRoute(pathname, href);
            return (
              <li key={href}>
                <Link
                  href={href}
                  aria-current={active ? "page" : undefined}
                  className={`group relative flex min-h-8 items-center gap-2 rounded-[var(--radius-small)] px-2.5 text-[0.7rem] transition-colors duration-[var(--motion-fast)] ${
                    active
                      ? "bg-surface-hover text-ink"
                      : "text-ink-secondary hover:bg-surface-hover hover:text-ink"
                  }`}
                >
                  {active && <span aria-hidden="true" className="absolute inset-y-2 left-0 w-px bg-accent" />}
                  <Icon
                    aria-hidden="true"
                    className={`size-3 ${active ? "text-accent" : "text-ink-muted group-hover:text-ink-secondary"}`}
                    strokeWidth={1.8}
                  />
                  <span className="flex-1">{label}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="mt-3 min-h-0 flex-1 border-t border-border px-2.5 pt-3">
        <div className="mb-1 flex items-center justify-between px-2">
          <p className="font-mono text-[0.53rem] uppercase tracking-[0.14em] text-ink-muted">Agent roster</p>
          <span className="text-[0.56rem] text-ink-muted">4</span>
        </div>
        <ul className="scrollbar-subtle max-h-full overflow-y-auto pb-2">
          {agents.map((agent) => (
            <li key={agent.id}>
              <Link
                href={`/agents#${agent.id}`}
                className="flex min-h-9 items-center gap-2 rounded-[var(--radius-small)] px-2 transition-colors duration-[var(--motion-fast)] hover:bg-surface-hover"
              >
                <span className="relative">
                  <AgentAvatar agent={agent} size="small" />
                  <span
                    aria-hidden="true"
                    className={`absolute -bottom-0.5 -right-0.5 size-1.5 rounded-full border border-elevated ${
                      agent.status === "active"
                        ? "bg-success"
                        : agent.status === "queued"
                          ? "bg-warning"
                          : agent.status === "stopped"
                            ? "bg-error"
                            : "bg-ink-muted"
                    }`}
                  />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[0.65rem] font-medium text-ink-secondary">{agent.name}</span>
                  <span className="block truncate text-[0.55rem] text-ink-muted">{agent.statusLabel}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </div>

      <div className="border-t border-border px-3.5 py-2.5">
        <div className="flex items-center justify-between">
          <span className="font-mono text-[0.52rem] text-ink-muted">LOCAL PREVIEW</span>
          <span className="flex items-center gap-1 text-[0.56rem] text-success">
            <span aria-hidden="true" className="size-1.5 rounded-full bg-success" />
            Ready
          </span>
        </div>
      </div>
    </div>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    if (!mobileOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [mobileOpen]);

  return (
    <div className="min-h-dvh overflow-x-hidden bg-canvas text-ink md:grid md:h-dvh md:grid-cols-[13.75rem_minmax(0,1fr)] md:overflow-hidden xl:grid-cols-[13.75rem_minmax(0,1fr)_16rem]">
      <a
        href="#main-content"
        className="fixed left-3 top-3 z-[70] -translate-y-20 rounded-[var(--radius-small)] bg-accent px-3 py-2 text-xs font-semibold text-[#1a1009] transition-transform focus:translate-y-0"
      >
        Skip to content
      </a>

      <header className="sticky top-0 z-30 flex h-[3.25rem] items-center justify-between border-b border-border bg-elevated px-3.5 md:hidden">
        <div className="flex items-center gap-2.5">
          <BrandMark compact />
          <span className="font-display text-base">Devcrew</span>
        </div>
        <button
          type="button"
          onClick={() => setMobileOpen(true)}
          aria-expanded={mobileOpen}
          aria-controls="mobile-sidebar"
          className="grid size-9 place-items-center rounded-[var(--radius-small)] border border-border bg-panel text-ink-secondary hover:text-ink"
        >
          <Menu aria-hidden="true" className="size-4" />
          <span className="sr-only">Open workspace navigation</span>
        </button>
      </header>

      <aside className="hidden min-h-0 border-r border-border md:block">
        <Sidebar pathname={pathname} />
      </aside>

      {mobileOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <button
            type="button"
            aria-label="Close workspace navigation"
            className="absolute inset-0 bg-black/65"
            onClick={() => setMobileOpen(false)}
          />
          <aside
            id="mobile-sidebar"
            aria-label="Workspace navigation"
            onClick={(event) => {
              if ((event.target as HTMLElement).closest("a")) {
                setMobileOpen(false);
              }
            }}
            className="relative h-full w-[min(19rem,88vw)] border-r border-border-strong shadow-[var(--shadow-overlay)]"
          >
            <button
              type="button"
              onClick={() => setMobileOpen(false)}
              className="absolute right-3 top-4 z-10 grid size-9 place-items-center rounded-[var(--radius-small)] text-ink-muted hover:bg-surface-hover hover:text-ink"
            >
              <X aria-hidden="true" className="size-4" />
              <span className="sr-only">Close navigation</span>
            </button>
            <Sidebar pathname={pathname} />
          </aside>
        </div>
      )}

      <main id="main-content" tabIndex={-1} className="scrollbar-subtle min-w-0 overflow-x-hidden overflow-y-auto">
        {children}
      </main>

      <aside aria-label="Workshop" className="hidden min-h-0 border-l border-border bg-elevated xl:block">
        <WorkshopRail />
      </aside>
    </div>
  );
}

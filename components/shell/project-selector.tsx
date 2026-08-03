import Link from "next/link";
import { ChevronDown, FolderPlus, GitBranch, Link2, Settings2 } from "lucide-react";
import { project } from "@/lib/mock-data";

const actions = [
  { label: "Create project", status: "Preview only", href: "/projects#new-project", icon: FolderPlus },
  { label: "Connect repository", status: "Preview only", href: "/projects#link-repository", icon: Link2 },
  { label: "Project settings", status: "Preview only", href: "/projects#settings", icon: Settings2 },
];

export function ProjectSelector() {
  return (
    <details className="group relative border-b border-border">
      <summary className="flex min-h-[3.75rem] cursor-pointer list-none items-center gap-2.5 px-3 transition-colors hover:bg-surface-hover/50 [&::-webkit-details-marker]:hidden">
        <span aria-hidden="true" className="inline-flex size-8 shrink-0 items-baseline justify-center rounded-[var(--radius-small)] border border-accent/30 bg-accent-soft font-display text-base text-ink">
          D<span className="ml-px font-mono text-[0.5em] text-accent">/</span>
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[0.69rem] font-semibold text-ink">{project.name}</span>
          <span className="mt-0.5 flex items-center gap-1 truncate font-mono text-[0.5rem] text-ink-muted">
            <GitBranch aria-hidden="true" className="size-2.5" /> {project.branch}
          </span>
        </span>
        <ChevronDown aria-hidden="true" className="size-3 text-ink-muted transition-transform group-open:rotate-180" />
      </summary>

      <div className="absolute inset-x-2 top-[calc(100%+0.25rem)] z-50 rounded-[var(--radius-standard)] border border-border-strong bg-elevated p-1 shadow-[var(--shadow-overlay)]">
        <Link href="/projects" className="flex min-h-8 items-center gap-2 rounded-[var(--radius-small)] bg-panel-strong px-2 text-[0.66rem] font-medium text-ink">
          <span className="grid size-5 place-items-center rounded-[var(--radius-small)] bg-accent-soft font-mono text-[0.48rem] text-accent">DM</span>
          Devcrew MVP
          <span className="ml-auto size-1.5 rounded-full bg-success" aria-hidden="true" />
        </Link>
        <div className="my-1 h-px bg-border" />
        {actions.map(({ label, status, href, icon: Icon }) => (
          <Link key={label} href={href} className="flex min-h-8 items-center gap-2 rounded-[var(--radius-small)] px-2 text-[0.65rem] text-ink-secondary hover:bg-surface-hover hover:text-ink">
            <Icon aria-hidden="true" className="size-3 text-ink-muted" />
            <span>{label}</span>
            <span className="ml-auto font-mono text-[0.48rem] uppercase tracking-[0.08em] text-ink-muted">{status}</span>
          </Link>
        ))}
      </div>
    </details>
  );
}

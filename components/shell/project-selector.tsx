import Link from "next/link";
import {
  ChevronDown,
  FolderPlus,
  GitBranch,
  Link2,
  Settings2,
} from "lucide-react";
import { project } from "@/lib/mock-data";

const projectActions = [
  { label: "Create project", href: "/projects#new-project", icon: FolderPlus },
  { label: "Link repository", href: "/projects#link-repository", icon: Link2 },
  { label: "Project settings", href: "/projects#settings", icon: Settings2 },
];

export function ProjectSelector() {
  return (
    <details className="group relative">
      <summary className="flex min-h-12 cursor-pointer list-none items-center gap-2.5 rounded-[var(--radius-standard)] border border-border bg-panel-strong/75 px-2.5 py-1.5 transition-colors duration-[var(--motion-fast)] hover:border-border-strong hover:bg-surface-hover [&::-webkit-details-marker]:hidden">
        <span className="grid size-7 shrink-0 place-items-center rounded-[var(--radius-small)] border border-border-strong bg-elevated font-mono text-[0.55rem] font-semibold tracking-[0.08em] text-accent">
          DM
        </span>
        <span className="min-w-0 flex-1 text-left">
          <span className="block truncate text-[0.68rem] font-semibold text-ink">{project.name}</span>
          <span className="flex items-center gap-1 truncate font-mono text-[0.54rem] text-ink-muted">
            <GitBranch aria-hidden="true" className="size-2.5" />
            {project.branch}
          </span>
        </span>
        <ChevronDown
          aria-hidden="true"
          className="size-3 text-ink-muted transition-transform group-open:rotate-180"
        />
      </summary>

      <div className="absolute inset-x-0 top-[calc(100%+0.3rem)] z-40 rounded-[var(--radius-standard)] border border-border-strong bg-elevated p-1 shadow-[var(--shadow-overlay)]">
        <Link
          href="/projects"
          className="flex items-center gap-2 rounded-[var(--radius-small)] px-2 py-1.5 text-[0.68rem] font-medium text-ink transition-colors hover:bg-surface-hover"
        >
          <span className="size-1.5 rounded-full bg-success" aria-hidden="true" />
          Current project
        </Link>
        <div className="my-1 h-px bg-border" />
        {projectActions.map(({ label, href, icon: Icon }) => (
          <Link
            key={label}
            href={href}
            className="flex items-center gap-2 rounded-[var(--radius-small)] px-2 py-1.5 text-[0.68rem] text-ink-secondary transition-colors hover:bg-surface-hover hover:text-ink"
          >
            <Icon aria-hidden="true" className="size-3" />
            {label}
          </Link>
        ))}
      </div>
    </details>
  );
}

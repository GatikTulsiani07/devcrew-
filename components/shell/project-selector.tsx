import Link from "next/link";
import { ChevronDown, FolderPlus, Link2, Settings2 } from "lucide-react";
import { project } from "@/lib/mock-data";
import { useWorkspaceState } from "@/components/shell/workspace-state";

const actions = [
  { label: "Create project", status: "Preview only", href: "/projects#new-project", icon: FolderPlus },
  { label: "Connect repository", status: "Preview only", href: "/projects#link-repository", icon: Link2 },
  { label: "Project settings", status: "Preview only", href: "/projects#settings", icon: Settings2 },
];

export function ProjectSelector() {
  const { workflow } = useWorkspaceState();
  const activeProject = workflow.project;
  const projectName = activeProject?.name ?? project.name;
  const repositoryUrl = activeProject?.repository.publicRepositoryUrl ?? project.repository;
  const projectMeta = activeProject ? `Project ID ${activeProject.id}` : "Fixture setup fallback";

  return (
    <details className="group relative">
      <summary
        aria-label={activeProject ? `Active project ${projectName}` : "Project selector showing fixture setup fallback"}
        className="mx-3 mt-4 flex min-h-[5.75rem] cursor-pointer list-none items-start gap-3 rounded-[var(--radius-small)] px-3.5 py-3.5 transition-colors hover:bg-panel/55 [&::-webkit-details-marker]:hidden"
      >
        <span aria-hidden="true" className="inline-flex size-10 shrink-0 items-baseline justify-center rounded-[var(--radius-standard)] bg-panel font-display text-xl text-ink shadow-[inset_0_1px_0_rgb(255_255_255/0.035)]">
          D<span className="ml-px font-mono text-[0.48em] text-accent">/</span>
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[0.95rem] font-medium text-ink">{projectName}</span>
          <span title={repositoryUrl} className="mt-1.5 block truncate text-[0.76rem] text-ink-muted">{repositoryUrl}</span>
          <span className="mt-1 block truncate font-mono text-[0.72rem] text-ink-muted">{projectMeta}</span>
        </span>
        <ChevronDown aria-hidden="true" className="mt-1 size-4 text-ink-muted transition-transform group-open:rotate-180" />
      </summary>

      <div className="absolute inset-x-3 top-[calc(100%+0.35rem)] z-50 rounded-[var(--radius-standard)] bg-elevated p-2 shadow-[var(--shadow-overlay)] ring-1 ring-border/70">
        <Link href="/projects" className="flex min-h-10 items-center gap-3 rounded-[var(--radius-small)] bg-panel/70 px-2.5 text-[0.84rem] font-medium text-ink">
          <span className="grid size-6 place-items-center rounded-[var(--radius-small)] bg-panel-strong font-mono text-[0.55rem] text-accent">DM</span>
          <span className="min-w-0 flex-1 truncate">{projectName}</span>
          <span className="ml-auto size-1.5 rounded-full bg-accent" aria-hidden="true" />
        </Link>
        <div className="my-2 h-px bg-border/45" />
        {actions.map(({ label, status, href, icon: Icon }) => (
          <Link key={label} href={href} className="flex min-h-10 items-center gap-3 rounded-[var(--radius-small)] px-2.5 text-[0.82rem] text-ink-secondary transition-colors hover:bg-panel/70 hover:text-ink">
            <Icon aria-hidden="true" className="size-4 text-ink-muted" />
            <span>{label}</span>
            <span className="ml-auto text-[0.68rem] text-ink-muted">{status}</span>
          </Link>
        ))}
      </div>
    </details>
  );
}

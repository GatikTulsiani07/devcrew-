import { ArrowUpRight, CheckCircle2, GitBranch, Radio } from "lucide-react";
import { project, workshopNotes } from "@/lib/mock-data";

export function WorkshopRail({ compact = false }: { compact?: boolean }) {
  return (
    <div className={compact ? "space-y-2" : "flex h-full flex-col"}>
      <div className={compact ? "mb-2" : "border-b border-border px-3.5 py-3"}>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[0.7rem] font-semibold text-ink">Workshop</p>
            <p className="mt-0.5 text-[0.6rem] text-ink-muted">Shared execution context</p>
          </div>
          <span className="flex items-center gap-1 rounded-full border border-success/15 bg-success-soft px-1.5 py-1 text-[0.56rem] font-medium text-success">
            <Radio aria-hidden="true" className="size-2" />
            Preview
          </span>
        </div>
      </div>

      <div className={compact ? "grid gap-2 sm:grid-cols-3" : "scrollbar-subtle flex-1 space-y-1.5 overflow-y-auto p-2"}>
        {workshopNotes.map((note, index) => (
          <article
            key={note.label}
            className="rounded-[var(--radius-small)] border border-border/80 bg-panel/45 p-2.5"
          >
            <div className="flex items-start justify-between gap-3">
              <span className="font-mono text-[0.51rem] uppercase tracking-[0.12em] text-ink-muted">
                {note.label}
              </span>
              {index === 0 && <ArrowUpRight aria-hidden="true" className="size-2.5 text-accent" />}
            </div>
            <p className="mt-1.5 text-[0.68rem] font-medium leading-4.5 text-ink">{note.title}</p>
            <p className="mt-2 flex items-center gap-1 font-mono text-[0.53rem] text-ink-muted">
              <CheckCircle2 aria-hidden="true" className="size-2.5" />
              {note.meta}
            </p>
          </article>
        ))}

        {!compact && (
          <div className="rounded-[var(--radius-small)] border border-border/80 bg-panel/45 p-2.5">
            <p className="font-mono text-[0.51rem] uppercase tracking-[0.12em] text-ink-muted">Repository</p>
            <p className="mt-1.5 truncate text-[0.68rem] font-medium text-ink">{project.repository}</p>
            <p className="mt-1.5 flex items-center gap-1 font-mono text-[0.53rem] text-ink-muted">
              <GitBranch aria-hidden="true" className="size-2.5" />
              {project.branch}
            </p>
          </div>
        )}
      </div>

      {!compact && (
        <div className="border-t border-border px-3.5 py-2.5">
          <p className="font-mono text-[0.51rem] uppercase tracking-[0.12em] text-ink-muted">Environment</p>
          <div className="mt-1.5 flex items-center justify-between text-[0.65rem]">
            <span className="text-ink-secondary">Local workspace</span>
            <span className="flex items-center gap-1.5 text-success">
              <span aria-hidden="true" className="size-1.5 rounded-full bg-success" />
              Ready
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

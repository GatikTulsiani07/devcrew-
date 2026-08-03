import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { ArrowRight, Sparkles } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Panel } from "@/components/ui/panel";
import { StatePanel } from "@/components/ui/state-panel";

type PlaceholderPageProps = {
  eyebrow: string;
  title: string;
  description: string;
  emptyTitle: string;
  emptyDescription: string;
  icon: LucideIcon;
  context: Array<{ label: string; value: string }>;
  anchors?: Array<{ id: string; label: string }>;
};

export function PlaceholderPage({
  eyebrow,
  title,
  description,
  emptyTitle,
  emptyDescription,
  icon,
  context,
  anchors = [],
}: PlaceholderPageProps) {
  return (
    <div className="mx-auto min-h-full w-full max-w-6xl px-[var(--space-page)] py-4 sm:py-5">
      <PageHeader
        eyebrow={eyebrow}
        title={title}
        description={description}
        action={
          <Link
            href="/"
            className="inline-flex min-h-8 w-fit items-center gap-1.5 rounded-[var(--radius-small)] border border-border bg-panel/70 px-3 text-[0.68rem] font-medium text-ink-secondary transition-colors hover:bg-surface-hover hover:text-ink"
          >
            Return to Activity
            <ArrowRight aria-hidden="true" className="size-3" />
          </Link>
        }
      />

      <div className="mt-4 grid gap-2 lg:grid-cols-[minmax(0,1fr)_15.5rem]">
        <StatePanel icon={icon} title={emptyTitle} description={emptyDescription} />
        <Panel title="Workspace context" description="Stable context preserved by the application shell.">
          <dl className="divide-y divide-border px-3.5">
            {context.map((item) => (
              <div key={item.label} className="py-2.5">
                <dt className="font-mono text-[0.51rem] uppercase tracking-[0.11em] text-ink-muted">{item.label}</dt>
                <dd className="mt-1 text-[0.68rem] leading-4.5 text-ink-secondary">{item.value}</dd>
              </div>
            ))}
          </dl>
        </Panel>
      </div>

      {anchors.length > 0 && (
        <div className="mt-2 grid gap-2 sm:grid-cols-3">
          {anchors.map((anchor) => (
            <section
              id={anchor.id}
              key={anchor.id}
              tabIndex={-1}
              className="scroll-mt-5 rounded-[var(--radius-standard)] border border-border bg-panel/55 p-3"
            >
              <Sparkles aria-hidden="true" className="size-3 text-accent" />
              <h2 className="mt-2 text-[0.68rem] font-semibold text-ink">{anchor.label}</h2>
              <p className="mt-1 text-[0.65rem] leading-4.5 text-ink-muted">This foundation is ready for the approved project contract.</p>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

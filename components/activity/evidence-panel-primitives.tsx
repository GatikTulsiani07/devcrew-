import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { formatActivityTimestamp } from "@/components/activity/activity-event-presentation";

export function EvidencePanel({
  icon: Icon,
  title,
  status,
  children,
}: {
  icon: LucideIcon;
  title: string;
  status: string;
  children: ReactNode;
}) {
  return (
    <section aria-labelledby={`${panelId(title)}-heading`} className="min-w-0 rounded-[var(--radius-standard)] bg-panel/70 p-5 shadow-[inset_0_1px_0_rgb(255_255_255/0.03)]">
      <div className="flex min-w-0 items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <span aria-hidden="true" className="grid size-8 shrink-0 place-items-center rounded-full bg-panel-strong text-accent">
            <Icon className="size-4" />
          </span>
          <div className="min-w-0">
            <h2 id={`${panelId(title)}-heading`} className="text-[0.95rem] font-medium text-ink">{title}</h2>
            <p className="mt-1 break-words text-[0.78rem] text-ink-muted">{status}</p>
          </div>
        </div>
      </div>
      <div className="mt-4 min-w-0">{children}</div>
    </section>
  );
}

export function EmptyEvidenceState({ children }: { children: ReactNode }) {
  return (
    <p role="status" className="break-words rounded-[var(--radius-small)] bg-canvas/55 px-3 py-2 text-[0.82rem] leading-5 text-ink-muted">
      {children}
    </p>
  );
}

export function EvidenceSummary({ children }: { children: ReactNode }) {
  return <p className="break-words text-[0.88rem] leading-6 text-ink-secondary">{children}</p>;
}

export function EvidenceSection({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="mt-4 min-w-0">
      <h3 className="font-mono text-[0.64rem] uppercase tracking-[0.08em] text-ink-muted">{title}</h3>
      {children}
    </div>
  );
}

export function EvidenceList({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <ul aria-label={label} className="mt-2 grid min-w-0 gap-2">
      {children}
    </ul>
  );
}

export function EvidenceListItem({ children }: { children: ReactNode }) {
  return <li className="min-w-0 rounded-[var(--radius-small)] bg-canvas/45 px-3 py-2 text-[0.8rem] leading-5 text-ink-secondary">{children}</li>;
}

export function EvidenceTimestamp({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  const timestamp = formatActivityTimestamp(value);

  return (
    <p className="mt-4 flex min-w-0 flex-wrap gap-x-2 gap-y-1 font-mono text-[0.66rem] text-ink-muted">
      <span>{label}</span>
      <time dateTime={timestamp.dateTime} className="break-words">{timestamp.label}</time>
    </p>
  );
}

export function StatusText({ children }: { children: ReactNode }) {
  return <span className="inline-flex max-w-full rounded-full bg-panel-strong px-2 py-1 text-[0.66rem] font-medium text-ink-secondary">{children}</span>;
}

function panelId(title: string) {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

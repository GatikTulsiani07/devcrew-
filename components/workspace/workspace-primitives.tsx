import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";

export function WorkspacePage({ children }: { children: ReactNode }) {
  return <div className="flex min-h-full w-full flex-col bg-canvas">{children}</div>;
}

export function WorkspaceHeader({
  icon: Icon,
  title,
  meta,
  action,
}: {
  icon: LucideIcon;
  title: string;
  meta: string;
  action?: ReactNode;
}) {
  return (
    <header className="flex min-h-[3.5rem] shrink-0 items-center justify-between gap-4 border-b border-border px-4 py-2.5 sm:px-5">
      <div className="flex min-w-0 items-center gap-2.5">
        <Icon aria-hidden="true" className="size-3.5 shrink-0 text-ink-muted" strokeWidth={1.8} />
        <div className="min-w-0">
          <h1 className="truncate text-[0.82rem] font-semibold text-ink">{title}</h1>
          <p className="mt-0.5 truncate font-mono text-[0.55rem] text-ink-muted">{meta}</p>
        </div>
      </div>
      {action}
    </header>
  );
}

export function MasterDetail({
  master,
  detail,
  masterWidth = "17rem",
}: {
  master: ReactNode;
  detail: ReactNode;
  masterWidth?: string;
}) {
  return (
    <div
      className="grid min-h-0 min-w-0 flex-1 grid-cols-[minmax(0,1fr)] lg:grid-cols-[var(--master)_minmax(0,1fr)]"
      style={{ "--master": masterWidth } as React.CSSProperties}
    >
      <aside className="min-h-0 min-w-0 border-b border-border bg-elevated/40 lg:border-b-0 lg:border-r">{master}</aside>
      <section className="scrollbar-subtle min-h-0 min-w-0 overflow-y-auto">{detail}</section>
    </div>
  );
}

export function SurfaceHeader({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex min-h-[4.4rem] items-start justify-between gap-4 border-b border-border px-4 py-3.5 sm:px-5">
      <div className="min-w-0">
        {eyebrow && <p className="font-mono text-[0.52rem] uppercase tracking-[0.13em] text-accent">{eyebrow}</p>}
        <h2 className={`${eyebrow ? "mt-1" : ""} text-[0.86rem] font-semibold text-ink`}>{title}</h2>
        {description && <p className="mt-1 max-w-2xl text-[0.67rem] leading-4 text-ink-muted">{description}</p>}
      </div>
      {action}
    </div>
  );
}

export function SectionLabel({ children, count }: { children: ReactNode; count?: string | number }) {
  return (
    <div className="flex items-center justify-between px-3 py-2">
      <h2 className="font-mono text-[0.52rem] uppercase tracking-[0.13em] text-ink-muted">{children}</h2>
      {count !== undefined && <span className="font-mono text-[0.52rem] text-ink-muted">{count}</span>}
    </div>
  );
}

export function DenseListRow({
  selected = false,
  icon,
  title,
  meta,
  trailing,
  onClick,
}: {
  selected?: boolean;
  icon?: ReactNode;
  title: string;
  meta: string;
  trailing?: ReactNode;
  onClick?: () => void;
}) {
  const Component = onClick ? "button" : "div";
  return (
    <Component type={onClick ? "button" : undefined} onClick={onClick} aria-pressed={onClick ? selected : undefined} className={`relative flex min-h-12 w-full items-center gap-2.5 border-t border-border px-3 py-2 text-left ${selected ? "bg-panel-strong" : "hover:bg-surface-hover/50"}`}>
      {selected && <span aria-hidden="true" className="absolute inset-y-2 left-0 w-px bg-accent" />}
      {icon}
      <div className="min-w-0 flex-1">
        <p className="truncate text-[0.69rem] font-medium text-ink">{title}</p>
        <p className="mt-0.5 truncate text-[0.58rem] text-ink-muted">{meta}</p>
      </div>
      {trailing}
    </Component>
  );
}

export function DetailSection({ title, children, action }: { title: string; children: ReactNode; action?: ReactNode }) {
  return (
    <section className="border-b border-border px-4 py-4 sm:px-5">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h3 className="font-mono text-[0.54rem] uppercase tracking-[0.13em] text-ink-muted">{title}</h3>
        {action}
      </div>
      {children}
    </section>
  );
}

export function MetadataGrid({ items }: { items: Array<{ label: string; value: string }> }) {
  return (
    <dl className="grid overflow-hidden rounded-[var(--radius-small)] border border-border bg-border sm:grid-cols-2 xl:grid-cols-3">
      {items.map((item) => (
        <div key={item.label} className="bg-panel px-3 py-2.5">
          <dt className="font-mono text-[0.5rem] uppercase tracking-[0.11em] text-ink-muted">{item.label}</dt>
          <dd className="mt-1 text-[0.66rem] text-ink-secondary">{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}

export function Tag({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "accent" | "success" | "warning" | "error" }) {
  const tones = {
    neutral: "border-border-strong text-ink-secondary",
    accent: "border-accent/30 bg-accent-soft text-accent",
    success: "border-success/25 bg-success-soft text-success",
    warning: "border-warning/25 bg-warning-soft text-warning",
    error: "border-error/25 bg-error-soft text-error",
  };
  return <span className={`inline-flex items-center rounded-full border px-1.5 py-0.5 text-[0.55rem] leading-none ${tones[tone]}`}>{children}</span>;
}

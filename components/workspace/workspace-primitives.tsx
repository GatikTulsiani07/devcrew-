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
    <header className="flex min-h-[5rem] shrink-0 items-center justify-between gap-4 border-b border-border/40 px-5 py-4 sm:px-7">
      <div className="flex min-w-0 items-center gap-3">
        <Icon aria-hidden="true" className="size-4 shrink-0 text-ink-muted" strokeWidth={1.6} />
        <div className="min-w-0">
          <h1 className="truncate font-display text-[1.7rem] leading-tight text-ink">{title}</h1>
          <p className="mt-1 truncate font-mono text-[0.62rem] text-ink-muted">{meta}</p>
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
      <aside className="min-h-0 min-w-0 border-b border-border/35 bg-elevated/35 lg:border-b-0 lg:border-r lg:border-border/35">{master}</aside>
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
    <div className="flex min-h-[6rem] items-start justify-between gap-4 border-b border-border/35 px-5 py-5 sm:px-7">
      <div className="min-w-0">
        {eyebrow && <p className="font-mono text-[0.58rem] uppercase tracking-[0.1em] text-ink-muted">{eyebrow}</p>}
        <h2 className={`${eyebrow ? "mt-1.5" : ""} font-display text-[1.7rem] leading-tight text-ink`}>{title}</h2>
        {description && <p className="mt-2 max-w-2xl text-[0.86rem] leading-6 text-ink-secondary">{description}</p>}
      </div>
      {action}
    </div>
  );
}

export function SectionLabel({ children, count }: { children: ReactNode; count?: string | number }) {
  return (
    <div className="flex items-center justify-between px-4 py-3">
      <h2 className="text-[0.78rem] text-ink-muted">{children}</h2>
      {count !== undefined && <span className="font-mono text-[0.56rem] text-ink-muted">{count}</span>}
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
    <Component type={onClick ? "button" : undefined} onClick={onClick} aria-pressed={onClick ? selected : undefined} className={`relative flex min-h-14 w-full items-center gap-3 border-t border-border/30 px-4 py-3 text-left ${selected ? "bg-panel-strong" : "hover:bg-surface-hover/35"}`}>
      {selected && <span aria-hidden="true" className="absolute inset-y-3 left-0 w-px bg-accent" />}
      {icon}
      <div className="min-w-0 flex-1">
        <p className="truncate text-[0.82rem] font-medium text-ink">{title}</p>
        <p className="mt-1 truncate text-[0.68rem] text-ink-muted">{meta}</p>
      </div>
      {trailing}
    </Component>
  );
}

export function DetailSection({ title, children, action }: { title: string; children: ReactNode; action?: ReactNode }) {
  return (
    <section className="border-b border-border/35 px-5 py-6 sm:px-7">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h3 className="text-[0.88rem] font-medium text-ink">{title}</h3>
        {action}
      </div>
      {children}
    </section>
  );
}

export function MetadataGrid({ items }: { items: Array<{ label: string; value: string }> }) {
  return (
    <dl className="grid overflow-hidden rounded-[var(--radius-standard)] bg-panel/55 shadow-[inset_0_1px_0_rgb(255_255_255/0.025)] sm:grid-cols-2 xl:grid-cols-3">
      {items.map((item) => (
        <div key={item.label} className="border-b border-r border-border/25 px-4 py-3.5">
          <dt className="font-mono text-[0.54rem] uppercase tracking-[0.1em] text-ink-muted">{item.label}</dt>
          <dd title={item.value} className="mt-1.5 break-words text-[0.78rem] text-ink-secondary">{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}

export function Tag({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "accent" | "success" | "warning" | "error" }) {
  const tones = {
    neutral: "bg-panel-strong text-ink-secondary",
    accent: "bg-panel-strong text-accent",
    success: "bg-panel-strong text-success",
    warning: "bg-panel-strong text-warning",
    error: "bg-panel-strong text-error",
  };
  return <span className={`inline-flex items-center rounded-full px-2 py-1 text-[0.58rem] leading-none ${tones[tone]}`}>{children}</span>;
}

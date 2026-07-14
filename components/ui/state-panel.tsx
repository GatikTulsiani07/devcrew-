import type { LucideIcon } from "lucide-react";
import { AlertTriangle, LoaderCircle } from "lucide-react";

type StatePanelProps = {
  icon?: LucideIcon;
  title: string;
  description: string;
  action?: React.ReactNode;
  tone?: "neutral" | "error" | "loading";
};

export function StatePanel({
  icon: SuppliedIcon,
  title,
  description,
  action,
  tone = "neutral",
}: StatePanelProps) {
  const Icon = SuppliedIcon ?? (tone === "error" ? AlertTriangle : LoaderCircle);
  const iconClass = tone === "error" ? "text-error" : "text-ink-muted";

  return (
    <div
      className="flex min-h-44 flex-col items-center justify-center rounded-[var(--radius-standard)] border border-dashed border-border bg-panel/50 px-5 py-8 text-center"
      role={tone === "error" ? "alert" : undefined}
      aria-live={tone === "loading" ? "polite" : undefined}
    >
      <span className="mb-3 grid size-8 place-items-center rounded-[var(--radius-small)] border border-border bg-elevated">
        <Icon
          aria-hidden="true"
          className={`size-3.5 ${iconClass} ${tone === "loading" ? "animate-spin" : ""}`}
        />
      </span>
      <h2 className="text-xs font-semibold text-ink">{title}</h2>
      <p className="mt-1.5 max-w-md text-xs leading-5 text-ink-secondary">{description}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

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
      className="flex min-h-56 flex-col items-center justify-center rounded-[var(--radius-standard)] bg-panel/45 px-6 py-10 text-center shadow-[inset_0_1px_0_rgb(255_255_255/0.025)]"
      role={tone === "error" ? "alert" : undefined}
      aria-live={tone === "loading" ? "polite" : undefined}
    >
      <span className="mb-4 grid size-8 place-items-center rounded-[var(--radius-small)] bg-elevated">
        <Icon
          aria-hidden="true"
          className={`size-3.5 ${iconClass} ${tone === "loading" ? "animate-spin" : ""}`}
        />
      </span>
      <h2 className="font-display text-[1.45rem] leading-tight text-ink">{title}</h2>
      <p className="mt-2 max-w-md text-[0.9rem] leading-6 text-ink-secondary">{description}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

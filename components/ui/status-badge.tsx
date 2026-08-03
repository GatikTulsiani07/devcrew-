import { Circle, CirclePause, CircleStop, Clock3 } from "lucide-react";
import type { AgentStatus } from "@/lib/mock-data";

const statusConfig: Record<
  AgentStatus,
  { className: string; icon: typeof Circle }
> = {
  active: {
    className: "border-success/25 bg-success-soft text-success",
    icon: Circle,
  },
  queued: {
    className: "border-warning/25 bg-warning-soft text-warning",
    icon: Clock3,
  },
  idle: {
    className: "border-border-strong bg-panel-strong text-ink-secondary",
    icon: CirclePause,
  },
  stopped: {
    className: "border-error/20 bg-error-soft text-error",
    icon: CircleStop,
  },
};

export function StatusBadge({
  status,
  label,
}: {
  status: AgentStatus;
  label: string;
}) {
  const config = statusConfig[status];
  const Icon = config.icon;

  return (
    <span
      className={`inline-flex w-fit items-center gap-1 rounded-full border px-1.5 py-1 text-[0.61rem] font-medium leading-none ${config.className}`}
    >
      <Icon aria-hidden="true" className="size-2.5" strokeWidth={2} />
      {label}
    </span>
  );
}

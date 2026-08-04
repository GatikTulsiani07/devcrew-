import { Circle, CirclePause, CircleStop, Clock3 } from "lucide-react";
import type { AgentStatus } from "@/lib/mock-data";

const statusConfig: Record<
  AgentStatus,
  { className: string; icon: typeof Circle }
> = {
  active: {
    className: "bg-panel-strong text-accent",
    icon: Circle,
  },
  queued: {
    className: "bg-panel-strong text-warning",
    icon: Clock3,
  },
  idle: {
    className: "bg-panel-strong text-ink-secondary",
    icon: CirclePause,
  },
  stopped: {
    className: "bg-panel-strong text-error",
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
      className={`inline-flex w-fit items-center gap-1 rounded-full px-2 py-1 text-[0.62rem] font-medium leading-none ${config.className}`}
    >
      <Icon aria-hidden="true" className="size-2.5" strokeWidth={2} />
      {label}
    </span>
  );
}

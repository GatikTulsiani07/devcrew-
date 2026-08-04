import type { Agent } from "@/lib/mock-data";

const tones: Record<Agent["avatarTone"], string> = {
  ember: "bg-panel-strong text-[#d2cdc5]",
  moss: "bg-panel-strong text-[#b9beb5]",
  slate: "bg-panel-strong text-[#b8bab8]",
  plum: "bg-panel-strong text-[#c1bbb9]",
};

type AgentAvatarProps = {
  agent: Pick<Agent, "name" | "shortName" | "avatarTone">;
  size?: "small" | "medium" | "large";
};

const sizes = {
  small: "size-6 text-[0.54rem]",
  medium: "size-8 text-[0.62rem]",
  large: "size-10 text-[0.68rem]",
};

export function AgentAvatar({ agent, size = "medium" }: AgentAvatarProps) {
  return (
    <span
      aria-hidden="true"
      className={`inline-flex shrink-0 items-center justify-center rounded-[var(--radius-small)] font-mono font-medium tracking-[0.08em] shadow-[inset_0_1px_0_rgb(255_255_255/0.035)] ${tones[agent.avatarTone]} ${sizes[size]}`}
      title={agent.name}
    >
      {agent.shortName}
    </span>
  );
}

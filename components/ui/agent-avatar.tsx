import type { Agent } from "@/lib/mock-data";

const tones: Record<Agent["avatarTone"], string> = {
  ember: "border-accent/35 bg-accent-soft text-[#efad7d]",
  moss: "border-success/30 bg-success-soft text-success",
  slate: "border-[#71829a]/35 bg-[#1d252e] text-[#9eb0c8]",
  plum: "border-[#9b7f9f]/35 bg-[#2a202b] text-[#c0a2c4]",
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
      className={`inline-flex shrink-0 items-center justify-center rounded-[var(--radius-standard)] border font-mono font-semibold tracking-[0.08em] ${tones[agent.avatarTone]} ${sizes[size]}`}
      title={agent.name}
    >
      {agent.shortName}
    </span>
  );
}

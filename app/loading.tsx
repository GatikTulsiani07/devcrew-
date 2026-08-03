import { StatePanel } from "@/components/ui/state-panel";

export default function Loading() {
  return (
    <div className="mx-auto w-full max-w-6xl px-[var(--space-page)] py-5">
      <StatePanel
        tone="loading"
        title="Preparing workspace"
        description="Loading the selected project context and its current work."
      />
    </div>
  );
}

"use client";

import { RotateCcw } from "lucide-react";
import { StatePanel } from "@/components/ui/state-panel";

export default function ErrorPage({
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  return (
    <div className="mx-auto w-full max-w-6xl px-[var(--space-page)] py-5">
      <StatePanel
        tone="error"
        title="This workspace view could not be loaded"
        description="Your project context is still safe. Retry this view, or use the navigation to continue elsewhere."
        action={
          <button
            type="button"
            onClick={unstable_retry}
            className="inline-flex min-h-9 items-center gap-2 rounded-[var(--radius-small)] border border-error/30 bg-error-soft px-3.5 text-xs font-medium text-error hover:border-error/50"
          >
            <RotateCcw aria-hidden="true" className="size-3.5" />
            Try again
          </button>
        }
      />
    </div>
  );
}

import Link from "next/link";
import { Compass } from "lucide-react";
import { StatePanel } from "@/components/ui/state-panel";

export default function NotFound() {
  return (
    <div className="mx-auto w-full max-w-6xl px-[var(--space-page)] py-5">
      <StatePanel
        icon={Compass}
        title="Workspace page not found"
        description="This route is not part of the Devcrew MVP workspace. Return to Activity to see the team’s current work."
        action={
          <Link
            href="/"
            className="inline-flex min-h-9 items-center rounded-[var(--radius-small)] bg-accent px-3.5 text-xs font-semibold text-[#1c1008] hover:bg-accent-hover"
          >
            Return to Activity
          </Link>
        }
      />
    </div>
  );
}

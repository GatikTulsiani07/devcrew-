import type { Metadata } from "next";
import { ShieldCheck } from "lucide-react";
import { PlaceholderPage } from "@/components/ui/placeholder-page";

export const metadata: Metadata = { title: "Reviews" };

export default function ReviewsPage() {
  return (
    <PlaceholderPage
      eyebrow="Workspace · Reviews"
      title="Reviews"
      description="Inspect requirements, changed scope, verification evidence, and an explicit merge-readiness outcome."
      emptyTitle="No work is ready for review"
      emptyDescription="The Reviewer is correctly stopped until implementation and verification evidence are available. Silence never implies approval."
      icon={ShieldCheck}
      context={[
        { label: "Reviewer", value: "Stopped · awaiting evidence" },
        { label: "Valid outcomes", value: "Approved · Changes required · Blocked" },
        { label: "Open findings", value: "None yet" },
      ]}
    />
  );
}

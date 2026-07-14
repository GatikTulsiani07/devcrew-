import type { Metadata } from "next";
import { Bot } from "lucide-react";
import { PlaceholderPage } from "@/components/ui/placeholder-page";

export const metadata: Metadata = { title: "Agents" };

export default function AgentsPage() {
  return (
    <PlaceholderPage
      eyebrow="Workspace · Agents"
      title="Agents"
      description="Persistent AI teammates with clear roles, operating context, and accountable work."
      emptyTitle="Your core crew is assembled"
      emptyDescription="Manager, Full-stack Developer, DevOps Engineer, and Reviewer are represented in this UI preview. Configuration will follow an approved contract."
      icon={Bot}
      context={[
        { label: "Roster", value: "4 fixed MVP roles" },
        { label: "Active", value: "Manager · planning" },
        { label: "Guardrail", value: "Human approval before implementation" },
      ]}
    />
  );
}

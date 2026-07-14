import type { Metadata } from "next";
import { Ticket } from "lucide-react";
import { PlaceholderPage } from "@/components/ui/placeholder-page";

export const metadata: Metadata = { title: "Tickets" };

export default function TicketsPage() {
  return (
    <PlaceholderPage
      eyebrow="Workspace · Tickets"
      title="Tickets"
      description="Track explicit ownership, priority, lifecycle, and evidence for every committed unit of work."
      emptyTitle="The tracked-work view is ready"
      emptyDescription="Demo queue items appear on Activity. Ticket mutation remains intentionally unavailable until backend lifecycle rules are approved."
      icon={Ticket}
      context={[
        { label: "Preview queue", value: "3 planned items" },
        { label: "Priority", value: "2 P0 · 1 P1" },
        { label: "Lifecycle", value: "Server-owned" },
      ]}
    />
  );
}

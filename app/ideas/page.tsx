import type { Metadata } from "next";
import { Lightbulb } from "lucide-react";
import { PlaceholderPage } from "@/components/ui/placeholder-page";

export const metadata: Metadata = { title: "Ideas" };

export default function IdeasPage() {
  return (
    <PlaceholderPage
      eyebrow="Workspace · Ideas"
      title="Ideas"
      description="Capture useful product and engineering opportunities before they become committed work."
      emptyTitle="The idea inbox is clear"
      emptyDescription="New ideas will remain separate from tracked tickets until a person chooses to promote them."
      icon={Lightbulb}
      context={[
        { label: "Inbox", value: "0 untriaged ideas" },
        { label: "Promotion", value: "Human-directed" },
        { label: "Project", value: "Devcrew MVP" },
      ]}
    />
  );
}

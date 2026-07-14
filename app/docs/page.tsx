import type { Metadata } from "next";
import { BookOpenText } from "lucide-react";
import { PlaceholderPage } from "@/components/ui/placeholder-page";

export const metadata: Metadata = { title: "Docs" };

export default function DocsPage() {
  return (
    <PlaceholderPage
      eyebrow="Workspace · Docs"
      title="Docs"
      description="Keep project knowledge and product requirements searchable, attributable, and close to execution."
      emptyTitle="Knowledge will live here"
      emptyDescription="This surface will present project documents and product requirements together without creating a separate top-level PRD product."
      icon={BookOpenText}
      context={[
        { label: "Knowledge types", value: "Docs · Product requirements" },
        { label: "Search", value: "Not connected" },
        { label: "Mutation", value: "Explicit and attributable" },
      ]}
    />
  );
}

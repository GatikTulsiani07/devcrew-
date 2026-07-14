import type { Metadata } from "next";
import { FolderKanban } from "lucide-react";
import { PlaceholderPage } from "@/components/ui/placeholder-page";

export const metadata: Metadata = { title: "Projects" };

export default function ProjectsPage() {
  return (
    <PlaceholderPage
      eyebrow="Workspace · Projects"
      title="Projects"
      description="Keep repositories, teammates, knowledge, and delivery history inside one visible project boundary."
      emptyTitle="One focused workspace"
      emptyDescription="Devcrew MVP is the active preview project. Project creation and repository linking will connect here after the server contract is approved."
      icon={FolderKanban}
      context={[
        { label: "Current project", value: "Devcrew MVP" },
        { label: "Repository", value: "suniltulsiani/devcrew" },
        { label: "Environment", value: "Prepared local workspace" },
      ]}
      anchors={[
        { id: "new-project", label: "Create project" },
        { id: "link-repository", label: "Link repository" },
        { id: "settings", label: "Project settings" },
      ]}
    />
  );
}

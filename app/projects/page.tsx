import type { Metadata } from "next";
import { ProjectsWorkspace } from "@/components/workspace/fixture-pages";

export const metadata: Metadata = { title: "Projects" };
export default function ProjectsPage() { return <ProjectsWorkspace />; }

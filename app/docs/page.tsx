import type { Metadata } from "next";
import { DocsWorkspace } from "@/components/workspace/fixture-pages";

export const metadata: Metadata = { title: "Docs" };
export default function DocsPage() { return <DocsWorkspace />; }

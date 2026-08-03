import type { Metadata } from "next";
import { AgentsWorkspace } from "@/components/workspace/fixture-pages";

export const metadata: Metadata = { title: "Agents" };
export default function AgentsPage() { return <AgentsWorkspace />; }

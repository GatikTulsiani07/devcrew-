import type { Metadata } from "next";
import { IdeasWorkspace } from "@/components/workspace/fixture-pages";

export const metadata: Metadata = { title: "Ideas" };
export default function IdeasPage() { return <IdeasWorkspace />; }

import type { Metadata } from "next";
import { TicketsWorkspace } from "@/components/workspace/fixture-pages";

export const metadata: Metadata = { title: "Tickets" };
export default function TicketsPage() { return <TicketsWorkspace />; }

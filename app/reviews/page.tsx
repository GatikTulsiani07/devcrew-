import type { Metadata } from "next";
import { ReviewsWorkspace } from "@/components/workspace/fixture-pages";

export const metadata: Metadata = { title: "Reviews" };
export default function ReviewsPage() { return <ReviewsWorkspace />; }

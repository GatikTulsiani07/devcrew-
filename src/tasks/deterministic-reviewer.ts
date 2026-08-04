import { randomUUID } from "node:crypto";

import type {
  ReviewFinding,
  ReviewId,
  TaskReview,
  TaskReviewer,
} from "./types.js";

export type ReviewIdGenerator = () => ReviewId;
export type ReviewClock = () => Date;

export interface DeterministicReviewerDependencies {
  generateReviewId?: ReviewIdGenerator;
  now?: ReviewClock;
}

const deterministicFindings: readonly ReviewFinding[] = [
  {
    severity: "INFO",
    title: "Implementation evidence available",
    description:
      "The implementation and validation evidence are complete for deterministic review.",
  },
];

const deterministicReviewSummary =
  "Deterministic review completed successfully.";

export function createDeterministicReviewer({
  generateReviewId = () => `review_${randomUUID()}`,
  now = () => new Date(),
}: DeterministicReviewerDependencies = {}): TaskReviewer {
  return {
    async review(): Promise<TaskReview> {
      const startedAt = now().toISOString();
      const completedAt = now().toISOString();

      return {
        id: generateReviewId(),
        role: "REVIEWER",
        status: "COMPLETED",
        verdict: "APPROVED",
        attempt: 1,
        startedAt,
        completedAt,
        summary: deterministicReviewSummary,
        findings: deterministicFindings.map((finding) => ({ ...finding })),
      };
    },
  };
}

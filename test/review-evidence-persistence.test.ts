import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { prepareReviewEvidencePersistence } from "../src/tasks/review-evidence-persistence.js";
import type { TaskReview, TaskSnapshot } from "../src/tasks/types.js";

describe("review evidence persistence", () => {
  it("stores first Reviewer evidence normally", () => {
    const task = taskSnapshot({ review: undefined });
    const review = reviewEvidence("review_first", "workflow_first");

    const result = prepareReviewEvidencePersistence({
      currentTask: task,
      review,
      updatedAt: "2026-08-03T06:00:00.000Z",
    });

    assert.equal(result.persisted, true);
    assert.equal(result.task.status, "REVIEW_COMPLETED");
    assert.deepEqual(result.task.review, review);
    assert.equal(result.task.workflowFailure, undefined);
    assert.equal(result.task.updatedAt, "2026-08-03T06:00:00.000Z");
  });

  it("does not overwrite original Reviewer evidence for a duplicate workflow command", () => {
    const originalReview = reviewEvidence("review_original", "workflow_duplicate");
    const original = taskSnapshot({
      status: "REVIEW_COMPLETED",
      review: originalReview,
      updatedAt: "2026-08-03T05:00:00.000Z",
    });
    const replacement = reviewEvidence("review_replacement", "workflow_duplicate");

    const result = prepareReviewEvidencePersistence({
      currentTask: original,
      review: replacement,
      updatedAt: "2026-08-03T06:00:00.000Z",
    });

    assert.equal(result.persisted, false);
    assert.deepEqual(result.task, original);
    assert.equal(result.task.review?.verdict, originalReview.verdict);
    assert.equal(result.task.review?.status, originalReview.status);
    assert.equal(result.task.review?.summary, originalReview.summary);
    assert.deepEqual(result.task.review?.findings, originalReview.findings);
    assert.equal(result.task.review?.findings.length, 2);
    assert.equal(result.task.review?.findings[0]?.severity, "INFO");
    assert.equal(result.task.review?.findings[0]?.title, "Original first finding");
    assert.equal(
      result.task.review?.findings[0]?.description,
      "Original first finding description.",
    );
    assert.equal(result.task.review?.findings[1]?.title, "Original second finding");
    assert.equal(result.task.review?.durationMs, originalReview.durationMs);
    assert.equal(result.task.review?.completedAt, originalReview.completedAt);
    assert.equal(result.task.updatedAt, "2026-08-03T05:00:00.000Z");
  });

  it("allows legitimate re-review for a different workflow command", () => {
    const original = taskSnapshot({
      review: reviewEvidence("review_original", "workflow_original"),
    });
    const replacement = reviewEvidence("review_replacement", "workflow_next");

    const result = prepareReviewEvidencePersistence({
      currentTask: original,
      review: replacement,
      updatedAt: "2026-08-03T06:00:00.000Z",
    });

    assert.equal(result.persisted, true);
    assert.deepEqual(result.task.review, replacement);
    assert.equal(result.task.updatedAt, "2026-08-03T06:00:00.000Z");
  });
});

function taskSnapshot(overrides: Partial<TaskSnapshot> = {}): TaskSnapshot {
  return {
    id: "task_000001",
    projectId: "proj_000001",
    title: "Implement review protection",
    description: "Prevent duplicate Reviewer evidence replacement.",
    status: "VALIDATION_COMPLETED",
    plan: {
      summary: "Implement a focused backend guard.",
      steps: ["Inspect review persistence", "Add tests", "Run checks"],
    },
    planDecision: {
      decision: "APPROVE",
      decidedAt: "2026-08-03T01:00:00.000Z",
    },
    execution: {
      id: "exec_000001",
      role: "FULL_STACK_DEVELOPER",
      status: "COMPLETED",
      attempt: 1,
      startedAt: "2026-08-03T02:00:00.000Z",
      completedAt: "2026-08-03T03:00:00.000Z",
      result: {
        summary: "Implemented the task.",
        changedFiles: ["src/tasks/task-service.ts"],
        verification: ["npm test"],
      },
    },
    validation: {
      id: "val_000001",
      role: "DEVOPS_ENGINEER",
      status: "PASSED",
      attempt: 1,
      startedAt: "2026-08-03T03:00:00.000Z",
      completedAt: "2026-08-03T04:00:00.000Z",
      checks: [
        {
          name: "typecheck",
          status: "PASSED",
          summary: "Typecheck passed.",
        },
      ],
      summary: "Validation passed.",
    },
    review: reviewEvidence("review_existing", "workflow_existing"),
    workflowFailure: {
      stage: "REVIEWER",
      workflowCorrelationId: "workflow_failure",
      category: "UNKNOWN_FAILURE",
      summary: "Previous failure.",
      failedAt: "2026-08-03T04:59:00.000Z",
    },
    createdAt: "2026-08-03T00:00:00.000Z",
    updatedAt: "2026-08-03T05:00:00.000Z",
    ...overrides,
  };
}

function reviewEvidence(id: string, workflowCorrelationId: string): TaskReview {
  const original = id === "review_original";

  return {
    id,
    role: "REVIEWER",
    status: "COMPLETED",
    verdict: "APPROVED",
    attempt: 1,
    workflowCorrelationId,
    startedAt: original
      ? "2026-08-03T04:00:00.000Z"
      : "2026-08-03T05:00:00.000Z",
    completedAt: original
      ? "2026-08-03T04:01:00.000Z"
      : "2026-08-03T05:01:00.000Z",
    durationMs: original ? 610 : 920,
    summary: original
      ? "Original Reviewer summary."
      : "Replacement Reviewer summary.",
    findings: original
      ? [
          {
            severity: "INFO",
            title: "Original first finding",
            description: "Original first finding description.",
          },
          {
            severity: "INFO",
            title: "Original second finding",
            description: "Original second finding description.",
          },
        ]
      : [
          {
            severity: "INFO",
            title: "Replacement finding",
            description: "Replacement finding description.",
          },
        ],
  };
}

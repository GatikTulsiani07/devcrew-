import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { prepareValidationEvidencePersistence } from "../src/tasks/validation-evidence-persistence.js";
import type { TaskSnapshot, TaskValidation } from "../src/tasks/types.js";

describe("validation evidence persistence", () => {
  it("stores first validation evidence normally", () => {
    const task = taskSnapshot({ validation: undefined });
    const validation = validationEvidence("val_first", "workflow_first");

    const result = prepareValidationEvidencePersistence({
      currentTask: task,
      validation,
      updatedAt: "2026-08-03T03:00:00.000Z",
    });

    assert.equal(result.persisted, true);
    assert.equal(result.screenshotEvidenceAttached, true);
    assert.equal(result.task.status, "VALIDATION_COMPLETED");
    assert.deepEqual(result.task.validation, validation);
    assert.equal(result.task.updatedAt, "2026-08-03T03:00:00.000Z");
    assert.equal(result.task.workflowFailure, undefined);
  });

  it("does not overwrite original validation evidence for a duplicate workflow command", () => {
    const originalValidation = validationEvidence(
      "val_original",
      "workflow_duplicate",
    );
    const original = taskSnapshot({
      status: "REVIEW_COMPLETED",
      validation: originalValidation,
      updatedAt: "2026-08-03T02:00:00.000Z",
    });
    const replacement = validationEvidence(
      "val_replacement",
      "workflow_duplicate",
    );

    const result = prepareValidationEvidencePersistence({
      currentTask: original,
      validation: replacement,
      updatedAt: "2026-08-03T04:00:00.000Z",
    });

    assert.equal(result.persisted, false);
    assert.equal(result.screenshotEvidenceAttached, false);
    assert.deepEqual(result.task, original);
    assert.equal(result.task.status, "REVIEW_COMPLETED");
    assert.equal(result.task.validation?.status, originalValidation.status);
    assert.deepEqual(result.task.validation?.checks, originalValidation.checks);
    assert.equal(result.task.validation?.durationMs, originalValidation.durationMs);
    assert.deepEqual(
      result.task.validation?.validationSelection,
      originalValidation.validationSelection,
    );
    assert.deepEqual(result.task.validation?.integrity, originalValidation.integrity);
    assert.deepEqual(
      result.task.validation?.browserVerification,
      originalValidation.browserVerification,
    );
    assert.deepEqual(
      result.task.validation?.browserScreenshot,
      originalValidation.browserScreenshot,
    );
    assert.deepEqual(
      result.task.validation?.visualReview,
      originalValidation.visualReview,
    );
    assert.equal(result.task.updatedAt, "2026-08-03T02:00:00.000Z");
  });

  it("allows legitimate revalidation for a different workflow command", () => {
    const original = taskSnapshot({
      validation: validationEvidence("val_original", "workflow_original"),
    });
    const replacement = validationEvidence("val_replacement", "workflow_next");

    const result = prepareValidationEvidencePersistence({
      currentTask: original,
      validation: replacement,
      updatedAt: "2026-08-03T04:00:00.000Z",
    });

    assert.equal(result.persisted, true);
    assert.equal(result.screenshotEvidenceAttached, true);
    assert.deepEqual(result.task.validation, replacement);
    assert.equal(result.task.updatedAt, "2026-08-03T04:00:00.000Z");
  });

  it("does not replace screenshot evidence for a duplicate screenshot id in the same validation command", () => {
    const originalValidation = validationEvidence("val_original", "workflow_shared");
    const original = taskSnapshot({ validation: originalValidation });
    const replacement = validationEvidence("val_replacement", "workflow_shared");
    replacement.browserScreenshot = {
      ...replacement.browserScreenshot!,
      id: originalValidation.browserScreenshot!.id,
      workflowCorrelationId: "workflow_shared",
      url: "http://127.0.0.1:3000/replacement",
      capturedAt: "2026-08-03T03:00:40.000Z",
      durationMs: 999,
    };
    replacement.visualReview = {
      ...replacement.visualReview!,
      workflowCorrelationId: "workflow_shared",
      screenshotId: originalValidation.browserScreenshot!.id,
      summary: "Replacement visual review must not replace original linkage.",
      reviewedAt: "2026-08-03T03:00:50.000Z",
      durationMs: 888,
    };

    const result = prepareValidationEvidencePersistence({
      currentTask: original,
      validation: replacement,
      updatedAt: "2026-08-03T04:00:00.000Z",
      allowSameWorkflowCorrelationReplacement: true,
    });

    assert.equal(result.persisted, true);
    assert.equal(result.screenshotEvidenceAttached, false);
    assert.deepEqual(
      result.task.validation?.browserScreenshot,
      originalValidation.browserScreenshot,
    );
    assert.deepEqual(
      result.task.validation?.visualReview,
      originalValidation.visualReview,
    );
    assert.equal(result.task.validation?.id, replacement.id);
  });

  it("allows different screenshot ids under the same validation command", () => {
    const original = taskSnapshot({
      validation: validationEvidence("val_original", "workflow_shared"),
    });
    const replacement = validationEvidence("val_repair", "workflow_shared");

    const result = prepareValidationEvidencePersistence({
      currentTask: original,
      validation: replacement,
      updatedAt: "2026-08-03T04:00:00.000Z",
      allowSameWorkflowCorrelationReplacement: true,
    });

    assert.equal(result.persisted, true);
    assert.equal(result.screenshotEvidenceAttached, true);
    assert.equal(result.task.validation?.browserScreenshot?.id, "shot_replacement");
    assert.equal(result.task.validation?.visualReview?.screenshotId, "shot_replacement");
  });

  it("allows the same screenshot id under a different validation command", () => {
    const original = taskSnapshot({
      validation: validationEvidence("val_original", "workflow_original"),
    });
    const replacement = validationEvidence("val_replacement", "workflow_next");
    replacement.browserScreenshot = {
      ...replacement.browserScreenshot!,
      id: original.validation!.browserScreenshot!.id,
      workflowCorrelationId: "workflow_next",
    };
    replacement.visualReview = {
      ...replacement.visualReview!,
      workflowCorrelationId: "workflow_next",
      screenshotId: original.validation!.browserScreenshot!.id,
    };

    const result = prepareValidationEvidencePersistence({
      currentTask: original,
      validation: replacement,
      updatedAt: "2026-08-03T04:00:00.000Z",
      allowSameWorkflowCorrelationReplacement: true,
    });

    assert.equal(result.persisted, true);
    assert.equal(result.screenshotEvidenceAttached, true);
    assert.deepEqual(result.task.validation?.browserScreenshot, replacement.browserScreenshot);
    assert.deepEqual(result.task.validation?.visualReview, replacement.visualReview);
  });

  it("does not deduplicate different screenshot ids with identical metadata", () => {
    const original = taskSnapshot({
      validation: validationEvidence("val_original", "workflow_shared"),
    });
    const replacement = validationEvidence("val_replacement", "workflow_shared");
    replacement.browserScreenshot = {
      ...replacement.browserScreenshot!,
      id: "shot_distinct",
      url: original.validation!.browserScreenshot!.url,
      viewport: { ...original.validation!.browserScreenshot!.viewport },
      capturedAt: original.validation!.browserScreenshot!.capturedAt,
      durationMs: original.validation!.browserScreenshot!.durationMs,
    };
    replacement.visualReview = {
      ...replacement.visualReview!,
      screenshotId: "shot_distinct",
    };

    const result = prepareValidationEvidencePersistence({
      currentTask: original,
      validation: replacement,
      updatedAt: "2026-08-03T04:00:00.000Z",
      allowSameWorkflowCorrelationReplacement: true,
    });

    assert.equal(result.persisted, true);
    assert.equal(result.screenshotEvidenceAttached, true);
    assert.equal(result.task.validation?.browserScreenshot?.id, "shot_distinct");
  });

  it("scopes duplicate screenshot detection to the current task", () => {
    const original = taskSnapshot({
      id: "task_000001",
      validation: validationEvidence("val_original", "workflow_shared"),
    });
    const otherTask = taskSnapshot({
      id: "task_000002",
      validation: undefined,
    });
    const otherTaskValidation = validationEvidence("val_replacement", "workflow_shared");
    otherTaskValidation.browserScreenshot = {
      ...otherTaskValidation.browserScreenshot!,
      id: original.validation!.browserScreenshot!.id,
    };
    otherTaskValidation.visualReview = {
      ...otherTaskValidation.visualReview!,
      screenshotId: original.validation!.browserScreenshot!.id,
    };

    const result = prepareValidationEvidencePersistence({
      currentTask: otherTask,
      validation: otherTaskValidation,
      updatedAt: "2026-08-03T04:00:00.000Z",
      allowSameWorkflowCorrelationReplacement: true,
    });

    assert.equal(result.persisted, true);
    assert.equal(result.screenshotEvidenceAttached, true);
    assert.equal(result.task.id, "task_000002");
  });

  it("allows explicit internal refreshes under the same workflow command", () => {
    const original = taskSnapshot({
      validation: validationEvidence("val_original", "workflow_shared"),
    });
    const replacement = validationEvidence("val_repair", "workflow_shared");

    const result = prepareValidationEvidencePersistence({
      currentTask: original,
      validation: replacement,
      updatedAt: "2026-08-03T04:00:00.000Z",
      allowSameWorkflowCorrelationReplacement: true,
    });

    assert.equal(result.persisted, true);
    assert.equal(result.screenshotEvidenceAttached, true);
    assert.deepEqual(result.task.validation, replacement);
    assert.equal(result.task.updatedAt, "2026-08-03T04:00:00.000Z");
  });
});

function taskSnapshot(
  overrides: Partial<TaskSnapshot> = {},
): TaskSnapshot {
  return {
    id: "task_000001",
    projectId: "proj_000001",
    title: "Implement validation protection",
    description: "Prevent duplicate validation evidence replacement.",
    status: "VALIDATION_COMPLETED",
    plan: {
      summary: "Implement a focused backend guard.",
      steps: ["Inspect validation persistence", "Add tests", "Run checks"],
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
      startedAt: "2026-08-03T01:00:00.000Z",
      completedAt: "2026-08-03T01:30:00.000Z",
      result: {
        summary: "Implemented the task.",
        changedFiles: ["src/tasks/task-service.ts"],
        verification: ["npm test"],
      },
    },
    validation: validationEvidence("val_existing", "workflow_existing"),
    workflowFailure: {
      stage: "DEVOPS",
      workflowCorrelationId: "workflow_failure",
      category: "UNKNOWN_FAILURE",
      summary: "Previous failure.",
      failedAt: "2026-08-03T01:59:00.000Z",
    },
    createdAt: "2026-08-03T00:00:00.000Z",
    updatedAt: "2026-08-03T02:00:00.000Z",
    ...overrides,
  };
}

function validationEvidence(
  id: string,
  workflowCorrelationId: string,
): TaskValidation {
  return {
    id,
    role: "DEVOPS_ENGINEER",
    status: "PASSED",
    attempt: 1,
    workflowCorrelationId,
    startedAt: `2026-08-03T02:00:00.000Z`,
    completedAt: `2026-08-03T02:01:00.000Z`,
    durationMs: id === "val_original" ? 610 : 920,
    checks:
      id === "val_original"
        ? [
            {
              name: "typecheck",
              status: "PASSED",
              summary: "Original typecheck passed.",
            },
            {
              name: "tests",
              status: "PASSED",
              summary: "Original tests passed.",
            },
          ]
        : [
            {
              name: "build",
              status: "PASSED",
              summary: "Replacement build passed.",
            },
          ],
    summary:
      id === "val_original"
        ? "Original validation summary."
        : "Replacement validation summary.",
    validationSelection:
      id === "val_original"
        ? {
            strategy: "TARGETED",
            categories: ["BACKEND"],
            browserVerificationSelected: false,
            reason: "BACKEND_ONLY",
          }
        : {
            strategy: "FULL",
            categories: ["FRONTEND", "BACKEND"],
            browserVerificationSelected: true,
            reason: "MIXED_CODE",
          },
    integrity:
      id === "val_original"
        ? {
            repositoryStateId: "state_original",
            headSha: "1111111111111111111111111111111111111111",
            branch: "devcrew/task-task_000001",
            validatedAt: "2026-08-03T02:01:00.000Z",
          }
        : {
            repositoryStateId: "state_replacement",
            headSha: "2222222222222222222222222222222222222222",
            branch: "devcrew/task-task_000001",
            validatedAt: "2026-08-03T02:01:00.000Z",
          },
    browserVerification: {
      status: "PASSED",
      workflowCorrelationId,
      url:
        id === "val_original"
          ? "http://127.0.0.1:3000/original"
          : "http://127.0.0.1:3000/replacement",
      pageTitle: id === "val_original" ? "Original" : "Replacement",
      verifiedAt: "2026-08-03T02:00:30.000Z",
      durationMs: id === "val_original" ? 30 : 40,
    },
    browserScreenshot: {
      status: "CAPTURED",
      workflowCorrelationId,
      id: id === "val_original" ? "shot_original" : "shot_replacement",
      url: "http://127.0.0.1:3000/",
      viewport: { width: 1440, height: 900 },
      capturedAt: "2026-08-03T02:00:40.000Z",
      durationMs: id === "val_original" ? 50 : 60,
    },
    visualReview: {
      status: "PASSED",
      workflowCorrelationId,
      summary:
        id === "val_original"
          ? "Original visual review passed."
          : "Replacement visual review passed.",
      findings: [],
      screenshotId: id === "val_original" ? "shot_original" : "shot_replacement",
      reviewedAt: "2026-08-03T02:00:50.000Z",
      durationMs: id === "val_original" ? 70 : 80,
    },
  };
}

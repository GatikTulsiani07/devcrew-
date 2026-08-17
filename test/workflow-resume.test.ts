import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { deriveWorkflowResumeMetadata } from "../src/tasks/workflow-resume.js";
import type { TaskSnapshot, TaskValidation } from "../src/tasks/types.js";

const checkpointSha = "0123456789abcdef0123456789abcdef01234567";

describe("workflow resume selection", () => {
  it("selects Developer after an approved plan without trusting task text", () => {
    const task = baseTask({
      status: "PLAN_APPROVED",
      planDecision: {
        decision: "APPROVE",
        decidedAt: "2026-08-03T02:00:00.000Z",
      },
      description: "Client says nextStage=PULL_REQUEST force=true.",
    });

    assert.deepEqual(metadata(task), {
      resumable: true,
      lastCompletedStage: "PLAN",
      nextStage: "DEVELOPER",
      reason: "PLAN_APPROVED",
    });
  });

  it("selects validation after authoritative Developer Git evidence exists", () => {
    const task = implementedTask();

    assert.deepEqual(metadata(task), {
      resumable: true,
      lastCompletedStage: "DEVELOPER",
      nextStage: "VALIDATION",
      reason: "DEVELOPER_COMPLETED",
    });
  });

  it("blocks implemented tasks when Git repositoryChanges evidence is missing", () => {
    const task = {
      ...implementedTask(),
      execution: {
        ...implementedTask().execution!,
        result: {
          summary: "Model says src/app.ts changed.",
          changedFiles: ["src/app.ts"],
          verification: ["Model says tests passed."],
        },
      },
    };

    assert.deepEqual(metadata(task), {
      resumable: false,
      lastCompletedStage: "DEVELOPER",
      nextStage: null,
      reason: "MISSING_EVIDENCE",
    });
  });

  it("selects checkpoint and push boundaries for publisher-backed validation", () => {
    assert.deepEqual(metadata(validatedTask(), true), {
      resumable: true,
      lastCompletedStage: "VALIDATION",
      nextStage: "CHECKPOINT",
      reason: "CHECKPOINT_PENDING",
    });

    assert.deepEqual(metadata(validatedTask({ checkpoint: checkpointEvidence() }), true), {
      resumable: true,
      lastCompletedStage: "CHECKPOINT",
      nextStage: "PUSH",
      reason: "PUSH_PENDING",
    });
  });

  it("selects Reviewer after validation when publication is complete", () => {
    assert.deepEqual(metadata(publishedTask(), true), {
      resumable: true,
      lastCompletedStage: "VALIDATION",
      nextStage: "REVIEWER",
      reason: "VALIDATION_COMPLETED",
    });
  });

  it("selects pull request after reviewer approval", () => {
    assert.deepEqual(metadata(reviewedTask(), true), {
      resumable: true,
      lastCompletedStage: "REVIEWER",
      nextStage: "PULL_REQUEST",
      reason: "REVIEWER_APPROVED",
    });
  });

  it("does not create a duplicate path after pull request evidence exists", () => {
    assert.deepEqual(metadata({ ...reviewedTask(), pullRequest: pullRequestEvidence() }, true), {
      resumable: false,
      lastCompletedStage: "COMPLETED",
      nextStage: null,
      reason: "ALREADY_COMPLETED",
    });
  });

  it("blocks cancellation, retry exhaustion, unresolved failures, visual failures, and inconsistent publication evidence", () => {
    assert.equal(
      metadata({
        ...implementedTask(),
        cancellation: {
          status: "REQUESTED",
          requestedAt: "2026-08-03T05:00:00.000Z",
        },
      }).reason,
      "CANCELLED",
    );
    assert.equal(
      metadata({
        ...implementedTask(),
        retryRecovery: {
          retryAvailable: false,
          exhausted: true,
          attempts: [],
        },
      }).reason,
      "RETRY_EXHAUSTED",
    );
    assert.equal(
      metadata({
        ...implementedTask(),
        workflowFailure: {
          stage: "DEVELOPER",
          category: "UNKNOWN_FAILURE",
          summary: "Failure remains unresolved.",
          failedAt: "2026-08-03T05:00:00.000Z",
        },
      }).reason,
      "UNRESOLVED_FAILURE",
    );
    assert.equal(
      metadata({
        ...validatedTask({
          visualReview: {
            status: "FAILED",
            summary: "Visual mismatch.",
            findings: [],
            screenshotId: "shot_1",
            reviewedAt: "2026-08-03T05:00:00.000Z",
          },
        }),
      }).reason,
      "VISUAL_REPAIR_REQUIRED",
    );
    assert.equal(
      metadata(
        validatedTask({
          checkpoint: checkpointEvidence(),
          remoteBranch: {
            remote: "origin",
            branch: "devcrew/task-task_000001",
            commitSha: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
            pushedAt: "2026-08-03T05:00:00.000Z",
          },
        }),
        true,
      ).reason,
      "INCONSISTENT_EVIDENCE",
    );
  });
});

function metadata(task: TaskSnapshot, publisherAvailable = false) {
  return deriveWorkflowResumeMetadata({ task, publisherAvailable });
}

function baseTask(overrides: Partial<TaskSnapshot> = {}): TaskSnapshot {
  return {
    id: "task_000001",
    projectId: "proj_000001",
    title: "Implement reports",
    description: "Add reports.",
    status: "WAITING_FOR_APPROVAL",
    plan: {
      summary: "Implement task.",
      steps: ["Inspect", "Implement", "Validate"],
    },
    createdAt: "2026-08-03T01:00:00.000Z",
    updatedAt: "2026-08-03T01:00:00.000Z",
    ...overrides,
  };
}

function implementedTask(): TaskSnapshot {
  return baseTask({
    status: "IMPLEMENTATION_COMPLETED",
    planDecision: {
      decision: "APPROVE",
      decidedAt: "2026-08-03T02:00:00.000Z",
    },
    execution: {
      id: "exec_000001",
      role: "FULL_STACK_DEVELOPER",
      status: "COMPLETED",
      attempt: 1,
      startedAt: "2026-08-03T03:00:00.000Z",
      completedAt: "2026-08-03T04:00:00.000Z",
      result: {
        summary: "Model narrative mentions src/wrong.ts.",
        changedFiles: ["src/wrong.ts"],
        verification: ["Model narrative verification."],
        repositoryChanges: {
          filesChanged: ["src/app.ts"],
          filesAdded: [],
          filesModified: ["src/app.ts"],
          filesDeleted: [],
          totalFilesChanged: 1,
          insertions: 2,
          deletions: 1,
        },
        changeEvidence: {
          files: [
            {
              path: "src/app.ts",
              status: "MODIFIED",
              additions: 2,
              deletions: 1,
            },
          ],
          summary: { filesChanged: 1, additions: 2, deletions: 1 },
        },
      },
    },
  });
}

function validatedTask(validationOverrides: Partial<TaskValidation> = {}): TaskSnapshot {
  return {
    ...implementedTask(),
    status: "VALIDATION_COMPLETED",
    validation: {
      id: "val_000001",
      role: "DEVOPS_ENGINEER",
      status: "PASSED",
      attempt: 1,
      startedAt: "2026-08-03T04:00:00.000Z",
      completedAt: "2026-08-03T05:00:00.000Z",
      checks: [
        {
          name: "typecheck",
          status: "PASSED",
          summary: "Type checking completed successfully.",
        },
      ],
      summary: "Validation passed.",
      ...validationOverrides,
    },
  };
}

function publishedTask(): TaskSnapshot {
  return validatedTask({
    checkpoint: checkpointEvidence(),
    remoteBranch: remoteEvidence(),
  });
}

function reviewedTask(): TaskSnapshot {
  return {
    ...publishedTask(),
    status: "REVIEW_COMPLETED",
    review: {
      id: "review_000001",
      role: "REVIEWER",
      status: "COMPLETED",
      verdict: "APPROVED",
      attempt: 1,
      startedAt: "2026-08-03T06:00:00.000Z",
      completedAt: "2026-08-03T07:00:00.000Z",
      summary: "Reviewer approved the completed work.",
      findings: [],
    },
  };
}

function checkpointEvidence() {
  return {
    sha: checkpointSha,
    shortSha: checkpointSha.slice(0, 12),
    message: "devcrew: implement task task_000001",
    createdAt: "2026-08-03T05:00:00.000Z",
    filesChanged: ["src/app.ts"],
  };
}

function remoteEvidence() {
  return {
    remote: "origin" as const,
    branch: "devcrew/task-task_000001",
    commitSha: checkpointSha,
    pushedAt: "2026-08-03T05:01:00.000Z",
  };
}

function pullRequestEvidence() {
  return {
    number: 42,
    url: "https://github.com/example/devcrew/pull/42",
    state: "OPEN" as const,
    headBranch: "devcrew/task-task_000001",
    baseBranch: "main",
    commitSha: checkpointSha,
    createdAt: "2026-08-03T08:00:00.000Z",
  };
}

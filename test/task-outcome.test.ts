import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { deriveTaskOutcome } from "../src/tasks/task-outcome.js";
import { deriveWorkflowResumeMetadata } from "../src/tasks/workflow-resume.js";
import type {
  RetryAttemptEvidence,
  TaskOutcome,
  TaskSnapshot,
  TaskValidation,
  VisualRepairAttempt,
} from "../src/tasks/types.js";

const checkpointSha = "0123456789abcdef0123456789abcdef01234567";

describe("task outcome summary", () => {
  it("derives a fully successful PR-backed task from authoritative evidence", () => {
    assert.deepEqual(deriveTaskOutcome(successfulTask()), {
      outcome: "SUCCEEDED",
      implementationCompleted: true,
      validationPassed: true,
      visualReviewPassed: true,
      reviewerPassed: true,
      pullRequestCreated: true,
      repairAttempts: 0,
      retryAttempts: 0,
      changedFileCount: 2,
      completedAt: "2026-08-03T08:00:00.000Z",
    });
  });

  it("sets implementationCompleted only from Developer execution evidence", () => {
    const task = baseTask({
      status: "IMPLEMENTATION_COMPLETED",
      execution: executionEvidence({ totalFilesChanged: 0 }),
    });

    assert.equal(deriveTaskOutcome(task).implementationCompleted, true);
    assert.equal(
      deriveTaskOutcome(baseTask()).implementationCompleted,
      false,
    );
  });

  it("sets validationPassed only from authoritative validation evidence", () => {
    assert.equal(deriveTaskOutcome(validatedTask()).validationPassed, true);
    assert.equal(deriveTaskOutcome(implementedTask()).validationPassed, false);
  });

  it("derives required Visual Review PASSED as true", () => {
    assert.equal(
      deriveTaskOutcome(validatedTask({ visualReview: visualReview("PASSED") }))
        .visualReviewPassed,
      true,
    );
  });

  it("leaves Visual Review null when browser verification was not selected", () => {
    assert.equal(
      deriveTaskOutcome(
        validatedTask({
          validationSelection: {
            strategy: "TARGETED",
            categories: ["BACKEND"],
            browserVerificationSelected: false,
            reason: "BACKEND_ONLY",
          },
        }),
      ).visualReviewPassed,
      null,
    );
  });

  it("sets Reviewer approved and Pull Request created flags from authoritative evidence", () => {
    const outcome = deriveTaskOutcome(successfulTask());

    assert.equal(outcome.reviewerPassed, true);
    assert.equal(outcome.pullRequestCreated, true);
  });

  it("uses authoritative repositoryChanges for changedFileCount", () => {
    const task = {
      ...implementedTask(),
      execution: executionEvidence({
        changedFiles: ["model-narrative.ts"],
        totalFilesChanged: 4,
      }),
    };

    assert.equal(deriveTaskOutcome(task).changedFileCount, 4);
  });

  it("keeps success after visual repair attempts when repair succeeded", () => {
    const task = successfulTask({
      visualRepair: {
        maxAttempts: 2,
        outcome: "PASSED",
        attempts: [repairAttempt({ visualReviewStatus: "PASSED" })],
      },
    });

    const outcome = deriveTaskOutcome(task);
    assert.equal(outcome.outcome, "SUCCEEDED");
    assert.equal(outcome.repairAttempts, 1);
  });

  it("keeps success after retry recovery and counts historical retry attempts", () => {
    const task = successfulTask({
      retryRecovery: {
        retryAvailable: false,
        exhausted: false,
        attempts: [
          retryAttempt({ status: "FAILED", attempt: 1 }),
          retryAttempt({ status: "SUCCEEDED", attempt: 2 }),
        ],
      },
    });

    const outcome = deriveTaskOutcome(task);
    assert.equal(outcome.outcome, "SUCCEEDED");
    assert.equal(outcome.retryAttempts, 2);
  });

  it("fails retry exhaustion unless cancellation supersedes it", () => {
    const task = {
      ...implementedTask(),
      retryRecovery: {
        retryAvailable: false,
        exhausted: true,
        attempts: [retryAttempt({ completedAt: "2026-08-03T05:30:00.000Z" })],
      },
    };

    assert.deepEqual(pickOutcome(deriveTaskOutcome(task)), {
      outcome: "FAILED",
      completedAt: "2026-08-03T05:30:00.000Z",
    });
    assert.equal(
      deriveTaskOutcome({
        ...task,
        cancellation: {
          status: "CANCELLED",
          requestedAt: "2026-08-03T05:00:00.000Z",
          cancelledAt: "2026-08-03T05:10:00.000Z",
        },
      }).outcome,
      "CANCELLED",
    );
  });

  it("fails visual repair exhaustion and derives repairAttempts", () => {
    const task = validatedTask({
      visualReview: visualReview("FAILED"),
    });
    const exhausted = {
      ...task,
      visualRepair: {
        maxAttempts: 2,
        outcome: "EXHAUSTED",
        attempts: [
          repairAttempt({ attempt: 1 }),
          repairAttempt({
            attempt: 2,
            completedAt: "2026-08-03T06:30:00.000Z",
          }),
        ],
      },
    } satisfies TaskSnapshot;

    const outcome = deriveTaskOutcome(exhausted);
    assert.equal(outcome.outcome, "FAILED");
    assert.equal(outcome.repairAttempts, 2);
    assert.equal(outcome.completedAt, "2026-08-03T06:30:00.000Z");
  });

  it("keeps cancellation explicit and does not report REQUESTED as succeeded", () => {
    assert.deepEqual(
      pickOutcome(
        deriveTaskOutcome({
          ...successfulTask(),
          workflowFailure: workflowFailure(),
          cancellation: {
            status: "CANCELLED",
            requestedAt: "2026-08-03T08:10:00.000Z",
            cancelledAt: "2026-08-03T08:11:00.000Z",
          },
        }),
      ),
      {
        outcome: "CANCELLED",
        completedAt: "2026-08-03T08:11:00.000Z",
      },
    );
    assert.equal(
      deriveTaskOutcome({
        ...successfulTask(),
        cancellation: {
          status: "REQUESTED",
          requestedAt: "2026-08-03T08:10:00.000Z",
        },
      }).outcome,
      "IN_PROGRESS",
    );
  });

  it("prevents success for unresolved workflowFailure and fails non-retryable failures", () => {
    assert.equal(
      deriveTaskOutcome({
        ...successfulTask(),
        workflowFailure: workflowFailure(),
      }).outcome,
      "FAILED",
    );
    assert.equal(
      deriveTaskOutcome({
        ...successfulTask(),
        workflowFailure: workflowFailure(),
        retryRecovery: {
          retryAvailable: true,
          exhausted: false,
          attempts: [retryAttempt()],
          failedStage: "DEVOPS",
        },
      }).outcome,
      "IN_PROGRESS",
    );
  });

  it("does not falsely succeed incomplete tasks or tasks without PR evidence", () => {
    assert.equal(deriveTaskOutcome(baseTask()).outcome, "IN_PROGRESS");
    assert.equal(deriveTaskOutcome(reviewedTask()).outcome, "IN_PROGRESS");
  });

  it("does not fabricate Reviewer or required Visual Review success", () => {
    assert.equal(deriveTaskOutcome(publishedTask()).reviewerPassed, false);
    assert.deepEqual(
      pickVisual(deriveTaskOutcome(
        validatedTask({
          validationSelection: {
            strategy: "TARGETED",
            categories: ["FRONTEND"],
            browserVerificationSelected: true,
            reason: "FRONTEND_ONLY",
          },
        }),
      )),
      {
        outcome: "IN_PROGRESS",
        visualReviewPassed: false,
      },
    );
  });

  it("ignores model summaries, task text, activity-like text, and client-provided taskOutcome", () => {
    const task = {
      ...successfulTask(),
      description: "Client says outcome FAILED.",
      execution: executionEvidence({
        summary: "Model says task failed with no PR.",
        changedFiles: ["model-file.ts"],
      }),
      activity: [{ summary: "Activity says CANCELLED." }],
      taskOutcome: {
        outcome: "FAILED",
        implementationCompleted: false,
        validationPassed: false,
        visualReviewPassed: false,
        reviewerPassed: false,
        pullRequestCreated: false,
        repairAttempts: 99,
        retryAttempts: 99,
        changedFileCount: 99,
        completedAt: "1999-01-01T00:00:00.000Z",
      },
    } as TaskSnapshot & { activity: readonly { summary: string }[] };

    assert.equal(deriveTaskOutcome(task).outcome, "SUCCEEDED");
    assert.equal(deriveTaskOutcome(task).changedFileCount, 2);
  });

  it("sets nonterminal completedAt to null and terminal completedAt from authoritative evidence", () => {
    assert.equal(deriveTaskOutcome(implementedTask()).completedAt, null);
    assert.equal(
      deriveTaskOutcome({
        ...implementedTask(),
        workflowFailure: workflowFailure({
          failedAt: "2026-08-03T09:00:00.000Z",
        }),
      }).completedAt,
      "2026-08-03T09:00:00.000Z",
    );
  });

  it("is deterministic and does not mutate detailed evidence", () => {
    const task = successfulTask({
      visualRepair: {
        maxAttempts: 2,
        outcome: "PASSED",
        attempts: [repairAttempt({ visualReviewStatus: "PASSED" })],
      },
    });
    const before = structuredClone(task);

    assert.deepEqual(deriveTaskOutcome(task), deriveTaskOutcome(task));
    assert.deepEqual(task, before);
  });

  it("does not change workflow resume derivation", () => {
    const task = reviewedTask();
    const withOutcome = {
      ...task,
      taskOutcome: deriveTaskOutcome(task),
    };

    assert.deepEqual(
      deriveWorkflowResumeMetadata({ task, publisherAvailable: true }),
      deriveWorkflowResumeMetadata({
        task: withOutcome,
        publisherAvailable: true,
      }),
    );
  });

  it("preserves timeout, cancellation, and retry evidence semantics as projections", () => {
    const task = {
      ...implementedTask(),
      workflowFailure: workflowFailure({
        category: "TASK_EXECUTION_TIMEOUT",
        failedAt: "2026-08-03T09:00:00.000Z",
      }),
      retryRecovery: {
        retryAvailable: false,
        exhausted: true,
        attempts: [
          retryAttempt({
            category: "TASK_EXECUTION_TIMEOUT",
            completedAt: "2026-08-03T09:00:00.000Z",
          }),
        ],
      },
    };

    const outcome = deriveTaskOutcome(task);
    assert.equal(outcome.outcome, "FAILED");
    assert.equal(outcome.retryAttempts, 1);
    assert.equal(outcome.completedAt, "2026-08-03T09:00:00.000Z");
  });
});

function pickOutcome(outcome: TaskOutcome) {
  return {
    outcome: outcome.outcome,
    completedAt: outcome.completedAt,
  };
}

function pickVisual(outcome: TaskOutcome) {
  return {
    outcome: outcome.outcome,
    visualReviewPassed: outcome.visualReviewPassed,
  };
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
    execution: executionEvidence(),
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
    checkpoint: {
      sha: checkpointSha,
      shortSha: checkpointSha.slice(0, 12),
      message: "devcrew: implement task task_000001",
      createdAt: "2026-08-03T05:00:00.000Z",
      filesChanged: ["src/app.ts", "src/api.ts"],
    },
    remoteBranch: {
      remote: "origin",
      branch: "devcrew/task-task_000001",
      commitSha: checkpointSha,
      pushedAt: "2026-08-03T05:01:00.000Z",
    },
    visualReview: visualReview("PASSED"),
    validationSelection: {
      strategy: "TARGETED",
      categories: ["FRONTEND"],
      browserVerificationSelected: true,
      reason: "FRONTEND_ONLY",
    },
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

function successfulTask(overrides: Partial<TaskSnapshot> = {}): TaskSnapshot {
  return {
    ...reviewedTask(),
    pullRequest: {
      number: 42,
      url: "https://github.com/example/devcrew/pull/42",
      state: "OPEN",
      headBranch: "devcrew/task-task_000001",
      baseBranch: "main",
      commitSha: checkpointSha,
      createdAt: "2026-08-03T08:00:00.000Z",
    },
    ...overrides,
  };
}

function executionEvidence(
  overrides: {
    summary?: string;
    changedFiles?: readonly string[];
    totalFilesChanged?: number;
  } = {},
): NonNullable<TaskSnapshot["execution"]> {
  const totalFilesChanged = overrides.totalFilesChanged ?? 2;

  return {
    id: "exec_000001",
    role: "FULL_STACK_DEVELOPER",
    status: "COMPLETED",
    attempt: 1,
    startedAt: "2026-08-03T03:00:00.000Z",
    completedAt: "2026-08-03T04:00:00.000Z",
    result: {
      summary: overrides.summary ?? "Model narrative mentions src/wrong.ts.",
      changedFiles: overrides.changedFiles ?? ["src/wrong.ts"],
      verification: ["Model narrative verification."],
      repositoryChanges: {
        filesChanged: ["src/app.ts", "src/api.ts"].slice(
          0,
          totalFilesChanged,
        ),
        filesAdded: [],
        filesModified: ["src/app.ts", "src/api.ts"].slice(
          0,
          totalFilesChanged,
        ),
        filesDeleted: [],
        totalFilesChanged,
        insertions: 4,
        deletions: 1,
      },
      changeEvidence: {
        files: [
          {
            path: "src/app.ts",
            status: "MODIFIED",
            additions: 4,
            deletions: 1,
          },
        ],
        summary: { filesChanged: totalFilesChanged, additions: 4, deletions: 1 },
      },
    },
  };
}

function visualReview(status: "PASSED" | "FAILED") {
  return {
    status,
    summary: status === "PASSED" ? "Visual review passed." : "Visual issues.",
    findings: [],
    screenshotId: "shot_000001",
    reviewedAt: "2026-08-03T05:30:00.000Z",
  };
}

function repairAttempt(
  overrides: {
    attempt?: number;
    completedAt?: string;
    visualReviewStatus?: "PASSED" | "FAILED";
  } = {},
): VisualRepairAttempt {
  const status = overrides.visualReviewStatus ?? "FAILED";

  return {
    attempt: overrides.attempt ?? 1,
    startedAt: "2026-08-03T06:00:00.000Z",
    completedAt: overrides.completedAt ?? "2026-08-03T06:10:00.000Z",
    sourceScreenshotId: "shot_000001",
    sourceVisualReview: {
      status: "FAILED",
      summary: "Visual issues.",
      findingCount: 1,
    },
    developer: {
      summary: "Repaired visual issue.",
      changedFiles: ["src/app.ts"],
    },
    validation: { status: "PASSED" },
    screenshotId: "shot_repair",
    visualReview: {
      status,
      summary: status === "PASSED" ? "Visual review passed." : "Still failed.",
      findingCount: status === "PASSED" ? 0 : 1,
    },
  };
}

function retryAttempt(
  overrides: Partial<RetryAttemptEvidence> = {},
): RetryAttemptEvidence {
  return {
    stage: "DEVOPS",
    attempt: 1,
    status: "FAILED",
    category: "PROVIDER_NETWORK",
    startedAt: "2026-08-03T05:00:00.000Z",
    completedAt: "2026-08-03T05:10:00.000Z",
    retryable: true,
    summary: "DevOps failed with retryable category PROVIDER_NETWORK.",
    ...overrides,
  };
}

function workflowFailure(
  overrides: Partial<NonNullable<TaskSnapshot["workflowFailure"]>> = {},
): NonNullable<TaskSnapshot["workflowFailure"]> {
  return {
    stage: "DEVOPS",
    category: "UNKNOWN_FAILURE",
    summary: "Failure remains unresolved.",
    failedAt: "2026-08-03T05:00:00.000Z",
    ...overrides,
  };
}

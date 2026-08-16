import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { ControlledBrowserVerificationError } from "../src/browser/controlled-browser-verifier.js";
import { ControlledDevServerError } from "../src/browser/controlled-dev-server.js";
import { ControlledScreenshotCaptureError } from "../src/browser/controlled-screenshot-capture.js";
import { GitHubPullRequestClientError } from "../src/github/github-pull-request-client.js";
import {
  classifyProviderFailure,
  classifyRetryFailure,
  createRetryOrchestrator,
  retryPolicyForStage,
} from "../src/orchestration/retry-orchestrator.js";
import { GitRemotePushError } from "../src/repositories/git-remote-push.js";
import { ApplicationError } from "../src/errors.js";
import { createNoopActivityService } from "../src/activity/activity-service.js";
import { TaskCancellationError } from "../src/tasks/task-cancellation.js";
import type { TaskSnapshot, TaskStore } from "../src/tasks/types.js";
import {
  createWorkflowFailureEvidence,
  MAX_WORKFLOW_FAILURE_SUMMARY_LENGTH,
  safeWorkflowFailureSummary,
  workflowFailureStageForRetryStage,
} from "../src/tasks/workflow-failure.js";

function retryableTask(): TaskSnapshot {
  return {
    id: "task_000001",
    projectId: "proj_000001",
    title: "Retry Visual Review",
    description: "Retry the failed provider call.",
    status: "VALIDATION_COMPLETED",
    plan: {
      summary: "Implement task.",
      steps: ["Update code"],
    },
    planDecision: {
      decision: "APPROVE",
      decidedAt: "2026-08-03T01:00:00.000Z",
    },
    retryRecovery: {
      failedStage: "VISUAL_REVIEW",
      retryAvailable: true,
      exhausted: false,
      attempts: [
        {
          stage: "VISUAL_REVIEW",
          attempt: 1,
          status: "FAILED",
          category: "PROVIDER_TIMEOUT",
          retryable: true,
          startedAt: "2026-08-03T02:00:00.000Z",
          completedAt: "2026-08-03T02:00:00.000Z",
          summary: "Visual Review failed with a retryable provider timeout.",
        },
      ],
    },
    createdAt: "2026-08-03T00:00:00.000Z",
    updatedAt: "2026-08-03T02:00:00.000Z",
  };
}

function memoryStore(initial: TaskSnapshot): { store: TaskStore; read: () => TaskSnapshot } {
  let task = structuredClone(initial);
  return {
    read: () => structuredClone(task),
    store: {
      async create(value) {
        task = structuredClone(value);
        return structuredClone(task);
      },
      async update(value) {
        task = structuredClone(value);
        return structuredClone(task);
      },
      async findByProjectAndId(projectId, taskId) {
        return task.projectId === projectId && task.id === taskId
          ? structuredClone(task)
          : undefined;
      },
    },
  };
}

describe("retry failure classification", () => {
  it("classifies provider timeout and network failures as retryable", () => {
    const timeout = classifyProviderFailure(
      "VISUAL_REVIEW",
      new Error("request timed out"),
    ).classification;
    const network = classifyProviderFailure(
      "REVIEWER",
      new Error("network socket closed"),
    ).classification;

    assert.deepEqual(
      {
        stage: timeout.stage,
        category: timeout.category,
        retryable: timeout.retryable,
      },
      {
        stage: "VISUAL_REVIEW",
        category: "PROVIDER_TIMEOUT",
        retryable: true,
      },
    );
    assert.equal(network.category, "PROVIDER_NETWORK");
    assert.equal(network.retryable, true);
  });

  it("classifies browser startup and navigation failures separately from unsafe URLs", () => {
    const startup = classifyRetryFailure(
      new ControlledDevServerError("server startup timed out"),
      "BROWSER",
    );
    const navigation = classifyRetryFailure(
      new ControlledBrowserVerificationError("browser navigation failed"),
      "BROWSER",
    );
    const unsafe = classifyRetryFailure(
      new ControlledBrowserVerificationError("localhost URL is not approved"),
      "BROWSER",
    );

    assert.equal(startup.category, "LOCALHOST_STARTUP_TIMEOUT");
    assert.equal(startup.retryable, true);
    assert.equal(navigation.category, "BROWSER_STARTUP_TRANSIENT");
    assert.equal(navigation.retryable, true);
    assert.equal(unsafe.category, "UNSAFE_PATH");
    assert.equal(unsafe.retryable, false);
  });

  it("classifies screenshot transient failures separately from artifact invariants", () => {
    const capture = classifyRetryFailure(
      new ControlledScreenshotCaptureError("screenshot capture failed"),
      "SCREENSHOT",
    );
    const invariant = classifyRetryFailure(
      new ControlledScreenshotCaptureError("artifact path escaped storage root"),
      "SCREENSHOT",
    );

    assert.equal(capture.retryable, true);
    assert.equal(invariant.category, "SCREENSHOT_ARTIFACT_MISMATCH");
    assert.equal(invariant.retryable, false);
  });

  it("classifies remote push and GitHub provider transients without retrying invariants", () => {
    const push = classifyRetryFailure(
      new GitRemotePushError("git remote push command failed"),
      "REMOTE_PUSH",
    );
    const divergence = classifyRetryFailure(
      new GitRemotePushError("remote branch points to a different commit"),
      "REMOTE_PUSH",
    );
    const github = classifyRetryFailure(
      new GitHubPullRequestClientError("provider request timed out"),
      "PULL_REQUEST",
    );

    assert.equal(push.category, "GIT_PUSH_TRANSIENT");
    assert.equal(push.retryable, true);
    assert.equal(divergence.category, "BRANCH_DIVERGENCE");
    assert.equal(divergence.retryable, false);
    assert.equal(github.category, "GITHUB_TIMEOUT");
    assert.equal(github.retryable, true);
  });

  it("treats invalid transitions and unknown failures as non-retryable", () => {
    const invalid = classifyRetryFailure(
      new ApplicationError(
        "INVALID_TASK_TRANSITION",
        409,
        "Task cannot transition",
      ),
      "DEVOPS",
    );
    const unknown = classifyRetryFailure(new Error("surprising"), "DEVOPS");

    assert.equal(invalid.category, "INVALID_TRANSITION");
    assert.equal(invalid.retryable, false);
    assert.equal(unknown.category, "UNKNOWN_FAILURE");
    assert.equal(unknown.retryable, false);
  });

  it("keeps retry limits server-owned and stage-specific", () => {
    assert.equal(retryPolicyForStage("DEVELOPER").maxAttempts, 2);
    assert.equal(retryPolicyForStage("VISUAL_REVIEW").maxAttempts, 2);
    assert.equal(retryPolicyForStage("PULL_REQUEST").maxAttempts, 2);
    assert.equal(retryPolicyForStage("CHECKPOINT").maxAttempts, 1);
  });

  it("cancels retry backoff without starting the next attempt or appending retry events", async () => {
    const initial = retryableTask();
    const { store, read } = memoryStore(initial);
    const controller = new AbortController();
    const events: string[] = [];
    let stageRuns = 0;

    await assert.rejects(
      createRetryOrchestrator({
        store,
        activityService: {
          ...createNoopActivityService(),
          async append(event) {
            events.push(event.type);
            return {
              id: `evt_${events.length}`,
              sequence: events.length,
              createdAt: "2026-08-03T03:00:00.000Z",
              ...event,
            };
          },
        },
        sleep: async (_ms, signal) => {
          assert.equal(signal, controller.signal);
          controller.abort(new TaskCancellationError());
          throw signal?.reason;
        },
        runStage: async () => {
          stageRuns += 1;
          return initial;
        },
      }).retry(initial, { signal: controller.signal }),
      { name: "TaskCancellationError" },
    );

    assert.equal(stageRuns, 0);
    assert.deepEqual(events, []);
    assert.deepEqual(read().retryRecovery, initial.retryRecovery);
    assert.equal(read().workflowFailure, undefined);
  });

  it("records workflow failure evidence when retryable failure is recorded", async () => {
    const initial = retryableTask();
    const { store, read } = memoryStore(initial);

    await createRetryOrchestrator({
      store,
      now: () => new Date("2026-08-03T03:00:00.000Z"),
      activityService: createNoopActivityService(),
      runStage: async () => initial,
    }).recordFailure(
      initial,
      "BROWSER",
      new ControlledDevServerError("server startup timed out"),
    );

    assert.deepEqual(read().workflowFailure, {
      stage: "BROWSER_VERIFICATION",
      category: "LOCALHOST_STARTUP_TIMEOUT",
      summary:
        "Browser failed with retryable category LOCALHOST_STARTUP_TIMEOUT.",
      failedAt: "2026-08-03T03:00:00.000Z",
    });
  });

  it("clears workflow failure after successful retry while preserving retry history", async () => {
    const initial: TaskSnapshot = {
      ...retryableTask(),
      workflowFailure: {
        stage: "VISUAL_REVIEW_PROVIDER",
        category: "PROVIDER_TIMEOUT",
        summary: "Visual Review failed with retryable category PROVIDER_TIMEOUT.",
        failedAt: "2026-08-03T02:00:00.000Z",
      },
    };
    const { store, read } = memoryStore(initial);

    await createRetryOrchestrator({
      store,
      now: () => new Date("2026-08-03T03:00:00.000Z"),
      activityService: createNoopActivityService(),
      runStage: async () => ({
        ...initial,
        status: "VALIDATION_COMPLETED",
      }),
    }).retry(initial);

    assert.equal(read().workflowFailure, undefined);
    assert.equal(read().retryRecovery?.attempts.length, 2);
    assert.equal(read().retryRecovery?.attempts[1].status, "SUCCEEDED");
  });

  it("keeps workflow failure after failed retry exhaustion", async () => {
    const initial: TaskSnapshot = {
      ...retryableTask(),
      workflowFailure: {
        stage: "REVIEWER",
        category: "PROVIDER_NETWORK",
        summary: "Reviewer failed with retryable category PROVIDER_NETWORK.",
        failedAt: "2026-08-03T02:00:00.000Z",
      },
      retryRecovery: {
        failedStage: "REVIEWER",
        retryAvailable: true,
        exhausted: false,
        attempts: [
          {
            stage: "REVIEWER",
            attempt: 1,
            status: "FAILED",
            category: "PROVIDER_NETWORK",
            retryable: true,
            startedAt: "2026-08-03T02:00:00.000Z",
            completedAt: "2026-08-03T02:00:00.000Z",
            summary: "Reviewer failed with retryable category PROVIDER_NETWORK.",
          },
        ],
      },
    };
    const { store, read } = memoryStore(initial);

    await assert.rejects(
      createRetryOrchestrator({
        store,
        now: () => new Date("2026-08-03T03:00:00.000Z"),
        activityService: createNoopActivityService(),
        runStage: async () => {
          throw classifyProviderFailure("REVIEWER", new Error("network socket closed"));
        },
      }).retry(initial),
      { name: "ApplicationError" },
    );

    assert.equal(read().workflowFailure?.stage, "REVIEWER");
    assert.equal(read().workflowFailure?.category, "PROVIDER_NETWORK");
    assert.equal(read().retryRecovery?.exhausted, true);
    assert.equal(read().retryRecovery?.attempts.length, 2);
  });
});

describe("workflow failure evidence helpers", () => {
  it("maps retry stages to controlled workflow failure stages", () => {
    assert.equal(workflowFailureStageForRetryStage("DEVELOPER"), "DEVELOPER");
    assert.equal(workflowFailureStageForRetryStage("DEVOPS"), "DEVOPS");
    assert.equal(workflowFailureStageForRetryStage("BROWSER"), "BROWSER_VERIFICATION");
    assert.equal(workflowFailureStageForRetryStage("SCREENSHOT"), "SCREENSHOT_CAPTURE");
    assert.equal(workflowFailureStageForRetryStage("VISUAL_REVIEW"), "VISUAL_REVIEW_PROVIDER");
    assert.equal(workflowFailureStageForRetryStage("CHECKPOINT"), "GIT_CHECKPOINT");
    assert.equal(workflowFailureStageForRetryStage("REMOTE_PUSH"), "GIT_PUSH");
    assert.equal(workflowFailureStageForRetryStage("REVIEWER"), "REVIEWER");
    assert.equal(workflowFailureStageForRetryStage("PULL_REQUEST"), "GITHUB_PULL_REQUEST");
  });

  it("uses controlled categories and bounded safe summaries", () => {
    const evidence = createWorkflowFailureEvidence(
      {
        stage: "DEVELOPER",
        category: "MODEL_OUTPUT_SCHEMA_INVALID",
        retryable: false,
        summary: [
          "Developer failed at /Users/suniltulsiani/Desktop/devcrew-backend/file.ts",
          "C:\\secret\\repo\\file.ts",
          "OPENAI_API_KEY sk-secret ghp_secret",
          "Authorization: Bearer token",
          "stdout=private output",
          "stderr=private error",
          "stack line 1\nstack line 2",
          "x".repeat(500),
        ].join(" "),
      },
      "2026-08-03T03:00:00.000Z",
    );

    assert.equal(evidence.stage, "DEVELOPER");
    assert.equal(evidence.category, "MODEL_OUTPUT_SCHEMA_INVALID");
    assert.equal(evidence.summary.length <= MAX_WORKFLOW_FAILURE_SUMMARY_LENGTH, true);
    assert.equal(evidence.summary.includes("/Users/"), false);
    assert.equal(evidence.summary.includes("C:\\secret"), false);
    assert.equal(evidence.summary.includes("OPENAI_API_KEY"), false);
    assert.equal(evidence.summary.includes("sk-secret"), false);
    assert.equal(evidence.summary.includes("ghp_secret"), false);
    assert.equal(evidence.summary.includes("Bearer token"), false);
    assert.equal(evidence.summary.includes("private output"), false);
    assert.equal(evidence.summary.includes("private error"), false);
    assert.equal(evidence.summary.includes("\n"), false);
  });

  it("falls back to a fixed summary for empty unsafe text", () => {
    assert.equal(safeWorkflowFailureSummary("\n\t"), "Workflow stage failed.");
  });
});

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
  });
});

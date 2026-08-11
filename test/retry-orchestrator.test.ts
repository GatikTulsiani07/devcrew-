import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { ControlledBrowserVerificationError } from "../src/browser/controlled-browser-verifier.js";
import { ControlledDevServerError } from "../src/browser/controlled-dev-server.js";
import { ControlledScreenshotCaptureError } from "../src/browser/controlled-screenshot-capture.js";
import { GitHubPullRequestClientError } from "../src/github/github-pull-request-client.js";
import {
  classifyProviderFailure,
  classifyRetryFailure,
  retryPolicyForStage,
} from "../src/orchestration/retry-orchestrator.js";
import { GitRemotePushError } from "../src/repositories/git-remote-push.js";
import { ApplicationError } from "../src/errors.js";

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
});

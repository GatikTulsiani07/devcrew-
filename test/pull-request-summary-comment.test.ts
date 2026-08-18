import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type {
  GitHubIssueComment,
  GitHubPullRequest,
  GitHubPullRequestClient,
} from "../src/github/github-pull-request-client.js";
import {
  buildPullRequestValidationSummary,
  formatSummaryDuration,
  PULL_REQUEST_SUMMARY_COMMENT_MARKER,
} from "../src/github/pull-request-summary-comment.js";
import { createPullRequestService } from "../src/tasks/pull-request-service.js";
import type { TaskSnapshot } from "../src/tasks/types.js";
import type { ProjectSnapshot } from "../src/projects/types.js";

const checkpointSha = "0123456789abcdef0123456789abcdef01234567";
const branch = "devcrew/task-task_000001";
const repository = { owner: "example", repo: "devcrew" };
const project: ProjectSnapshot = {
  id: "proj_000001",
  name: "Devcrew",
  status: "REPOSITORY_CONNECTED",
  repository: {
    id: "repo_000001",
    publicRepositoryUrl: "https://github.com/example/devcrew",
    preparedRepositoryId: "prepared_devcrew_main",
  },
  createdAt: "2026-08-03T00:00:00.000Z",
  updatedAt: "2026-08-03T00:00:00.000Z",
};

describe("pull request validation summary comment", () => {
  it("generates deterministic status-only summary from authoritative evidence", () => {
    const first = buildPullRequestValidationSummary(reviewedTask());
    const second = buildPullRequestValidationSummary({
      ...reviewedTask(),
      execution: {
        ...reviewedTask().execution!,
        result: {
          ...reviewedTask().execution!.result,
          changedFiles: ["prompt-controlled.ts", "another-narrative-file.ts"],
          summary:
            "Developer summary with /Users/suniltulsiani/Desktop/devcrew-backend and ghp_SECRET.",
        },
      },
      review: {
        ...reviewedTask().review!,
        summary: "Reviewer narrative that should not be included.",
      },
      validation: {
        ...reviewedTask().validation!,
        visualReview: {
          ...reviewedTask().validation!.visualReview!,
          summary: "Visual findings that should not be included.",
        },
      },
    });

    assert.equal(first, second);
    assert.equal(first.includes(PULL_REQUEST_SUMMARY_COMMENT_MARKER), true);
    assert.equal(first.includes("- Implementation: completed"), true);
    assert.equal(first.includes("- Files changed: 4"), true);
    assert.equal(first.includes("- Validation: passed"), true);
    assert.equal(first.includes("- Browser verification: passed"), true);
    assert.equal(first.includes("- Visual Review: passed"), true);
    assert.equal(first.includes("- Visual repair attempts: 1"), true);
    assert.equal(first.includes("- Reviewer: approved"), true);
    assert.equal(first.includes("- Retry attempts: 2"), true);
    assert.equal(first.includes("- Implementation duration: 1m 12s"), true);
    assert.equal(first.includes("prompt-controlled.ts"), false);
    assert.equal(first.includes("Reviewer narrative"), false);
    assert.equal(first.includes("Visual findings"), false);
    assert.equal(first.includes("/Users/"), false);
    assert.equal(first.includes("ghp_SECRET"), false);
  });

  it("omits optional browser and visual review evidence when absent", () => {
    const task = reviewedTask();
    const summary = buildPullRequestValidationSummary({
      ...task,
      validation: {
        ...task.validation!,
        browserVerification: undefined,
        visualReview: undefined,
      },
      visualRepair: undefined,
    });

    assert.equal(summary.includes("Browser verification"), false);
    assert.equal(summary.includes("Visual Review"), false);
    assert.equal(summary.includes("Visual repair attempts"), false);
  });

  it("formats durations deterministically", () => {
    assert.equal(formatSummaryDuration(840), "840ms");
    assert.equal(formatSummaryDuration(42_100), "42s");
    assert.equal(formatSummaryDuration(72_900), "1m 12s");
  });

  it("creates, updates, and no-ops exactly one marker comment", async () => {
    const requests: string[] = [];
    let comments: GitHubIssueComment[] = [];
    let nextId = 100;
    const service = createPullRequestService({
      preparedRepositories: [
        {
          id: "prepared_devcrew_main",
          publicRepositoryUrl: "https://github.com/example/devcrew",
          defaultBranch: "main",
        },
      ],
      githubClient: fakeGitHubClient({
        async listPullRequestComments() {
          requests.push("list");
          return comments;
        },
        async createPullRequestComment(input) {
          requests.push("create");
          const comment = commentEvidence(nextId++, input.body);
          comments = [comment];
          return comment;
        },
        async updatePullRequestComment(input) {
          requests.push("update");
          const comment = commentEvidence(input.commentId, input.body);
          comments = [comment];
          return comment;
        },
      }),
    });

    const created = await service.publishSummaryComment!({
      project,
      task: reviewedTask(),
    });
    const unchanged = await service.publishSummaryComment!({
      project,
      task: reviewedTask(),
    });
    const updated = await service.publishSummaryComment!({
      project,
      task: reviewedTask({ totalFilesChanged: 5 }),
    });

    assert.equal(created.action, "CREATED");
    assert.equal(unchanged.action, "UNCHANGED");
    assert.equal(updated.action, "UPDATED");
    assert.deepEqual(requests, ["list", "create", "list", "list", "update"]);
    assert.equal(comments.length, 1);
    assert.equal(comments[0].body.includes("- Files changed: 5"), true);
  });

  it("fails safely when multiple marker comments are present", async () => {
    const service = createPullRequestService({
      preparedRepositories: [
        {
          id: "prepared_devcrew_main",
          publicRepositoryUrl: "https://github.com/example/devcrew",
          defaultBranch: "main",
        },
      ],
      githubClient: fakeGitHubClient({
        async listPullRequestComments() {
          return [
            commentEvidence(1, PULL_REQUEST_SUMMARY_COMMENT_MARKER),
            commentEvidence(2, PULL_REQUEST_SUMMARY_COMMENT_MARKER),
          ];
        },
      }),
    });

    await assert.rejects(
      service.publishSummaryComment!({ project, task: reviewedTask() }),
      /ambiguous summary comments/,
    );
  });
});

function reviewedTask({
  totalFilesChanged = 4,
}: { totalFilesChanged?: number } = {}): TaskSnapshot {
  return {
    id: "task_000001",
    projectId: "proj_000001",
    title: "Implement reports",
    description: "Task prompt that should not appear in the comment.",
    status: "REVIEW_COMPLETED",
    plan: {
      summary: "Plan summary",
      steps: ["Step one"],
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
      completedAt: "2026-08-03T02:01:12.900Z",
      durationMs: 72_900,
      result: {
        summary: "Developer summary",
        changedFiles: ["model-narrative.ts"],
        verification: ["Done"],
        repositoryChanges: {
          filesChanged: ["src/app.ts", "src/routes.ts"],
          filesAdded: ["src/new.ts"],
          filesModified: ["src/app.ts", "src/routes.ts"],
          filesDeleted: ["src/old.ts"],
          totalFilesChanged,
          insertions: 10,
          deletions: 2,
        },
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
      checkpoint: {
        sha: checkpointSha,
        shortSha: checkpointSha.slice(0, 12),
        message: "devcrew: implement task task_000001",
        createdAt: "2026-08-03T04:00:00.000Z",
        filesChanged: ["src/app.ts"],
      },
      remoteBranch: {
        remote: "origin",
        branch,
        commitSha: checkpointSha,
        pushedAt: "2026-08-03T04:01:00.000Z",
      },
      browserVerification: {
        status: "PASSED",
        url: "http://127.0.0.1:3000/",
        verifiedAt: "2026-08-03T03:20:00.000Z",
      },
      visualReview: {
        status: "PASSED",
        summary: "Visual review narrative",
        findings: [],
        screenshotId: "screenshot_000001",
        reviewedAt: "2026-08-03T03:30:00.000Z",
      },
    },
    visualRepair: {
      maxAttempts: 2,
      outcome: "PASSED",
      attempts: [
        {
          attempt: 1,
          startedAt: "2026-08-03T03:35:00.000Z",
          completedAt: "2026-08-03T03:45:00.000Z",
          sourceScreenshotId: "screenshot_000001",
          sourceVisualReview: {
            status: "FAILED",
            summary: "Visual review failed.",
            findingCount: 1,
          },
        },
      ],
    },
    retryRecovery: {
      retryAvailable: false,
      attempts: [
        {
          stage: "DEVOPS",
          attempt: 1,
          status: "FAILED",
          category: "PROVIDER_NETWORK",
          startedAt: "2026-08-03T02:30:00.000Z",
          completedAt: "2026-08-03T02:31:00.000Z",
          retryable: true,
          summary: "Failed.",
        },
        {
          stage: "DEVOPS",
          attempt: 2,
          status: "SUCCEEDED",
          category: "PROVIDER_NETWORK",
          startedAt: "2026-08-03T02:31:00.000Z",
          completedAt: "2026-08-03T02:32:00.000Z",
          retryable: true,
          summary: "Succeeded.",
        },
      ],
    },
    review: {
      id: "review_000001",
      role: "REVIEWER",
      status: "COMPLETED",
      verdict: "APPROVED",
      attempt: 1,
      startedAt: "2026-08-03T05:00:00.000Z",
      completedAt: "2026-08-03T05:10:00.000Z",
      summary: "Reviewer approved.",
      findings: [],
    },
    pullRequest: {
      number: 42,
      url: "https://github.com/example/devcrew/pull/42",
      state: "OPEN",
      headBranch: branch,
      baseBranch: "main",
      commitSha: checkpointSha,
      createdAt: "2026-08-03T07:00:00.000Z",
    },
    createdAt: "2026-08-03T00:00:00.000Z",
    updatedAt: "2026-08-03T07:00:00.000Z",
  };
}

function commentEvidence(id: number, body: string): GitHubIssueComment {
  return {
    id,
    body,
    createdAt: "2026-08-03T08:00:00.000Z",
    updatedAt: "2026-08-03T08:01:00.000Z",
  };
}

function fakeGitHubClient(
  overrides: Partial<GitHubPullRequestClient>,
): GitHubPullRequestClient {
  const pullRequest: GitHubPullRequest = {
    number: 42,
    url: "https://github.com/example/devcrew/pull/42",
    state: "OPEN",
    headRef: branch,
    headSha: checkpointSha,
    baseRef: "main",
    repository,
    createdAt: "2026-08-03T07:00:00.000Z",
  };

  return {
    async findOpenPullRequest() {
      return pullRequest;
    },
    async getPullRequest() {
      return pullRequest;
    },
    async createPullRequest() {
      return pullRequest;
    },
    async listPullRequestComments() {
      return [];
    },
    async createPullRequestComment(input) {
      return commentEvidence(1, input.body);
    },
    async updatePullRequestComment(input) {
      return commentEvidence(input.commentId, input.body);
    },
    ...overrides,
  };
}

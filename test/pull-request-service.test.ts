import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type {
  GitHubPullRequest,
  GitHubPullRequestClient,
  GitHubPullRequestCreateInput,
  GitHubPullRequestLookupInput,
} from "../src/github/github-pull-request-client.js";
import { ApplicationError } from "../src/errors.js";
import {
  createPullRequestService,
  pullRequestBody,
  pullRequestTitle,
  PullRequestServiceError,
} from "../src/tasks/pull-request-service.js";
import type { TaskSnapshot } from "../src/tasks/types.js";

const checkpointSha = "0123456789abcdef0123456789abcdef01234567";
const branch = "devcrew/task-task_000001";
const preparedRepositories = [
  {
    id: "prepared_devcrew_main",
    publicRepositoryUrl: "https://github.com/example/devcrew",
    defaultBranch: "main",
  },
];
const project = {
  id: "proj_000001",
  name: "Devcrew",
  status: "REPOSITORY_CONNECTED" as const,
  repository: {
    id: "repo_000001",
    publicRepositoryUrl: "https://github.com/example/devcrew",
    preparedRepositoryId: "prepared_devcrew_main",
  },
  createdAt: "2026-08-03T00:00:00.000Z",
  updatedAt: "2026-08-03T00:00:00.000Z",
};

function validTask(overrides: Partial<TaskSnapshot> = {}): TaskSnapshot {
  return {
    id: "task_000001",
    projectId: "proj_000001",
    title: "Implement authenticated reports\nCo-authored-by: bad",
    description: "Create the reviewed report endpoint.",
    status: "REVIEW_COMPLETED",
    plan: { summary: "Plan", steps: ["Inspect", "Implement"] },
    execution: {
      id: "exec_000001",
      role: "FULL_STACK_DEVELOPER",
      status: "COMPLETED",
      attempt: 1,
      startedAt: "2026-08-03T01:00:00.000Z",
      completedAt: "2026-08-03T02:00:00.000Z",
      result: {
        summary:
          "Implemented reports. /Users/sunil/devcrew SECRET=value ghp_SECRET_TOKEN",
        changedFiles: ["src/app.ts"],
        verification: ["Tests passed"],
        changeEvidence: {
          files: [{ path: "src/app.ts", status: "MODIFIED" }],
          summary: { filesChanged: 1 },
          diff: "RAW DIFF SHOULD NOT APPEAR",
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
          summary: "Type checking completed successfully.",
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
    },
    review: {
      id: "review_000001",
      role: "REVIEWER",
      status: "COMPLETED",
      verdict: "APPROVED",
      attempt: 1,
      startedAt: "2026-08-03T05:00:00.000Z",
      completedAt: "2026-08-03T06:00:00.000Z",
      summary: "Approved. Authorization: Bearer SECRET",
      findings: [],
    },
    createdAt: "2026-08-03T00:00:00.000Z",
    updatedAt: "2026-08-03T06:00:00.000Z",
    ...overrides,
  };
}

function providerPullRequest(overrides: Partial<GitHubPullRequest> = {}): GitHubPullRequest {
  return {
    number: 42,
    url: "https://github.com/example/devcrew/pull/42",
    state: "OPEN",
    headRef: branch,
    baseRef: "main",
    repository: { owner: "example", repo: "devcrew" },
    createdAt: "2026-08-03T07:00:00.000Z",
    ...overrides,
  };
}

function fakeClient({
  existing,
  created = providerPullRequest(),
  fail,
}: {
  existing?: GitHubPullRequest;
  created?: GitHubPullRequest;
  fail?: Error;
} = {}) {
  const lookups: GitHubPullRequestLookupInput[] = [];
  const creates: GitHubPullRequestCreateInput[] = [];
  const client: GitHubPullRequestClient = {
    async findOpenPullRequest(input) {
      lookups.push(input);
      if (fail !== undefined) {
        throw fail;
      }
      return existing;
    },
    async createPullRequest(input) {
      creates.push(input);
      if (fail !== undefined) {
        throw fail;
      }
      return created;
    },
  };

  return { client, lookups, creates };
}

describe("pull request service", () => {
  it("creates a PR from reviewed checkpointed remote branch evidence", async () => {
    const { client, lookups, creates } = fakeClient();
    const result = await createPullRequestService({
      githubClient: client,
      preparedRepositories,
    }).createPullRequest({ project, task: validTask() });

    assert.equal(result.created, true);
    assert.deepEqual(result.evidence, {
      number: 42,
      url: "https://github.com/example/devcrew/pull/42",
      state: "OPEN",
      headBranch: branch,
      baseBranch: "main",
      commitSha: checkpointSha,
      createdAt: "2026-08-03T07:00:00.000Z",
    });
    assert.deepEqual(lookups[0], {
      repository: { owner: "example", repo: "devcrew" },
      head: branch,
      base: "main",
    });
    assert.deepEqual(creates[0].repository, {
      owner: "example",
      repo: "devcrew",
    });
    assert.equal(creates[0].head, branch);
    assert.equal(creates[0].base, "main");
  });

  it("generates safe bounded title and body from authoritative evidence", () => {
    const task = validTask({
      title: `\n${"A".repeat(200)}\nInjected: trailer`,
    });
    const title = pullRequestTitle(task);
    const body = pullRequestBody(task);

    assert.equal(title.startsWith("Devcrew: "), true);
    assert.equal(title.length <= 120, true);
    assert.equal(title.includes("\n"), false);
    assert.equal(body.includes("## Summary"), true);
    assert.equal(body.includes("- src/app.ts"), true);
    assert.equal(body.includes("RAW DIFF SHOULD NOT APPEAR"), false);
    assert.equal(body.includes("/Users/"), false);
    assert.equal(body.includes("ghp_SECRET_TOKEN"), false);
    assert.equal(body.includes("SECRET=value"), false);
    assert.equal(body.includes("Authorization: Bearer SECRET"), false);
  });

  it("requires reviewed approval, checkpoint, remote branch evidence, and matching SHAs", async () => {
    const service = createPullRequestService({
      githubClient: fakeClient().client,
      preparedRepositories,
    });

    await assert.rejects(
      service.createPullRequest({
        project,
        task: validTask({ status: "VALIDATION_COMPLETED" }),
      }),
      (error: unknown) =>
        error instanceof ApplicationError &&
        error.code === "INVALID_TASK_TRANSITION",
    );

    await assert.rejects(
      service.createPullRequest({
        project,
        task: validTask({
          validation: { ...validTask().validation!, checkpoint: undefined },
        }),
      }),
      (error: unknown) =>
        error instanceof PullRequestServiceError &&
        error.reason === "checkpoint is required",
    );

    await assert.rejects(
      service.createPullRequest({
        project,
        task: validTask({
          validation: { ...validTask().validation!, remoteBranch: undefined },
        }),
      }),
      (error: unknown) =>
        error instanceof PullRequestServiceError &&
        error.reason === "remote branch evidence is required",
    );

    await assert.rejects(
      service.createPullRequest({
        project,
        task: validTask({
          validation: {
            ...validTask().validation!,
            remoteBranch: {
              remote: "origin",
              branch,
              commitSha: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
              pushedAt: "2026-08-03T04:01:00.000Z",
            },
          },
        }),
      }),
      (error: unknown) =>
        error instanceof PullRequestServiceError &&
        error.reason === "remote branch does not match checkpoint",
    );
  });

  it("rejects non-authoritative refs, repositories, and unsafe base branches", async () => {
    const service = createPullRequestService({
      githubClient: fakeClient().client,
      preparedRepositories,
    });

    await assert.rejects(
      service.createPullRequest({
        project,
        task: validTask({
          validation: {
            ...validTask().validation!,
            remoteBranch: {
              remote: "origin",
              branch: "devcrew/task-other",
              commitSha: checkpointSha,
              pushedAt: "2026-08-03T04:01:00.000Z",
            },
          },
        }),
      }),
      (error: unknown) =>
        error instanceof PullRequestServiceError &&
        error.reason === "remote branch is not authoritative",
    );

    await assert.rejects(
      createPullRequestService({
        githubClient: fakeClient().client,
        preparedRepositories: [
          {
            id: "prepared_devcrew_main",
            publicRepositoryUrl: "https://github.com/example/other",
            defaultBranch: "main",
          },
        ],
      }).createPullRequest({ project, task: validTask() }),
      (error: unknown) =>
        error instanceof PullRequestServiceError &&
        error.reason === "project repository is not authoritative",
    );

    await assert.rejects(
      createPullRequestService({
        githubClient: fakeClient().client,
        preparedRepositories: [
          {
            id: "prepared_devcrew_main",
            publicRepositoryUrl: "https://github.com/example/devcrew",
            defaultBranch: "bad branch",
          },
        ],
      }).createPullRequest({ project, task: validTask() }),
      (error: unknown) =>
        error instanceof PullRequestServiceError &&
        error.reason === "base branch is unsafe",
    );
  });

  it("reuses existing matching PRs and existing task evidence without duplicates", async () => {
    const withRemotePr = fakeClient({ existing: providerPullRequest({ number: 77 }) });
    const remoteResult = await createPullRequestService({
      githubClient: withRemotePr.client,
      preparedRepositories,
    }).createPullRequest({ project, task: validTask() });

    assert.equal(remoteResult.created, false);
    assert.equal(remoteResult.evidence.number, 77);
    assert.equal(withRemotePr.creates.length, 0);

    const taskEvidence = {
      number: 88,
      url: "https://github.com/example/devcrew/pull/88",
      state: "OPEN" as const,
      headBranch: branch,
      baseBranch: "main",
      commitSha: checkpointSha,
      createdAt: "2026-08-03T07:30:00.000Z",
    };
    const withTaskPr = fakeClient();
    const taskResult = await createPullRequestService({
      githubClient: withTaskPr.client,
      preparedRepositories,
    }).createPullRequest({
      project,
      task: validTask({ pullRequest: taskEvidence }),
    });

    assert.deepEqual(taskResult.evidence, taskEvidence);
    assert.equal(taskResult.created, false);
    assert.equal(withTaskPr.lookups.length, 0);
    assert.equal(withTaskPr.creates.length, 0);
  });
});

import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";

import {
  createGitRemotePushService,
  GitRemotePushError,
} from "../src/repositories/git-remote-push.js";
import type { GitCheckpointEvidence } from "../src/repositories/git-checkpoint.js";
import type {
  GitCommandResult,
  GitCommandRunner,
} from "../src/repositories/git-inspector.js";

const checkpointSha = "0123456789abcdef0123456789abcdef01234567";
const differentSha = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const branch = "devcrew/task-task_000001";
const projectRepositoryUrl = "https://github.com/example/devcrew";

let repositoryRoot: string;

function checkpoint(): GitCheckpointEvidence {
  return {
    sha: checkpointSha,
    shortSha: checkpointSha.slice(0, 12),
    message: "devcrew: implement task task_000001",
    createdAt: "2026-08-03T05:00:00.000Z",
    filesChanged: ["src/app.ts"],
  };
}

function successfulResult(stdout = ""): GitCommandResult {
  return {
    stdout,
    exitCode: 0,
    timedOut: false,
    outputLimitExceeded: false,
    started: true,
  };
}

function failedResult(overrides: Partial<GitCommandResult> = {}): GitCommandResult {
  return {
    stdout: "",
    exitCode: 1,
    timedOut: false,
    outputLimitExceeded: false,
    started: true,
    ...overrides,
  };
}

function scriptedRunner(
  responses: readonly GitCommandResult[],
  calls: Array<{ args: readonly string[]; cwd: string }> = [],
): GitCommandRunner {
  let index = 0;

  return {
    async run(args, cwd) {
      calls.push({ args, cwd });
      const response = responses[index] ?? successfulResult("");
      index += 1;
      return response;
    },
  };
}

function successfulPushResponses(): readonly GitCommandResult[] {
  return [
    successfulResult(`${checkpointSha}\n`),
    successfulResult(""),
    successfulResult(`${branch}\n`),
    successfulResult("git@github.com:example/devcrew.git\n"),
    successfulResult("origin/main\n"),
    successfulResult(""),
    successfulResult(""),
    successfulResult(`${checkpointSha}\trefs/heads/${branch}\n`),
  ];
}

beforeEach(async () => {
  repositoryRoot = await mkdtemp(join(tmpdir(), "devcrew-remote-push-"));
});

afterEach(async () => {
  await rm(repositoryRoot, { recursive: true, force: true });
});

describe("controlled Git remote push", () => {
  it("pushes a checkpointed task branch and returns safe remote evidence", async () => {
    const calls: Array<{ args: readonly string[]; cwd: string }> = [];
    const pushed = await createGitRemotePushService({
      runner: scriptedRunner(successfulPushResponses(), calls),
      now: () => new Date("2026-08-03T06:00:00.000Z"),
    }).pushValidatedBranch({
      repositoryRoot,
      taskId: "task_000001",
      projectRepositoryUrl,
      checkpoint: checkpoint(),
    });

    assert.deepEqual(pushed, {
      remote: "origin",
      branch,
      commitSha: checkpointSha,
      pushedAt: "2026-08-03T06:00:00.000Z",
    });
    assert.deepEqual(
      calls.map((call) => call.args),
      [
        ["rev-parse", "HEAD"],
        [
          "status",
          "--porcelain=v1",
          "-z",
          "--untracked-files=all",
          "--no-renames",
        ],
        ["branch", "--show-current"],
        ["remote", "get-url", "origin"],
        ["symbolic-ref", "--quiet", "--short", "refs/remotes/origin/HEAD"],
        ["ls-remote", "--heads", "origin", branch],
        ["push", "origin", `${branch}:${branch}`],
        ["ls-remote", "--heads", "origin", branch],
      ],
    );
    assert.equal(calls.every((call) => call.cwd === repositoryRoot), true);
    assert.equal(
      calls.every((call) =>
        call.args.every(
          (arg) => !["--force", "--force-with-lease", "-f"].includes(arg),
        ),
      ),
      true,
    );
  });

  it("requires a checkpoint and matching HEAD", async () => {
    await assert.rejects(
      createGitRemotePushService({
        runner: scriptedRunner([]),
      }).pushValidatedBranch({
        repositoryRoot,
        taskId: "task_000001",
        projectRepositoryUrl,
      }),
      (error: unknown) =>
        error instanceof GitRemotePushError &&
        error.reason === "checkpoint is required",
    );

    await assert.rejects(
      createGitRemotePushService({
        runner: scriptedRunner([successfulResult(`${differentSha}\n`)]),
      }).pushValidatedBranch({
        repositoryRoot,
        taskId: "task_000001",
        projectRepositoryUrl,
        checkpoint: checkpoint(),
      }),
      (error: unknown) =>
        error instanceof GitRemotePushError &&
        error.reason === "HEAD does not match checkpoint",
    );
  });

  it("requires a clean working tree and the correct task branch", async () => {
    await assert.rejects(
      createGitRemotePushService({
        runner: scriptedRunner([
          successfulResult(`${checkpointSha}\n`),
          successfulResult(" M src/app.ts\0"),
        ]),
      }).pushValidatedBranch({
        repositoryRoot,
        taskId: "task_000001",
        projectRepositoryUrl,
        checkpoint: checkpoint(),
      }),
      (error: unknown) =>
        error instanceof GitRemotePushError &&
        error.reason === "working tree is not clean",
    );

    await assert.rejects(
      createGitRemotePushService({
        runner: scriptedRunner([
          successfulResult(`${checkpointSha}\n`),
          successfulResult(""),
          successfulResult("main\n"),
        ]),
      }).pushValidatedBranch({
        repositoryRoot,
        taskId: "task_000001",
        projectRepositoryUrl,
        checkpoint: checkpoint(),
      }),
      (error: unknown) =>
        error instanceof GitRemotePushError &&
        error.reason === "current branch is not the task branch",
    );
  });

  it("rejects main and default branch targets", async () => {
    await assert.rejects(
      createGitRemotePushService({
        runner: scriptedRunner([
          successfulResult(`${checkpointSha}\n`),
          successfulResult(""),
          successfulResult(`${branch}\n`),
          successfulResult("https://github.com/example/devcrew.git\n"),
          successfulResult(`${branch}\n`),
        ]),
      }).pushValidatedBranch({
        repositoryRoot,
        taskId: "task_000001",
        projectRepositoryUrl,
        checkpoint: checkpoint(),
      }),
      (error: unknown) =>
        error instanceof GitRemotePushError &&
        error.reason === "task branch is a default branch",
    );
  });

  it("uses only server-owned remote and refspec values", async () => {
    const calls: Array<{ args: readonly string[]; cwd: string }> = [];
    const sanitizedBranch = "devcrew/task-task_000001--force";

    await createGitRemotePushService({
      runner: scriptedRunner(
        [
          successfulResult(`${checkpointSha}\n`),
          successfulResult(""),
          successfulResult(`${sanitizedBranch}\n`),
          successfulResult("git@github.com:example/devcrew.git\n"),
          successfulResult("origin/main\n"),
          successfulResult(""),
          successfulResult(""),
          successfulResult(`${checkpointSha}\trefs/heads/${sanitizedBranch}\n`),
        ],
        calls,
      ),
    }).pushValidatedBranch({
      repositoryRoot,
      taskId: "task_000001\n--force",
      projectRepositoryUrl,
      checkpoint: checkpoint(),
    });

    const push = calls.find((call) => call.args[0] === "push");

    assert.deepEqual(push?.args, [
      "push",
      "origin",
      `${sanitizedBranch}:${sanitizedBranch}`,
    ]);
    assert.equal(push?.args.includes("--force"), false);
    assert.equal(push?.args.includes("-f"), false);
    assert.equal(calls.some((call) => call.args.includes(projectRepositoryUrl)), false);
  });

  it("rejects missing remotes, remote mismatches, and credential-bearing URLs", async () => {
    const cases: readonly GitCommandResult[] = [
      failedResult(),
      successfulResult("https://github.com/example/other.git\n"),
      successfulResult("https://token@github.com/example/devcrew.git\n"),
    ];

    for (const remoteResult of cases) {
      await assert.rejects(
        createGitRemotePushService({
          runner: scriptedRunner([
            successfulResult(`${checkpointSha}\n`),
            successfulResult(""),
            successfulResult(`${branch}\n`),
            remoteResult,
          ]),
        }).pushValidatedBranch({
          repositoryRoot,
          taskId: "task_000001",
          projectRepositoryUrl,
          checkpoint: checkpoint(),
        }),
        GitRemotePushError,
      );
    }
  });

  it("fails closed when the default branch cannot be determined safely", async () => {
    await assert.rejects(
      createGitRemotePushService({
        runner: scriptedRunner([
          successfulResult(`${checkpointSha}\n`),
          successfulResult(""),
          successfulResult(`${branch}\n`),
          successfulResult("https://github.com/example/devcrew.git\n"),
          failedResult(),
        ]),
      }).pushValidatedBranch({
        repositoryRoot,
        taskId: "task_000001",
        projectRepositoryUrl,
        checkpoint: checkpoint(),
      }),
      (error: unknown) =>
        error instanceof GitRemotePushError &&
        error.reason === "git remote push command failed",
    );
  });

  it("returns idempotent success when the remote already points to the checkpoint", async () => {
    const calls: Array<{ args: readonly string[]; cwd: string }> = [];
    const existing = {
      remote: "origin" as const,
      branch,
      commitSha: checkpointSha,
      pushedAt: "2026-08-03T06:00:00.000Z",
    };
    const pushed = await createGitRemotePushService({
      runner: scriptedRunner(
        [
          successfulResult(`${checkpointSha}\n`),
          successfulResult(""),
          successfulResult(`${branch}\n`),
          successfulResult("https://github.com/example/devcrew.git\n"),
          successfulResult("origin/main\n"),
          successfulResult(`${checkpointSha}\trefs/heads/${branch}\n`),
        ],
        calls,
      ),
    }).pushValidatedBranch({
      repositoryRoot,
      taskId: "task_000001",
      projectRepositoryUrl,
      checkpoint: checkpoint(),
      existingRemoteBranch: existing,
    });

    assert.deepEqual(pushed, existing);
    assert.equal(calls.some((call) => call.args[0] === "push"), false);
  });

  it("rejects divergent remote branches without pushing", async () => {
    const calls: Array<{ args: readonly string[]; cwd: string }> = [];

    await assert.rejects(
      createGitRemotePushService({
        runner: scriptedRunner(
          [
            successfulResult(`${checkpointSha}\n`),
            successfulResult(""),
            successfulResult(`${branch}\n`),
            successfulResult("https://github.com/example/devcrew.git\n"),
            successfulResult("origin/main\n"),
            successfulResult(`${differentSha}\trefs/heads/${branch}\n`),
          ],
          calls,
        ),
      }).pushValidatedBranch({
        repositoryRoot,
        taskId: "task_000001",
        projectRepositoryUrl,
        checkpoint: checkpoint(),
      }),
      (error: unknown) =>
        error instanceof GitRemotePushError &&
        error.reason === "remote branch points to a different commit",
    );
    assert.equal(calls.some((call) => call.args[0] === "push"), false);
  });

  it("sanitizes auth, network, timeout, output-limit, and spawn failures", async () => {
    const failures: readonly GitCommandResult[] = [
      failedResult(),
      failedResult({ timedOut: true, exitCode: null }),
      failedResult({ outputLimitExceeded: true }),
      failedResult({ started: false, exitCode: null }),
    ];

    for (const failure of failures) {
      await assert.rejects(
        createGitRemotePushService({
          runner: scriptedRunner([
            successfulResult(`${checkpointSha}\n`),
            successfulResult(""),
            successfulResult(`${branch}\n`),
            successfulResult("https://github.com/example/devcrew.git\n"),
            successfulResult("origin/main\n"),
            successfulResult(""),
            failure,
          ]),
        }).pushValidatedBranch({
          repositoryRoot,
          taskId: "task_000001",
          projectRepositoryUrl,
          checkpoint: checkpoint(),
        }),
        (error: unknown) =>
          error instanceof GitRemotePushError &&
          error.reason === "git remote push command failed",
      );
    }
  });

  it("verifies the remote SHA after push before returning evidence", async () => {
    await assert.rejects(
      createGitRemotePushService({
        runner: scriptedRunner([
          successfulResult(`${checkpointSha}\n`),
          successfulResult(""),
          successfulResult(`${branch}\n`),
          successfulResult("https://github.com/example/devcrew.git\n"),
          successfulResult("origin/main\n"),
          successfulResult(""),
          successfulResult(""),
          successfulResult(`${differentSha}\trefs/heads/${branch}\n`),
        ]),
      }).pushValidatedBranch({
        repositoryRoot,
        taskId: "task_000001",
        projectRepositoryUrl,
        checkpoint: checkpoint(),
      }),
      (error: unknown) =>
        error instanceof GitRemotePushError &&
        error.reason === "remote branch verification failed",
    );
  });

  it("does not expose credentials or raw remote URLs in thrown errors", async () => {
    await assert.rejects(
      createGitRemotePushService({
        runner: scriptedRunner([
          successfulResult(`${checkpointSha}\n`),
          successfulResult(""),
          successfulResult(`${branch}\n`),
          successfulResult("https://token@github.com/example/devcrew.git\n"),
        ]),
      }).pushValidatedBranch({
        repositoryRoot,
        taskId: "task_000001",
        projectRepositoryUrl,
        checkpoint: checkpoint(),
      }),
      (error: unknown) =>
        error instanceof GitRemotePushError &&
        !error.message.includes("token") &&
        !error.message.includes("github.com"),
    );
  });
});

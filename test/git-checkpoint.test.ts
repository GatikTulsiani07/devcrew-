import assert from "node:assert/strict";
import { execFile as execFileCallback } from "node:child_process";
import { mkdtemp, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";
import { promisify } from "node:util";

import {
  CHECKPOINT_AUTHOR_EMAIL,
  CHECKPOINT_AUTHOR_NAME,
  createGitCheckpointService,
  GitCheckpointError,
} from "../src/repositories/git-checkpoint.js";
import type {
  GitChangeEvidence,
  GitCommandResult,
  GitCommandRunner,
} from "../src/repositories/git-inspector.js";

const execFile = promisify(execFileCallback);

let repositoryRoot: string;

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

async function git(args: readonly string[]): Promise<string> {
  const result = await execFile("git", [...args], { cwd: repositoryRoot });
  return result.stdout;
}

function changeEvidence(
  files: readonly GitChangeEvidence["files"][number][],
): GitChangeEvidence {
  return {
    files,
    summary: { filesChanged: files.length },
  };
}

function evidenceFor(paths: readonly string[]): GitChangeEvidence {
  return changeEvidence(
    paths.map((path) => ({
      path,
      status: "MODIFIED",
      additions: 1,
      deletions: 0,
    })),
  );
}

async function initializeRepository(): Promise<void> {
  await git(["init", "--quiet", "-b", "main"]);
  await git(["config", "user.email", "fixture@example.com"]);
  await git(["config", "user.name", "Fixture User"]);
  await writeFile(join(repositoryRoot, "existing.ts"), "one\n", "utf8");
  await git(["add", "--all"]);
  await git(["commit", "--quiet", "-m", "baseline"]);
}

beforeEach(async () => {
  repositoryRoot = await mkdtemp(join(tmpdir(), "devcrew-checkpoint-"));
  await initializeRepository();
});

afterEach(async () => {
  await rm(repositoryRoot, { recursive: true, force: true });
});

describe("controlled Git checkpoint", () => {
  it("creates a local commit with authoritative checkpoint evidence", async () => {
    await writeFile(join(repositoryRoot, "existing.ts"), "one\ntwo\n", "utf8");
    await writeFile(join(repositoryRoot, "created.ts"), "created\n", "utf8");

    const checkpoint = await createGitCheckpointService({
      now: () => new Date("2026-08-03T05:00:00.000Z"),
    }).createCheckpoint({
      repositoryRoot,
      taskId: "task_000001",
      changeEvidence: changeEvidence([
        { path: "created.ts", status: "UNTRACKED", additions: 1, deletions: 0 },
        { path: "existing.ts", status: "MODIFIED", additions: 1, deletions: 0 },
      ]),
    });

    assert.match(checkpoint.sha, /^[0-9a-f]{40}$/);
    assert.equal(checkpoint.shortSha, checkpoint.sha.slice(0, 12));
    assert.equal(checkpoint.message, "devcrew: implement task task_000001");
    assert.equal(checkpoint.createdAt, "2026-08-03T05:00:00.000Z");
    assert.deepEqual(checkpoint.filesChanged, ["created.ts", "existing.ts"]);
    assert.equal((await git(["rev-parse", "HEAD"])).trim(), checkpoint.sha);
    assert.equal(await git(["status", "--porcelain"]), "");
    assert.equal(await git(["diff", "--cached", "--name-only"]), "");
  });

  it("stages only the verified authoritative paths", async () => {
    const calls: Array<{ args: readonly string[]; cwd: string }> = [];
    const runner = scriptedRunner(
      [
        successfulResult(" M b.ts\0?? a.ts\0"),
        successfulResult(),
        successfulResult(),
        successfulResult("0123456789abcdef0123456789abcdef01234567\n"),
        successfulResult(""),
      ],
      calls,
    );

    await createGitCheckpointService({ runner }).createCheckpoint({
      repositoryRoot,
      taskId: "task_000001",
      changeEvidence: evidenceFor(["b.ts", "a.ts"]),
    });

    assert.deepEqual(calls[1]?.args, ["add", "--", "a.ts", "b.ts"]);
    assert.equal(calls.every((call) => call.cwd === repositoryRoot), true);
    assert.equal(calls.some((call) => call.args.includes("push")), false);
    assert.equal(calls.some((call) => call.args.includes("remote")), false);
    assert.equal(calls.some((call) => call.args.includes("merge")), false);
    assert.equal(calls.some((call) => call.args.includes("rebase")), false);
  });

  it("uses server-owned author identity and server-generated message", async () => {
    await writeFile(join(repositoryRoot, "existing.ts"), "changed\n", "utf8");

    const checkpoint = await createGitCheckpointService().createCheckpoint({
      repositoryRoot,
      taskId: "task_000001\n\nCo-authored-by: attacker <x@y>",
      changeEvidence: evidenceFor(["existing.ts"]),
    });
    const author = await git(["show", "-s", "--format=%an <%ae>%n%B", "HEAD"]);

    assert.match(author, new RegExp(`${CHECKPOINT_AUTHOR_NAME} <${CHECKPOINT_AUTHOR_EMAIL}>`));
    assert.match(author, /^Devcrew Agent <devcrew@localhost>\ndevcrew: implement task task_000001Co-authored-by:attackerxy/m);
    assert.equal(checkpoint.message.includes("\n"), false);
  });

  it("rejects unexpected dirty files without staging or committing", async () => {
    await writeFile(join(repositoryRoot, "existing.ts"), "changed\n", "utf8");
    await writeFile(join(repositoryRoot, "unexpected.ts"), "dirty\n", "utf8");
    const before = (await git(["rev-parse", "HEAD"])).trim();

    await assert.rejects(
      createGitCheckpointService().createCheckpoint({
        repositoryRoot,
        taskId: "task_000001",
        changeEvidence: evidenceFor(["existing.ts"]),
      }),
      (error: unknown) =>
        error instanceof GitCheckpointError &&
        error.reason === "unexpected dirty path",
    );

    assert.equal((await git(["rev-parse", "HEAD"])).trim(), before);
    assert.equal(await git(["diff", "--cached", "--name-only"]), "");
  });

  it("rejects missing expected dirty files", async () => {
    await assert.rejects(
      createGitCheckpointService().createCheckpoint({
        repositoryRoot,
        taskId: "task_000001",
        changeEvidence: evidenceFor(["existing.ts"]),
      }),
      (error: unknown) =>
        error instanceof GitCheckpointError &&
        error.reason === "expected dirty path is missing",
    );
  });

  it("fails closed for a directory that is not a Git repository", async () => {
    const plain = await mkdtemp(join(tmpdir(), "devcrew-checkpoint-plain-"));

    try {
      await writeFile(join(plain, "existing.ts"), "changed\n", "utf8");

      await assert.rejects(
        createGitCheckpointService().createCheckpoint({
          repositoryRoot: plain,
          taskId: "task_000001",
          changeEvidence: evidenceFor(["existing.ts"]),
        }),
        (error: unknown) =>
          error instanceof GitCheckpointError &&
          error.reason === "git checkpoint command failed",
      );
    } finally {
      await rm(plain, { recursive: true, force: true });
    }
  });

  it("rejects absolute and traversal authoritative paths", async () => {
    for (const path of ["/tmp/outside.ts", "../outside.ts", "src/../../outside.ts"]) {
      await assert.rejects(
        createGitCheckpointService().createCheckpoint({
          repositoryRoot,
          taskId: "task_000001",
          changeEvidence: evidenceFor([path]),
        }),
        (error: unknown) =>
          error instanceof GitCheckpointError &&
          error.reason === "unsafe authoritative path",
        `expected ${path} to be rejected`,
      );
    }
  });

  it("prevents repository-controlled commit hooks from executing", async () => {
    await writeFile(join(repositoryRoot, "existing.ts"), "changed\n", "utf8");
    await writeFile(
      join(repositoryRoot, ".git/hooks/pre-commit"),
      "#!/bin/sh\nprintf executed > ../hook-ran\nexit 1\n",
      { mode: 0o755 },
    );

    await createGitCheckpointService().createCheckpoint({
      repositoryRoot,
      taskId: "task_000001",
      changeEvidence: evidenceFor(["existing.ts"]),
    });

    await assert.rejects(stat(join(repositoryRoot, ".git/hook-ran")));
    assert.equal(await git(["status", "--porcelain"]), "");
  });

  it("does not modify global Git configuration", async () => {
    const before = await readGlobalConfig();
    await writeFile(join(repositoryRoot, "existing.ts"), "changed\n", "utf8");

    await createGitCheckpointService().createCheckpoint({
      repositoryRoot,
      taskId: "task_000001",
      changeEvidence: evidenceFor(["existing.ts"]),
    });

    assert.equal(await readGlobalConfig(), before);
  });

  it("sanitizes spawn failures, timeouts, and commit failures as checkpoint errors", async () => {
    const failures: GitCommandResult[] = [
      failedResult({ started: false, exitCode: null }),
      failedResult({ timedOut: true, exitCode: null }),
      failedResult({ outputLimitExceeded: true }),
    ];

    for (const failure of failures) {
      await assert.rejects(
        createGitCheckpointService({
          runner: scriptedRunner([failure]),
        }).createCheckpoint({
          repositoryRoot,
          taskId: "task_000001",
          changeEvidence: evidenceFor(["existing.ts"]),
        }),
        (error: unknown) =>
          error instanceof GitCheckpointError &&
          error.reason === "git checkpoint command failed",
      );
    }

    await assert.rejects(
      createGitCheckpointService({
        runner: scriptedRunner([
          successfulResult(" M existing.ts\0"),
          successfulResult(),
          failedResult(),
        ]),
      }).createCheckpoint({
        repositoryRoot,
        taskId: "task_000001",
        changeEvidence: evidenceFor(["existing.ts"]),
      }),
      (error: unknown) =>
        error instanceof GitCheckpointError &&
        error.reason === "git checkpoint command failed",
    );
  });

  it("rejects malformed commit SHA and dirty post-commit state", async () => {
    await assert.rejects(
      createGitCheckpointService({
        runner: scriptedRunner([
          successfulResult(" M existing.ts\0"),
          successfulResult(),
          successfulResult(),
          successfulResult("not-a-sha\n"),
        ]),
      }).createCheckpoint({
        repositoryRoot,
        taskId: "task_000001",
        changeEvidence: evidenceFor(["existing.ts"]),
      }),
      (error: unknown) =>
        error instanceof GitCheckpointError &&
        error.reason === "malformed checkpoint SHA",
    );

    await assert.rejects(
      createGitCheckpointService({
        runner: scriptedRunner([
          successfulResult(" M existing.ts\0"),
          successfulResult(),
          successfulResult(),
          successfulResult("0123456789abcdef0123456789abcdef01234567\n"),
          successfulResult(" M existing.ts\0"),
        ]),
      }).createCheckpoint({
        repositoryRoot,
        taskId: "task_000001",
        changeEvidence: evidenceFor(["existing.ts"]),
      }),
      (error: unknown) =>
        error instanceof GitCheckpointError &&
        error.reason === "post-commit repository state is dirty",
    );
  });

  it("reuses a valid existing checkpoint without creating a duplicate commit", async () => {
    await writeFile(join(repositoryRoot, "existing.ts"), "changed\n", "utf8");
    const service = createGitCheckpointService();
    const checkpoint = await service.createCheckpoint({
      repositoryRoot,
      taskId: "task_000001",
      changeEvidence: evidenceFor(["existing.ts"]),
    });
    const logCount = (await git(["rev-list", "--count", "HEAD"])).trim();

    const reused = await service.createCheckpoint({
      repositoryRoot,
      taskId: "task_000001",
      changeEvidence: evidenceFor(["existing.ts"]),
      existingCheckpoint: checkpoint,
    });

    assert.deepEqual(reused, checkpoint);
    assert.equal((await git(["rev-list", "--count", "HEAD"])).trim(), logCount);
  });

  it("fails safely when repository state changed after checkpoint creation", async () => {
    await writeFile(join(repositoryRoot, "existing.ts"), "changed\n", "utf8");
    const service = createGitCheckpointService();
    const checkpoint = await service.createCheckpoint({
      repositoryRoot,
      taskId: "task_000001",
      changeEvidence: evidenceFor(["existing.ts"]),
    });
    await writeFile(join(repositoryRoot, "later.ts"), "later\n", "utf8");

    await assert.rejects(
      service.createCheckpoint({
        repositoryRoot,
        taskId: "task_000001",
        changeEvidence: evidenceFor(["existing.ts"]),
        existingCheckpoint: checkpoint,
      }),
      (error: unknown) =>
        error instanceof GitCheckpointError &&
        error.reason === "post-commit repository state is dirty",
    );
  });
});

async function readGlobalConfig(): Promise<string> {
  try {
    return (await execFile("git", ["config", "--global", "--list", "--null"])).stdout;
  } catch {
    return "";
  }
}

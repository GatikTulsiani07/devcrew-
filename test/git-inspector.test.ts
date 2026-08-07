import assert from "node:assert/strict";
import { execFile as execFileCallback } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";
import { promisify } from "node:util";

import {
  createControlledGitCommandRunner,
  createControlledGitInspector,
  DIFF_TRUNCATION_NOTICE,
  GIT_EXECUTABLE,
  GitInspectionError,
  parseNumstatOutput,
  parseStatusOutput,
  sanitizeDiff,
  type GitCommandResult,
  type GitCommandRunner,
} from "../src/repositories/git-inspector.js";

const execFile = promisify(execFileCallback);

let repositoryRoot: string;

function successfulResult(stdout: string): GitCommandResult {
  return {
    stdout,
    exitCode: 0,
    timedOut: false,
    outputLimitExceeded: false,
    started: true,
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

beforeEach(async () => {
  repositoryRoot = await mkdtemp(join(tmpdir(), "devcrew-inspect-"));
  await execFile("git", ["init", "--quiet", "-b", "main"], { cwd: repositoryRoot });
  await execFile("git", ["config", "user.email", "devcrew@example.com"], {
    cwd: repositoryRoot,
  });
  await execFile("git", ["config", "user.name", "Devcrew"], { cwd: repositoryRoot });
});

afterEach(async () => {
  await rm(repositoryRoot, { recursive: true, force: true });
});

describe("git status parsing", () => {
  it("maps statuses, including paths with spaces and unknown codes", () => {
    const stdout = [
      " M src/auth/middleware.ts\0",
      "?? src/new file.ts\0",
      "A  staged.ts\0",
      " D removed.ts\0",
      "!! ignored.ts\0",
    ].join("");

    assert.deepEqual(parseStatusOutput(stdout), [
      { path: "src/auth/middleware.ts", status: "MODIFIED" },
      { path: "src/new file.ts", status: "UNTRACKED" },
      { path: "staged.ts", status: "ADDED" },
      { path: "removed.ts", status: "DELETED" },
      { path: "ignored.ts", status: "UNKNOWN" },
    ]);
  });

  it("returns nothing for a clean repository and rejects malformed or unsafe output", () => {
    assert.deepEqual(parseStatusOutput(""), []);
    assert.throws(() => parseStatusOutput("M\0"), GitInspectionError);
    assert.throws(() => parseStatusOutput(" M /etc/passwd\0"), GitInspectionError);
    assert.throws(
      () => parseStatusOutput(" M ../outside.ts\0"),
      GitInspectionError,
    );
  });

  it("parses numstat records including renames and binary files", () => {
    const stats = parseNumstatOutput(
      "12\t3\tsrc/a.ts\0-\t-\tlogo.png\0" + "4\t2\t\0old name.ts\0new name.ts\0",
    );

    assert.deepEqual(stats.get("src/a.ts"), { additions: 12, deletions: 3 });
    assert.deepEqual(stats.get("logo.png"), {});
    assert.deepEqual(stats.get("new name.ts"), { additions: 4, deletions: 2 });
    assert.throws(() => parseNumstatOutput("garbage\0"), GitInspectionError);
  });

  it("strips terminal escapes and rejects host paths in diff evidence", () => {
    assert.equal(sanitizeDiff("\u001b[31m-old\u001b[0m\n"), "-old\n");
    assert.throws(
      () => sanitizeDiff("+++ b/x\n+/Users/example/secret\n"),
      GitInspectionError,
    );
  });
});

describe("controlled git inspector", () => {
  it("uses server-owned commands against the prepared repository", async () => {
    await writeFile(join(repositoryRoot, "a.ts"), "one\n", "utf8");
    await execFile("git", ["add", "--all"], { cwd: repositoryRoot });
    await execFile("git", ["commit", "--quiet", "-m", "base"], {
      cwd: repositoryRoot,
    });

    const calls: Array<{ args: readonly string[]; cwd: string }> = [];
    const inspector = createControlledGitInspector({
      runner: scriptedRunner(
        [
          successfulResult(" M a.ts\0"),
          successfulResult("1\t0\ta.ts\0"),
          successfulResult("--- a/a.ts\n+++ b/a.ts\n+two\n"),
        ],
        calls,
      ),
    });

    const evidence = await inspector.captureEvidence(repositoryRoot);

    assert.deepEqual(evidence.files, [
      { path: "a.ts", status: "MODIFIED", additions: 1, deletions: 0 },
    ]);
    assert.deepEqual(evidence.summary, {
      filesChanged: 1,
      additions: 1,
      deletions: 0,
    });
    assert.equal(calls.every((call) => call.cwd === repositoryRoot), true);
    assert.deepEqual(
      calls.map((call) => call.args[0]),
      ["status", "diff", "diff"],
    );
    assert.equal(
      calls.every((call) =>
        call.args.every((arg) => typeof arg === "string" && !arg.includes(" ")),
      ),
      true,
    );
    assert.equal(
      calls.some((call) => call.args.includes("add") || call.args.includes("commit")),
      false,
    );
  });

  it("accepts a clean baseline and rejects a dirty one", async () => {
    const clean = createControlledGitInspector({
      runner: scriptedRunner([successfulResult("")]),
    });
    const dirty = createControlledGitInspector({
      runner: scriptedRunner([successfulResult(" M a.ts\0")]),
    });

    await clean.assertCleanBaseline(repositoryRoot);
    await assert.rejects(
      dirty.assertCleanBaseline(repositoryRoot),
      GitInspectionError,
    );
  });

  it("fails closed for command failures, timeouts, and limits", async () => {
    const failures: GitCommandResult[] = [
      { ...successfulResult(""), exitCode: 128 },
      { ...successfulResult(""), timedOut: true, exitCode: null },
      { ...successfulResult(""), outputLimitExceeded: true },
      { ...successfulResult(""), started: false, exitCode: null },
    ];

    for (const failure of failures) {
      await assert.rejects(
        createControlledGitInspector({
          runner: scriptedRunner([failure]),
        }).captureEvidence(repositoryRoot),
        GitInspectionError,
      );
    }

    await assert.rejects(
      createControlledGitInspector({
        runner: scriptedRunner([successfulResult("")]),
      }).captureEvidence(repositoryRoot),
      GitInspectionError,
    );

    await assert.rejects(
      createControlledGitInspector({
        maxChangedFiles: 1,
        runner: scriptedRunner([successfulResult(" M a.ts\0 M b.ts\0")]),
      }).captureEvidence(repositoryRoot),
      GitInspectionError,
    );
  });

  it("truncates oversized diff evidence", async () => {
    const inspector = createControlledGitInspector({
      maxDiffBytes: 32,
      runner: scriptedRunner([
        successfulResult(" M a.ts\0"),
        successfulResult("1\t0\ta.ts\0"),
        successfulResult(`+${"x".repeat(500)}\n`),
      ]),
    });

    const evidence = await inspector.captureEvidence(repositoryRoot);

    assert.equal(evidence.diff?.endsWith(DIFF_TRUNCATION_NOTICE), true);
    assert.equal(
      Buffer.byteLength(evidence.diff ?? "", "utf8") <
        32 + Buffer.byteLength(DIFF_TRUNCATION_NOTICE, "utf8") + 1,
      true,
    );
  });

  it("captures untracked text and binary evidence through the real runner", async () => {
    await writeFile(join(repositoryRoot, "kept.ts"), "one\n", "utf8");
    await execFile("git", ["add", "--all"], { cwd: repositoryRoot });
    await execFile("git", ["commit", "--quiet", "-m", "base"], {
      cwd: repositoryRoot,
    });
    await writeFile(join(repositoryRoot, "new.ts"), "alpha\nbeta\n", "utf8");
    await writeFile(
      join(repositoryRoot, "logo.bin"),
      Buffer.from([0, 1, 2, 3, 0, 255]),
    );

    const evidence = await createControlledGitInspector().captureEvidence(
      repositoryRoot,
    );
    const files = [...evidence.files].sort((left, right) =>
      left.path.localeCompare(right.path),
    );

    assert.deepEqual(files, [
      { path: "logo.bin", status: "UNTRACKED" },
      { path: "new.ts", status: "UNTRACKED", additions: 2, deletions: 0 },
    ]);
    assert.deepEqual(evidence.summary, { filesChanged: 2 });
    assert.match(evidence.diff ?? "", /Binary files/);
    assert.match(evidence.diff ?? "", /\+alpha/);
    assert.equal((evidence.diff ?? "").includes("\u0000"), false);
  });

  it("bounds real command output and reports non-git directories", async () => {
    const plain = await mkdtemp(join(tmpdir(), "devcrew-plain-"));

    try {
      const runner = createControlledGitCommandRunner({ maxOutputBytes: 8 });
      const failure = await runner.run(["status", "--porcelain=v1"], plain);
      const relative = await runner.run(["status"], "relative/path");

      assert.equal(failure.exitCode !== 0, true);
      assert.equal(relative.started, false);
      assert.equal(GIT_EXECUTABLE, "git");
    } finally {
      await rm(plain, { recursive: true, force: true });
    }
  });
});

import assert from "node:assert/strict";
import { execFile as execFileCallback } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";
import { promisify } from "node:util";

import {
  createDeveloperRollbackService,
  DeveloperRollbackError,
  type DeveloperRollbackBaseline,
} from "../src/repositories/developer-rollback.js";
import type {
  GitChangedFile,
  GitCommandRunner,
  GitInspector,
} from "../src/repositories/git-inspector.js";
import type { TaskSnapshot } from "../src/tasks/types.js";

const execFile = promisify(execFileCallback);
let repositoryRoot: string;
let outsideRoot: string;

async function git(args: readonly string[]): Promise<string> {
  const result = await execFile("git", [...args], { cwd: repositoryRoot });
  return result.stdout;
}

async function initializeRepository(): Promise<void> {
  await git(["init", "--quiet", "-b", "main"]);
  await git(["config", "user.email", "fixture@example.com"]);
  await git(["config", "user.name", "Fixture User"]);
  await writeFile(join(repositoryRoot, "tracked.ts"), "original\n", "utf8");
  await writeFile(join(repositoryRoot, "delete-me.ts"), "delete me\n", "utf8");
  await git(["add", "--all"]);
  await git(["commit", "--quiet", "-m", "baseline"]);
}

beforeEach(async () => {
  repositoryRoot = await mkdtemp(join(tmpdir(), "devcrew-rollback-"));
  outsideRoot = await mkdtemp(join(tmpdir(), "devcrew-rollback-outside-"));
  await initializeRepository();
});

afterEach(async () => {
  await rm(repositoryRoot, { recursive: true, force: true });
  await rm(outsideRoot, { recursive: true, force: true });
});

describe("developer rollback service", () => {
  it("rolls back failed Developer tracked modifications, additions, deletions, and mixed changes", async () => {
    const service = createDeveloperRollbackService();
    const baseline = await service.captureBaseline({ repositoryRoot });

    await writeFile(join(repositoryRoot, "tracked.ts"), "mutated\n", "utf8");
    await service.rollback({ repositoryRoot, baseline });
    assert.equal(await readFile(join(repositoryRoot, "tracked.ts"), "utf8"), "original\n");
    await assertClean();

    await writeFile(join(repositoryRoot, "created.ts"), "created\n", "utf8");
    await service.rollback({ repositoryRoot, baseline });
    await assert.rejects(readFile(join(repositoryRoot, "created.ts"), "utf8"));
    await assertClean();

    await rm(join(repositoryRoot, "delete-me.ts"));
    await service.rollback({ repositoryRoot, baseline });
    assert.equal(await readFile(join(repositoryRoot, "delete-me.ts"), "utf8"), "delete me\n");
    await assertClean();

    await writeFile(join(repositoryRoot, "tracked.ts"), "mutated again\n", "utf8");
    await mkdir(join(repositoryRoot, "nested"), { recursive: true });
    await writeFile(join(repositoryRoot, "nested/created.ts"), "created\n", "utf8");
    await rm(join(repositoryRoot, "delete-me.ts"));
    await service.rollback({ repositoryRoot, baseline });
    assert.equal(await readFile(join(repositoryRoot, "tracked.ts"), "utf8"), "original\n");
    assert.equal(await readFile(join(repositoryRoot, "delete-me.ts"), "utf8"), "delete me\n");
    await assert.rejects(readFile(join(repositoryRoot, "nested/created.ts"), "utf8"));
    await assertClean();
  });

  it("is idempotent when the repository already matches the captured baseline", async () => {
    const service = createDeveloperRollbackService();
    const baseline = await service.captureBaseline({ repositoryRoot });

    await service.rollback({ repositoryRoot, baseline });
    await service.rollback({ repositoryRoot, baseline });

    await assertClean();
  });

  it("preserves unrelated pre-existing untracked and tracked dirty state, including overlaps", async () => {
    await writeFile(join(repositoryRoot, "notes.md"), "user notes\n", "utf8");
    await writeFile(join(repositoryRoot, "tracked.ts"), "user dirty\n", "utf8");

    const service = createDeveloperRollbackService();
    const baseline = await service.captureBaseline({ repositoryRoot });

    await writeFile(join(repositoryRoot, "notes.md"), "developer touched notes\n", "utf8");
    await writeFile(join(repositoryRoot, "tracked.ts"), "developer touched tracked\n", "utf8");
    await writeFile(join(repositoryRoot, "developer.ts"), "developer file\n", "utf8");

    await service.rollback({ repositoryRoot, baseline });

    assert.equal(await readFile(join(repositoryRoot, "notes.md"), "utf8"), "user notes\n");
    assert.equal(await readFile(join(repositoryRoot, "tracked.ts"), "utf8"), "user dirty\n");
    await assert.rejects(readFile(join(repositoryRoot, "developer.ts"), "utf8"));
    assert.deepEqual(await statusLines(), [" M tracked.ts", "?? notes.md"]);
  });

  it("blocks rollback after checkpoint, remote push, or PR evidence", async () => {
    const service = createDeveloperRollbackService();
    const baseline = await service.captureBaseline({ repositoryRoot });
    await writeFile(join(repositoryRoot, "created.ts"), "created\n", "utf8");

    for (const candidateTask of [
      taskSnapshot({ checkpoint: true }),
      taskSnapshot({ remoteBranch: true }),
      taskSnapshot({ pullRequest: true }),
    ]) {
      await assert.rejects(
        service.rollback({ repositoryRoot, baseline, task: candidateTask }),
        (error: unknown) =>
          error instanceof DeveloperRollbackError &&
          error.reason === "PUBLISHED_WORK",
      );
    }
  });

  it("blocks rollback when HEAD or branch changed unexpectedly", async () => {
    const service = createDeveloperRollbackService();
    const baseline = await service.captureBaseline({ repositoryRoot });

    await writeFile(join(repositoryRoot, "post.ts"), "post\n", "utf8");
    await git(["add", "--all"]);
    await git(["commit", "--quiet", "-m", "head changed"]);
    await assertRollbackError(service.rollback({ repositoryRoot, baseline }), "HEAD_CHANGED");

    await git(["checkout", "--quiet", baseline.headSha]);
    await git(["switch", "--quiet", "-c", "other-branch"]);
    await assertRollbackError(service.rollback({ repositoryRoot, baseline }), "BRANCH_CHANGED");
  });

  it("rejects unsafe rollback path evidence and symlink deletion", async () => {
    const baseline = await createDeveloperRollbackService().captureBaseline({
      repositoryRoot,
    });
    await assertRollbackError(
      createDeveloperRollbackService({
        gitInspector: inspectorWithFiles([
          { path: "../outside.ts", status: "UNTRACKED" },
        ]),
      }).rollback({ repositoryRoot, baseline }),
      "UNSAFE_GIT_EVIDENCE",
    );

    await assertRollbackError(
      createDeveloperRollbackService({
        gitInspector: inspectorWithFiles([
          { path: "/tmp/outside.ts", status: "UNTRACKED" },
        ]),
      }).rollback({ repositoryRoot, baseline }),
      "UNSAFE_GIT_EVIDENCE",
    );

    await assertRollbackError(
      createDeveloperRollbackService({
        gitInspector: inspectorWithFiles([
          { path: ".git/config", status: "MODIFIED" },
        ]),
      }).rollback({ repositoryRoot, baseline }),
      "UNSAFE_GIT_EVIDENCE",
    );

    await symlink(outsideRoot, join(repositoryRoot, "linked.ts"));
    await assertRollbackError(
      createDeveloperRollbackService().rollback({ repositoryRoot, baseline }),
      "ROLLBACK_UNSAFE",
    );
  });

  it("uses only explicit safe Git restore commands and never broad cleanup commands", async () => {
    const commands: string[][] = [];
    const runner = recordingRunner(commands);
    const baseline = cleanBaseline();

    await assert.rejects(
      createDeveloperRollbackService({
        runner,
        gitInspector: inspectorWithFiles([
          { path: "tracked.ts", status: "MODIFIED" },
        ]),
      }).rollback({ repositoryRoot, baseline }),
      DeveloperRollbackError,
    );

    assert.equal(
      commands.some((args) => args.includes("reset") && args.includes("--hard")),
      false,
    );
    assert.equal(commands.some((args) => args.includes("clean")), false);
    assert.equal(commands.some((args) => args.join(" ") === "restore ."), false);
    assert.equal(commands.some((args) => args.join(" ").includes("checkout -- .")), false);
    assert.equal(commands.some((args) => args.includes("push") && args.includes("--force")), false);
    assert.equal(
      commands.some(
        (args) =>
          args[0] === "restore" &&
          args.includes("--worktree") &&
          args.includes("--") &&
          args.at(-1) === "tracked.ts",
      ),
      true,
    );
  });

  it("reports safe rollback failure when post-rollback verification does not match baseline", async () => {
    const baseline = await createDeveloperRollbackService().captureBaseline({
      repositoryRoot,
    });

    await writeFile(join(repositoryRoot, "created.ts"), "created\n", "utf8");
    await assertRollbackError(
      createDeveloperRollbackService({
        gitInspector: {
          async assertCleanBaseline() {},
          async captureEvidence() {
            throw new Error("unused");
          },
          async captureRepositoryChanges() {
            return {
              repositoryChanges: {
                filesChanged: ["created.ts"],
                filesAdded: ["created.ts"],
                filesModified: [],
                filesDeleted: [],
                totalFilesChanged: 1,
                insertions: 1,
                deletions: 0,
              },
              changeEvidence: {
                files: [{ path: "created.ts", status: "UNTRACKED" }],
                summary: { filesChanged: 1 },
              },
            };
          },
        },
      }).rollback({ repositoryRoot, baseline }),
      "ROLLBACK_FAILED",
    );
  });
});

async function assertClean(): Promise<void> {
  assert.deepEqual(await statusLines(), []);
}

async function statusLines(): Promise<readonly string[]> {
  return (await git(["status", "--porcelain=v1", "--untracked-files=all"]))
    .split("\n")
    .filter((line) => line !== "");
}

async function assertRollbackError(
  promise: Promise<unknown>,
  reason: DeveloperRollbackError["reason"],
): Promise<void> {
  await assert.rejects(
    promise,
    (error: unknown) =>
      error instanceof DeveloperRollbackError && error.reason === reason,
  );
}

function inspectorWithFiles(files: readonly GitChangedFile[]): GitInspector {
  return {
    async assertCleanBaseline() {},
    async captureEvidence() {
      return {
        files,
        summary: { filesChanged: files.length },
      };
    },
    async captureRepositoryChanges() {
      return {
        repositoryChanges: {
          filesChanged: files.map((file) => file.path),
          filesAdded: files
            .filter((file) => file.status === "ADDED" || file.status === "UNTRACKED")
            .map((file) => file.path),
          filesModified: files
            .filter((file) => file.status === "MODIFIED")
            .map((file) => file.path),
          filesDeleted: files
            .filter((file) => file.status === "DELETED")
            .map((file) => file.path),
          totalFilesChanged: files.length,
          insertions: 0,
          deletions: 0,
        },
        ...(files.length === 0
          ? {}
          : {
              changeEvidence: {
                files,
                summary: { filesChanged: files.length },
              },
            }),
      };
    },
  };
}

function recordingRunner(commands: string[][]): GitCommandRunner {
  return {
    async run(args) {
      commands.push([...args]);

      if (args[0] === "rev-parse") {
        return result("1111111111111111111111111111111111111111\n");
      }

      if (args[0] === "branch") {
        return result("main\n");
      }

      return result("");
    },
  };
}

function result(stdout: string) {
  return {
    stdout,
    exitCode: 0,
    timedOut: false,
    outputLimitExceeded: false,
    started: true,
  };
}

function cleanBaseline(): DeveloperRollbackBaseline {
  return {
    headSha: "1111111111111111111111111111111111111111",
    branch: "main",
    capturedAt: "2026-08-03T00:00:00.000Z",
    repositoryChangesBefore: {
      filesChanged: [],
      filesAdded: [],
      filesModified: [],
      filesDeleted: [],
      totalFilesChanged: 0,
      insertions: 0,
      deletions: 0,
    },
    snapshots: [],
  };
}

function taskSnapshot(options: {
  checkpoint?: boolean;
  remoteBranch?: boolean;
  pullRequest?: boolean;
}): TaskSnapshot {
  return {
    id: "task_000001",
    projectId: "proj_000001",
    title: "Rollback",
    description: "Rollback safely.",
    status: "VALIDATION_COMPLETED",
    plan: { summary: "Plan.", steps: ["Implement."] },
    validation: {
      id: "val_000001",
      role: "DEVOPS_ENGINEER",
      status: "PASSED",
      attempt: 1,
      startedAt: "2026-08-03T00:00:00.000Z",
      completedAt: "2026-08-03T00:01:00.000Z",
      checks: [],
      summary: "Passed.",
      ...(options.checkpoint
        ? {
            checkpoint: {
              sha: "1111111111111111111111111111111111111111",
              shortSha: "111111111111",
              message: "checkpoint",
              createdAt: "2026-08-03T00:02:00.000Z",
              filesChanged: ["tracked.ts"],
            },
          }
        : {}),
      ...(options.remoteBranch
        ? {
            remoteBranch: {
              remote: "origin",
              branch: "devcrew/task-task_000001",
              commitSha: "1111111111111111111111111111111111111111",
              pushedAt: "2026-08-03T00:03:00.000Z",
            },
          }
        : {}),
    },
    ...(options.pullRequest
      ? {
          pullRequest: {
            number: 1,
            url: "https://github.com/example/devcrew/pull/1",
            state: "OPEN",
            headBranch: "devcrew/task-task_000001",
            baseBranch: "main",
            commitSha: "1111111111111111111111111111111111111111",
            createdAt: "2026-08-03T00:04:00.000Z",
          },
        }
      : {}),
    createdAt: "2026-08-03T00:00:00.000Z",
    updatedAt: "2026-08-03T00:00:00.000Z",
  };
}

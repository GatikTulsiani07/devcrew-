import assert from "node:assert/strict";
import { execFile as execFileCallback } from "node:child_process";
import { mkdtemp, rm, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";
import { promisify } from "node:util";

import { createGitCheckpointService } from "../src/repositories/git-checkpoint.js";
import type {
  GitInspector,
  GitRepositoryChangeSummary,
} from "../src/repositories/git-inspector.js";
import {
  createRepositoryDriftVerifier,
  RepositoryDriftError,
} from "../src/repositories/repository-drift.js";
import type { PreparedRepository } from "../src/repositories/prepared-repositories.js";
import type { ProjectSnapshot } from "../src/projects/types.js";
import type { TaskSnapshot } from "../src/tasks/types.js";

const execFile = promisify(execFileCallback);
let repositoryRoot: string;

async function git(args: readonly string[]): Promise<string> {
  const result = await execFile("git", [...args], { cwd: repositoryRoot });
  return result.stdout;
}

async function initializeRepository(): Promise<void> {
  await git(["init", "--quiet", "-b", "main"]);
  await git(["config", "user.email", "fixture@example.com"]);
  await git(["config", "user.name", "Fixture User"]);
  await writeFile(join(repositoryRoot, "tracked.ts"), "one\ntwo\n", "utf8");
  await writeFile(join(repositoryRoot, "remove.ts"), "delete me\n", "utf8");
  await git(["add", "--all"]);
  await git(["commit", "--quiet", "-m", "baseline"]);
}

beforeEach(async () => {
  repositoryRoot = await mkdtemp(join(tmpdir(), "devcrew-drift-"));
  await initializeRepository();
});

afterEach(async () => {
  await rm(repositoryRoot, { recursive: true, force: true });
});

describe("repository drift verifier", () => {
  it("passes unchanged authoritative dirty worktree changes before checkpoint", async () => {
    await writeFile(join(repositoryRoot, "tracked.ts"), "one\ntwo\nthree\n", "utf8");
    await writeFile(join(repositoryRoot, "added.ts"), "new\n", "utf8");
    await unlink(join(repositoryRoot, "remove.ts"));

    await assert.doesNotReject(() =>
      verifier().verifyTaskRepository({
        project: project(),
        task: taskWithChanges({
          filesChanged: ["added.ts", "remove.ts", "tracked.ts"],
          filesAdded: ["added.ts"],
          filesModified: ["tracked.ts"],
          filesDeleted: ["remove.ts"],
          totalFilesChanged: 3,
          insertions: 2,
          deletions: 1,
        }),
      }),
    );
  });

  it("fails pre-checkpoint drift for unexpected modified, added, deleted, missing, and changed-type paths", async () => {
    await writeFile(join(repositoryRoot, "tracked.ts"), "one\ntwo\nthree\n", "utf8");
    await writeFile(join(repositoryRoot, "unexpected.ts"), "new\n", "utf8");
    await assertDrift(taskWithChanges(changes(["tracked.ts"], ["tracked.ts"])));

    await git(["checkout", "--quiet", "--", "tracked.ts"]);
    await rm(join(repositoryRoot, "unexpected.ts"), { force: true });
    await writeFile(join(repositoryRoot, "unexpected.ts"), "new\n", "utf8");
    await assertDrift(taskWithChanges(emptyChanges()));

    await rm(join(repositoryRoot, "unexpected.ts"), { force: true });
    await unlink(join(repositoryRoot, "remove.ts"));
    await assertDrift(taskWithChanges(emptyChanges()));

    await git(["checkout", "--quiet", "--", "remove.ts"]);
    await assertDrift(taskWithChanges(changes(["tracked.ts"], ["tracked.ts"])));
    await assertDrift(taskWithChanges({
      filesChanged: ["added.ts"],
      filesAdded: ["added.ts"],
      filesModified: [],
      filesDeleted: [],
      totalFilesChanged: 1,
      insertions: 1,
      deletions: 0,
    }));

    await unlink(join(repositoryRoot, "tracked.ts"));
    await assertDrift(taskWithChanges(changes(["tracked.ts"], ["tracked.ts"])));
  });

  it("passes clean post-checkpoint state and fails HEAD, branch, checkpoint, and dirty worktree drift", async () => {
    await writeFile(join(repositoryRoot, "tracked.ts"), "one\ntwo\nthree\n", "utf8");
    const checkpoint = await createGitCheckpointService().createCheckpoint({
      repositoryRoot,
      taskId: "task_000001",
      changeEvidence: {
        files: [{ path: "tracked.ts", status: "MODIFIED", additions: 1, deletions: 0 }],
        summary: { filesChanged: 1, additions: 1, deletions: 0 },
      },
    });
    const cleanTask = taskWithChanges(changes(["tracked.ts"], ["tracked.ts"]), {
      validation: {
        id: "val_000001",
        role: "DEVOPS_ENGINEER",
        status: "PASSED",
        attempt: 1,
        startedAt: "2026-08-03T02:00:00.000Z",
        completedAt: "2026-08-03T03:00:00.000Z",
        checks: [],
        summary: "Passed.",
        checkpoint,
      },
    });

    await assert.doesNotReject(() =>
      verifier().verifyTaskRepository({ project: project(), task: cleanTask }),
    );

    await writeFile(join(repositoryRoot, "post.ts"), "post\n", "utf8");
    await git(["add", "--all"]);
    await git(["commit", "--quiet", "-m", "post drift"]);
    await assertDrift(cleanTask);

    await git(["checkout", "--quiet", checkpoint.sha]);
    await git(["switch", "--quiet", "-c", "devcrew/task-other"]);
    await assertDrift(cleanTask);

    await git(["switch", "--quiet", "devcrew/task-task_000001"]);
    await assertDrift({
      ...cleanTask,
      validation: {
        ...cleanTask.validation!,
        checkpoint: {
          ...checkpoint,
          sha: "1111111111111111111111111111111111111111",
          shortSha: "111111111111",
        },
      },
    });

    await writeFile(join(repositoryRoot, "dirty.ts"), "dirty\n", "utf8");
    await assertDrift(cleanTask);
  });

  it("fails closed for unsafe authoritative or fresh Git path evidence", async () => {
    await assertDrift(taskWithChanges({
      filesChanged: ["/tmp/outside.ts"],
      filesAdded: [],
      filesModified: ["/tmp/outside.ts"],
      filesDeleted: [],
      totalFilesChanged: 1,
      insertions: 1,
      deletions: 0,
    }));

    const unsafeInspector: GitInspector = {
      async assertCleanBaseline() {},
      async captureEvidence() {
        throw new Error("unused");
      },
      async captureRepositoryChanges() {
        return {
          repositoryChanges: {
            filesChanged: ["../outside.ts"],
            filesAdded: [],
            filesModified: ["../outside.ts"],
            filesDeleted: [],
            totalFilesChanged: 1,
            insertions: 1,
            deletions: 0,
          },
        };
      },
    };

    await assertDrift(
      taskWithChanges(changes(["tracked.ts"], ["tracked.ts"])),
      unsafeInspector,
    );
  });
});

function verifier(gitInspector?: GitInspector) {
  return createRepositoryDriftVerifier({
    preparedRepositories: [repository()],
    ...(gitInspector === undefined ? {} : { gitInspector }),
  });
}

async function assertDrift(
  task: TaskSnapshot,
  gitInspector?: GitInspector,
): Promise<void> {
  await assert.rejects(
    verifier(gitInspector).verifyTaskRepository({ project: project(), task }),
    (error: unknown) => error instanceof RepositoryDriftError,
  );
}

function repository(): PreparedRepository {
  return {
    id: "prepared_devcrew_main",
    publicRepositoryUrl: "https://github.com/example/devcrew",
    localCheckoutPath: repositoryRoot,
    validationProfileId: "node_standard",
  };
}

function project(): ProjectSnapshot {
  return {
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
}

function taskWithChanges(
  repositoryChanges: GitRepositoryChangeSummary,
  overrides: Partial<TaskSnapshot> = {},
): TaskSnapshot {
  return {
    id: "task_000001",
    projectId: "proj_000001",
    title: "Implement drift checks",
    description: "Do not trust narrative changed files.",
    status: "IMPLEMENTATION_COMPLETED",
    plan: { summary: "Plan.", steps: ["Implement."] },
    planDecision: {
      decision: "APPROVE",
      decidedAt: "2026-08-03T01:00:00.000Z",
    },
    execution: {
      id: "exec_000001",
      role: "FULL_STACK_DEVELOPER",
      status: "COMPLETED",
      attempt: 1,
      startedAt: "2026-08-03T01:00:00.000Z",
      completedAt: "2026-08-03T02:00:00.000Z",
      result: {
        summary: "Narrative mentions src/narrative.ts.",
        changedFiles: ["src/narrative.ts"],
        verification: ["Narrative verification."],
        repositoryChanges,
      },
    },
    createdAt: "2026-08-03T00:00:00.000Z",
    updatedAt: "2026-08-03T02:00:00.000Z",
    ...overrides,
  };
}

function changes(
  filesChanged: readonly string[],
  filesModified: readonly string[] = [],
): GitRepositoryChangeSummary {
  return {
    filesChanged,
    filesAdded: [],
    filesModified,
    filesDeleted: [],
    totalFilesChanged: filesChanged.length,
    insertions: 1,
    deletions: 0,
  };
}

function emptyChanges(): GitRepositoryChangeSummary {
  return {
    filesChanged: [],
    filesAdded: [],
    filesModified: [],
    filesDeleted: [],
    totalFilesChanged: 0,
    insertions: 0,
    deletions: 0,
  };
}

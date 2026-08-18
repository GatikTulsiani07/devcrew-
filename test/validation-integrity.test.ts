import assert from "node:assert/strict";
import { execFile as execFileCallback } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";
import { promisify } from "node:util";

import { createGitCheckpointService } from "../src/repositories/git-checkpoint.js";
import type {
  GitInspector,
  GitRepositoryChangeSummary,
} from "../src/repositories/git-inspector.js";
import type { PreparedRepository } from "../src/repositories/prepared-repositories.js";
import type { ProjectSnapshot } from "../src/projects/types.js";
import type { TaskSnapshot, TaskValidation } from "../src/tasks/types.js";
import {
  canonicalRepositoryState,
  createValidationIntegrityService,
  repositoryStateId,
  ValidationIntegrityError,
} from "../src/validation/validation-integrity.js";

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
  repositoryRoot = await mkdtemp(join(tmpdir(), "devcrew-integrity-"));
  await initializeRepository();
});

afterEach(async () => {
  await rm(repositoryRoot, { recursive: true, force: true });
});

describe("validation integrity evidence", () => {
  it("records safe server-owned integrity evidence for successful validation", async () => {
    await writeFile(join(repositoryRoot, "tracked.ts"), "one\ntwo\nthree\n", "utf8");

    const bound = await service().bindValidation({
      project: project(),
      task: taskWithChanges(changes(["tracked.ts"], ["tracked.ts"])),
      validation: validation(),
    });

    assert.equal(bound.integrity?.branch, "main");
    assert.equal(bound.integrity?.validatedAt, validation().completedAt);
    assert.match(bound.integrity?.repositoryStateId ?? "", /^[0-9a-f]{64}$/);
    assert.match(bound.integrity?.headSha ?? "", /^[0-9a-f]{40}$/);
    assert.equal(JSON.stringify(bound).includes(repositoryRoot), false);
    assert.equal(JSON.stringify(bound).includes("stdout"), false);
  });

  it("creates deterministic fingerprints independent of changed-file ordering and model narrative", () => {
    const left = repositoryStateId({
      headSha: "1111111111111111111111111111111111111111",
      branch: "devcrew/task-task_000001",
      repositoryChanges: {
        filesChanged: ["b.ts", "a.ts"],
        filesAdded: ["b.ts"],
        filesModified: ["a.ts"],
        filesDeleted: [],
        totalFilesChanged: 2,
        insertions: 5,
        deletions: 1,
      },
    });
    const right = repositoryStateId({
      headSha: "1111111111111111111111111111111111111111",
      branch: "devcrew/task-task_000001",
      repositoryChanges: {
        filesChanged: ["a.ts", "b.ts"],
        filesAdded: ["b.ts"],
        filesModified: ["a.ts"],
        filesDeleted: [],
        totalFilesChanged: 2,
        insertions: 5,
        deletions: 1,
      },
    });

    assert.equal(left, right);
    assert.equal(
      canonicalRepositoryState({
        headSha: "1111111111111111111111111111111111111111",
        branch: "devcrew/task-task_000001",
        repositoryChanges: changes(["tracked.ts"], ["tracked.ts"]),
      }).includes("Narrative"),
      false,
    );
  });

  it("passes unchanged pre-checkpoint state and fails stale dirty-worktree changes", async () => {
    await writeFile(join(repositoryRoot, "tracked.ts"), "one\ntwo\nthree\n", "utf8");
    const task = taskWithValidation(
      await bind(taskWithChanges(changes(["tracked.ts"], ["tracked.ts"]))),
    );

    await assert.doesNotReject(() =>
      service().verifyValidation({ project: project(), task }),
    );

    await writeFile(join(repositoryRoot, "unexpected.ts"), "new\n", "utf8");
    await assertStale(task);

    await rm(join(repositoryRoot, "unexpected.ts"), { force: true });
    await git(["checkout", "--quiet", "--", "tracked.ts"]);
    await assertStale(task);
  });

  it("fails pre-checkpoint HEAD and branch mismatches", async () => {
    await writeFile(join(repositoryRoot, "tracked.ts"), "one\ntwo\nthree\n", "utf8");
    const task = taskWithValidation(
      await bind(taskWithChanges(changes(["tracked.ts"], ["tracked.ts"]))),
    );

    await git(["add", "--all"]);
    await git(["commit", "--quiet", "-m", "unexpected head"]);
    await assertStale(task, "HEAD_CHANGED");

    await git(["reset", "--quiet", "--soft", "HEAD~1"]);
    await git(["switch", "--quiet", "-c", "unexpected-branch"]);
    await assertStale(task, "BRANCH_CHANGED");
  });

  it("passes a clean post-checkpoint repository created from validated changes", async () => {
    await writeFile(join(repositoryRoot, "tracked.ts"), "one\ntwo\nthree\n", "utf8");
    const bound = await bind(taskWithChanges(changes(["tracked.ts"], ["tracked.ts"])));
    const checkpoint = await createGitCheckpointService({
      now: () => new Date("2026-08-03T06:00:00.000Z"),
    }).createCheckpoint({
      repositoryRoot,
      taskId: "task_000001",
      changeEvidence: {
        files: [{ path: "tracked.ts", status: "MODIFIED", additions: 1, deletions: 0 }],
        summary: { filesChanged: 1, additions: 1, deletions: 0 },
      },
    });
    const task = taskWithValidation({
      ...bound,
      checkpoint,
    });

    await assert.doesNotReject(() =>
      service().verifyValidation({ project: project(), task }),
    );
  });

  it("fails incompatible checkpoint, post-checkpoint HEAD, branch, remote, and dirty state", async () => {
    await writeFile(join(repositoryRoot, "tracked.ts"), "one\ntwo\nthree\n", "utf8");
    const bound = await bind(taskWithChanges(changes(["tracked.ts"], ["tracked.ts"])));
    const checkpoint = await createGitCheckpointService().createCheckpoint({
      repositoryRoot,
      taskId: "task_000001",
      changeEvidence: {
        files: [{ path: "tracked.ts", status: "MODIFIED", additions: 1, deletions: 0 }],
        summary: { filesChanged: 1, additions: 1, deletions: 0 },
      },
    });
    const task = taskWithValidation({ ...bound, checkpoint });

    await assertStale(
      taskWithValidation({
        ...bound,
        checkpoint: { ...checkpoint, filesChanged: ["other.ts"] },
      }),
      "CHECKPOINT_MISMATCH",
    );

    await assertStale(
      taskWithValidation({
        ...bound,
        checkpoint,
        remoteBranch: {
          remote: "origin",
          branch: "devcrew/task-task_000001",
          commitSha: "2222222222222222222222222222222222222222",
          pushedAt: "2026-08-03T07:00:00.000Z",
        },
      }),
      "CHECKPOINT_MISMATCH",
    );

    await writeFile(join(repositoryRoot, "dirty.ts"), "dirty\n", "utf8");
    await assertStale(task, "WORKTREE_CHANGED");
    await rm(join(repositoryRoot, "dirty.ts"), { force: true });

    await writeFile(join(repositoryRoot, "post.ts"), "post\n", "utf8");
    await git(["add", "--all"]);
    await git(["commit", "--quiet", "-m", "post checkpoint drift"]);
    await assertStale(task, "HEAD_CHANGED");

    await git(["checkout", "--quiet", checkpoint.sha]);
    await git(["switch", "--quiet", "-c", "unexpected-branch"]);
    await assertStale(task, "BRANCH_CHANGED");
  });

  it("fails closed for missing integrity and unsafe Git path evidence", async () => {
    await assertStale(
      taskWithValidation(validation()),
      "MISSING_INTEGRITY",
    );

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

    await assert.rejects(
      service(unsafeInspector).bindValidation({
        project: project(),
        task: taskWithChanges(changes(["tracked.ts"], ["tracked.ts"])),
        validation: validation(),
      }),
      (error: unknown) =>
        error instanceof ValidationIntegrityError &&
        error.reason === "UNSAFE_GIT_EVIDENCE",
    );
  });
});

function service(gitInspector?: GitInspector) {
  return createValidationIntegrityService({
    preparedRepositories: [repository()],
    ...(gitInspector === undefined ? {} : { gitInspector }),
  });
}

async function bind(task: TaskSnapshot): Promise<TaskValidation> {
  return service().bindValidation({
    project: project(),
    task,
    validation: validation(),
  });
}

async function assertStale(
  task: TaskSnapshot,
  reason?: ValidationIntegrityError["reason"],
): Promise<void> {
  await assert.rejects(
    service().verifyValidation({ project: project(), task }),
    (error: unknown) =>
      error instanceof ValidationIntegrityError &&
      (reason === undefined || error.reason === reason),
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

function taskWithValidation(validationEvidence: TaskValidation): TaskSnapshot {
  return {
    ...taskWithChanges(changes(["tracked.ts"], ["tracked.ts"])),
    status: "VALIDATION_COMPLETED",
    validation: validationEvidence,
  };
}

function taskWithChanges(repositoryChanges: GitRepositoryChangeSummary): TaskSnapshot {
  return {
    id: "task_000001",
    projectId: "proj_000001",
    title: "Implement validation integrity checks",
    description: "Bind validation to authoritative repository state.",
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
        summary: "Model narrative is ignored.",
        changedFiles: ["src/model-output.ts"],
        verification: ["Model verification text is ignored."],
        repositoryChanges,
      },
    },
    createdAt: "2026-08-03T00:00:00.000Z",
    updatedAt: "2026-08-03T02:00:00.000Z",
  };
}

function validation(): TaskValidation {
  return {
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
    insertions: filesChanged.length,
    deletions: 0,
  };
}

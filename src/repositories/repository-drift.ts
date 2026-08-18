import { isAbsolute } from "node:path";

import type { ProjectSnapshot } from "../projects/types.js";
import { throwIfSignalCancelled } from "../tasks/task-cancellation.js";
import type { TaskSnapshot } from "../tasks/types.js";
import {
  isSafeBranchName,
  isSafeTaskBranchName,
  taskBranchName,
} from "./git-checkpoint.js";
import {
  createControlledGitCommandRunner,
  createControlledGitInspector,
  isSafeEvidencePath,
  type GitCommandResult,
  type GitCommandRunner,
  type GitInspector,
  type GitRepositoryChangeSummary,
} from "./git-inspector.js";
import {
  findPreparedRepository,
  type PreparedRepository,
} from "./prepared-repositories.js";

export type RepositoryDriftReason =
  | "MISSING_REPOSITORY"
  | "MISSING_EXPECTED_CHANGES"
  | "WORKTREE_CHANGED"
  | "HEAD_CHANGED"
  | "BRANCH_CHANGED"
  | "CHECKPOINT_MISMATCH"
  | "UNSAFE_GIT_EVIDENCE";

export interface RepositoryDriftVerifier {
  verifyTaskRepository(input: {
    project: ProjectSnapshot;
    task: TaskSnapshot;
    signal?: AbortSignal;
  }): Promise<void>;
}

export interface RepositoryDriftVerifierDependencies {
  preparedRepositories: readonly PreparedRepository[];
  gitInspector?: GitInspector;
  runner?: GitCommandRunner;
}

export class RepositoryDriftError extends Error {
  constructor(readonly reason: RepositoryDriftReason) {
    super(`Repository drift detected: ${reason}`);
    this.name = "RepositoryDriftError";
  }
}

export const REPOSITORY_DRIFT_SUMMARY =
  "Repository state changed after authoritative workflow evidence was recorded.";

export function createRepositoryDriftVerifier({
  preparedRepositories,
  gitInspector = createControlledGitInspector(),
  runner = createControlledGitCommandRunner(),
}: RepositoryDriftVerifierDependencies): RepositoryDriftVerifier {
  return {
    async verifyTaskRepository({ project, task, signal }) {
      throwIfSignalCancelled(signal);
      const repository = findPreparedRepository(
        preparedRepositories,
        project.repository.preparedRepositoryId,
      );

      if (
        repository?.localCheckoutPath === undefined ||
        repository.publicRepositoryUrl !== project.repository.publicRepositoryUrl ||
        !isAbsolute(repository.localCheckoutPath)
      ) {
        throw new RepositoryDriftError("MISSING_REPOSITORY");
      }

      if (task.validation?.checkpoint !== undefined) {
        await verifyPostCheckpointState({
          repositoryRoot: repository.localCheckoutPath,
          task,
          runner,
          gitInspector,
          signal,
        });
        return;
      }

      await verifyPreCheckpointState({
        repositoryRoot: repository.localCheckoutPath,
        expected: task.execution?.result.repositoryChanges,
        gitInspector,
        signal,
      });
    },
  };
}

export function createNoopRepositoryDriftVerifier(): RepositoryDriftVerifier {
  return {
    async verifyTaskRepository() {
      // Tests and deterministic modes without a prepared local checkout can opt out.
    },
  };
}

async function verifyPreCheckpointState({
  repositoryRoot,
  expected,
  gitInspector,
  signal,
}: {
  repositoryRoot: string;
  expected?: GitRepositoryChangeSummary;
  gitInspector: GitInspector;
  signal?: AbortSignal;
}): Promise<void> {
  if (expected === undefined) {
    throw new RepositoryDriftError("MISSING_EXPECTED_CHANGES");
  }

  assertSafeRepositoryChanges(expected);

  const current = (
    await gitInspector.captureRepositoryChanges(repositoryRoot, signal)
  ).repositoryChanges;
  assertSafeRepositoryChanges(current);

  if (!sameRepositoryChanges(expected, current)) {
    throw new RepositoryDriftError("WORKTREE_CHANGED");
  }
}

async function verifyPostCheckpointState({
  repositoryRoot,
  task,
  runner,
  gitInspector,
  signal,
}: {
  repositoryRoot: string;
  task: TaskSnapshot;
  runner: GitCommandRunner;
  gitInspector: GitInspector;
  signal?: AbortSignal;
}): Promise<void> {
  const checkpoint = task.validation?.checkpoint;

  if (checkpoint === undefined || !isSha(checkpoint.sha)) {
    throw new RepositoryDriftError("CHECKPOINT_MISMATCH");
  }

  if (
    task.validation?.remoteBranch !== undefined &&
    normalizeSha(task.validation.remoteBranch.commitSha) !==
      normalizeSha(checkpoint.sha)
  ) {
    throw new RepositoryDriftError("CHECKPOINT_MISMATCH");
  }

  const expectedBranch = taskBranchName(task.id);
  if (!isSafeTaskBranchName(expectedBranch)) {
    throw new RepositoryDriftError("BRANCH_CHANGED");
  }

  const head = normalizeSha(
    (await runGit(runner, ["rev-parse", "HEAD"], repositoryRoot, [0], signal))
      .stdout,
  );

  if (head !== normalizeSha(checkpoint.sha)) {
    throw new RepositoryDriftError("HEAD_CHANGED");
  }

  const currentBranch = (
    await runGit(
      runner,
      ["branch", "--show-current"],
      repositoryRoot,
      [0],
      signal,
    )
  ).stdout.trim();

  if (!isSafeBranchName(currentBranch) || currentBranch !== expectedBranch) {
    throw new RepositoryDriftError("BRANCH_CHANGED");
  }

  const current = (
    await gitInspector.captureRepositoryChanges(repositoryRoot, signal)
  ).repositoryChanges;
  assertSafeRepositoryChanges(current);

  if (current.totalFilesChanged !== 0) {
    throw new RepositoryDriftError("WORKTREE_CHANGED");
  }
}

function sameRepositoryChanges(
  expected: GitRepositoryChangeSummary,
  current: GitRepositoryChangeSummary,
): boolean {
  return (
    expected.totalFilesChanged === current.totalFilesChanged &&
    samePathSet(expected.filesChanged, current.filesChanged) &&
    samePathSet(expected.filesAdded, current.filesAdded) &&
    samePathSet(expected.filesModified, current.filesModified) &&
    samePathSet(expected.filesDeleted, current.filesDeleted)
  );
}

function samePathSet(left: readonly string[], right: readonly string[]): boolean {
  if (left.length !== right.length) return false;

  const sortedLeft = [...left].sort((a, b) => a.localeCompare(b));
  const sortedRight = [...right].sort((a, b) => a.localeCompare(b));

  return sortedLeft.every((path, index) => path === sortedRight[index]);
}

function assertSafeRepositoryChanges(summary: GitRepositoryChangeSummary): void {
  const allPaths = [
    ...summary.filesChanged,
    ...summary.filesAdded,
    ...summary.filesModified,
    ...summary.filesDeleted,
  ];

  if (
    !Number.isSafeInteger(summary.totalFilesChanged) ||
    summary.totalFilesChanged < 0 ||
    summary.totalFilesChanged !== new Set(summary.filesChanged).size ||
    !Number.isSafeInteger(summary.insertions) ||
    summary.insertions < 0 ||
    !Number.isSafeInteger(summary.deletions) ||
    summary.deletions < 0
  ) {
    throw new RepositoryDriftError("UNSAFE_GIT_EVIDENCE");
  }

  for (const path of allPaths) {
    if (!isSafeEvidencePath(path)) {
      throw new RepositoryDriftError("UNSAFE_GIT_EVIDENCE");
    }
  }
}

async function runGit(
  runner: GitCommandRunner,
  args: readonly string[],
  repositoryRoot: string,
  acceptedExitCodes: readonly number[],
  signal?: AbortSignal,
): Promise<GitCommandResult> {
  throwIfSignalCancelled(signal);
  if (!isAbsolute(repositoryRoot)) {
    throw new RepositoryDriftError("MISSING_REPOSITORY");
  }

  const result = await runner.run(args, repositoryRoot, { signal });
  throwIfSignalCancelled(signal);

  if (
    !result.started ||
    result.timedOut ||
    result.outputLimitExceeded ||
    result.exitCode === null ||
    !acceptedExitCodes.includes(result.exitCode)
  ) {
    throw new RepositoryDriftError("WORKTREE_CHANGED");
  }

  return result;
}

function normalizeSha(value: string): string {
  const sha = value.trim().toLowerCase();

  if (!isSha(sha)) {
    throw new RepositoryDriftError("CHECKPOINT_MISMATCH");
  }

  return sha;
}

function isSha(value: string): boolean {
  return /^[0-9a-f]{40}$/i.test(value);
}

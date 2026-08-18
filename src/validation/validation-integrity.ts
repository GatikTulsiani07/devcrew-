import { createHash } from "node:crypto";
import { isAbsolute } from "node:path";

import type { ProjectSnapshot } from "../projects/types.js";
import {
  isSafeBranchName,
  taskBranchName,
} from "../repositories/git-checkpoint.js";
import {
  createControlledGitCommandRunner,
  createControlledGitInspector,
  isSafeEvidencePath,
  type GitCommandResult,
  type GitCommandRunner,
  type GitInspector,
  type GitRepositoryChangeSummary,
} from "../repositories/git-inspector.js";
import {
  findPreparedRepository,
  type PreparedRepository,
} from "../repositories/prepared-repositories.js";
import { throwIfSignalCancelled } from "../tasks/task-cancellation.js";
import type { TaskSnapshot, TaskValidation } from "../tasks/types.js";

export interface ValidationIntegrityEvidence {
  repositoryStateId: string;
  headSha: string;
  branch: string;
  validatedAt: string;
}

export interface ValidationIntegrityService {
  bindValidation(input: {
    project: ProjectSnapshot;
    task: TaskSnapshot;
    validation: TaskValidation;
    signal?: AbortSignal;
  }): Promise<TaskValidation>;
  verifyValidation(input: {
    project: ProjectSnapshot;
    task: TaskSnapshot;
    signal?: AbortSignal;
  }): Promise<void>;
}

export interface ValidationIntegrityServiceDependencies {
  preparedRepositories: readonly PreparedRepository[];
  gitInspector?: GitInspector;
  runner?: GitCommandRunner;
}

export type ValidationIntegrityFailureReason =
  | "MISSING_REPOSITORY"
  | "MISSING_VALIDATION"
  | "MISSING_INTEGRITY"
  | "MISSING_EXPECTED_CHANGES"
  | "WORKTREE_CHANGED"
  | "HEAD_CHANGED"
  | "BRANCH_CHANGED"
  | "CHECKPOINT_MISMATCH"
  | "UNSAFE_GIT_EVIDENCE";

export class ValidationIntegrityError extends Error {
  constructor(readonly reason: ValidationIntegrityFailureReason) {
    super(`Validation integrity failed: ${reason}`);
    this.name = "ValidationIntegrityError";
  }
}

export const VALIDATION_INTEGRITY_SUMMARY =
  "Validation evidence no longer matches the authoritative repository state.";

export function createValidationIntegrityService({
  preparedRepositories,
  gitInspector = createControlledGitInspector(),
  runner = createControlledGitCommandRunner(),
}: ValidationIntegrityServiceDependencies): ValidationIntegrityService {
  return {
    async bindValidation({ project, task, validation, signal }) {
      const repositoryRoot = repositoryRootFor(project, preparedRepositories);
      const expected = expectedRepositoryChanges(task);
      const current = await currentRepositoryState({
        repositoryRoot,
        gitInspector,
        runner,
        signal,
      });

      if (!sameRepositoryChanges(expected, current.repositoryChanges)) {
        throw new ValidationIntegrityError("WORKTREE_CHANGED");
      }

      return {
        ...validation,
        integrity: {
          repositoryStateId: repositoryStateId({
            headSha: current.headSha,
            branch: current.branch,
            repositoryChanges: expected,
          }),
          headSha: current.headSha,
          branch: current.branch,
          validatedAt: validation.completedAt,
        },
      };
    },

    async verifyValidation({ project, task, signal }) {
      throwIfSignalCancelled(signal);
      const validation = task.validation;

      if (validation === undefined) {
        throw new ValidationIntegrityError("MISSING_VALIDATION");
      }

      const integrity = validation.integrity;

      if (integrity === undefined) {
        throw new ValidationIntegrityError("MISSING_INTEGRITY");
      }

      const expected = expectedRepositoryChanges(task);
      const expectedStateId = repositoryStateId({
        headSha: normalizeSha(integrity.headSha),
        branch: validateBranch(integrity.branch),
        repositoryChanges: expected,
      });

      if (integrity.repositoryStateId !== expectedStateId) {
        throw new ValidationIntegrityError("WORKTREE_CHANGED");
      }

      if (validation.checkpoint !== undefined) {
        verifyCheckpointCompatibility(task);
        const repositoryRoot = repositoryRootFor(project, preparedRepositories);
        const current = await currentRepositoryState({
          repositoryRoot,
          gitInspector,
          runner,
          signal,
        });
        const expectedBranch = taskBranchName(task.id);

        if (current.headSha !== normalizeSha(validation.checkpoint.sha)) {
          throw new ValidationIntegrityError("HEAD_CHANGED");
        }

        if (current.branch !== expectedBranch) {
          throw new ValidationIntegrityError("BRANCH_CHANGED");
        }

        if (current.repositoryChanges.totalFilesChanged !== 0) {
          throw new ValidationIntegrityError("WORKTREE_CHANGED");
        }
        return;
      }

      const repositoryRoot = repositoryRootFor(project, preparedRepositories);
      const current = await currentRepositoryState({
        repositoryRoot,
        gitInspector,
        runner,
        signal,
      });

      if (current.headSha !== integrity.headSha) {
        throw new ValidationIntegrityError("HEAD_CHANGED");
      }

      if (current.branch !== integrity.branch) {
        throw new ValidationIntegrityError("BRANCH_CHANGED");
      }

      if (!sameRepositoryChanges(expected, current.repositoryChanges)) {
        throw new ValidationIntegrityError("WORKTREE_CHANGED");
      }
    },
  };
}

export function createNoopValidationIntegrityService(): ValidationIntegrityService {
  return {
    async bindValidation({ validation }) {
      return validation;
    },
    async verifyValidation() {
      // Tests and deterministic modes without a prepared local checkout can opt out.
    },
  };
}

export function repositoryStateId(input: {
  headSha: string;
  branch: string;
  repositoryChanges: GitRepositoryChangeSummary;
}): string {
  const canonical = canonicalRepositoryState(input);

  return createHash("sha256").update(canonical).digest("hex");
}

export function canonicalRepositoryState(input: {
  headSha: string;
  branch: string;
  repositoryChanges: GitRepositoryChangeSummary;
}): string {
  const repositoryChanges = canonicalRepositoryChanges(input.repositoryChanges);

  return JSON.stringify({
    version: 1,
    headSha: normalizeSha(input.headSha),
    branch: validateBranch(input.branch),
    repositoryChanges,
  });
}

function repositoryRootFor(
  project: ProjectSnapshot,
  preparedRepositories: readonly PreparedRepository[],
): string {
  const repository = findPreparedRepository(
    preparedRepositories,
    project.repository.preparedRepositoryId,
  );

  if (
    repository?.localCheckoutPath === undefined ||
    repository.publicRepositoryUrl !== project.repository.publicRepositoryUrl ||
    !isAbsolute(repository.localCheckoutPath)
  ) {
    throw new ValidationIntegrityError("MISSING_REPOSITORY");
  }

  return repository.localCheckoutPath;
}

function expectedRepositoryChanges(task: TaskSnapshot): GitRepositoryChangeSummary {
  const repositoryChanges = task.execution?.result.repositoryChanges;

  if (repositoryChanges === undefined) {
    throw new ValidationIntegrityError("MISSING_EXPECTED_CHANGES");
  }

  return canonicalRepositoryChanges(repositoryChanges);
}

async function currentRepositoryState({
  repositoryRoot,
  gitInspector,
  runner,
  signal,
}: {
  repositoryRoot: string;
  gitInspector: GitInspector;
  runner: GitCommandRunner;
  signal?: AbortSignal;
}): Promise<{
  headSha: string;
  branch: string;
  repositoryChanges: GitRepositoryChangeSummary;
}> {
  const headSha = normalizeSha(
    (await runGit(runner, ["rev-parse", "HEAD"], repositoryRoot, [0], signal))
      .stdout,
  );
  const branch = validateBranch(
    (
      await runGit(
        runner,
        ["branch", "--show-current"],
        repositoryRoot,
        [0],
        signal,
      )
    ).stdout.trim(),
  );
  const repositoryChanges = canonicalRepositoryChanges(
    (
      await gitInspector.captureRepositoryChanges(repositoryRoot, signal)
    ).repositoryChanges,
  );

  return { headSha, branch, repositoryChanges };
}

function verifyCheckpointCompatibility(task: TaskSnapshot): void {
  const checkpoint = task.validation?.checkpoint;
  const integrity = task.validation?.integrity;

  if (checkpoint === undefined || integrity === undefined) {
    throw new ValidationIntegrityError("CHECKPOINT_MISMATCH");
  }

  normalizeSha(checkpoint.sha);

  if (
    task.validation?.remoteBranch !== undefined &&
    normalizeSha(task.validation.remoteBranch.commitSha) !==
      normalizeSha(checkpoint.sha)
  ) {
    throw new ValidationIntegrityError("CHECKPOINT_MISMATCH");
  }

  const expectedBranch = taskBranchName(task.id);

  if (!isSafeBranchName(expectedBranch)) {
    throw new ValidationIntegrityError("BRANCH_CHANGED");
  }

  const expected = expectedRepositoryChanges(task);

  if (!samePathSet(checkpoint.filesChanged, expected.filesChanged)) {
    throw new ValidationIntegrityError("CHECKPOINT_MISMATCH");
  }
}

function canonicalRepositoryChanges(
  summary: GitRepositoryChangeSummary,
): GitRepositoryChangeSummary {
  assertSafeRepositoryChanges(summary);

  return {
    filesChanged: sortedUnique(summary.filesChanged),
    filesAdded: sortedUnique(summary.filesAdded),
    filesModified: sortedUnique(summary.filesModified),
    filesDeleted: sortedUnique(summary.filesDeleted),
    totalFilesChanged: summary.totalFilesChanged,
    insertions: summary.insertions,
    deletions: summary.deletions,
  };
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
    throw new ValidationIntegrityError("UNSAFE_GIT_EVIDENCE");
  }

  for (const path of allPaths) {
    if (!isSafeEvidencePath(path)) {
      throw new ValidationIntegrityError("UNSAFE_GIT_EVIDENCE");
    }
  }
}

function sortedUnique(paths: readonly string[]): readonly string[] {
  const seen = new Set<string>();

  for (const path of paths) {
    if (!isSafeEvidencePath(path) || seen.has(path)) {
      throw new ValidationIntegrityError("UNSAFE_GIT_EVIDENCE");
    }
    seen.add(path);
  }

  return [...seen].sort((left, right) => left.localeCompare(right));
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
    throw new ValidationIntegrityError("MISSING_REPOSITORY");
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
    throw new ValidationIntegrityError("WORKTREE_CHANGED");
  }

  return result;
}

function validateBranch(branch: string): string {
  if (!isSafeBranchName(branch)) {
    throw new ValidationIntegrityError("BRANCH_CHANGED");
  }

  return branch;
}

function normalizeSha(value: string): string {
  const sha = value.trim().toLowerCase();

  if (!/^[0-9a-f]{40}$/i.test(sha)) {
    throw new ValidationIntegrityError("HEAD_CHANGED");
  }

  return sha;
}

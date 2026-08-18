import {
  lstat,
  mkdir,
  readFile,
  realpath,
  rm,
  rmdir,
  writeFile,
} from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";

import { describeError, logger } from "../observability/logger.js";
import type { TaskSnapshot } from "../tasks/types.js";
import {
  createControlledGitCommandRunner,
  createControlledGitInspector,
  emptyRepositoryChanges,
  isSafeEvidencePath,
  type GitChangedFile,
  type GitCommandResult,
  type GitCommandRunner,
  type GitInspector,
  type GitRepositoryChangeSummary,
} from "./git-inspector.js";
import { isSafeBranchName } from "./git-checkpoint.js";

export interface DeveloperRollbackBaseline {
  headSha: string;
  branch: string;
  repositoryChangesBefore: GitRepositoryChangeSummary;
  capturedAt: string;
  snapshots: readonly DeveloperRollbackSnapshot[];
}

export interface DeveloperRollbackSnapshot {
  path: string;
  status: GitChangedFile["status"];
  content?: string;
}

export interface DeveloperRollbackService {
  captureBaseline(input: {
    repositoryRoot: string;
    now?: () => Date;
  }): Promise<DeveloperRollbackBaseline>;
  rollback(input: {
    repositoryRoot: string;
    baseline: DeveloperRollbackBaseline;
    task?: TaskSnapshot;
  }): Promise<void>;
}

export interface DeveloperRollbackServiceDependencies {
  gitInspector?: GitInspector;
  runner?: GitCommandRunner;
  maxFiles?: number;
  maxSnapshotBytes?: number;
}

export type DeveloperRollbackFailureReason =
  | "MISSING_REPOSITORY"
  | "PUBLISHED_WORK"
  | "HEAD_CHANGED"
  | "BRANCH_CHANGED"
  | "UNSAFE_GIT_EVIDENCE"
  | "ROLLBACK_LIMIT_EXCEEDED"
  | "ROLLBACK_UNSAFE"
  | "ROLLBACK_FAILED";

export class DeveloperRollbackError extends Error {
  constructor(readonly reason: DeveloperRollbackFailureReason) {
    super(`Developer rollback failed: ${reason}`);
    this.name = "DeveloperRollbackError";
  }
}

export const DEVELOPER_ROLLBACK_FAILED_SUMMARY =
  "Developer changes could not be safely rolled back.";

export const MAX_ROLLBACK_FILES = 24;
export const MAX_ROLLBACK_SNAPSHOT_BYTES = 256 * 1024;

export function createDeveloperRollbackService({
  gitInspector = createControlledGitInspector(),
  runner = createControlledGitCommandRunner(),
  maxFiles = MAX_ROLLBACK_FILES,
  maxSnapshotBytes = MAX_ROLLBACK_SNAPSHOT_BYTES,
}: DeveloperRollbackServiceDependencies = {}): DeveloperRollbackService {
  return {
    async captureBaseline({ repositoryRoot, now = () => new Date() }) {
      const root = await canonicalRoot(repositoryRoot);
      const headSha = await currentHead(runner, root);
      const branch = await currentBranch(runner, root);
      const inspection = await gitInspector.captureRepositoryChanges(root);
      const changedFiles = inspection.changeEvidence?.files ?? [];

      assertRollbackFileLimit(changedFiles, maxFiles);

      const snapshots = await captureSnapshots({
        root,
        files: changedFiles,
        maxSnapshotBytes,
      });

      return {
        headSha,
        branch,
        repositoryChangesBefore: inspection.repositoryChanges,
        capturedAt: now().toISOString(),
        snapshots,
      };
    },

    async rollback({ repositoryRoot, baseline, task }) {
      assertPublicationAllowed(task);

      const root = await canonicalRoot(repositoryRoot);
      await assertCurrentHeadAndBranch(root, baseline, runner);

      const current = await gitInspector.captureRepositoryChanges(root);
      const currentFiles = current.changeEvidence?.files ?? [];
      assertRollbackFileLimit(currentFiles, maxFiles);

      const plan = buildRollbackPlan(baseline, currentFiles, maxFiles);
      await validateRollbackPlan(root, plan);

      for (const path of plan.restoreFromSnapshot) {
        const snapshot = snapshotFor(baseline, path);
        await restoreSnapshot(root, snapshot);
      }

      for (const path of plan.restoreFromHead) {
        await restoreTrackedPath(runner, root, baseline.headSha, path);
      }

      for (const path of plan.removeCreated) {
        await removeCreatedPath(root, path);
      }

      for (const path of plan.parentDirectories) {
        await removeDirectoryIfEmpty(root, path);
      }

      await assertCurrentHeadAndBranch(root, baseline, runner);
      const verified = await gitInspector.captureRepositoryChanges(root);

      if (
        !sameRepositoryChanges(
          baseline.repositoryChangesBefore,
          verified.repositoryChanges,
        )
      ) {
        throw new DeveloperRollbackError("ROLLBACK_FAILED");
      }
    },
  };
}

interface RollbackPlan {
  restoreFromHead: readonly string[];
  restoreFromSnapshot: readonly string[];
  removeCreated: readonly string[];
  parentDirectories: readonly string[];
}

async function captureSnapshots({
  root,
  files,
  maxSnapshotBytes,
}: {
  root: string;
  files: readonly GitChangedFile[];
  maxSnapshotBytes: number;
}): Promise<readonly DeveloperRollbackSnapshot[]> {
  const snapshots: DeveloperRollbackSnapshot[] = [];
  let totalBytes = 0;

  for (const file of files) {
    assertSafePath(file.path);

    if (file.status === "DELETED") {
      snapshots.push({ path: file.path, status: file.status });
      continue;
    }

    const absolutePath = await resolveSafePath(root, file.path);
    const content = await readFile(absolutePath, "utf8").catch((error: unknown) => {
      logger.error("Failed to read rollback baseline file", {
        cause: describeError(error),
      });
      throw new DeveloperRollbackError("ROLLBACK_UNSAFE");
    });
    totalBytes += Buffer.byteLength(content, "utf8");

    if (totalBytes > maxSnapshotBytes) {
      throw new DeveloperRollbackError("ROLLBACK_LIMIT_EXCEEDED");
    }

    snapshots.push({ path: file.path, status: file.status, content });
  }

  return snapshots;
}

function buildRollbackPlan(
  baseline: DeveloperRollbackBaseline,
  currentFiles: readonly GitChangedFile[],
  maxFiles: number,
): RollbackPlan {
  const baselinePaths = new Set(baseline.repositoryChangesBefore.filesChanged);
  const currentPaths = new Set(currentFiles.map((file) => file.path));
  const restoreFromSnapshot = new Set<string>();
  const restoreFromHead = new Set<string>();
  const removeCreated = new Set<string>();
  const parentDirectories = new Set<string>();

  for (const path of baselinePaths) {
    assertSafePath(path);
    if (currentPaths.has(path)) {
      restoreFromSnapshot.add(path);
    }
  }

  for (const file of currentFiles) {
    assertSafePath(file.path);

    if (baselinePaths.has(file.path)) {
      continue;
    }

    if (file.status === "UNTRACKED" || file.status === "ADDED") {
      removeCreated.add(file.path);
      for (const directory of parentDirectoriesFor(file.path)) {
        parentDirectories.add(directory);
      }
      continue;
    }

    restoreFromHead.add(file.path);
  }

  const total =
    restoreFromSnapshot.size + restoreFromHead.size + removeCreated.size;

  if (total > maxFiles) {
    throw new DeveloperRollbackError("ROLLBACK_LIMIT_EXCEEDED");
  }

  return {
    restoreFromHead: sorted(restoreFromHead),
    restoreFromSnapshot: sorted(restoreFromSnapshot),
    removeCreated: sorted(removeCreated),
    parentDirectories: [...sorted(parentDirectories)].reverse(),
  };
}

async function validateRollbackPlan(
  root: string,
  plan: RollbackPlan,
): Promise<void> {
  for (const path of [
    ...plan.restoreFromHead,
    ...plan.restoreFromSnapshot,
    ...plan.removeCreated,
    ...plan.parentDirectories,
  ]) {
    await resolveSafePath(root, path);
  }

  for (const path of plan.removeCreated) {
    const absolutePath = await resolveSafePath(root, path);
    const stat = await lstat(absolutePath).catch(() => undefined);

    if (stat === undefined) {
      continue;
    }

    if (!stat.isFile()) {
      throw new DeveloperRollbackError("ROLLBACK_UNSAFE");
    }
  }
}

async function restoreSnapshot(
  root: string,
  snapshot: DeveloperRollbackSnapshot,
): Promise<void> {
  const absolutePath = await resolveSafePath(root, snapshot.path);

  if (snapshot.status === "DELETED") {
    await rm(absolutePath, { force: true });
    return;
  }

  if (snapshot.content === undefined) {
    throw new DeveloperRollbackError("ROLLBACK_UNSAFE");
  }

  await mkdir(dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, snapshot.content, "utf8");
}

async function restoreTrackedPath(
  runner: GitCommandRunner,
  root: string,
  headSha: string,
  path: string,
): Promise<void> {
  await runGit(
    runner,
    ["restore", `--source=${headSha}`, "--worktree", "--", path],
    root,
    [0],
  );
}

async function removeCreatedPath(root: string, path: string): Promise<void> {
  const absolutePath = await resolveSafePath(root, path);
  const stat = await lstat(absolutePath).catch(() => undefined);

  if (stat === undefined) {
    return;
  }

  if (!stat.isFile()) {
    throw new DeveloperRollbackError("ROLLBACK_UNSAFE");
  }

  await rm(absolutePath, { force: true });
}

async function removeDirectoryIfEmpty(root: string, path: string): Promise<void> {
  if (path === ".") return;

  const absolutePath = await resolveSafePath(root, path);

  await rmdir(absolutePath).catch((error: unknown) => {
    if (error instanceof Error && "code" in error && error.code === "ENOTEMPTY") {
      return;
    }
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return;
    }
    throw error;
  });
}

function snapshotFor(
  baseline: DeveloperRollbackBaseline,
  path: string,
): DeveloperRollbackSnapshot {
  const snapshot = baseline.snapshots.find((candidate) => candidate.path === path);

  if (snapshot === undefined) {
    throw new DeveloperRollbackError("ROLLBACK_UNSAFE");
  }

  return snapshot;
}

async function assertCurrentHeadAndBranch(
  root: string,
  baseline: DeveloperRollbackBaseline,
  runner: GitCommandRunner,
): Promise<void> {
  if ((await currentHead(runner, root)) !== baseline.headSha) {
    throw new DeveloperRollbackError("HEAD_CHANGED");
  }

  if ((await currentBranch(runner, root)) !== baseline.branch) {
    throw new DeveloperRollbackError("BRANCH_CHANGED");
  }
}

function assertPublicationAllowed(task: TaskSnapshot | undefined): void {
  if (
    task?.validation?.checkpoint !== undefined ||
    task?.validation?.remoteBranch !== undefined ||
    task?.pullRequest !== undefined
  ) {
    throw new DeveloperRollbackError("PUBLISHED_WORK");
  }
}

async function canonicalRoot(repositoryRoot: string): Promise<string> {
  if (!isAbsolute(repositoryRoot)) {
    throw new DeveloperRollbackError("MISSING_REPOSITORY");
  }

  const root = await realpath(repositoryRoot).catch((error: unknown) => {
    logger.error("Rollback repository root is unavailable", {
      cause: describeError(error),
    });
    throw new DeveloperRollbackError("MISSING_REPOSITORY");
  });

  return root;
}

async function resolveSafePath(root: string, path: string): Promise<string> {
  assertSafePath(path);
  const absolutePath = resolve(root, path);
  const relativePath = relative(root, absolutePath);

  if (
    absolutePath !== root &&
    (relativePath === "" ||
      relativePath.startsWith("..") ||
      isAbsolute(relativePath) ||
      relativePath.split(sep).includes(".."))
  ) {
    throw new DeveloperRollbackError("ROLLBACK_UNSAFE");
  }

  const parent = await realpath(dirname(absolutePath)).catch(() => root);
  const parentRelative = relative(root, parent);

  if (
    parent !== root &&
    (parentRelative === "" ||
      parentRelative.startsWith("..") ||
      isAbsolute(parentRelative) ||
      parentRelative.split(sep).includes(".."))
  ) {
    throw new DeveloperRollbackError("ROLLBACK_UNSAFE");
  }

  return absolutePath;
}

function assertSafePath(path: string): void {
  if (!isSafeEvidencePath(path)) {
    throw new DeveloperRollbackError("UNSAFE_GIT_EVIDENCE");
  }
}

async function currentHead(
  runner: GitCommandRunner,
  root: string,
): Promise<string> {
  const sha = (await runGit(runner, ["rev-parse", "HEAD"], root, [0])).stdout
    .trim()
    .toLowerCase();

  if (!/^[0-9a-f]{40}$/.test(sha)) {
    throw new DeveloperRollbackError("HEAD_CHANGED");
  }

  return sha;
}

async function currentBranch(
  runner: GitCommandRunner,
  root: string,
): Promise<string> {
  const branch = (
    await runGit(runner, ["branch", "--show-current"], root, [0])
  ).stdout.trim();

  if (!isSafeBranchName(branch)) {
    throw new DeveloperRollbackError("BRANCH_CHANGED");
  }

  return branch;
}

async function runGit(
  runner: GitCommandRunner,
  args: readonly string[],
  root: string,
  acceptedExitCodes: readonly number[],
): Promise<GitCommandResult> {
  const result = await runner.run(args, root);

  if (
    !result.started ||
    result.timedOut ||
    result.outputLimitExceeded ||
    result.exitCode === null ||
    !acceptedExitCodes.includes(result.exitCode)
  ) {
    logger.error("Developer rollback Git command failed", {
      command: args[0],
      exitCode: result.exitCode,
      timedOut: result.timedOut,
      outputLimitExceeded: result.outputLimitExceeded,
      started: result.started,
    });
    throw new DeveloperRollbackError("ROLLBACK_FAILED");
  }

  return result;
}

function assertRollbackFileLimit(
  files: readonly GitChangedFile[],
  maxFiles: number,
): void {
  if (files.length > maxFiles) {
    throw new DeveloperRollbackError("ROLLBACK_LIMIT_EXCEEDED");
  }
}

function sameRepositoryChanges(
  left: GitRepositoryChangeSummary,
  right: GitRepositoryChangeSummary,
): boolean {
  return (
    left.totalFilesChanged === right.totalFilesChanged &&
    samePathSet(left.filesChanged, right.filesChanged) &&
    samePathSet(left.filesAdded, right.filesAdded) &&
    samePathSet(left.filesModified, right.filesModified) &&
    samePathSet(left.filesDeleted, right.filesDeleted)
  );
}

function samePathSet(left: readonly string[], right: readonly string[]): boolean {
  if (left.length !== right.length) return false;

  const sortedLeft = [...left].sort((a, b) => a.localeCompare(b));
  const sortedRight = [...right].sort((a, b) => a.localeCompare(b));

  return sortedLeft.every((path, index) => path === sortedRight[index]);
}

function sorted(paths: Set<string>): readonly string[] {
  return [...paths].sort((left, right) => left.localeCompare(right));
}

function parentDirectoriesFor(path: string): readonly string[] {
  const segments = path.split("/").slice(0, -1);
  const directories: string[] = [];

  for (let index = 0; index < segments.length; index += 1) {
    directories.push(segments.slice(0, index + 1).join("/"));
  }

  return directories;
}

export function cleanRollbackBaseline(
  input: Pick<DeveloperRollbackBaseline, "headSha" | "branch" | "capturedAt">,
): DeveloperRollbackBaseline {
  return {
    headSha: input.headSha,
    branch: input.branch,
    capturedAt: input.capturedAt,
    repositoryChangesBefore: emptyRepositoryChanges(),
    snapshots: [],
  };
}

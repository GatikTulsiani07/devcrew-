import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { isAbsolute, join } from "node:path";

import { describeError, logger } from "../observability/logger.js";
import {
  createControlledGitCommandRunner,
  isSafeEvidencePath,
  parseStatusOutput,
  type GitChangeEvidence,
  type GitCommandResult,
  type GitCommandRunner,
} from "./git-inspector.js";

export interface GitCheckpointEvidence {
  sha: string;
  shortSha: string;
  message: string;
  createdAt: string;
  filesChanged: readonly string[];
}

export interface GitCheckpointInput {
  repositoryRoot: string;
  taskId: string;
  changeEvidence: GitChangeEvidence;
  existingCheckpoint?: GitCheckpointEvidence;
}

export interface GitCheckpointService {
  createCheckpoint(input: GitCheckpointInput): Promise<GitCheckpointEvidence>;
}

export class GitCheckpointError extends Error {
  constructor(readonly reason: string) {
    super(`Git checkpoint failed: ${reason}`);
    this.name = "GitCheckpointError";
  }
}

export const CHECKPOINT_AUTHOR_NAME = "Devcrew Agent";
export const CHECKPOINT_AUTHOR_EMAIL = "devcrew@localhost";
export const GIT_CHECKPOINT_TIMEOUT_MS = 20_000;
export const MAX_CHECKPOINT_FILES = 24;

const statusArgs: readonly string[] = [
  "status",
  "--porcelain=v1",
  "-z",
  "--untracked-files=all",
  "--no-renames",
];

export function createGitCheckpointService({
  runner = createControlledGitCommandRunner({
    timeoutMs: GIT_CHECKPOINT_TIMEOUT_MS,
  }),
  now = () => new Date(),
}: {
  runner?: GitCommandRunner;
  now?: () => Date;
} = {}): GitCheckpointService {
  return {
    async createCheckpoint(input) {
      const expectedPaths = expectedChangedPaths(input.changeEvidence);

      if (input.existingCheckpoint !== undefined) {
        return verifyExistingCheckpoint(runner, input.repositoryRoot, input.existingCheckpoint);
      }

      await verifyPreCommitStatus(runner, input.repositoryRoot, expectedPaths);

      const hooksPath = await mkdtemp(join(tmpdir(), "devcrew-git-hooks-"));
      const message = checkpointMessage(input.taskId);

      try {
        await runGit(runner, ["add", "--", ...expectedPaths], input.repositoryRoot, [0]);
        await runGit(
          runner,
          [
            "-c",
            `user.name=${CHECKPOINT_AUTHOR_NAME}`,
            "-c",
            `user.email=${CHECKPOINT_AUTHOR_EMAIL}`,
            "-c",
            `core.hooksPath=${hooksPath}`,
            "commit",
            "--no-gpg-sign",
            "-m",
            message,
          ],
          input.repositoryRoot,
          [0],
        );
      } finally {
        await rm(hooksPath, { recursive: true, force: true }).catch((error: unknown) => {
          logger.error("Failed to remove temporary Git hooks path", {
            cause: describeError(error),
          });
        });
      }

      const sha = parseSha(
        (await runGit(runner, ["rev-parse", "HEAD"], input.repositoryRoot, [0])).stdout,
      );
      await verifyPostCommitStatus(runner, input.repositoryRoot);

      return {
        sha,
        shortSha: sha.slice(0, 12),
        message,
        createdAt: now().toISOString(),
        filesChanged: [...expectedPaths],
      };
    },
  };
}

function expectedChangedPaths(evidence: GitChangeEvidence): readonly string[] {
  if (!Array.isArray(evidence.files) || evidence.files.length === 0) {
    throw new GitCheckpointError("no authoritative changes were provided");
  }

  if (evidence.files.length > MAX_CHECKPOINT_FILES) {
    throw new GitCheckpointError("changed file limit exceeded");
  }

  const paths = evidence.files.map((file) => file.path);
  const seen = new Set<string>();

  for (const path of paths) {
    if (!isSafeEvidencePath(path)) {
      throw new GitCheckpointError("unsafe authoritative path");
    }

    if (seen.has(path)) {
      throw new GitCheckpointError("duplicate authoritative path");
    }

    seen.add(path);
  }

  return [...seen].sort((left, right) => left.localeCompare(right));
}

async function verifyPreCommitStatus(
  runner: GitCommandRunner,
  repositoryRoot: string,
  expectedPaths: readonly string[],
): Promise<void> {
  const dirtyPaths = new Set(await readDirtyPaths(runner, repositoryRoot));
  const expected = new Set(expectedPaths);

  for (const path of dirtyPaths) {
    if (!expected.has(path)) {
      throw new GitCheckpointError("unexpected dirty path");
    }
  }

  for (const path of expected) {
    if (!dirtyPaths.has(path)) {
      throw new GitCheckpointError("expected dirty path is missing");
    }
  }
}

async function verifyPostCommitStatus(
  runner: GitCommandRunner,
  repositoryRoot: string,
): Promise<void> {
  const dirtyPaths = await readDirtyPaths(runner, repositoryRoot);

  if (dirtyPaths.length > 0) {
    throw new GitCheckpointError("post-commit repository state is dirty");
  }
}

async function verifyExistingCheckpoint(
  runner: GitCommandRunner,
  repositoryRoot: string,
  checkpoint: GitCheckpointEvidence,
): Promise<GitCheckpointEvidence> {
  const head = parseSha(
    (await runGit(runner, ["rev-parse", "HEAD"], repositoryRoot, [0])).stdout,
  );

  if (head !== checkpoint.sha) {
    throw new GitCheckpointError("existing checkpoint does not match HEAD");
  }

  await verifyPostCommitStatus(runner, repositoryRoot);

  return {
    sha: checkpoint.sha,
    shortSha: checkpoint.shortSha,
    message: checkpoint.message,
    createdAt: checkpoint.createdAt,
    filesChanged: [...checkpoint.filesChanged],
  };
}

async function readDirtyPaths(
  runner: GitCommandRunner,
  repositoryRoot: string,
): Promise<readonly string[]> {
  return parseStatusOutput(
    (await runGit(runner, statusArgs, repositoryRoot, [0])).stdout,
  ).map((file) => file.path);
}

async function runGit(
  runner: GitCommandRunner,
  args: readonly string[],
  repositoryRoot: string,
  acceptedExitCodes: readonly number[],
): Promise<GitCommandResult> {
  if (!isAbsolute(repositoryRoot)) {
    throw new GitCheckpointError("repository root is not absolute");
  }

  const result = await runner.run(args, repositoryRoot);

  if (
    !result.started ||
    result.timedOut ||
    result.outputLimitExceeded ||
    result.exitCode === null ||
    !acceptedExitCodes.includes(result.exitCode)
  ) {
    logger.error("Git checkpoint command failed", {
      command: args[0],
      exitCode: result.exitCode,
      timedOut: result.timedOut,
      outputLimitExceeded: result.outputLimitExceeded,
      started: result.started,
    });
    throw new GitCheckpointError("git checkpoint command failed");
  }

  return result;
}

function checkpointMessage(taskId: string): string {
  const safeTaskId = taskId
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .replace(/[^A-Za-z0-9._:-]/g, "")
    .slice(0, 128);

  return `devcrew: implement task ${safeTaskId || "unknown"}`;
}

function parseSha(stdout: string): string {
  const value = stdout.trim();

  if (!/^[0-9a-f]{40}$/i.test(value)) {
    throw new GitCheckpointError("malformed checkpoint SHA");
  }

  return value.toLowerCase();
}

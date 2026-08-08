import { isAbsolute } from "node:path";

import { logger } from "../observability/logger.js";
import {
  DEFAULT_BRANCH_NAMES,
  isSafeBranchName,
  isSafeTaskBranchName,
  taskBranchName,
  type GitCheckpointEvidence,
} from "./git-checkpoint.js";
import {
  createControlledGitCommandRunner,
  parseStatusOutput,
  type GitCommandResult,
  type GitCommandRunner,
} from "./git-inspector.js";

export interface GitRemotePushEvidence {
  remote: "origin";
  branch: string;
  commitSha: string;
  pushedAt: string;
}

export interface GitRemotePushInput {
  repositoryRoot: string;
  taskId: string;
  projectRepositoryUrl: string;
  checkpoint?: GitCheckpointEvidence;
  existingRemoteBranch?: GitRemotePushEvidence;
}

export interface GitRemotePushService {
  pushValidatedBranch(input: GitRemotePushInput): Promise<GitRemotePushEvidence>;
}

export class GitRemotePushError extends Error {
  constructor(readonly reason: string) {
    super(`Git remote push failed: ${reason}`);
    this.name = "GitRemotePushError";
  }
}

export const GIT_REMOTE_PUSH_TIMEOUT_MS = 30_000;
export const REMOTE_NAME = "origin";

const statusArgs: readonly string[] = [
  "status",
  "--porcelain=v1",
  "-z",
  "--untracked-files=all",
  "--no-renames",
];

export function createGitRemotePushService({
  runner = createControlledGitCommandRunner({
    timeoutMs: GIT_REMOTE_PUSH_TIMEOUT_MS,
  }),
  now = () => new Date(),
}: {
  runner?: GitCommandRunner;
  now?: () => Date;
} = {}): GitRemotePushService {
  return {
    async pushValidatedBranch(input) {
      if (input.checkpoint === undefined) {
        throw new GitRemotePushError("checkpoint is required");
      }

      const branch = taskBranchName(input.taskId);
      const checkpointSha = normalizeSha(input.checkpoint.sha);

      await verifyLocalPreconditions(runner, input.repositoryRoot, branch, checkpointSha);
      await verifyRemoteOwnership(
        runner,
        input.repositoryRoot,
        input.projectRepositoryUrl,
      );
      await verifyDefaultBranch(runner, input.repositoryRoot, branch);

      const existingRemoteSha = await readRemoteBranchSha(
        runner,
        input.repositoryRoot,
        branch,
      );

      if (existingRemoteSha === checkpointSha) {
        return copyRemoteEvidence(
          input.existingRemoteBranch ?? {
            remote: REMOTE_NAME,
            branch,
            commitSha: checkpointSha,
            pushedAt: now().toISOString(),
          },
          branch,
          checkpointSha,
        );
      }

      if (existingRemoteSha !== undefined) {
        throw new GitRemotePushError("remote branch points to a different commit");
      }

      await runGit(
        runner,
        ["push", REMOTE_NAME, `${branch}:${branch}`],
        input.repositoryRoot,
        [0],
      );

      const pushedSha = await readRemoteBranchSha(runner, input.repositoryRoot, branch);

      if (pushedSha !== checkpointSha) {
        throw new GitRemotePushError("remote branch verification failed");
      }

      return {
        remote: REMOTE_NAME,
        branch,
        commitSha: checkpointSha,
        pushedAt: now().toISOString(),
      };
    },
  };
}

async function verifyLocalPreconditions(
  runner: GitCommandRunner,
  repositoryRoot: string,
  branch: string,
  checkpointSha: string,
): Promise<void> {
  const head = normalizeSha(
    (await runGit(runner, ["rev-parse", "HEAD"], repositoryRoot, [0])).stdout,
  );

  if (head !== checkpointSha) {
    throw new GitRemotePushError("HEAD does not match checkpoint");
  }

  const dirtyFiles = parseStatusOutput(
    (await runGit(runner, statusArgs, repositoryRoot, [0])).stdout,
  );

  if (dirtyFiles.length > 0) {
    throw new GitRemotePushError("working tree is not clean");
  }

  const currentBranch = (
    await runGit(runner, ["branch", "--show-current"], repositoryRoot, [0])
  ).stdout.trim();

  if (!isSafeBranchName(currentBranch)) {
    throw new GitRemotePushError("current branch is unsafe");
  }

  if (currentBranch !== branch) {
    throw new GitRemotePushError("current branch is not the task branch");
  }

  if (!isSafeTaskBranchName(branch) || DEFAULT_BRANCH_NAMES.has(branch)) {
    throw new GitRemotePushError("task branch is unsafe");
  }
}

async function verifyRemoteOwnership(
  runner: GitCommandRunner,
  repositoryRoot: string,
  projectRepositoryUrl: string,
): Promise<void> {
  const configuredUrl = (
    await runGit(runner, ["remote", "get-url", REMOTE_NAME], repositoryRoot, [0])
  ).stdout.trim();
  const configured = githubRepositoryKey(configuredUrl);
  const expected = githubRepositoryKey(projectRepositoryUrl);

  if (configured === undefined || expected === undefined || configured !== expected) {
    throw new GitRemotePushError("configured remote does not match project repository");
  }
}

async function verifyDefaultBranch(
  runner: GitCommandRunner,
  repositoryRoot: string,
  taskBranch: string,
): Promise<void> {
  const defaultRef = (
    await runGit(
      runner,
      ["symbolic-ref", "--quiet", "--short", `refs/remotes/${REMOTE_NAME}/HEAD`],
      repositoryRoot,
      [0],
    )
  ).stdout.trim();
  const defaultBranch = defaultRef.startsWith(`${REMOTE_NAME}/`)
    ? defaultRef.slice(REMOTE_NAME.length + 1)
    : defaultRef;

  if (!isSafeBranchName(defaultBranch)) {
    throw new GitRemotePushError("default branch is unsafe");
  }

  if (taskBranch === defaultBranch || DEFAULT_BRANCH_NAMES.has(taskBranch)) {
    throw new GitRemotePushError("task branch is a default branch");
  }
}

async function readRemoteBranchSha(
  runner: GitCommandRunner,
  repositoryRoot: string,
  branch: string,
): Promise<string | undefined> {
  const output = (
    await runGit(
      runner,
      ["ls-remote", "--heads", REMOTE_NAME, branch],
      repositoryRoot,
      [0],
    )
  ).stdout.trim();

  if (output === "") {
    return undefined;
  }

  const rows = output.split("\n");

  if (rows.length !== 1) {
    throw new GitRemotePushError("remote branch output is ambiguous");
  }

  const [sha, ref] = rows[0].split(/\s+/);

  if (ref !== `refs/heads/${branch}`) {
    throw new GitRemotePushError("remote branch output is malformed");
  }

  return normalizeSha(sha ?? "");
}

async function runGit(
  runner: GitCommandRunner,
  args: readonly string[],
  repositoryRoot: string,
  acceptedExitCodes: readonly number[],
): Promise<GitCommandResult> {
  if (!isAbsolute(repositoryRoot)) {
    throw new GitRemotePushError("repository root is not absolute");
  }

  const result = await runner.run(args, repositoryRoot);

  if (
    !result.started ||
    result.timedOut ||
    result.outputLimitExceeded ||
    result.exitCode === null ||
    !acceptedExitCodes.includes(result.exitCode)
  ) {
    logger.error("Git remote push command failed", {
      command: args[0],
      exitCode: result.exitCode,
      timedOut: result.timedOut,
      outputLimitExceeded: result.outputLimitExceeded,
      started: result.started,
    });
    throw new GitRemotePushError("git remote push command failed");
  }

  return result;
}

function copyRemoteEvidence(
  evidence: GitRemotePushEvidence,
  branch: string,
  commitSha: string,
): GitRemotePushEvidence {
  if (
    evidence.remote !== REMOTE_NAME ||
    evidence.branch !== branch ||
    normalizeSha(evidence.commitSha) !== commitSha
  ) {
    throw new GitRemotePushError("existing remote evidence does not match");
  }

  return {
    remote: REMOTE_NAME,
    branch: evidence.branch,
    commitSha: evidence.commitSha,
    pushedAt: evidence.pushedAt,
  };
}

function normalizeSha(value: string): string {
  const sha = value.trim().toLowerCase();

  if (!/^[0-9a-f]{40}$/.test(sha)) {
    throw new GitRemotePushError("malformed commit SHA");
  }

  return sha;
}

function githubRepositoryKey(url: string): string | undefined {
  if (
    /[\u0000-\u001f\u007f]/.test(url) ||
    /^https?:\/\/[^/@]+@/i.test(url) ||
    /^ssh:\/\/[^/@]+:[^/@]+@/i.test(url)
  ) {
    return undefined;
  }

  const trimmed = url.trim();
  const httpsMatch = /^https:\/\/github\.com\/([^/\s]+)\/([^/\s]+?)(?:\.git)?\/?$/i.exec(trimmed);
  const sshMatch = /^git@github\.com:([^/\s]+)\/([^/\s]+?)(?:\.git)?$/i.exec(trimmed);
  const sshUrlMatch = /^ssh:\/\/git@github\.com\/([^/\s]+)\/([^/\s]+?)(?:\.git)?$/i.exec(trimmed);
  const match = httpsMatch ?? sshMatch ?? sshUrlMatch;

  if (match === null) {
    return undefined;
  }

  const owner = match[1].toLowerCase();
  const repo = match[2].replace(/\.git$/i, "").toLowerCase();

  if (!/^[a-z0-9_.-]+$/.test(owner) || !/^[a-z0-9_.-]+$/.test(repo)) {
    return undefined;
  }

  return `${owner}/${repo}`;
}

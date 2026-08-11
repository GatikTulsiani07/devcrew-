import {
  type GitHubPullRequestClient,
  parseGitHubRepositoryUrl,
  sameGitHubRepository,
} from "../github/github-pull-request-client.js";
import { ApplicationError } from "../errors.js";
import { throwIfSignalCancelled } from "./task-cancellation.js";
import {
  isSafeBranchName,
  isSafeTaskBranchName,
  taskBranchName,
} from "../repositories/git-checkpoint.js";
import { isSafeEvidencePath } from "../repositories/git-inspector.js";
import {
  findPreparedRepository,
  type PreparedRepository,
} from "../repositories/prepared-repositories.js";
import type {
  TaskPullRequestCreator,
  TaskPullRequestCreatorInput,
  TaskPullRequestEvidence,
  TaskSnapshot,
} from "./types.js";

const DEFAULT_BASE_BRANCH = "main";
const MAX_TITLE_LENGTH = 120;
const MAX_BODY_LENGTH = 8_000;
const MAX_BODY_FIELD_LENGTH = 1_000;
const MAX_CHANGED_FILES = 60;

export interface PullRequestServiceDependencies {
  githubClient: GitHubPullRequestClient;
  preparedRepositories: readonly PreparedRepository[];
  now?: () => Date;
}

export class PullRequestServiceError extends Error {
  constructor(readonly reason: string) {
    super(`Pull request creation failed: ${reason}`);
    this.name = "PullRequestServiceError";
  }
}

export function createPullRequestService({
  githubClient,
  preparedRepositories,
  now = () => new Date(),
}: PullRequestServiceDependencies): TaskPullRequestCreator {
  return {
    async createPullRequest(input) {
      throwIfSignalCancelled(input.signal);
      const context = resolveContext(input, preparedRepositories);

      if (input.task.pullRequest !== undefined) {
        return {
          evidence: copyExistingPullRequestEvidence(
            input.task.pullRequest,
            context.headBranch,
            context.baseBranch,
            context.checkpointSha,
          ),
          created: false,
        };
      }

      const existing = await githubClient.findOpenPullRequest({
        repository: context.repository,
        head: context.headBranch,
        base: context.baseBranch,
        ...(input.signal === undefined ? {} : { signal: input.signal }),
      });
      throwIfSignalCancelled(input.signal);

      if (existing !== undefined) {
        return {
          evidence: {
            number: existing.number,
            url: existing.url,
            state: existing.state,
            headBranch: existing.headRef,
            baseBranch: existing.baseRef,
            commitSha: context.checkpointSha,
            createdAt: existing.createdAt,
          },
          created: false,
        };
      }

      const created = await githubClient.createPullRequest({
        repository: context.repository,
        head: context.headBranch,
          base: context.baseBranch,
          title: pullRequestTitle(input.task),
          body: pullRequestBody(input.task),
          ...(input.signal === undefined ? {} : { signal: input.signal }),
        });
      throwIfSignalCancelled(input.signal);

      return {
        evidence: {
          number: created.number,
          url: created.url,
          state: created.state,
          headBranch: created.headRef,
          baseBranch: created.baseRef,
          commitSha: context.checkpointSha,
          createdAt:
            created.createdAt === "" ? now().toISOString() : created.createdAt,
        },
        created: true,
      };
    },
  };
}

export function pullRequestTitle(task: TaskSnapshot): string {
  const safeTitle = sanitizeInlineText(task.title, MAX_TITLE_LENGTH - 9);
  return `Devcrew: ${safeTitle || `Task ${sanitizeInlineText(task.id, 80)}`}`.slice(
    0,
    MAX_TITLE_LENGTH,
  );
}

export function pullRequestBody(task: TaskSnapshot): string {
  const changeEvidence = task.execution?.result.changeEvidence;
  const files =
    changeEvidence?.files
      .map((file) => file.path)
      .filter((path) => isSafeEvidencePath(path))
      .slice(0, MAX_CHANGED_FILES) ?? [];
  const checks =
    task.validation?.checks.map(
      (check) =>
        `- ${sanitizeInlineText(check.name, 80)}: ${sanitizeInlineText(
          check.status,
          40,
        )} - ${sanitizeInlineText(check.summary, 180)}`,
    ) ?? [];
  const checkpoint = task.validation?.checkpoint;
  const summary = sanitizeBlockText(
    task.execution?.result.summary ?? "Developer execution completed.",
    MAX_BODY_FIELD_LENGTH,
  );
  const reviewSummary = sanitizeBlockText(
    task.review?.summary ?? "Reviewer approved the completed work.",
    MAX_BODY_FIELD_LENGTH,
  );

  const body = [
    "## Summary",
    summary,
    "",
    "## Changed files",
    ...(files.length === 0 ? ["- No changed files recorded."] : files.map((file) => `- ${file}`)),
    "",
    "## Validation",
    ...(checks.length === 0 ? ["- Validation passed."] : checks),
    "",
    "## Review",
    `Verdict: ${sanitizeInlineText(task.review?.verdict ?? "APPROVED", 40)}`,
    reviewSummary,
    "",
    "## Devcrew",
    `Task ID: ${sanitizeInlineText(task.id, 120)}`,
    `Checkpoint: ${sanitizeInlineText(checkpoint?.shortSha ?? "", 16)}`,
  ].join("\n");

  return body.slice(0, MAX_BODY_LENGTH);
}

function resolveContext(
  { project, task }: TaskPullRequestCreatorInput,
  preparedRepositories: readonly PreparedRepository[],
) {
  if (task.projectId !== project.id) {
    throw new PullRequestServiceError("task does not belong to project");
  }

  if (task.status !== "REVIEW_COMPLETED") {
    throw new ApplicationError(
      "INVALID_TASK_TRANSITION",
      409,
      "Task review is not completed",
    );
  }

  if (task.review?.verdict !== "APPROVED") {
    throw new PullRequestServiceError("reviewer approval is required");
  }

  if (
    task.validation?.visualReview?.status === "FAILED" ||
    task.visualRepair?.outcome === "EXHAUSTED"
  ) {
    throw new PullRequestServiceError("visual review approval is required");
  }

  const checkpoint = task.validation?.checkpoint;

  if (checkpoint === undefined) {
    throw new PullRequestServiceError("checkpoint is required");
  }

  const remoteBranch = task.validation?.remoteBranch;

  if (remoteBranch === undefined) {
    throw new PullRequestServiceError("remote branch evidence is required");
  }

  const checkpointSha = normalizeSha(checkpoint.sha);

  if (normalizeSha(remoteBranch.commitSha) !== checkpointSha) {
    throw new PullRequestServiceError("remote branch does not match checkpoint");
  }

  const expectedHeadBranch = taskBranchName(task.id);

  if (
    remoteBranch.remote !== "origin" ||
    remoteBranch.branch !== expectedHeadBranch ||
    !isSafeTaskBranchName(remoteBranch.branch)
  ) {
    throw new PullRequestServiceError("remote branch is not authoritative");
  }

  const preparedRepository = findPreparedRepository(
    preparedRepositories,
    project.repository.preparedRepositoryId,
  );

  if (preparedRepository === undefined) {
    throw new PullRequestServiceError("prepared repository is missing");
  }

  const projectRepository = parseGitHubRepositoryUrl(
    project.repository.publicRepositoryUrl,
  );
  const preparedRepositoryRef = parseGitHubRepositoryUrl(
    preparedRepository.publicRepositoryUrl,
  );

  if (
    projectRepository === undefined ||
    preparedRepositoryRef === undefined ||
    !sameGitHubRepository(projectRepository, preparedRepositoryRef)
  ) {
    throw new PullRequestServiceError("project repository is not authoritative");
  }

  const baseBranch = preparedRepository.defaultBranch ?? DEFAULT_BASE_BRANCH;

  if (!isSafeBranchName(baseBranch)) {
    throw new PullRequestServiceError("base branch is unsafe");
  }

  if (remoteBranch.branch === baseBranch) {
    throw new PullRequestServiceError("head branch must differ from base branch");
  }

  return {
    repository: projectRepository,
    headBranch: remoteBranch.branch,
    baseBranch,
    checkpointSha,
  };
}

function copyExistingPullRequestEvidence(
  evidence: TaskPullRequestEvidence,
  headBranch: string,
  baseBranch: string,
  checkpointSha: string,
): TaskPullRequestEvidence {
  if (
    !Number.isInteger(evidence.number) ||
    evidence.number <= 0 ||
    evidence.state !== "OPEN" ||
    evidence.headBranch !== headBranch ||
    evidence.baseBranch !== baseBranch ||
    normalizeSha(evidence.commitSha) !== checkpointSha ||
    !isSafePullRequestUrl(evidence.url)
  ) {
    throw new PullRequestServiceError("existing pull request evidence does not match");
  }

  return { ...evidence };
}

function normalizeSha(value: string): string {
  const sha = value.trim().toLowerCase();

  if (!/^[0-9a-f]{40}$/.test(sha)) {
    throw new PullRequestServiceError("malformed commit SHA");
  }

  return sha;
}

function sanitizeInlineText(value: string, maxLength: number): string {
  return redactUnsafeText(value)
    .replace(/[\r\n\t]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

function sanitizeBlockText(value: string, maxLength: number): string {
  return redactUnsafeText(value)
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line !== "")
    .join("\n")
    .slice(0, maxLength);
}

function redactUnsafeText(value: string): string {
  return value
    .replace(/\/Users\/[^\s)]+/g, "[redacted]")
    .replace(/\/private\/tmp\/[^\s)]+/g, "[redacted]")
    .replace(/\/tmp\/[^\s)]+/g, "[redacted]")
    .replace(/\/home\/[^\s)]+/g, "[redacted]")
    .replace(/Authorization:\s*\S+/gi, "Authorization: [redacted]")
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer [redacted]")
    .replace(/gh[pousr]_[A-Za-z0-9_]+/g, "[redacted]")
    .replace(/sk-[A-Za-z0-9_-]+/g, "[redacted]")
    .replace(/(TOKEN|SECRET|PASSWORD|API_KEY)=\S+/gi, "$1=[redacted]");
}

function isSafePullRequestUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return (
      parsed.protocol === "https:" &&
      parsed.hostname.toLowerCase() === "github.com" &&
      parsed.username === "" &&
      parsed.password === "" &&
      /^\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+\/pull\/[1-9][0-9]*$/.test(
        parsed.pathname,
      )
    );
  } catch {
    return false;
  }
}

export interface GitHubRepositoryRef {
  owner: string;
  repo: string;
}

export type GitHubPullRequestState = "OPEN" | "CLOSED" | "MERGED";

export interface GitHubPullRequest {
  number: number;
  url: string;
  state: GitHubPullRequestState;
  headRef: string;
  baseRef: string;
  repository: GitHubRepositoryRef;
  createdAt: string;
}

export interface GitHubPullRequestLookupInput {
  repository: GitHubRepositoryRef;
  head: string;
  base: string;
  signal?: AbortSignal;
}

export interface GitHubPullRequestCreateInput
  extends GitHubPullRequestLookupInput {
  title: string;
  body: string;
}

export interface GitHubPullRequestClient {
  findOpenPullRequest(
    input: GitHubPullRequestLookupInput,
  ): Promise<GitHubPullRequest | undefined>;
  createPullRequest(
    input: GitHubPullRequestCreateInput,
  ): Promise<GitHubPullRequest>;
}

export class GitHubPullRequestClientError extends Error {
  constructor(readonly reason: string) {
    super(`GitHub pull request request failed: ${reason}`);
    this.name = "GitHubPullRequestClientError";
  }
}

export const GITHUB_PULL_REQUEST_TIMEOUT_MS = 10_000;
const GITHUB_API_BASE_URL = "https://api.github.com";

export function createGitHubPullRequestClient({
  token = process.env.GITHUB_TOKEN,
  fetchImpl = globalThis.fetch,
  timeoutMs = GITHUB_PULL_REQUEST_TIMEOUT_MS,
}: {
  token?: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
} = {}): GitHubPullRequestClient {
  return {
    async findOpenPullRequest(input) {
      const response = await requestJson({
        token,
        fetchImpl,
        timeoutMs,
        method: "GET",
        url: pullRequestsUrl(input),
        signal: input.signal,
      });

      if (!Array.isArray(response)) {
        throw new GitHubPullRequestClientError("malformed provider response");
      }

      if (response.length === 0) {
        return undefined;
      }

      return parsePullRequestResponse(response[0], input);
    },

    async createPullRequest(input) {
      const response = await requestJson({
        token,
        fetchImpl,
        timeoutMs,
        method: "POST",
        url: repositoryUrl(input.repository, "/pulls"),
        body: {
          title: input.title,
          head: input.head,
          base: input.base,
          body: input.body,
        },
        signal: input.signal,
      });

      return parsePullRequestResponse(response, input);
    },
  };
}

export function parseGitHubRepositoryUrl(
  repositoryUrl: string,
): GitHubRepositoryRef | undefined {
  if (
    /[\u0000-\u001f\u007f]/.test(repositoryUrl) ||
    /^https?:\/\/[^/@]+@/i.test(repositoryUrl) ||
    /^ssh:\/\/[^/@]+:[^/@]+@/i.test(repositoryUrl)
  ) {
    return undefined;
  }

  const trimmed = repositoryUrl.trim();
  const httpsMatch =
    /^https:\/\/github\.com\/([^/\s]+)\/([^/\s]+?)(?:\.git)?\/?$/i.exec(
      trimmed,
    );
  const sshMatch = /^git@github\.com:([^/\s]+)\/([^/\s]+?)(?:\.git)?$/i.exec(
    trimmed,
  );
  const sshUrlMatch =
    /^ssh:\/\/git@github\.com\/([^/\s]+)\/([^/\s]+?)(?:\.git)?$/i.exec(
      trimmed,
    );
  const match = httpsMatch ?? sshMatch ?? sshUrlMatch;

  if (match === null) {
    return undefined;
  }

  const owner = match[1];
  const repo = match[2].replace(/\.git$/i, "");

  if (!isSafeRepositorySegment(owner) || !isSafeRepositorySegment(repo)) {
    return undefined;
  }

  return { owner: owner.toLowerCase(), repo: repo.toLowerCase() };
}

export function sameGitHubRepository(
  left: GitHubRepositoryRef,
  right: GitHubRepositoryRef,
): boolean {
  return (
    left.owner.toLowerCase() === right.owner.toLowerCase() &&
    left.repo.toLowerCase() === right.repo.toLowerCase()
  );
}

export function parsePullRequestResponse(
  response: unknown,
  expected: GitHubPullRequestLookupInput,
): GitHubPullRequest {
  if (!isRecord(response)) {
    throw new GitHubPullRequestClientError("malformed provider response");
  }

  const number = response.number;
  const url = response.html_url;
  const state = parseState(response.state, response.merged);
  const head = isRecord(response.head) ? response.head.ref : undefined;
  const base = isRecord(response.base) ? response.base.ref : undefined;
  const baseRepo = isRecord(response.base)
    ? parseProviderRepository(response.base.repo)
    : undefined;
  const createdAt = response.created_at;

  if (
    typeof number !== "number" ||
    !Number.isInteger(number) ||
    number <= 0 ||
    typeof url !== "string" ||
    !isSafePullRequestUrl(url, expected.repository, number) ||
    typeof head !== "string" ||
    head !== expected.head ||
    typeof base !== "string" ||
    base !== expected.base ||
    baseRepo === undefined ||
    !sameGitHubRepository(baseRepo, expected.repository) ||
    typeof createdAt !== "string" ||
    Number.isNaN(Date.parse(createdAt))
  ) {
    throw new GitHubPullRequestClientError("malformed provider response");
  }

  return {
    number,
    url,
    state,
    headRef: head,
    baseRef: base,
    repository: expected.repository,
    createdAt,
  };
}

async function requestJson({
  token,
  fetchImpl,
  timeoutMs,
  method,
  url,
  body,
  signal,
}: {
  token?: string;
  fetchImpl: typeof fetch;
  timeoutMs: number;
  method: "GET" | "POST";
  url: string;
  body?: Record<string, unknown>;
  signal?: AbortSignal;
}): Promise<unknown> {
  if (token === undefined || token.trim() === "") {
    throw new GitHubPullRequestClientError("missing GitHub token");
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetchImpl(url, {
      method,
      signal: timeoutOrCancellationSignal(controller.signal, signal),
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        "User-Agent": "devcrew-backend",
        "X-GitHub-Api-Version": "2022-11-28",
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });

    if (!response.ok) {
      throw new GitHubPullRequestClientError("provider request failed");
    }

    return (await response.json()) as unknown;
  } catch (error) {
    if (error instanceof GitHubPullRequestClientError) {
      throw error;
    }

    if (signal?.aborted === true) {
      throw signal.reason ?? new Error("Operation cancelled");
    }

    if (error instanceof DOMException && error.name === "AbortError") {
      throw new GitHubPullRequestClientError("provider request timed out");
    }

    throw new GitHubPullRequestClientError("provider request failed");
  } finally {
    clearTimeout(timeout);
  }
}

function timeoutOrCancellationSignal(
  timeoutSignal: AbortSignal,
  signal?: AbortSignal,
): AbortSignal {
  if (signal === undefined) {
    return timeoutSignal;
  }

  const controller = new AbortController();
  const onTimeout = () => controller.abort(timeoutSignal.reason);
  const onAbort = () => controller.abort(signal.reason);

  timeoutSignal.addEventListener("abort", onTimeout, { once: true });
  signal.addEventListener("abort", onAbort, { once: true });
  controller.signal.addEventListener(
    "abort",
    () => {
      timeoutSignal.removeEventListener("abort", onTimeout);
      signal.removeEventListener("abort", onAbort);
    },
    { once: true },
  );

  return controller.signal;
}

function pullRequestsUrl(input: GitHubPullRequestLookupInput): string {
  const url = new URL(repositoryUrl(input.repository, "/pulls"));
  url.searchParams.set("state", "open");
  url.searchParams.set("head", `${input.repository.owner}:${input.head}`);
  url.searchParams.set("base", input.base);
  return url.toString();
}

function repositoryUrl(
  repository: GitHubRepositoryRef,
  suffix: `/${string}`,
): string {
  return `${GITHUB_API_BASE_URL}/repos/${encodeURIComponent(
    repository.owner,
  )}/${encodeURIComponent(repository.repo)}${suffix}`;
}

function parseState(state: unknown, merged: unknown): GitHubPullRequestState {
  if (state === "open") {
    return "OPEN";
  }

  if (state === "closed") {
    return merged === true ? "MERGED" : "CLOSED";
  }

  throw new GitHubPullRequestClientError("malformed provider response");
}

function parseProviderRepository(value: unknown): GitHubRepositoryRef | undefined {
  if (!isRecord(value) || typeof value.full_name !== "string") {
    return undefined;
  }

  const [owner, repo] = value.full_name.split("/");

  if (
    owner === undefined ||
    repo === undefined ||
    !isSafeRepositorySegment(owner) ||
    !isSafeRepositorySegment(repo)
  ) {
    return undefined;
  }

  return { owner: owner.toLowerCase(), repo: repo.toLowerCase() };
}

function isSafePullRequestUrl(
  url: string,
  repository: GitHubRepositoryRef,
  number: number,
): boolean {
  try {
    const parsed = new URL(url);
    return (
      parsed.protocol === "https:" &&
      parsed.hostname.toLowerCase() === "github.com" &&
      parsed.username === "" &&
      parsed.password === "" &&
      parsed.pathname === `/${repository.owner}/${repository.repo}/pull/${number}`
    );
  } catch {
    return false;
  }
}

function isSafeRepositorySegment(segment: string): boolean {
  return /^[A-Za-z0-9_.-]{1,100}$/.test(segment);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

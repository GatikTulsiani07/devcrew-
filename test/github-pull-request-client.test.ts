import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  createGitHubPullRequestClient,
  GitHubPullRequestClientError,
  parseGitHubRepositoryUrl,
  parsePullRequestResponse,
} from "../src/github/github-pull-request-client.js";

const providerPullRequest = {
  number: 42,
  html_url: "https://github.com/example/devcrew/pull/42",
  state: "open",
  head: { ref: "devcrew/task-task_000001" },
  base: {
    ref: "main",
    repo: { full_name: "example/devcrew" },
  },
  created_at: "2026-08-03T08:00:00.000Z",
};

const lookup = {
  repository: { owner: "example", repo: "devcrew" },
  head: "devcrew/task-task_000001",
  base: "main",
};

describe("GitHub pull request client", () => {
  it("parses supported GitHub repository URLs without credentials", () => {
    assert.deepEqual(parseGitHubRepositoryUrl("https://github.com/Example/Devcrew.git"), {
      owner: "example",
      repo: "devcrew",
    });
    assert.deepEqual(parseGitHubRepositoryUrl("git@github.com:example/devcrew.git"), {
      owner: "example",
      repo: "devcrew",
    });
    assert.equal(
      parseGitHubRepositoryUrl("https://token@github.com/example/devcrew"),
      undefined,
    );
    assert.equal(parseGitHubRepositoryUrl("https://gitlab.com/example/devcrew"), undefined);
  });

  it("validates provider pull request responses before trusting them", () => {
    assert.deepEqual(parsePullRequestResponse(providerPullRequest, lookup), {
      number: 42,
      url: "https://github.com/example/devcrew/pull/42",
      state: "OPEN",
      headRef: "devcrew/task-task_000001",
      baseRef: "main",
      repository: { owner: "example", repo: "devcrew" },
      createdAt: "2026-08-03T08:00:00.000Z",
    });

    assert.throws(
      () =>
        parsePullRequestResponse(
          {
            ...providerPullRequest,
            head: { ref: "main" },
          },
          lookup,
        ),
      GitHubPullRequestClientError,
    );
  });

  it("uses server-owned authorization headers and bounded request payloads", async () => {
    const requests: Array<{ url: string; init?: RequestInit }> = [];
    const fetchImpl: typeof fetch = async (url, init) => {
      requests.push({ url: String(url), init });
      return new Response(JSON.stringify(providerPullRequest), { status: 201 });
    };

    const client = createGitHubPullRequestClient({
      token: "ghp_SERVER_TOKEN",
      fetchImpl,
      timeoutMs: 100,
    });

    await client.createPullRequest({
      ...lookup,
      title: "Devcrew: Implement task",
      body: "## Summary\nDone",
    });

    assert.equal(requests.length, 1);
    assert.equal(requests[0].init?.method, "POST");
    assert.equal(
      (requests[0].init?.headers as Record<string, string>).Authorization,
      "Bearer ghp_SERVER_TOKEN",
    );
    assert.equal(String(requests[0].url).includes("ghp_SERVER_TOKEN"), false);
    assert.deepEqual(JSON.parse(String(requests[0].init?.body)), {
      title: "Devcrew: Implement task",
      head: "devcrew/task-task_000001",
      base: "main",
      body: "## Summary\nDone",
    });
  });

  it("looks up matching open pull requests before creation", async () => {
    const requests: string[] = [];
    const fetchImpl: typeof fetch = async (url) => {
      requests.push(String(url));
      return new Response(JSON.stringify([providerPullRequest]), { status: 200 });
    };

    const found = await createGitHubPullRequestClient({
      token: "ghp_SERVER_TOKEN",
      fetchImpl,
    }).findOpenPullRequest(lookup);

    assert.equal(found?.number, 42);
    assert.equal(requests[0].includes("state=open"), true);
    assert.equal(
      requests[0].includes("head=example%3Adevcrew%2Ftask-task_000001"),
      true,
    );
    assert.equal(requests[0].includes("base=main"), true);
  });

  it("sanitizes missing token, provider failure, malformed response, and timeout", async () => {
    await assert.rejects(
      createGitHubPullRequestClient({
        token: "",
        fetchImpl: async () => new Response("{}", { status: 200 }),
      }).findOpenPullRequest(lookup),
      (error: unknown) =>
        error instanceof GitHubPullRequestClientError &&
        error.reason === "missing GitHub token",
    );

    await assert.rejects(
      createGitHubPullRequestClient({
        token: "ghp_SERVER_TOKEN",
        fetchImpl: async () =>
          new Response("SENSITIVE_PROVIDER_BODY", { status: 401 }),
      }).findOpenPullRequest(lookup),
      (error: unknown) =>
        error instanceof GitHubPullRequestClientError &&
        error.reason === "provider request failed",
    );

    await assert.rejects(
      createGitHubPullRequestClient({
        token: "ghp_SERVER_TOKEN",
        fetchImpl: async () => new Response(JSON.stringify({}), { status: 200 }),
      }).findOpenPullRequest(lookup),
      (error: unknown) =>
        error instanceof GitHubPullRequestClientError &&
        error.reason === "malformed provider response",
    );

    const hangingFetch: typeof fetch = async (_url, init) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => {
          reject(new DOMException("aborted", "AbortError"));
        });
      });

    await assert.rejects(
      createGitHubPullRequestClient({
        token: "ghp_SERVER_TOKEN",
        fetchImpl: hangingFetch,
        timeoutMs: 1,
      }).findOpenPullRequest(lookup),
      (error: unknown) =>
        error instanceof GitHubPullRequestClientError &&
        error.reason === "provider request timed out",
    );
  });
});

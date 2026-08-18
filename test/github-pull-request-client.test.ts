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
  head: {
    ref: "devcrew/task-task_000001",
    sha: "0123456789abcdef0123456789abcdef01234567",
  },
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

const providerIssueComment = {
  id: 9001,
  body: "<!-- devcrew-validation-summary -->\n\n### Devcrew validation summary",
  created_at: "2026-08-03T08:00:00.000Z",
  updated_at: "2026-08-03T08:01:00.000Z",
  user: { login: "devcrew-bot" },
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
      headSha: "0123456789abcdef0123456789abcdef01234567",
      baseRef: "main",
      repository: { owner: "example", repo: "devcrew" },
      createdAt: "2026-08-03T08:00:00.000Z",
    });

    assert.throws(
      () =>
        parsePullRequestResponse(
          {
            ...providerPullRequest,
            head: {
              ref: "main",
              sha: "0123456789abcdef0123456789abcdef01234567",
            },
          },
          lookup,
        ),
      GitHubPullRequestClientError,
    );

    assert.throws(
      () =>
        parsePullRequestResponse(
          {
            ...providerPullRequest,
            number: 99,
          },
          { ...lookup, number: 42 },
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

  it("reads a specific pull request and maps merged provider state", async () => {
    const requests: Array<{ url: string; method?: string }> = [];
    const fetchImpl: typeof fetch = async (url, init) => {
      requests.push({ url: String(url), method: init?.method });
      return new Response(
        JSON.stringify({
          ...providerPullRequest,
          state: "closed",
          merged: true,
        }),
        { status: 200 },
      );
    };

    const pulled = await createGitHubPullRequestClient({
      token: "ghp_SERVER_TOKEN",
      fetchImpl,
    }).getPullRequest({ ...lookup, number: 42 });

    assert.equal(pulled.state, "MERGED");
    assert.equal(requests[0].method, "GET");
    assert.equal(
      requests[0].url,
      "https://api.github.com/repos/example/devcrew/pulls/42",
    );
  });

  it("lists, creates, and updates pull request conversation comments", async () => {
    const requests: Array<{ url: string; init?: RequestInit }> = [];
    const fetchImpl: typeof fetch = async (url, init) => {
      requests.push({ url: String(url), init });

      if (init?.method === "GET") {
        return new Response(JSON.stringify([providerIssueComment]), {
          status: 200,
        });
      }

      return new Response(JSON.stringify(providerIssueComment), {
        status: init?.method === "PATCH" ? 200 : 201,
      });
    };

    const client = createGitHubPullRequestClient({
      token: "ghp_SERVER_TOKEN",
      fetchImpl,
    });

    const listed = await client.listPullRequestComments({
      repository: lookup.repository,
      number: 42,
    });
    const created = await client.createPullRequestComment({
      repository: lookup.repository,
      number: 42,
      body: providerIssueComment.body,
    });
    const updated = await client.updatePullRequestComment({
      repository: lookup.repository,
      commentId: 9001,
      body: providerIssueComment.body,
    });

    assert.equal(listed[0].id, 9001);
    assert.equal(created.updatedAt, "2026-08-03T08:01:00.000Z");
    assert.equal(updated.authorLogin, "devcrew-bot");
    assert.deepEqual(
      requests.map((request) => ({
        url: request.url,
        method: request.init?.method,
      })),
      [
        {
          url: "https://api.github.com/repos/example/devcrew/issues/42/comments",
          method: "GET",
        },
        {
          url: "https://api.github.com/repos/example/devcrew/issues/42/comments",
          method: "POST",
        },
        {
          url: "https://api.github.com/repos/example/devcrew/issues/comments/9001",
          method: "PATCH",
        },
      ],
    );
    assert.deepEqual(JSON.parse(String(requests[1].init?.body)), {
      body: providerIssueComment.body,
    });
    assert.equal(
      (requests[1].init?.headers as Record<string, string>).Authorization,
      "Bearer ghp_SERVER_TOKEN",
    );
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

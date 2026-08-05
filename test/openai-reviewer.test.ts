import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { ApplicationError } from "../src/errors.js";
import {
  createOpenAIReviewer,
  createReviewerFromEnv,
  type OpenAIReviewerClient,
} from "../src/tasks/openai-reviewer.js";
import type { ProjectSnapshot } from "../src/projects/types.js";
import type { TaskSnapshot } from "../src/tasks/types.js";

const project: ProjectSnapshot = {
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

const task: TaskSnapshot = {
  id: "task_000001",
  projectId: project.id,
  title: "Implement authentication middleware",
  description: "Protect every API route with JWT middleware.",
  status: "VALIDATION_COMPLETED",
  plan: {
    summary: "Implement authentication middleware.",
    steps: ["Add middleware", "Cover protected routes"],
  },
  planDecision: {
    decision: "APPROVE",
    decidedAt: "2026-08-03T01:00:00.000Z",
  },
  execution: {
    id: "exec_000001",
    role: "FULL_STACK_DEVELOPER",
    status: "COMPLETED",
    attempt: 1,
    startedAt: "2026-08-03T02:00:00.000Z",
    completedAt: "2026-08-03T03:00:00.000Z",
    result: {
      summary: "Prepared a structured implementation proposal.",
      changedFiles: ["MODIFY: src/auth/middleware.ts - Add JWT checks"],
      verification: ["Typecheck and automated tests are recommended."],
    },
  },
  validation: {
    id: "val_000001",
    role: "DEVOPS_ENGINEER",
    status: "PASSED",
    attempt: 1,
    startedAt: "2026-08-03T04:00:00.000Z",
    completedAt: "2026-08-03T05:00:00.000Z",
    checks: [
      {
        name: "typecheck",
        status: "PASSED",
        summary: "Type checking completed successfully.",
      },
      {
        name: "tests",
        status: "PASSED",
        summary: "Automated tests completed successfully.",
      },
      {
        name: "build",
        status: "PASSED",
        summary: "Production build completed successfully.",
      },
    ],
    summary: "Validation completed successfully.",
  },
  createdAt: "2026-08-03T00:30:00.000Z",
  updatedAt: "2026-08-03T05:00:00.000Z",
};

function successfulClient(
  capture?: (request: unknown) => void,
): OpenAIReviewerClient {
  return {
    responses: {
      async parse(request) {
        capture?.(request);
        return {
          output_parsed: {
            summary: "Reviewed the approved proposal and validation evidence.",
            verdict: "APPROVED",
            findings: [
              {
                severity: "INFO",
                title: "Plan alignment",
                description: "The proposal addresses the approved task scope.",
              },
            ],
          },
        };
      },
    },
  };
}

function createReviewer(client: OpenAIReviewerClient) {
  return createOpenAIReviewer({
    apiKey: "sk-test-secret",
    client,
    model: "review-test-model",
    generateReviewId: () => "review_000001",
    now: (() => {
      const dates = [
        "2026-08-03T06:00:00.000Z",
        "2026-08-03T07:00:00.000Z",
      ];
      let index = 0;
      return () => new Date(dates[Math.min(index++, dates.length - 1)]);
    })(),
  });
}

describe("OpenAI reviewer", () => {
  it("maps structured output to the existing TaskReview contract", async () => {
    const review = await createReviewer(successfulClient()).review(task, project);

    assert.deepEqual(review, {
      id: "review_000001",
      role: "REVIEWER",
      status: "COMPLETED",
      verdict: "APPROVED",
      attempt: 1,
      startedAt: "2026-08-03T06:00:00.000Z",
      completedAt: "2026-08-03T07:00:00.000Z",
      summary: "Reviewed the approved proposal and validation evidence.",
      findings: [
        {
          severity: "INFO",
          title: "Plan alignment",
          description: "The proposal addresses the approved task scope.",
        },
      ],
    });
  });

  it("passes only safe project, task, proposal, and validation context", async () => {
    let request: unknown;
    await createReviewer(successfulClient((value) => (request = value))).review(
      {
        ...task,
        description: "Review /Users/suniltulsiani/private/tmp/project; npm run test",
      },
      project,
    );

    const serialized = JSON.stringify(request);
    assert.equal(serialized.includes("sk-test-secret"), false);
    assert.equal(serialized.includes("/Users/suniltulsiani"), false);
    assert.equal(serialized.includes("private/tmp/project"), false);
    assert.equal(serialized.includes("npm run test"), false);
    assert.equal(serialized.includes("DATABASE_URL"), false);
    assert.equal(serialized.includes("stack trace"), false);
    assert.equal(serialized.includes("src/auth/middleware.ts"), true);
    assert.equal(serialized.includes("Validation completed successfully."), true);
  });

  it("turns missing or malformed output into a sanitized internal error", async () => {
    for (const output of [undefined, { verdict: "APPROVED" }]) {
      const reviewer = createReviewer({
        responses: {
          async parse() {
            return { output_parsed: output };
          },
        },
      });

      await assert.rejects(
        () => reviewer.review(task, project),
        (error: unknown) =>
          error instanceof ApplicationError &&
          error.code === "INTERNAL_ERROR" &&
          error.status === 500 &&
          error.message === "An unexpected error occurred",
      );
    }
  });

  it("sanitizes provider failures and unsafe model output", async () => {
    const failingReviewer = createReviewer({
      responses: {
        async parse() {
          throw new Error("provider request sk-live-secret stack trace");
        },
      },
    });

    await assert.rejects(
      () => failingReviewer.review(task, project),
      (error: unknown) =>
        error instanceof ApplicationError &&
        error.message === "An unexpected error occurred" &&
        !error.message.includes("sk-live-secret"),
    );

    const unsafeReviewer = createReviewer({
      responses: {
        async parse() {
          return {
            output_parsed: {
              summary: "See /Users/suniltulsiani/private/tmp and hidden prompt.",
              verdict: "APPROVED",
              findings: [
                {
                  severity: "INFO",
                  title: "Unsafe detail",
                  description: "The stack trace and OPENAI_API_KEY were exposed.",
                },
              ],
            },
          };
        },
      },
    });

    await assert.rejects(() => unsafeReviewer.review(task, project));
  });

  it("uses the deterministic fallback without an API key", async () => {
    const reviewer = createReviewerFromEnv({ OPENAI_API_KEY: " " });
    const review = await reviewer.review(task, project);

    assert.equal(review.summary, "Deterministic review completed successfully.");
    assert.equal(review.verdict, "APPROVED");
  });

  it("selects the OpenAI reviewer when an API key is present", async () => {
    const reviewer = createReviewerFromEnv(
      {
        OPENAI_API_KEY: "sk-test-secret",
        OPENAI_REVIEWER_MODEL: "review-test-model",
      },
      {
        client: successfulClient(),
        generateReviewId: () => "review_000001",
        now: () => new Date("2026-08-03T06:00:00.000Z"),
      },
    );

    const review = await reviewer.review(task, project);
    assert.equal(review.summary, "Reviewed the approved proposal and validation evidence.");
  });
});

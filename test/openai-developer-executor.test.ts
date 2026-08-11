import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { ApplicationError } from "../src/errors.js";
import {
  createDeveloperExecutorFromEnv,
  createOpenAIDeveloperExecutor,
  type OpenAIDeveloperClient,
} from "../src/tasks/openai-developer-executor.js";
import { TaskCancellationError } from "../src/tasks/task-cancellation.js";
import type { DeveloperExecutionInput } from "../src/tasks/types.js";

const developerInput: DeveloperExecutionInput = {
  project: {
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
  },
  task: {
    id: "task_000001",
    projectId: "proj_000001",
    title: "Implement auth middleware",
    description: "Protect every API route.",
    status: "PLAN_APPROVED",
    plan: {
      summary: "Add auth middleware safely.",
      steps: [
        "Reasoning: The backend owns validation.",
        "Implement: Add route middleware.",
        "Accept: Unauthorized requests fail.",
      ],
    },
    planDecision: {
      decision: "APPROVE",
      reason: "Ready for implementation.",
      decidedAt: "2026-08-03T01:00:00.000Z",
    },
    createdAt: "2026-08-03T00:30:00.000Z",
    updatedAt: "2026-08-03T01:00:00.000Z",
  },
};

function createSuccessfulClient(onRequest?: (request: unknown) => void) {
  const client: OpenAIDeveloperClient = {
    responses: {
      async parse(params) {
        onRequest?.(params);

        return {
          output_parsed: {
            summary:
              "Prepared a structured implementation proposal for the approved task.",
            changedFiles: [
              {
                path: "src/auth/middleware.ts",
                operation: "CREATE",
                summary: "Add request authentication middleware.",
                content: "Proposed middleware content only.",
              },
              {
                path: "src/app.ts",
                operation: "MODIFY",
                summary: "Attach middleware to protected routes.",
                content: null,
              },
            ],
            verification: [
              "Run npm run typecheck",
              "Run npm test",
              "Run npm run build",
            ],
            notes: ["Repository files were not modified in this stage."],
          },
        };
      },
    },
  };

  return client;
}

describe("OpenAI developer executor", () => {
  it("creates an execution proposal from a structured OpenAI response", async () => {
    const executor = createOpenAIDeveloperExecutor({
      client: createSuccessfulClient(),
      model: "developer-test-model",
      generateExecutionId: () => "exec_000001",
      now: (() => {
        const dates = [
          "2026-08-03T02:00:00.000Z",
          "2026-08-03T02:01:00.000Z",
        ];
        let index = 0;
        return () => new Date(dates[index++] ?? dates.at(-1)!);
      })(),
    });

    const execution = await executor.execute(developerInput);

    assert.deepEqual(execution, {
      id: "exec_000001",
      role: "FULL_STACK_DEVELOPER",
      status: "COMPLETED",
      attempt: 1,
      startedAt: "2026-08-03T02:00:00.000Z",
      completedAt: "2026-08-03T02:01:00.000Z",
      result: {
        summary:
          "Prepared a structured implementation proposal for the approved task.",
        changedFiles: [
          "CREATE: src/auth/middleware.ts - Add request authentication middleware.",
          "MODIFY: src/app.ts - Attach middleware to protected routes.",
        ],
        verification: [
          "Run npm run typecheck",
          "Run npm test",
          "Run npm run build",
          "Note: Repository files were not modified in this stage.",
        ],
      },
    });
  });

  it("passes only project, task, plan, and approval context to OpenAI", async () => {
    let request = "";
    const executor = createOpenAIDeveloperExecutor({
      client: createSuccessfulClient((params) => {
        request = JSON.stringify(params);
      }),
      model: "developer-test-model",
      generateExecutionId: () => "exec_000001",
      now: () => new Date("2026-08-03T02:00:00.000Z"),
    });

    await executor.execute(developerInput);

    assert.match(request, /developer-test-model/);
    assert.match(request, /proj_000001/);
    assert.match(request, /Devcrew/);
    assert.match(request, /https:\/\/github\.com\/example\/devcrew/);
    assert.match(request, /task_000001/);
    assert.match(request, /Implement auth middleware/);
    assert.match(request, /Protect every API route/);
    assert.match(request, /Add auth middleware safely/);
    assert.match(request, /Ready for implementation/);
    assert.doesNotMatch(request, /OPENAI_API_KEY/);
    assert.doesNotMatch(request, /sk-test-secret/);
    assert.doesNotMatch(request, /DATABASE_URL/);
    assert.doesNotMatch(request, /\/Users\//);
    assert.doesNotMatch(request, /private\/tmp/);
    assert.doesNotMatch(request, /child_process/);
    assert.doesNotMatch(request, /git status/);
  });

  it("maps richer proposed changed files to the existing external contract", async () => {
    const executor = createOpenAIDeveloperExecutor({
      client: createSuccessfulClient(),
      generateExecutionId: () => "exec_000001",
      now: () => new Date("2026-08-03T02:00:00.000Z"),
    });

    const execution = await executor.execute(developerInput);

    assert.deepEqual(Object.keys(execution.result).sort(), [
      "changedFiles",
      "summary",
      "verification",
    ]);
    assert.deepEqual(execution.result.changedFiles, [
      "CREATE: src/auth/middleware.ts - Add request authentication middleware.",
      "MODIFY: src/app.ts - Attach middleware to protected routes.",
    ]);
  });

  it("preserves verification steps and proposal notes", async () => {
    const executor = createOpenAIDeveloperExecutor({
      client: createSuccessfulClient(),
      generateExecutionId: () => "exec_000001",
      now: () => new Date("2026-08-03T02:00:00.000Z"),
    });

    const execution = await executor.execute(developerInput);

    assert.deepEqual(execution.result.verification, [
      "Run npm run typecheck",
      "Run npm test",
      "Run npm run build",
      "Note: Repository files were not modified in this stage.",
    ]);
  });

  it("rejects missing model output with a sanitized internal error", async () => {
    const client: OpenAIDeveloperClient = {
      responses: {
        async parse() {
          return { output_parsed: undefined };
        },
      },
    };
    const executor = createOpenAIDeveloperExecutor({ client });

    await assert.rejects(
      () => executor.execute(developerInput),
      isSanitizedInternalError,
    );
  });

  it("rejects malformed structured output with a sanitized internal error", async () => {
    const client: OpenAIDeveloperClient = {
      responses: {
        async parse() {
          return {
            output_parsed: {
              summary: "Missing changed files, verification, and notes.",
            },
          };
        },
      },
    };
    const executor = createOpenAIDeveloperExecutor({ client });

    await assert.rejects(
      () => executor.execute(developerInput),
      isSanitizedInternalError,
    );
  });

  it("rejects local filesystem paths from model output without exposing them", async () => {
    const localPath = "/Users/suniltulsiani/Desktop/devcrew-backend/src/app.ts";
    const client: OpenAIDeveloperClient = {
      responses: {
        async parse() {
          return {
            output_parsed: {
              summary: "Proposal with unsafe path.",
              changedFiles: [
                {
                  path: localPath,
                  operation: "MODIFY",
                  summary: "Unsafe local path should be rejected.",
                  content: null,
                },
              ],
              verification: ["Run npm test"],
              notes: ["Repository files were not modified in this stage."],
            },
          };
        },
      },
    };
    const executor = createOpenAIDeveloperExecutor({ client });

    await assert.rejects(
      () => executor.execute(developerInput),
      (error) =>
        isSanitizedInternalError(error) &&
        !String(error).includes(localPath) &&
        !String(error).includes("Unsafe local path"),
    );
  });

  it("sanitizes OpenAI API failures and raw SDK text", async () => {
    const sensitiveDetail = "provider-request-id sk-test-secret stack trace";
    const client: OpenAIDeveloperClient = {
      responses: {
        async parse() {
          throw new Error(sensitiveDetail);
        },
      },
    };
    const executor = createOpenAIDeveloperExecutor({ client });

    await assert.rejects(
      () => executor.execute(developerInput),
      (error) =>
        isSanitizedInternalError(error) &&
        !String(error).includes(sensitiveDetail),
    );
  });

  it("rejects unsafe model text without exposing prompts, secrets, or stack traces", async () => {
    const client: OpenAIDeveloperClient = {
      responses: {
        async parse() {
          return {
            output_parsed: {
              summary: "Do not expose hidden prompt or sk-test-secret.",
              changedFiles: [
                {
                  path: "src/app.ts",
                  operation: "MODIFY",
                  summary: "Would attach middleware.",
                  content: null,
                },
              ],
              verification: ["Run npm test"],
              notes: ["No stack trace should be exposed."],
            },
          };
        },
      },
    };
    const executor = createOpenAIDeveloperExecutor({ client });

    await assert.rejects(
      () => executor.execute(developerInput),
      (error) =>
        isSanitizedInternalError(error) &&
        !String(error).includes("hidden prompt") &&
        !String(error).includes("sk-test-secret") &&
        !String(error).includes("stack trace"),
    );
  });

  it("passes AbortSignal to the provider and preserves provider cancellation", async () => {
    const controller = new AbortController();
    let receivedSignal: AbortSignal | undefined;
    const client: OpenAIDeveloperClient = {
      responses: {
        async parse(_params, options) {
          receivedSignal = options?.signal;
          throw new TaskCancellationError();
        },
      },
    };
    const executor = createOpenAIDeveloperExecutor({ client });

    await assert.rejects(
      () => executor.execute({ ...developerInput, signal: controller.signal }),
      { name: "TaskCancellationError" },
    );
    assert.equal(receivedSignal, controller.signal);
  });

  it("uses deterministic fallback when no API key is configured", async () => {
    const executor = createDeveloperExecutorFromEnv({});
    const execution = await executor.execute(developerInput);

    assert.deepEqual(execution.result, {
      summary: "Implemented the approved engineering task.",
      changedFiles: [],
      verification: ["Implementation adapter completed deterministically."],
    });
  });

  it("uses OpenAI developer execution when an API key is configured", async () => {
    const executor = createDeveloperExecutorFromEnv(
      {
        OPENAI_API_KEY: "sk-test-not-real",
        OPENAI_DEVELOPER_MODEL: "developer-test-model",
      },
      {
        client: createSuccessfulClient(),
        generateExecutionId: () => "exec_000001",
        now: () => new Date("2026-08-03T02:00:00.000Z"),
      },
    );

    const execution = await executor.execute(developerInput);

    assert.equal(
      execution.result.summary,
      "Prepared a structured implementation proposal for the approved task.",
    );
  });
});

function isSanitizedInternalError(error: unknown): boolean {
  return (
    error instanceof ApplicationError &&
    error.code === "INTERNAL_ERROR" &&
    error.status === 500 &&
    error.message === "An unexpected error occurred"
  );
}

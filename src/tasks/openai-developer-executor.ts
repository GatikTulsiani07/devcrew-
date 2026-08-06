import { randomUUID } from "node:crypto";

import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import { z } from "zod";

import { ApplicationError } from "../errors.js";
import { describeError, logger } from "../observability/logger.js";
import { createDeterministicDeveloperExecutor } from "./deterministic-developer-executor.js";
import type {
  DeveloperExecutionInput,
  DeveloperExecutor,
  ExecutionId,
  ImplementationResult,
  TaskExecution,
} from "./types.js";

const defaultModel = "gpt-5.5";

const changedFileSchema = z.object({
  path: z.string().trim().min(1).max(240),
  operation: z.enum(["CREATE", "MODIFY", "DELETE"]),
  summary: z.string().trim().min(1).max(700),
  content: z.string().trim().max(8_000).nullable(),
});

const developerResponseSchema = z.object({
  summary: z.string().trim().min(1).max(700),
  changedFiles: z.array(changedFileSchema).min(1).max(12),
  verification: z.array(z.string().trim().min(1).max(500)).min(1).max(8),
  notes: z.array(z.string().trim().min(1).max(500)).min(1).max(8),
});

type DeveloperResponse = z.infer<typeof developerResponseSchema>;

export type ExecutionIdGenerator = () => ExecutionId;
export type ExecutionClock = () => Date;

export interface OpenAIDeveloperResponses {
  parse(
    params: Parameters<OpenAI["responses"]["parse"]>[0],
  ): Promise<{ output_parsed: unknown }>;
}

export interface OpenAIDeveloperClient {
  responses: OpenAIDeveloperResponses;
}

export interface OpenAIDeveloperExecutorDependencies {
  apiKey?: string;
  client?: OpenAIDeveloperClient;
  model?: string;
  generateExecutionId?: ExecutionIdGenerator;
  now?: ExecutionClock;
}

export function createOpenAIDeveloperExecutor({
  apiKey,
  client,
  model = process.env.OPENAI_DEVELOPER_MODEL ?? defaultModel,
  generateExecutionId = () => `exec_${randomUUID()}`,
  now = () => new Date(),
}: OpenAIDeveloperExecutorDependencies = {}): DeveloperExecutor {
  const openaiClient =
    client ??
    new OpenAI({
      apiKey,
    });

  return {
    async execute(input): Promise<TaskExecution> {
      const startedAt = now().toISOString();
      let output: unknown;

      try {
        const response = await openaiClient.responses.parse({
          model,
          input: [
            {
              role: "system",
              content: [
                "You are Devcrew's Full Stack Developer agent.",
                "Generate a structured implementation proposal only.",
                "Do not claim files were modified, commands were executed, or tests were run.",
                "Do not request local filesystem access, shell execution, Git operations, or Codex CLI.",
                "Return only schema-compliant structured output.",
              ].join(" "),
            },
            {
              role: "user",
              content: buildDeveloperPrompt(input),
            },
          ],
          text: {
            format: zodTextFormat(
              developerResponseSchema,
              "developer_implementation_proposal",
            ),
          },
        });

        output = response.output_parsed;
      } catch (error) {
        logger.error("Developer execution request failed", {
          model,
          cause: describeError(error),
        });
        throw sanitizedDeveloperError();
      }

      const parsed = developerResponseSchema.safeParse(output);

      if (!parsed.success) {
        logger.error("Developer execution returned an invalid response", {
          model,
          issues: parsed.error.issues,
        });
        throw sanitizedDeveloperError();
      }

      if (parsed.data.changedFiles.some((file) => isLocalPath(file.path))) {
        logger.error("Developer execution proposed an unsafe local path", {
          model,
        });
        throw sanitizedDeveloperError();
      }

      if (containsUnsafeOutput(parsed.data)) {
        logger.error("Developer execution returned unsafe output", {
          model,
        });
        throw sanitizedDeveloperError();
      }

      return {
        id: generateExecutionId(),
        role: "FULL_STACK_DEVELOPER",
        status: "COMPLETED",
        attempt: 1,
        startedAt,
        completedAt: now().toISOString(),
        result: toImplementationResult(parsed.data),
      };
    },
  };
}

export function createDeveloperExecutorFromEnv(
  environment: Record<string, string | undefined> = process.env,
  dependencies: Omit<OpenAIDeveloperExecutorDependencies, "apiKey" | "model"> = {},
): DeveloperExecutor {
  const apiKey = environment.OPENAI_API_KEY;

  if (apiKey === undefined || apiKey.trim() === "") {
    return createDeterministicDeveloperExecutor();
  }

  return createOpenAIDeveloperExecutor({
    ...dependencies,
    apiKey,
    model: environment.OPENAI_DEVELOPER_MODEL ?? defaultModel,
  });
}

function buildDeveloperPrompt(input: DeveloperExecutionInput): string {
  const { project, task } = input;
  const planDecision = task.planDecision;

  return [
    "Context available to you is intentionally limited. Repository files are not available in this stage.",
    "Produce a proposal only; no files have been changed and no commands have been run.",
    "",
    "Project:",
    `- id: ${project.id}`,
    `- name: ${project.name}`,
    `- publicRepositoryUrl: ${project.repository.publicRepositoryUrl}`,
    "",
    "Task:",
    `- id: ${task.id}`,
    `- title: ${task.title}`,
    `- description: ${task.description}`,
    "",
    "Approved Manager plan:",
    `- summary: ${task.plan.summary}`,
    ...task.plan.steps.map((step) => `- step: ${step}`),
    "",
    "Plan decision:",
    `- decision: ${planDecision?.decision ?? "UNKNOWN"}`,
    ...(planDecision?.reason === undefined
      ? []
      : [`- approvalReason: ${planDecision.reason}`]),
    "",
    "Return:",
    "- summary of the proposed implementation",
    "- changedFiles as proposed repository-relative paths only",
    "- verification checks to run later, phrased as recommendations",
    "- notes that clearly state repository files were not modified in this stage",
  ].join("\n");
}

function toImplementationResult(response: DeveloperResponse): ImplementationResult {
  return {
    summary: response.summary,
    changedFiles: response.changedFiles.map(
      (file) => `${file.operation}: ${file.path} - ${file.summary}`,
    ),
    verification: [
      ...response.verification,
      ...response.notes.map((note) => `Note: ${note}`),
    ],
  };
}

function sanitizedDeveloperError(): ApplicationError {
  return new ApplicationError(
    "INTERNAL_ERROR",
    500,
    "An unexpected error occurred",
  );
}

function isLocalPath(value: string): boolean {
  return (
    value.startsWith("/") ||
    value.includes("\\") ||
    value.includes("..") ||
    value.includes("/Users/") ||
    value.includes("private/tmp")
  );
}

function containsUnsafeOutput(response: DeveloperResponse): boolean {
  const values = [
    response.summary,
    ...response.changedFiles.flatMap((file) => [
      file.path,
      file.summary,
      file.content ?? "",
    ]),
    ...response.verification,
    ...response.notes,
  ];

  return values.some((value) =>
    [
      "/Users/",
      "private/tmp",
      "OPENAI_API_KEY",
      "DATABASE_URL",
      "sk-",
      "stack trace",
      "hidden prompt",
      "system prompt",
    ].some((unsafePattern) => value.includes(unsafePattern)),
  );
}

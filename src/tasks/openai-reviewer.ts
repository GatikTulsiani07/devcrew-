import { randomUUID } from "node:crypto";

import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import { z } from "zod";

import { ApplicationError } from "../errors.js";
import type { ProjectSnapshot } from "../projects/types.js";
import { createDeterministicReviewer } from "./deterministic-reviewer.js";
import type {
  ReviewId,
  TaskReview,
  TaskReviewer,
  TaskSnapshot,
} from "./types.js";

const defaultModel = "gpt-5.5";

const findingSchema = z.object({
  severity: z.literal("INFO"),
  title: z.string().trim().min(1).max(300),
  description: z.string().trim().min(1).max(1_000),
});

const reviewerResponseSchema = z.object({
  summary: z.string().trim().min(1).max(700),
  verdict: z.literal("APPROVED"),
  findings: z.array(findingSchema).min(1).max(8),
});

type ReviewerResponse = z.infer<typeof reviewerResponseSchema>;

export type ReviewIdGenerator = () => ReviewId;
export type ReviewClock = () => Date;

export interface OpenAIReviewerResponses {
  parse(
    params: Parameters<OpenAI["responses"]["parse"]>[0],
  ): Promise<{ output_parsed: unknown }>;
}

export interface OpenAIReviewerClient {
  responses: OpenAIReviewerResponses;
}

export interface OpenAIReviewerDependencies {
  apiKey?: string;
  client?: OpenAIReviewerClient;
  model?: string;
  generateReviewId?: ReviewIdGenerator;
  now?: ReviewClock;
}

export function createOpenAIReviewer({
  apiKey,
  client,
  model = process.env.OPENAI_REVIEWER_MODEL ?? defaultModel,
  generateReviewId = () => `review_${randomUUID()}`,
  now = () => new Date(),
}: OpenAIReviewerDependencies = {}): TaskReviewer {
  const openaiClient = client ?? new OpenAI({ apiKey });

  return {
    async review(task, project): Promise<TaskReview> {
      const startedAt = now().toISOString();
      let output: unknown;

      try {
        const response = await openaiClient.responses.parse({
          model,
          input: [
            {
              role: "system",
              content: [
                "You are Devcrew's Reviewer agent.",
                "Review the supplied proposal and validation snapshot only.",
                "Return an approval review with INFO findings only.",
                "Do not claim files were changed or commands were run.",
                "Do not request filesystem access, shell execution, Git operations, or repository contents.",
                "Return only schema-compliant structured output.",
              ].join(" "),
            },
            {
              role: "user",
              content: buildReviewerPrompt(task, project),
            },
          ],
          text: {
            format: zodTextFormat(
              reviewerResponseSchema,
              "reviewer_review",
            ),
          },
        });

        output = response.output_parsed;
      } catch {
        throw sanitizedReviewerError();
      }

      const parsed = reviewerResponseSchema.safeParse(output);

      if (!parsed.success || containsUnsafeOutput(parsed.data)) {
        throw sanitizedReviewerError();
      }

      return {
        id: generateReviewId(),
        role: "REVIEWER",
        status: "COMPLETED",
        verdict: parsed.data.verdict,
        attempt: 1,
        startedAt,
        completedAt: now().toISOString(),
        summary: parsed.data.summary,
        findings: parsed.data.findings.map((finding) => ({ ...finding })),
      };
    },
  };
}

export function createReviewerFromEnv(
  environment: Record<string, string | undefined> = process.env,
  dependencies: Omit<OpenAIReviewerDependencies, "apiKey" | "model"> = {},
): TaskReviewer {
  const apiKey = environment.OPENAI_API_KEY;

  if (apiKey === undefined || apiKey.trim() === "") {
    return createDeterministicReviewer();
  }

  return createOpenAIReviewer({
    ...dependencies,
    apiKey,
    model: environment.OPENAI_REVIEWER_MODEL ?? defaultModel,
  });
}

function buildReviewerPrompt(
  task: TaskSnapshot,
  project?: ProjectSnapshot,
): string {
  return [
    "Review context:",
    `- projectId: ${safeText(project?.id ?? task.projectId)}`,
    `- projectName: ${safeText(project?.name ?? "Unknown project")}`,
    `- publicRepositoryUrl: ${safeText(project?.repository.publicRepositoryUrl ?? "Unavailable")}`,
    `- taskTitle: ${safeText(task.title)}`,
    `- taskDescription: ${safeText(task.description)}`,
    "",
    "Approved Manager plan:",
    `- summary: ${safeText(task.plan.summary)}`,
    ...task.plan.steps.map((step) => `- step: ${safeText(step)}`),
    "",
    "Developer proposal:",
    `- summary: ${safeText(task.execution?.result.summary ?? "Unavailable")}`,
    ...(
      task.execution?.result.changedFiles ?? ["Unavailable"]
    ).map((file) => `- proposedChange: ${safeText(file)}`),
    "",
    "Verification steps:",
    ...(
      task.execution?.result.verification ?? ["Unavailable"]
    ).map((step) => `- step: ${safeText(step)}`),
    "",
    "Current validation snapshot:",
    `- status: ${safeText(task.validation?.status ?? "Unavailable")}`,
    `- summary: ${safeText(task.validation?.summary ?? "Unavailable")}`,
    ...(task.validation?.checks ?? []).map(
      (check) => `- ${check.name}: ${check.status}; ${safeText(check.summary)}`,
    ),
    "",
    "Review the proposal against the approved plan and validation snapshot.",
    "All findings must be informational and must not claim actual file mutation or command execution.",
  ].join("\n");
}

function safeText(value: string): string {
  return value
    .replace(
      /(?:^|[\s:])(?:\/(?:Users|private\/tmp|tmp|var|etc)\/|[A-Za-z]:\\|\\\\)[^\s]*/g,
      "[redacted path]",
    )
    .replace(/(?:OPENAI_API_KEY|DATABASE_URL|sk-[A-Za-z0-9_-]+)/g, "[redacted secret]")
    .replace(
      /(?:npm|pnpm|yarn|bun|node|npx|git|bash|sh|curl|wget|python|rm|docker)\s+[^\n]+/gi,
      "[redacted command]",
    );
}

function containsUnsafeOutput(response: ReviewerResponse | undefined): boolean {
  if (response === undefined) return true;

  const values = [
    response.summary,
    ...response.findings.flatMap((finding) => [
      finding.title,
      finding.description,
    ]),
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
      "npm run",
      "git status",
      "child_process",
    ].some((unsafePattern) => value.includes(unsafePattern)),
  );
}

function sanitizedReviewerError(): ApplicationError {
  return new ApplicationError(
    "INTERNAL_ERROR",
    500,
    "An unexpected error occurred",
  );
}

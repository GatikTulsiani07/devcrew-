import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import { z } from "zod";

import { ApplicationError } from "../errors.js";
import { describeError, logger } from "../observability/logger.js";
import { createDeterministicPlanner } from "./deterministic-planner.js";
import type { ManagerPlanInput, ManagerPlanner, TaskPlan } from "./types.js";

const defaultModel = "gpt-5.5";

const managerResponseSchema = z.object({
  summary: z.string().trim().min(1).max(500),
  reasoning: z.string().trim().min(1).max(1_500),
  implementationSteps: z.array(z.string().trim().min(1).max(500)).min(1).max(8),
  acceptanceCriteria: z.array(z.string().trim().min(1).max(500)).min(1).max(8),
});

type ManagerResponse = z.infer<typeof managerResponseSchema>;

export interface OpenAIManagerResponses {
  parse(
    params: Parameters<OpenAI["responses"]["parse"]>[0],
  ): Promise<{ output_parsed: unknown }>;
}

export interface OpenAIManagerClient {
  responses: OpenAIManagerResponses;
}

export interface OpenAIManagerPlannerDependencies {
  apiKey?: string;
  client?: OpenAIManagerClient;
  model?: string;
}

export function createOpenAIManagerPlanner({
  apiKey,
  client,
  model = process.env.OPENAI_MANAGER_MODEL ?? defaultModel,
}: OpenAIManagerPlannerDependencies = {}): ManagerPlanner {
  const openaiClient =
    client ??
    new OpenAI({
      apiKey,
    });

  return {
    async createPlan(input) {
      let output: unknown;

      try {
        const response = await openaiClient.responses.parse({
          model,
          input: [
            {
              role: "system",
              content: [
                "You are Devcrew's Manager agent.",
                "Create concise implementation plans for a local-first engineering workflow.",
                "Return only the requested structured plan fields.",
                "Do not include secrets, stack traces, or internal SDK details.",
              ].join(" "),
            },
            {
              role: "user",
              content: buildManagerPrompt(input),
            },
          ],
          text: {
            format: zodTextFormat(managerResponseSchema, "manager_plan"),
          },
        });

        output = response.output_parsed;
      } catch (error) {
        logger.error("Manager planning request failed", {
          model,
          cause: describeError(error),
        });
        throw new ApplicationError(
          "MANAGER_PLANNING_FAILED",
          502,
          "Manager planning failed",
        );
      }

      const parsed = managerResponseSchema.safeParse(output);

      if (!parsed.success) {
        logger.error("Manager planning returned an invalid response", {
          model,
          issues: parsed.error.issues,
        });
        throw new ApplicationError(
          "MANAGER_PLAN_INVALID",
          502,
          "Manager planning returned an invalid response",
        );
      }

      return toTaskPlan(parsed.data);
    },
  };
}

export function createManagerPlannerFromEnv(
  environment: Record<string, string | undefined> = process.env,
): ManagerPlanner {
  const apiKey = environment.OPENAI_API_KEY;

  if (apiKey === undefined || apiKey.trim() === "") {
    return createDeterministicPlanner();
  }

  return createOpenAIManagerPlanner({
    apiKey,
    model: environment.OPENAI_MANAGER_MODEL ?? defaultModel,
  });
}

function buildManagerPrompt(input: ManagerPlanInput): string {
  return [
    "Project:",
    `- id: ${input.project.id}`,
    `- name: ${input.project.name}`,
    `- repository: ${input.project.repository.publicRepositoryUrl}`,
    "",
    "Task:",
    `- title: ${input.title}`,
    `- description: ${input.description}`,
    "",
    "Generate a Manager plan with:",
    "- summary",
    "- reasoning",
    "- implementationSteps",
    "- acceptanceCriteria",
  ].join("\n");
}

function toTaskPlan(response: ManagerResponse): TaskPlan {
  return {
    summary: response.summary,
    steps: [
      `Reasoning: ${response.reasoning}`,
      ...response.implementationSteps.map((step) => `Implement: ${step}`),
      ...response.acceptanceCriteria.map((criterion) => `Accept: ${criterion}`),
    ],
  };
}

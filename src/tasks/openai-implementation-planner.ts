import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";

import {
  developerImplementationPlanSchema,
  type DeveloperImplementationPlanner,
} from "./controlled-developer-executor.js";
import type { DeveloperExecutionInput } from "./types.js";

const defaultModel = "gpt-5.5";

export interface OpenAIImplementationPlannerResponses {
  parse(
    params: Parameters<OpenAI["responses"]["parse"]>[0],
  ): Promise<{ output_parsed: unknown }>;
}

export interface OpenAIImplementationPlannerClient {
  responses: OpenAIImplementationPlannerResponses;
}

export interface OpenAIImplementationPlannerDependencies {
  apiKey?: string;
  client?: OpenAIImplementationPlannerClient;
  model?: string;
}

export function createOpenAIImplementationPlanner({
  apiKey,
  client,
  model = defaultModel,
}: OpenAIImplementationPlannerDependencies = {}): DeveloperImplementationPlanner {
  const openaiClient = client ?? new OpenAI({ apiKey });

  return {
    async plan(input) {
      const response = await openaiClient.responses.parse({
        model,
        input: [
          {
            role: "system",
            content: [
              "You are Devcrew's Full Stack Developer agent.",
              "Return only structured file operations for the approved plan.",
              "Supported operation types are create and update.",
              "Paths must be repository-relative; absolute paths and traversal are rejected.",
              "Never return shell commands, environment variables, credentials, or host paths.",
            ].join(" "),
          },
          {
            role: "user",
            content: buildPlannerPrompt(input),
          },
        ],
        text: {
          format: zodTextFormat(
            developerImplementationPlanSchema,
            "developer_implementation_operations",
          ),
        },
      });

      return response.output_parsed;
    },
  };
}

function buildPlannerPrompt(input: DeveloperExecutionInput): string {
  const { project, task } = input;
  const planDecision = task.planDecision;

  return [
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
    "- summary describing the implementation you are applying",
    "- operations containing complete file content for each created or updated file",
    "- verification checks a maintainer should run afterwards",
  ].join("\n");
}

export function createImplementationPlannerFromEnv(
  environment: Record<string, string | undefined> = process.env,
  dependencies: Omit<OpenAIImplementationPlannerDependencies, "apiKey" | "model"> = {},
): DeveloperImplementationPlanner | undefined {
  const apiKey = environment.OPENAI_API_KEY;

  if (apiKey === undefined || apiKey.trim() === "") {
    return undefined;
  }

  return createOpenAIImplementationPlanner({
    ...dependencies,
    apiKey,
    model: environment.OPENAI_DEVELOPER_MODEL ?? defaultModel,
  });
}

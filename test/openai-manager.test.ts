import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { ApplicationError } from "../src/errors.js";
import {
  createManagerPlannerFromEnv,
  createOpenAIManagerPlanner,
  type OpenAIManagerClient,
} from "../src/tasks/openai-manager.js";
import type { ManagerPlanInput } from "../src/tasks/types.js";

const managerInput: ManagerPlanInput = {
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
  title: "Implement auth middleware",
  description: "Protect every API route.",
};

describe("OpenAI manager planner", () => {
  it("creates a task plan from a structured OpenAI response", async () => {
    let request: unknown;
    const client: OpenAIManagerClient = {
      responses: {
        async parse(params) {
          request = params;

          return {
            output_parsed: {
              summary: "Add auth middleware safely.",
              reasoning: "The backend owns route validation and errors.",
              implementationSteps: [
                "Inspect route composition",
                "Add middleware tests",
              ],
              acceptanceCriteria: [
                "Unauthorized requests fail",
                "Existing request IDs remain intact",
              ],
            },
          };
        },
      },
    };

    const planner = createOpenAIManagerPlanner({ client, model: "test-model" });
    const plan = await planner.createPlan(managerInput);

    assert.deepEqual(plan, {
      summary: "Add auth middleware safely.",
      steps: [
        "Reasoning: The backend owns route validation and errors.",
        "Implement: Inspect route composition",
        "Implement: Add middleware tests",
        "Accept: Unauthorized requests fail",
        "Accept: Existing request IDs remain intact",
      ],
    });
    assert.match(JSON.stringify(request), /test-model/);
    assert.match(JSON.stringify(request), /Devcrew/);
    assert.match(JSON.stringify(request), /Implement auth middleware/);
    assert.match(JSON.stringify(request), /Protect every API route/);
  });

  it("rejects malformed OpenAI responses with a sanitized error", async () => {
    const client: OpenAIManagerClient = {
      responses: {
        async parse() {
          return {
            output_parsed: {
              summary: "Missing required fields",
            },
          };
        },
      },
    };
    const planner = createOpenAIManagerPlanner({ client });

    await assert.rejects(
      () => planner.createPlan(managerInput),
      (error) =>
        error instanceof ApplicationError &&
        error.code === "MANAGER_PLAN_INVALID" &&
        error.status === 502 &&
        error.message === "Manager planning returned an invalid response",
    );
  });

  it("sanitizes OpenAI API failures", async () => {
    const sensitiveDetail = "sk-test-secret stack trace";
    const client: OpenAIManagerClient = {
      responses: {
        async parse() {
          throw new Error(sensitiveDetail);
        },
      },
    };
    const planner = createOpenAIManagerPlanner({ client });

    await assert.rejects(
      () => planner.createPlan(managerInput),
      (error) =>
        error instanceof ApplicationError &&
        error.code === "MANAGER_PLANNING_FAILED" &&
        error.status === 502 &&
        error.message === "Manager planning failed" &&
        !error.message.includes(sensitiveDetail),
    );
  });

  it("keeps deterministic planning available when no API key is configured", async () => {
    const planner = createManagerPlannerFromEnv({});
    const plan = await planner.createPlan(managerInput);

    assert.deepEqual(plan, {
      summary: "Implement requested engineering task.",
      steps: [
        "Inspect relevant source files",
        "Modify implementation",
        "Add or update tests",
        "Validate build",
        "Prepare for review",
      ],
    });
  });
});

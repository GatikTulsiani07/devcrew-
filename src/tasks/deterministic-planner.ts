import type { ManagerPlanner, TaskPlan } from "./types.js";

const deterministicPlan: TaskPlan = {
  summary: "Implement requested engineering task.",
  steps: [
    "Inspect relevant source files",
    "Modify implementation",
    "Add or update tests",
    "Validate build",
    "Prepare for review",
  ],
};

export function createDeterministicPlanner(): ManagerPlanner {
  return {
    async createPlan() {
      return {
        summary: deterministicPlan.summary,
        steps: [...deterministicPlan.steps],
      };
    },
  };
}

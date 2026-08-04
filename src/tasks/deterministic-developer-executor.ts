import { randomUUID } from "node:crypto";

import type {
  DeveloperExecutor,
  ExecutionId,
  ImplementationResult,
  TaskExecution,
} from "./types.js";

export type ExecutionIdGenerator = () => ExecutionId;
export type ExecutionClock = () => Date;

export interface DeterministicDeveloperExecutorDependencies {
  generateExecutionId?: ExecutionIdGenerator;
  now?: ExecutionClock;
}

const deterministicImplementationResult: ImplementationResult = {
  summary: "Implemented the approved engineering task.",
  changedFiles: [],
  verification: ["Implementation adapter completed deterministically."],
};

export function createDeterministicDeveloperExecutor({
  generateExecutionId = () => `exec_${randomUUID()}`,
  now = () => new Date(),
}: DeterministicDeveloperExecutorDependencies = {}): DeveloperExecutor {
  return {
    async execute(): Promise<TaskExecution> {
      const startedAt = now().toISOString();
      const completedAt = now().toISOString();

      return {
        id: generateExecutionId(),
        role: "FULL_STACK_DEVELOPER",
        status: "COMPLETED",
        attempt: 1,
        startedAt,
        completedAt,
        result: {
          summary: deterministicImplementationResult.summary,
          changedFiles: [...deterministicImplementationResult.changedFiles],
          verification: [...deterministicImplementationResult.verification],
        },
      };
    },
  };
}

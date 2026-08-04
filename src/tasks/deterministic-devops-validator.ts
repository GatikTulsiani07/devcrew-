import { randomUUID } from "node:crypto";

import type {
  DevOpsValidator,
  TaskValidation,
  ValidationCheck,
  ValidationId,
} from "./types.js";

export type ValidationIdGenerator = () => ValidationId;
export type ValidationClock = () => Date;

export interface DeterministicDevOpsValidatorDependencies {
  generateValidationId?: ValidationIdGenerator;
  now?: ValidationClock;
}

const deterministicValidationChecks: readonly ValidationCheck[] = [
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
];

const deterministicValidationSummary =
  "Deterministic validation completed successfully.";

export function createDeterministicDevOpsValidator({
  generateValidationId = () => `val_${randomUUID()}`,
  now = () => new Date(),
}: DeterministicDevOpsValidatorDependencies = {}): DevOpsValidator {
  return {
    async validate(): Promise<TaskValidation> {
      const startedAt = now().toISOString();
      const completedAt = now().toISOString();

      return {
        id: generateValidationId(),
        role: "DEVOPS_ENGINEER",
        status: "PASSED",
        attempt: 1,
        startedAt,
        completedAt,
        checks: deterministicValidationChecks.map((check) => ({ ...check })),
        summary: deterministicValidationSummary,
      };
    },
  };
}

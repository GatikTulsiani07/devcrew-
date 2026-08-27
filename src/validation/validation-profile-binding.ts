import { createHash } from "node:crypto";

import type { RepositoryCapabilities } from "../repositories/repository-capabilities.js";
import { findPreparedRepository, type PreparedRepository } from "../repositories/prepared-repositories.js";
import type { ProjectSnapshot } from "../projects/types.js";
import type { TaskValidation } from "../tasks/types.js";
import { browserVerificationProfiles } from "../browser/controlled-dev-server.js";
import type { ValidationProfile } from "./types.js";
import { findValidationProfile, validationProfiles } from "./validation-profiles.js";

export const VALIDATION_PROFILE_BINDING_SUMMARY =
  "Validation evidence was produced with an outdated validation profile.";

export class ValidationProfileBindingError extends Error {
  constructor(readonly reason: "MISSING_VALIDATION" | "MISSING_BINDING" | "PROFILE_MISMATCH") {
    super(`Validation profile binding failed: ${reason}`);
    this.name = "ValidationProfileBindingError";
  }
}

export interface ValidationProfileBindingInput {
  profile: ValidationProfile;
  capabilities?: RepositoryCapabilities;
}

export interface ValidationProfileBindingService {
  bindValidation(input: {
    project: ProjectSnapshot;
    validation: TaskValidation;
  }): TaskValidation;
  verifyValidation(input: {
    project: ProjectSnapshot;
    validation: TaskValidation | undefined;
  }): void;
}

export interface ValidationProfileBindingServiceDependencies {
  preparedRepositories: readonly PreparedRepository[];
  profiles?: readonly ValidationProfile[];
}

export function createValidationProfileBindingService({
  preparedRepositories,
  profiles = validationProfiles,
}: ValidationProfileBindingServiceDependencies): ValidationProfileBindingService {
  return {
    bindValidation({ project, validation }) {
      return bindValidationProfile(validation, resolveProfileBindingInput({
        project,
        preparedRepositories,
        profiles,
      }));
    },
    verifyValidation({ project, validation }) {
      verifyValidationProfileBinding(validation, resolveProfileBindingInput({
        project,
        preparedRepositories,
        profiles,
      }));
    },
  };
}

export function createNoopValidationProfileBindingService(): ValidationProfileBindingService {
  return {
    bindValidation({ validation }) {
      return validation;
    },
    verifyValidation() {
      // Tests and deterministic modes without prepared repository metadata can opt out.
    },
  };
}

export function bindValidationProfile(
  validation: TaskValidation,
  input: ValidationProfileBindingInput,
): TaskValidation {
  return {
    ...validation,
    validationProfileFingerprint: validationProfileFingerprint(input),
  };
}

export function verifyValidationProfileBinding(
  validation: TaskValidation | undefined,
  input: ValidationProfileBindingInput,
): void {
  if (validation === undefined) {
    throw new ValidationProfileBindingError("MISSING_VALIDATION");
  }

  if (validation.validationProfileFingerprint === undefined) {
    throw new ValidationProfileBindingError("MISSING_BINDING");
  }

  if (validation.validationProfileFingerprint !== validationProfileFingerprint(input)) {
    throw new ValidationProfileBindingError("PROFILE_MISMATCH");
  }
}

export function validationProfileFingerprint(
  input: ValidationProfileBindingInput,
): string {
  return createHash("sha256")
    .update(canonicalValidationProfile(input))
    .digest("hex");
}

export function canonicalValidationProfile({
  profile,
  capabilities,
}: ValidationProfileBindingInput): string {
  return JSON.stringify(
    canonicalize({
      version: 1,
      profile: {
        id: profile.id,
        checks: profile.checks.map((check) => ({
          name: check.name,
          executable: check.executable,
          args: [...check.args],
          timeoutMs: check.timeoutMs,
        })),
      },
      validationSelectionPolicy: {
        version: 1,
        fullSelectionCategories: ["UNKNOWN"],
        fallbackReasons: [
          "CONFIGURATION_CHANGE",
          "CONSERVATIVE_FALLBACK",
          "MISSING_CHANGE_EVIDENCE",
          "MIXED_CODE",
          "UNKNOWN_CHANGE",
        ],
        targetedReasons: [
          "BACKEND_ONLY",
          "DOCUMENTATION_ONLY",
          "FRONTEND_ONLY",
          "NO_CHANGE",
          "TEST_ONLY",
        ],
      },
      browserVerificationPolicy: {
        version: 1,
        eligibleProfileIds: browserVerificationProfiles.map((browserProfile) => browserProfile.id),
        capabilities: {
          browserVerificationEligible:
            capabilities?.browserVerificationEligible === true,
          frontendApplication: capabilities?.frontendApplication === true,
          hasDevScript: capabilities?.hasDevScript === true,
          nodeProject: capabilities?.nodeProject === true,
          typescriptProject: capabilities?.typescriptProject === true,
        },
      },
    }),
  );
}

type CanonicalValue =
  | null
  | boolean
  | number
  | string
  | readonly CanonicalValue[]
  | { readonly [key: string]: CanonicalValue };

function canonicalize(value: CanonicalValue): CanonicalValue {
  if (Array.isArray(value)) {
    return value.map(canonicalize);
  }

  if (typeof value !== "object" || value === null) {
    return value;
  }

  return Object.fromEntries(
    Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => [key, canonicalize(entry)]),
  );
}

function resolveProfileBindingInput({
  project,
  preparedRepositories,
  profiles,
}: {
  project: ProjectSnapshot;
  preparedRepositories: readonly PreparedRepository[];
  profiles: readonly ValidationProfile[];
}): ValidationProfileBindingInput {
  const repository = findPreparedRepository(
    preparedRepositories,
    project.repository.preparedRepositoryId,
  );
  const profileId = repository?.validationProfileId;
  const profile =
    profileId === undefined ? undefined : findValidationProfile(profiles, profileId);

  if (
    repository === undefined ||
    repository.publicRepositoryUrl !== project.repository.publicRepositoryUrl ||
    profile === undefined
  ) {
    throw new ValidationProfileBindingError("PROFILE_MISMATCH");
  }

  return {
    profile,
    capabilities: repository.capabilities,
  };
}

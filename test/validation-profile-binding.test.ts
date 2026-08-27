import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { RepositoryCapabilities } from "../src/repositories/repository-capabilities.js";
import {
  bindValidationProfile,
  canonicalValidationProfile,
  VALIDATION_PROFILE_BINDING_SUMMARY,
  ValidationProfileBindingError,
  validationProfileFingerprint,
  verifyValidationProfileBinding,
} from "../src/validation/validation-profile-binding.js";
import type { ValidationProfile } from "../src/validation/types.js";
import type { TaskValidation } from "../src/tasks/types.js";

const capabilities: RepositoryCapabilities = {
  nodeProject: true,
  frontendApplication: true,
  hasDevScript: true,
  hasTestScript: true,
  hasBuildScript: true,
  typescriptProject: true,
  browserVerificationEligible: true,
};

const profile: ValidationProfile = {
  id: "node_standard",
  checks: [
    {
      name: "typecheck",
      executable: "npm",
      args: ["run", "typecheck"],
      timeoutMs: 120_000,
    },
    {
      name: "tests",
      executable: "npm",
      args: ["test"],
      timeoutMs: 300_000,
    },
  ],
};

describe("validation profile binding", () => {
  it("derives a deterministic server-owned fingerprint", () => {
    const fingerprint = validationProfileFingerprint({ profile, capabilities });

    assert.match(fingerprint, /^[0-9a-f]{64}$/);
    assert.equal(
      fingerprint,
      validationProfileFingerprint({
        capabilities: { ...capabilities },
        profile: {
          checks: profile.checks.map((check) => ({ ...check })),
          id: profile.id,
        },
      }),
    );
  });

  it("canonicalizes object property ordering", () => {
    const canonical = canonicalValidationProfile({ profile, capabilities });
    const reordered = canonicalValidationProfile({
      capabilities: {
        browserVerificationEligible: true,
        typescriptProject: true,
        hasBuildScript: true,
        hasTestScript: true,
        hasDevScript: true,
        frontendApplication: true,
        nodeProject: true,
      },
      profile: {
        checks: [
          {
            timeoutMs: 120_000,
            args: ["run", "typecheck"],
            executable: "npm",
            name: "typecheck",
          },
          {
            timeoutMs: 300_000,
            args: ["test"],
            executable: "npm",
            name: "tests",
          },
        ],
        id: "node_standard",
      },
    });

    assert.equal(canonical, reordered);
  });

  it("changes identity when validation behavior changes", () => {
    assert.notEqual(
      validationProfileFingerprint({ profile, capabilities }),
      validationProfileFingerprint({
        profile: {
          ...profile,
          checks: [
            ...profile.checks,
            {
              name: "build",
              executable: "npm",
              args: ["run", "build"],
              timeoutMs: 300_000,
            },
          ],
        },
        capabilities,
      }),
    );
  });

  it("changes identity when browser requirement changes", () => {
    assert.notEqual(
      validationProfileFingerprint({ profile, capabilities }),
      validationProfileFingerprint({
        profile,
        capabilities: {
          ...capabilities,
          browserVerificationEligible: false,
        },
      }),
    );
  });

  it("ignores unrelated task, model, activity, and timestamp metadata", () => {
    const first = validationProfileFingerprint({ profile, capabilities });
    const unrelated = {
      taskPrompt: "Do a different task",
      modelOutput: "Validation passed",
      activityText: "DevOps completed validation",
      timestamp: "2026-08-03T00:00:00.000Z",
    };

    assert.equal(JSON.stringify(unrelated).includes(first), false);
    assert.equal(validationProfileFingerprint({ profile, capabilities }), first);
  });

  it("binds and verifies current validation evidence", () => {
    const validation = bindValidationProfile(validationEvidence(), {
      profile,
      capabilities,
    });

    assert.equal(validation.validationProfileFingerprint?.length, 64);
    assert.doesNotThrow(() =>
      verifyValidationProfileBinding(validation, { profile, capabilities }),
    );
  });

  it("fails closed for stale or missing profile binding", () => {
    assert.throws(
      () => verifyValidationProfileBinding(validationEvidence(), { profile, capabilities }),
      (error) =>
        error instanceof ValidationProfileBindingError &&
        error.reason === "MISSING_BINDING",
    );

    const stale = bindValidationProfile(validationEvidence(), {
      profile,
      capabilities,
    });

    assert.throws(
      () =>
        verifyValidationProfileBinding(stale, {
          profile,
          capabilities: { ...capabilities, browserVerificationEligible: false },
        }),
      (error) =>
        error instanceof ValidationProfileBindingError &&
        error.reason === "PROFILE_MISMATCH",
    );
  });

  it("does not expose raw profile configuration in the public fingerprint", () => {
    const validation = bindValidationProfile(validationEvidence(), {
      profile,
      capabilities,
    });
    const serialized = JSON.stringify(validation);

    assert.equal(serialized.includes("npm"), false);
    assert.equal(serialized.includes("typecheck"), true);
    assert.equal(serialized.includes("OPENAI_API_KEY"), false);
    assert.equal(serialized.includes("/Users/"), false);
    assert.equal(VALIDATION_PROFILE_BINDING_SUMMARY.includes("npm"), false);
  });
});

function validationEvidence(): TaskValidation {
  return {
    id: "val_000001",
    role: "DEVOPS_ENGINEER",
    status: "PASSED",
    attempt: 1,
    startedAt: "2026-08-03T01:00:00.000Z",
    completedAt: "2026-08-03T01:01:00.000Z",
    checks: [
      {
        name: "typecheck",
        status: "PASSED",
        summary: "Type checking completed successfully.",
      },
    ],
    summary: "Validation passed.",
  };
}

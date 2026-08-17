import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { GitRepositoryChangeSummary } from "../src/repositories/git-inspector.js";
import type { RepositoryCapabilities } from "../src/repositories/repository-capabilities.js";
import {
  classifyRepositoryPath,
  selectValidationPlan,
} from "../src/validation/validation-selection.js";
import { validationProfiles } from "../src/validation/validation-profiles.js";

const profile = validationProfiles[0];

const browserEligible: RepositoryCapabilities = {
  nodeProject: true,
  frontendApplication: true,
  hasDevScript: true,
  hasTestScript: true,
  hasBuildScript: true,
  typescriptProject: true,
  browserVerificationEligible: true,
};

const browserIneligible: RepositoryCapabilities = {
  ...browserEligible,
  browserVerificationEligible: false,
};

function changes(paths: readonly string[]): GitRepositoryChangeSummary {
  return {
    filesChanged: paths,
    filesAdded: [],
    filesModified: paths,
    filesDeleted: [],
    totalFilesChanged: paths.length,
    insertions: paths.length,
    deletions: 0,
  };
}

function select(paths: readonly string[] | undefined, capabilities = browserEligible) {
  return selectValidationPlan({
    repositoryChanges: paths === undefined ? undefined : changes(paths),
    capabilities,
    approvedValidationConfig: profile,
  });
}

describe("validation selection", () => {
  it("classifies server-owned repository-relative paths", () => {
    assert.equal(classifyRepositoryPath("app/page.tsx", browserEligible), "FRONTEND");
    assert.equal(classifyRepositoryPath("components/button.tsx", browserEligible), "FRONTEND");
    assert.equal(classifyRepositoryPath("src/server.ts", browserEligible), "BACKEND");
    assert.equal(classifyRepositoryPath("routes/tasks.ts", browserEligible), "BACKEND");
    assert.equal(classifyRepositoryPath("README.md", browserEligible), "DOCUMENTATION");
    assert.equal(classifyRepositoryPath("tests/tasks.test.ts", browserEligible), "TEST");
    assert.equal(classifyRepositoryPath("package.json", browserEligible), "CONFIGURATION");
    assert.equal(classifyRepositoryPath("package-lock.json", browserEligible), "CONFIGURATION");
    assert.equal(classifyRepositoryPath("next.config.ts", browserEligible), "CONFIGURATION");
    assert.equal(classifyRepositoryPath("unknown.asset", browserEligible), "UNKNOWN");
    assert.equal(classifyRepositoryPath("/absolute/path.ts", browserEligible), "UNKNOWN");
    assert.equal(classifyRepositoryPath("../outside.ts", browserEligible), "UNKNOWN");
    assert.equal(classifyRepositoryPath(".git/config", browserEligible), "UNKNOWN");
  });

  it("selects targeted frontend validation and browser only when eligible", () => {
    assert.deepEqual(select(["app/page.tsx"], browserEligible), {
      strategy: "TARGETED",
      categories: ["FRONTEND"],
      browserVerificationSelected: true,
      reason: "FRONTEND_ONLY",
    });
    assert.deepEqual(select(["components/card.tsx"], browserIneligible), {
      strategy: "TARGETED",
      categories: ["FRONTEND"],
      browserVerificationSelected: false,
      reason: "FRONTEND_ONLY",
    });
  });

  it("selects targeted backend, documentation, and test validation without browser", () => {
    assert.deepEqual(select(["src/tasks/task-service.ts"]), {
      strategy: "TARGETED",
      categories: ["BACKEND"],
      browserVerificationSelected: false,
      reason: "BACKEND_ONLY",
    });
    assert.deepEqual(select(["docs/usage.md", "README.md"]), {
      strategy: "TARGETED",
      categories: ["DOCUMENTATION"],
      browserVerificationSelected: false,
      reason: "DOCUMENTATION_ONLY",
    });
    assert.deepEqual(select(["test/tasks.test.ts"]), {
      strategy: "TARGETED",
      categories: ["TEST"],
      browserVerificationSelected: false,
      reason: "TEST_ONLY",
    });
  });

  it("falls back to full validation for config, mixed, unknown, missing, and malformed evidence", () => {
    assert.deepEqual(select(["tsconfig.json"]), {
      strategy: "FULL",
      categories: ["UNKNOWN"],
      browserVerificationSelected: true,
      reason: "CONFIGURATION_CHANGE",
    });
    assert.deepEqual(select(["app/page.tsx", "src/server.ts"]), {
      strategy: "FULL",
      categories: ["UNKNOWN"],
      browserVerificationSelected: true,
      reason: "MIXED_CODE",
    });
    assert.deepEqual(select(["assets/logo.bin"]), {
      strategy: "FULL",
      categories: ["UNKNOWN"],
      browserVerificationSelected: true,
      reason: "UNKNOWN_CHANGE",
    });
    assert.deepEqual(select(undefined), {
      strategy: "FULL",
      categories: ["UNKNOWN"],
      browserVerificationSelected: true,
      reason: "MISSING_CHANGE_EVIDENCE",
    });
    assert.deepEqual(
      selectValidationPlan({
        repositoryChanges: {
          ...changes(["app/page.tsx"]),
          totalFilesChanged: 2,
        },
        capabilities: browserEligible,
        approvedValidationConfig: profile,
      }),
      {
        strategy: "FULL",
        categories: ["UNKNOWN"],
        browserVerificationSelected: true,
        reason: "CONSERVATIVE_FALLBACK",
      },
    );
  });

  it("uses safe empty-change behavior and never emits commands", () => {
    const selected = select([]);

    assert.deepEqual(selected, {
      strategy: "TARGETED",
      categories: [],
      browserVerificationSelected: false,
      reason: "NO_CHANGE",
    });
    assert.equal(JSON.stringify(selected).includes("npm"), false);
    assert.equal(JSON.stringify(selected).includes("run"), false);
  });

  it("does not allow missing capabilities to select browser verification", () => {
    assert.deepEqual(
      selectValidationPlan({
        repositoryChanges: changes(["app/page.tsx"]),
        capabilities: undefined,
        approvedValidationConfig: profile,
      }),
      {
        strategy: "TARGETED",
        categories: ["FRONTEND"],
        browserVerificationSelected: false,
        reason: "FRONTEND_ONLY",
      },
    );
  });
});

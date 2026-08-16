import assert from "node:assert/strict";
import { mkdtemp, rm, stat, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";

import { ApplicationError } from "../src/errors.js";
import { InMemoryProjectStore } from "../src/projects/in-memory-project-store.js";
import { createProjectService } from "../src/projects/project-service.js";
import {
  detectRepositoryCapabilities,
  MAX_PACKAGE_JSON_BYTES,
} from "../src/repositories/repository-capabilities.js";
import type { PreparedRepository } from "../src/repositories/prepared-repositories.js";

describe("repository capability detection", () => {
  it("detects a supported frontend Node repository and browser eligibility", async () => {
    await withRepository(async (repositoryRoot) => {
      await writePackageJson(repositoryRoot, {
        scripts: {
          dev: "next dev",
          test: "node --test",
          build: "next build",
        },
        dependencies: {
          next: "16.2.10",
          react: "19.2.4",
        },
        devDependencies: {
          typescript: "^5",
        },
      });
      await writeFile(join(repositoryRoot, "tsconfig.json"), "{}", "utf8");

      assert.deepEqual(
        await detectRepositoryCapabilities(repository(repositoryRoot)),
        {
          nodeProject: true,
          frontendApplication: true,
          hasDevScript: true,
          hasTestScript: true,
          hasBuildScript: true,
          typescriptProject: true,
          browserVerificationEligible: true,
        },
      );
    });
  });

  it("detects a backend-only Node repository without browser eligibility", async () => {
    await withRepository(async (repositoryRoot) => {
      await writePackageJson(repositoryRoot, {
        scripts: {
          dev: "node server.js",
          test: "node --test",
          build: "tsc -p tsconfig.json",
        },
        dependencies: {
          hono: "^4",
        },
      });
      await writeFile(join(repositoryRoot, "tsconfig.json"), "{}", "utf8");

      assert.deepEqual(
        await detectRepositoryCapabilities(repository(repositoryRoot)),
        {
          nodeProject: true,
          frontendApplication: false,
          hasDevScript: true,
          hasTestScript: true,
          hasBuildScript: true,
          typescriptProject: true,
          browserVerificationEligible: false,
        },
      );
    });
  });

  it("handles repositories without package.json", async () => {
    await withRepository(async (repositoryRoot) => {
      await writeFile(join(repositoryRoot, "tsconfig.json"), "{}", "utf8");

      assert.deepEqual(
        await detectRepositoryCapabilities(repository(repositoryRoot)),
        {
          nodeProject: false,
          frontendApplication: false,
          hasDevScript: false,
          hasTestScript: false,
          hasBuildScript: false,
          typescriptProject: true,
          browserVerificationEligible: false,
        },
      );
    });
  });

  it("fails safely for malformed package.json", async () => {
    await withRepository(async (repositoryRoot) => {
      await writeFile(join(repositoryRoot, "package.json"), "{", "utf8");

      await assert.rejects(
        () => detectRepositoryCapabilities(repository(repositoryRoot)),
        safePreparedRepositoryError,
      );
    });
  });

  it("detects script presence without exposing or executing script contents", async () => {
    await withRepository(async (repositoryRoot) => {
      const marker = join(repositoryRoot, "script-ran");
      await writePackageJson(repositoryRoot, {
        scripts: {
          dev: `node -e "require('fs').writeFileSync('${marker}', '')"`,
          test: "node --test",
          build: "node build.js",
        },
      });

      const capabilities = await detectRepositoryCapabilities(
        repository(repositoryRoot),
      );

      assert.equal(capabilities?.hasDevScript, true);
      assert.equal(capabilities?.hasTestScript, true);
      assert.equal(capabilities?.hasBuildScript, true);
      await assert.rejects(stat(marker));
    });
  });

  it("detects frontend framework signals from dependencies and config existence", async () => {
    await withRepository(async (repositoryRoot) => {
      await writePackageJson(repositoryRoot, {
        scripts: {},
        devDependencies: {
          vite: "^7",
        },
      });

      assert.equal(
        (await detectRepositoryCapabilities(repository(repositoryRoot)))
          ?.frontendApplication,
        true,
      );
    });

    await withRepository(async (repositoryRoot) => {
      await writePackageJson(repositoryRoot, {
        scripts: {},
      });
      await writeFile(join(repositoryRoot, "next.config.mjs"), "", "utf8");

      assert.equal(
        (await detectRepositoryCapabilities(repository(repositoryRoot)))
          ?.frontendApplication,
        true,
      );
    });
  });

  it("does not classify a repository as frontend from a dev script alone", async () => {
    await withRepository(async (repositoryRoot) => {
      await writePackageJson(repositoryRoot, {
        scripts: {
          dev: "node server.js",
        },
      });

      const capabilities = await detectRepositoryCapabilities(
        repository(repositoryRoot),
      );

      assert.equal(capabilities?.hasDevScript, true);
      assert.equal(capabilities?.frontendApplication, false);
      assert.equal(capabilities?.browserVerificationEligible, false);
    });
  });

  it("rejects oversized package.json safely", async () => {
    await withRepository(async (repositoryRoot) => {
      await writeFile(
        join(repositoryRoot, "package.json"),
        `{ "name": "${"x".repeat(MAX_PACKAGE_JSON_BYTES)}" }`,
        "utf8",
      );

      await assert.rejects(
        () => detectRepositoryCapabilities(repository(repositoryRoot)),
        safePreparedRepositoryError,
      );
    });
  });

  it("uses fixed contained paths and fails safely for symlink escapes", async () => {
    await withRepository(async (repositoryRoot) => {
      const outsideRoot = await mkdtemp(join(tmpdir(), "devcrew-outside-"));
      try {
        await writeFile(join(outsideRoot, "package.json"), "{}", "utf8");
        await symlink(
          join(outsideRoot, "package.json"),
          join(repositoryRoot, "package.json"),
        );

        await assert.rejects(
          () => detectRepositoryCapabilities(repository(repositoryRoot)),
          safePreparedRepositoryError,
        );
      } finally {
        await rm(outsideRoot, { recursive: true, force: true });
      }
    });
  });

  it("returns undefined when no local checkout has been prepared", async () => {
    assert.equal(
      await detectRepositoryCapabilities({
        id: "prepared_backend",
        publicRepositoryUrl: "https://github.com/example/backend",
      }),
      undefined,
    );
  });

  it("persists capability metadata on project creation and subsequent reads", async () => {
    await withRepository(async (repositoryRoot) => {
      await writePackageJson(repositoryRoot, {
        scripts: {
          dev: "next dev",
          test: "node --test",
          build: "next build",
        },
        dependencies: {
          next: "16.2.10",
        },
      });
      const preparedRepository = repository(repositoryRoot);
      const projectService = createProjectService({
        store: new InMemoryProjectStore(),
        preparedRepositories: [preparedRepository],
        generateProjectId: () => "proj_capabilities",
        generateRepositoryId: () => "repo_capabilities",
        now: () => new Date("2026-08-03T00:00:00.000Z"),
      });

      const created = await projectService.createProject({
        name: "Capabilities",
        publicRepositoryUrl: "https://github.com/example/devcrew",
        preparedRepositoryId: "prepared_devcrew_main",
      });
      await writePackageJson(repositoryRoot, {
        scripts: {},
      });
      const read = await projectService.getProject("proj_capabilities");

      assert.deepEqual(created.repository.capabilities, {
        nodeProject: true,
        frontendApplication: true,
        hasDevScript: true,
        hasTestScript: true,
        hasBuildScript: true,
        typescriptProject: false,
        browserVerificationEligible: true,
      });
      assert.deepEqual(read.repository.capabilities, created.repository.capabilities);
      assert.deepEqual(preparedRepository.capabilities, created.repository.capabilities);
    });
  });
});

function repository(repositoryRoot: string): PreparedRepository {
  return {
    id: "prepared_devcrew_main",
    publicRepositoryUrl: "https://github.com/example/devcrew",
    localCheckoutPath: repositoryRoot,
    validationProfileId: "node_standard",
    browserVerificationProfileId: "next_localhost",
  };
}

async function withRepository(
  callback: (repositoryRoot: string) => Promise<void>,
): Promise<void> {
  const repositoryRoot = await mkdtemp(join(tmpdir(), "devcrew-capabilities-"));
  try {
    await callback(repositoryRoot);
  } finally {
    await rm(repositoryRoot, { recursive: true, force: true });
  }
}

async function writePackageJson(
  repositoryRoot: string,
  packageJson: Record<string, unknown>,
): Promise<void> {
  await writeFile(
    join(repositoryRoot, "package.json"),
    JSON.stringify(packageJson, null, 2),
    "utf8",
  );
}

function safePreparedRepositoryError(error: unknown): boolean {
  return (
    error instanceof ApplicationError &&
    error.status === 422 &&
    error.code === "PREPARED_REPOSITORY_INVALID" &&
    error.message === "Prepared repository metadata is invalid" &&
    !String(error).includes("/private/") &&
    !String(error).includes("package.json")
  );
}

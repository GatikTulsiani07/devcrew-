import { constants } from "node:fs";
import { access, readFile, realpath, stat } from "node:fs/promises";
import { isAbsolute, join, relative } from "node:path";

import { browserVerificationProfiles } from "../browser/controlled-dev-server.js";
import { ApplicationError } from "../errors.js";
import type { PreparedRepository } from "./prepared-repositories.js";

export const MAX_PACKAGE_JSON_BYTES = 64 * 1024;

const emptyCapabilities: RepositoryCapabilities = {
  nodeProject: false,
  frontendApplication: false,
  hasDevScript: false,
  hasTestScript: false,
  hasBuildScript: false,
  typescriptProject: false,
  browserVerificationEligible: false,
};

const frontendDependencies = new Set([
  "@remix-run/dev",
  "astro",
  "next",
  "react-scripts",
  "vite",
]);

const frontendConfigPaths = [
  "next.config.js",
  "next.config.mjs",
  "next.config.cjs",
  "next.config.ts",
  "vite.config.js",
  "vite.config.mjs",
  "vite.config.cjs",
  "vite.config.ts",
  "astro.config.js",
  "astro.config.mjs",
  "astro.config.cjs",
  "astro.config.ts",
] as const;

export interface RepositoryCapabilities {
  nodeProject: boolean;
  frontendApplication: boolean;
  hasDevScript: boolean;
  hasTestScript: boolean;
  hasBuildScript: boolean;
  typescriptProject: boolean;
  browserVerificationEligible: boolean;
}

export async function detectRepositoryCapabilities(
  repository: PreparedRepository,
): Promise<RepositoryCapabilities | undefined> {
  if (repository.localCheckoutPath === undefined) {
    return undefined;
  }

  const root = await canonicalRepositoryRoot(repository.localCheckoutPath);
  const packageJson = await readPackageJson(root);
  const hasTsconfig = await fixedPathExists(root, "tsconfig.json");
  const hasFrontendConfig = await hasKnownFrontendConfig(root);

  if (packageJson === undefined) {
    const capabilities = {
      ...emptyCapabilities,
      typescriptProject: hasTsconfig,
    };
    return withBrowserEligibility(capabilities, repository);
  }

  const scripts = scriptNames(packageJson);
  const dependencies = dependencyNames(packageJson);
  const frontendApplication =
    hasFrontendConfig ||
    dependencies.some((dependency) => frontendDependencies.has(dependency));
  const capabilities: RepositoryCapabilities = {
    nodeProject: true,
    frontendApplication,
    hasDevScript: scripts.has("dev"),
    hasTestScript: scripts.has("test"),
    hasBuildScript: scripts.has("build"),
    typescriptProject: hasTsconfig || dependencies.includes("typescript"),
    browserVerificationEligible: false,
  };

  return withBrowserEligibility(capabilities, repository);
}

async function canonicalRepositoryRoot(repositoryRoot: string): Promise<string> {
  if (!isAbsolute(repositoryRoot)) {
    throw invalidPreparedRepository();
  }

  try {
    return await realpath(repositoryRoot);
  } catch {
    throw invalidPreparedRepository();
  }
}

async function readPackageJson(
  root: string,
): Promise<Record<string, unknown> | undefined> {
  const packagePath = await containedFixedPath(root, "package.json");

  if (packagePath === undefined) {
    return undefined;
  }

  try {
    const metadata = await stat(packagePath);
    if (!metadata.isFile() || metadata.size > MAX_PACKAGE_JSON_BYTES) {
      throw invalidPreparedRepository();
    }

    const parsed: unknown = JSON.parse(await readFile(packagePath, "utf8"));
    if (!isRecord(parsed)) {
      throw invalidPreparedRepository();
    }

    return parsed;
  } catch (error) {
    if (error instanceof ApplicationError) {
      throw error;
    }
    throw invalidPreparedRepository();
  }
}

async function fixedPathExists(root: string, path: string): Promise<boolean> {
  const resolved = await containedFixedPath(root, path);
  if (resolved === undefined) {
    return false;
  }

  try {
    await access(resolved, constants.R_OK);
    return true;
  } catch {
    return false;
  }
}

async function hasKnownFrontendConfig(root: string): Promise<boolean> {
  for (const configPath of frontendConfigPaths) {
    if (await fixedPathExists(root, configPath)) {
      return true;
    }
  }

  return false;
}

async function containedFixedPath(
  root: string,
  path: string,
): Promise<string | undefined> {
  const target = join(root, path);

  try {
    const canonicalTarget = await realpath(target);
    const relativePath = relative(root, canonicalTarget);
    if (
      relativePath === "" ||
      relativePath.startsWith("..") ||
      isAbsolute(relativePath)
    ) {
      throw invalidPreparedRepository();
    }
    return canonicalTarget;
  } catch (error) {
    if (error instanceof ApplicationError) {
      throw error;
    }
    return undefined;
  }
}

function scriptNames(packageJson: Record<string, unknown>): Set<string> {
  const scripts = packageJson.scripts;
  if (!isRecord(scripts)) {
    return new Set();
  }

  return new Set(
    Object.entries(scripts)
      .filter((entry): entry is [string, string] => typeof entry[1] === "string")
      .map(([name]) => name),
  );
}

function dependencyNames(packageJson: Record<string, unknown>): string[] {
  return [
    ...objectKeys(packageJson.dependencies),
    ...objectKeys(packageJson.devDependencies),
    ...objectKeys(packageJson.peerDependencies),
    ...objectKeys(packageJson.optionalDependencies),
  ];
}

function objectKeys(value: unknown): string[] {
  return isRecord(value) ? Object.keys(value) : [];
}

function withBrowserEligibility(
  capabilities: RepositoryCapabilities,
  repository: PreparedRepository,
): RepositoryCapabilities {
  return {
    ...capabilities,
    browserVerificationEligible:
      capabilities.frontendApplication &&
      capabilities.hasDevScript &&
      browserVerificationProfiles.some(
        (profile) => profile.id === repository.browserVerificationProfileId,
      ),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function invalidPreparedRepository(): ApplicationError {
  return new ApplicationError(
    "PREPARED_REPOSITORY_INVALID",
    422,
    "Prepared repository metadata is invalid",
  );
}

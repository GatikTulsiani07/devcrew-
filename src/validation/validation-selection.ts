import type { GitRepositoryChangeSummary } from "../repositories/git-inspector.js";
import { isSafeEvidencePath } from "../repositories/git-inspector.js";
import type { RepositoryCapabilities } from "../repositories/repository-capabilities.js";
import type { ValidationProfile } from "./types.js";

export type ValidationSelectionStrategy = "FULL" | "TARGETED";
export type ValidationChangeCategory =
  | "FRONTEND"
  | "BACKEND"
  | "DOCUMENTATION"
  | "CONFIGURATION"
  | "TEST"
  | "UNKNOWN";
export type ValidationSelectionReason =
  | "FRONTEND_ONLY"
  | "BACKEND_ONLY"
  | "DOCUMENTATION_ONLY"
  | "TEST_ONLY"
  | "MIXED_CODE"
  | "CONFIGURATION_CHANGE"
  | "UNKNOWN_CHANGE"
  | "NO_CHANGE"
  | "MISSING_CHANGE_EVIDENCE"
  | "CONSERVATIVE_FALLBACK";

export interface ValidationSelectionEvidence {
  strategy: ValidationSelectionStrategy;
  categories: readonly ValidationChangeCategory[];
  browserVerificationSelected: boolean;
  reason: ValidationSelectionReason;
}

export interface ValidationSelectionInput {
  repositoryChanges?: GitRepositoryChangeSummary;
  capabilities?: RepositoryCapabilities;
  approvedValidationConfig: ValidationProfile;
}

const configurationFilePatterns: readonly RegExp[] = [
  /^package\.json$/,
  /^package-lock\.json$/,
  /^(?:package-lock|pnpm-lock|yarn)\.ya?ml$/,
  /^tsconfig(?:\..*)?\.json$/,
  /^next\.config\.[cm]?[jt]s$/,
  /^vite\.config\.[cm]?[jt]s$/,
  /^astro\.config\.[cm]?[jt]s$/,
  /^eslint\.config\.[cm]?[jt]s$/,
  /^\.eslintrc(?:\..*)?$/,
  /^\.prettierrc(?:\..*)?$/,
  /^prettier\.config\.[cm]?[jt]s$/,
  /^postcss\.config\.[cm]?[jt]s$/,
  /^tailwind\.config\.[cm]?[jt]s$/,
  /^Dockerfile(?:\..*)?$/,
  /^docker-compose(?:\..*)?\.ya?ml$/,
  /^\.env\.example$/,
  /^env\.example$/,
];

export function selectValidationPlan({
  repositoryChanges,
  capabilities,
  approvedValidationConfig,
}: ValidationSelectionInput): ValidationSelectionEvidence {
  if (!isUsableValidationConfig(approvedValidationConfig)) {
    return fullSelection("CONSERVATIVE_FALLBACK", capabilities);
  }

  if (repositoryChanges === undefined) {
    return fullSelection("MISSING_CHANGE_EVIDENCE", capabilities);
  }

  if (!isConsistentRepositoryChanges(repositoryChanges)) {
    return fullSelection("CONSERVATIVE_FALLBACK", capabilities);
  }

  if (repositoryChanges.totalFilesChanged === 0) {
    return {
      strategy: "TARGETED",
      categories: [],
      browserVerificationSelected: false,
      reason: "NO_CHANGE",
    };
  }

  const categories = new Set<ValidationChangeCategory>();

  for (const path of repositoryChanges.filesChanged) {
    categories.add(classifyRepositoryPath(path, capabilities));
  }

  if (categories.has("CONFIGURATION")) {
    return fullSelection("CONFIGURATION_CHANGE", capabilities);
  }

  if (categories.has("UNKNOWN")) {
    return fullSelection("UNKNOWN_CHANGE", capabilities);
  }

  const hasFrontend = categories.has("FRONTEND");
  const hasBackend = categories.has("BACKEND");

  if (hasFrontend && hasBackend) {
    return fullSelection("MIXED_CODE", capabilities);
  }

  if (hasFrontend) {
    return targetedSelection("FRONTEND_ONLY", categories, shouldRunBrowser(capabilities));
  }

  if (hasBackend) {
    return targetedSelection("BACKEND_ONLY", categories, false);
  }

  if (categories.has("TEST")) {
    return targetedSelection("TEST_ONLY", categories, false);
  }

  if (categories.has("DOCUMENTATION")) {
    return targetedSelection("DOCUMENTATION_ONLY", categories, false);
  }

  return fullSelection("CONSERVATIVE_FALLBACK", capabilities);
}

export function classifyRepositoryPath(
  path: string,
  capabilities?: RepositoryCapabilities,
): ValidationChangeCategory {
  if (!isSafeEvidencePath(path)) {
    return "UNKNOWN";
  }

  const normalized = path.replace(/\\/g, "/");
  const fileName = normalized.split("/").at(-1) ?? normalized;
  const lower = normalized.toLowerCase();
  const lowerFileName = fileName.toLowerCase();

  if (isConfigurationPath(normalized)) {
    return "CONFIGURATION";
  }

  if (
    lower.startsWith("test/") ||
    lower.startsWith("tests/") ||
    /\.(?:test|spec)\.[cm]?[jt]sx?$/.test(lower)
  ) {
    return "TEST";
  }

  if (
    lower.startsWith("docs/") ||
    lower.endsWith(".md") ||
    lowerFileName.startsWith("readme") ||
    lowerFileName.startsWith("changelog")
  ) {
    return "DOCUMENTATION";
  }

  if (
    lower.startsWith("app/") ||
    lower.startsWith("pages/") ||
    lower.startsWith("components/") ||
    lower.startsWith("client/") ||
    lower.startsWith("frontend/") ||
    lower.startsWith("hooks/") ||
    /^src\/.+\.[cm]?[jt]sx$/.test(lower)
  ) {
    return "FRONTEND";
  }

  if (
    lower.startsWith("server/") ||
    lower.startsWith("api/") ||
    lower.startsWith("backend/") ||
    lower.startsWith("routes/") ||
    lower.startsWith("services/") ||
    /^src\/.+\.[cm]?[jt]s$/.test(lower)
  ) {
    return capabilities?.nodeProject === false ? "UNKNOWN" : "BACKEND";
  }

  return "UNKNOWN";
}

function isConfigurationPath(path: string): boolean {
  if (path.startsWith(".github/")) {
    return true;
  }

  return configurationFilePatterns.some((pattern) => pattern.test(path));
}

function fullSelection(
  reason: ValidationSelectionReason,
  capabilities?: RepositoryCapabilities,
): ValidationSelectionEvidence {
  return {
    strategy: "FULL",
    categories: ["UNKNOWN"],
    browserVerificationSelected: shouldRunBrowser(capabilities),
    reason,
  };
}

function targetedSelection(
  reason: ValidationSelectionReason,
  categories: Set<ValidationChangeCategory>,
  browserVerificationSelected: boolean,
): ValidationSelectionEvidence {
  return {
    strategy: "TARGETED",
    categories: [...categories].sort(),
    browserVerificationSelected,
    reason,
  };
}

function shouldRunBrowser(capabilities?: RepositoryCapabilities): boolean {
  return capabilities?.browserVerificationEligible === true;
}

function isUsableValidationConfig(profile: ValidationProfile): boolean {
  return Array.isArray(profile.checks) && profile.checks.length > 0;
}

function isConsistentRepositoryChanges(
  evidence: GitRepositoryChangeSummary,
): boolean {
  if (
    !Number.isSafeInteger(evidence.totalFilesChanged) ||
    evidence.totalFilesChanged < 0 ||
    !Number.isSafeInteger(evidence.insertions) ||
    evidence.insertions < 0 ||
    !Number.isSafeInteger(evidence.deletions) ||
    evidence.deletions < 0
  ) {
    return false;
  }

  const changed = uniqueSafePaths(evidence.filesChanged);

  if (
    changed === undefined ||
    changed.size !== evidence.filesChanged.length ||
    changed.size !== evidence.totalFilesChanged
  ) {
    return false;
  }

  for (const paths of [
    evidence.filesAdded,
    evidence.filesModified,
    evidence.filesDeleted,
  ]) {
    const safePaths = uniqueSafePaths(paths);

    if (safePaths === undefined) {
      return false;
    }

    for (const path of safePaths) {
      if (!changed.has(path)) {
        return false;
      }
    }
  }

  return true;
}

function uniqueSafePaths(paths: readonly string[]): Set<string> | undefined {
  const safePaths = new Set<string>();

  for (const path of paths) {
    if (!isSafeEvidencePath(path) || safePaths.has(path)) {
      return undefined;
    }

    safePaths.add(path);
  }

  return safePaths;
}

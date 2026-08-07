import { mkdir, readFile, realpath, rm, stat, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";

import { describeError, logger } from "../observability/logger.js";

export type RepositoryOperationType = "create" | "update";

export interface RepositoryFileOperation {
  type: RepositoryOperationType;
  path: string;
  content: string;
}

export interface AppliedRepositoryOperation {
  type: RepositoryOperationType;
  path: string;
}

export interface RepositoryWorkspace {
  apply(
    repositoryRoot: string,
    operations: readonly RepositoryFileOperation[],
  ): Promise<readonly AppliedRepositoryOperation[]>;
}

export const MAX_OPERATIONS = 12;
export const MAX_OPERATION_CONTENT_BYTES = 64 * 1024;
export const MAX_TOTAL_CONTENT_BYTES = 256 * 1024;
export const MAX_REPOSITORY_PATH_LENGTH = 200;

const forbiddenSegments = new Set([
  ".git",
  ".ssh",
  ".aws",
  "node_modules",
  ".next",
  "dist",
]);

const forbiddenFileNames = new Set([
  ".npmrc",
  ".netrc",
  "id_rsa",
  "credentials",
  "credentials.json",
]);

export class RepositoryWorkspaceError extends Error {
  constructor(readonly reason: string) {
    super(`Controlled repository operation rejected: ${reason}`);
    this.name = "RepositoryWorkspaceError";
  }
}

export function isSafeRepositoryPath(candidate: string): boolean {
  if (
    typeof candidate !== "string" ||
    candidate.trim() === "" ||
    candidate !== candidate.trim() ||
    candidate.length > MAX_REPOSITORY_PATH_LENGTH ||
    candidate.includes("\0") ||
    candidate.includes("\\") ||
    isAbsolute(candidate) ||
    /^[A-Za-z]:/.test(candidate)
  ) {
    return false;
  }

  const segments = candidate.split("/");

  return segments.every(
    (segment) =>
      segment !== "" &&
      segment !== "." &&
      segment !== ".." &&
      !forbiddenSegments.has(segment) &&
      !forbiddenFileNames.has(segment) &&
      !segment.startsWith(".env"),
  );
}

export function validateRepositoryOperations(
  operations: readonly RepositoryFileOperation[],
): void {
  if (!Array.isArray(operations) || operations.length === 0) {
    throw new RepositoryWorkspaceError("no operations were provided");
  }

  if (operations.length > MAX_OPERATIONS) {
    throw new RepositoryWorkspaceError("operation count limit exceeded");
  }

  let totalBytes = 0;
  const seen = new Set<string>();

  for (const operation of operations) {
    if (operation.type !== "create" && operation.type !== "update") {
      throw new RepositoryWorkspaceError("unsupported operation type");
    }

    if (!isSafeRepositoryPath(operation.path)) {
      throw new RepositoryWorkspaceError("unsafe repository path");
    }

    if (seen.has(operation.path)) {
      throw new RepositoryWorkspaceError("duplicate operation path");
    }

    seen.add(operation.path);

    if (typeof operation.content !== "string") {
      throw new RepositoryWorkspaceError("invalid operation content");
    }

    const bytes = Buffer.byteLength(operation.content, "utf8");

    if (bytes > MAX_OPERATION_CONTENT_BYTES) {
      throw new RepositoryWorkspaceError("operation content limit exceeded");
    }

    totalBytes += bytes;
  }

  if (totalBytes > MAX_TOTAL_CONTENT_BYTES) {
    throw new RepositoryWorkspaceError("total content limit exceeded");
  }
}

interface ResolvedTarget {
  operation: RepositoryFileOperation;
  absolutePath: string;
}

interface RestorePoint {
  absolutePath: string;
  previousContent: string | undefined;
}

export function createControlledRepositoryWorkspace(): RepositoryWorkspace {
  return {
    async apply(repositoryRoot, operations) {
      validateRepositoryOperations(operations);

      if (!isAbsolute(repositoryRoot)) {
        throw new RepositoryWorkspaceError("repository root is not absolute");
      }

      const root = await canonicalRoot(repositoryRoot);
      const targets: ResolvedTarget[] = [];

      for (const operation of operations) {
        targets.push({
          operation,
          absolutePath: await resolveTargetPath(root, operation.path),
        });
      }

      const restorePoints: RestorePoint[] = [];

      try {
        for (const target of targets) {
          const existingContent = await readExistingFile(target.absolutePath);

          if (target.operation.type === "create" && existingContent !== undefined) {
            throw new RepositoryWorkspaceError("create target already exists");
          }

          if (target.operation.type === "update" && existingContent === undefined) {
            throw new RepositoryWorkspaceError("update target does not exist");
          }

          restorePoints.push({
            absolutePath: target.absolutePath,
            previousContent: existingContent,
          });

          await mkdir(dirname(target.absolutePath), { recursive: true });
          await writeFile(target.absolutePath, target.operation.content, "utf8");
        }
      } catch (error) {
        await restore(restorePoints);
        if (error instanceof RepositoryWorkspaceError) {
          throw error;
        }
        logger.error("Controlled repository mutation failed", {
          cause: describeError(error),
        });
        throw new RepositoryWorkspaceError("repository mutation failed");
      }

      return targets.map((target) => ({
        type: target.operation.type,
        path: target.operation.path,
      }));
    },
  };
}

async function canonicalRoot(repositoryRoot: string): Promise<string> {
  let canonical: string;

  try {
    canonical = await realpath(repositoryRoot);
  } catch (error) {
    logger.error("Prepared repository root is unavailable", {
      cause: describeError(error),
    });
    throw new RepositoryWorkspaceError("repository root is unavailable");
  }

  const rootStat = await stat(canonical);

  if (!rootStat.isDirectory()) {
    throw new RepositoryWorkspaceError("repository root is not a directory");
  }

  return canonical;
}

async function resolveTargetPath(
  root: string,
  repositoryRelativePath: string,
): Promise<string> {
  const absolutePath = resolve(root, repositoryRelativePath);

  assertWithinRoot(root, absolutePath);

  const canonicalParent = await canonicalExistingAncestor(dirname(absolutePath));

  assertWithinRoot(root, canonicalParent);

  try {
    const canonicalTarget = await realpath(absolutePath);
    assertWithinRoot(root, canonicalTarget);
  } catch {
    // The target does not exist yet, which is expected for create operations.
  }

  return absolutePath;
}

function assertWithinRoot(root: string, candidate: string): void {
  const relativePath = relative(root, candidate);

  if (
    candidate !== root &&
    (relativePath === "" ||
      relativePath.startsWith("..") ||
      isAbsolute(relativePath) ||
      relativePath.split(sep).includes(".."))
  ) {
    throw new RepositoryWorkspaceError("target escapes the repository root");
  }
}

async function canonicalExistingAncestor(directory: string): Promise<string> {
  let current = directory;

  for (;;) {
    try {
      return await realpath(current);
    } catch {
      const parent = dirname(current);

      if (parent === current) {
        throw new RepositoryWorkspaceError("target directory is unavailable");
      }

      current = parent;
    }
  }
}

async function readExistingFile(
  absolutePath: string,
): Promise<string | undefined> {
  try {
    return await readFile(absolutePath, "utf8");
  } catch {
    return undefined;
  }
}

async function restore(restorePoints: readonly RestorePoint[]): Promise<void> {
  for (const point of [...restorePoints].reverse()) {
    try {
      if (point.previousContent === undefined) {
        await rm(point.absolutePath, { force: true });
      } else {
        await writeFile(point.absolutePath, point.previousContent, "utf8");
      }
    } catch (error) {
      logger.error("Failed to restore repository file after failed mutation", {
        cause: describeError(error),
      });
    }
  }
}

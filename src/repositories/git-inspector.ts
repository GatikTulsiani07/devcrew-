import { spawn } from "node:child_process";
import { isAbsolute } from "node:path";

import { describeError, logger } from "../observability/logger.js";

export type GitFileStatus =
  | "ADDED"
  | "MODIFIED"
  | "DELETED"
  | "RENAMED"
  | "UNTRACKED"
  | "UNKNOWN";

export interface GitChangedFile {
  path: string;
  status: GitFileStatus;
  additions?: number;
  deletions?: number;
}

export interface GitDiffSummary {
  filesChanged: number;
  additions?: number;
  deletions?: number;
}

export interface GitChangeEvidence {
  files: readonly GitChangedFile[];
  summary: GitDiffSummary;
  diff?: string;
}

export interface GitCommandResult {
  stdout: string;
  exitCode: number | null;
  timedOut: boolean;
  outputLimitExceeded: boolean;
  started: boolean;
}

export interface GitCommandRunner {
  run(args: readonly string[], cwd: string): Promise<GitCommandResult>;
}

export interface GitInspector {
  assertCleanBaseline(repositoryRoot: string): Promise<void>;
  captureEvidence(repositoryRoot: string): Promise<GitChangeEvidence>;
}

export const GIT_EXECUTABLE = "git";
export const GIT_TIMEOUT_MS = 20_000;
export const MAX_GIT_OUTPUT_BYTES = 256 * 1024;
export const MAX_DIFF_BYTES = 64 * 1024;
export const MAX_CHANGED_FILES = 24;
export const DIFF_TRUNCATION_NOTICE = "\n[diff truncated by Devcrew]\n";

const statusArgs: readonly string[] = [
  "status",
  "--porcelain=v1",
  "-z",
  "--untracked-files=all",
  "--no-renames",
];

const trackedNumstatArgs: readonly string[] = [
  "diff",
  "--numstat",
  "-z",
  "--no-color",
  "--no-ext-diff",
];

const trackedPatchArgs: readonly string[] = [
  "diff",
  "--no-color",
  "--no-ext-diff",
];

function untrackedDiffArgs(path: string): readonly string[] {
  return [
    "diff",
    "--no-index",
    "--numstat",
    "--patch",
    "--no-color",
    "--no-ext-diff",
    "--",
    "/dev/null",
    path,
  ];
}

export class GitInspectionError extends Error {
  constructor(readonly reason: string) {
    super(`Git inspection failed: ${reason}`);
    this.name = "GitInspectionError";
  }
}

export function createControlledGitCommandRunner({
  timeoutMs = GIT_TIMEOUT_MS,
  maxOutputBytes = MAX_GIT_OUTPUT_BYTES,
}: {
  timeoutMs?: number;
  maxOutputBytes?: number;
} = {}): GitCommandRunner {
  return {
    run(args, cwd) {
      return new Promise((resolve) => {
        if (!isAbsolute(cwd)) {
          resolve(failedCommand());
          return;
        }

        let child: ReturnType<typeof spawn>;

        try {
          child = spawn(GIT_EXECUTABLE, [...args], {
            cwd,
            shell: false,
            stdio: ["ignore", "pipe", "pipe"],
            env: {
              NODE_ENV: "production",
              PATH: process.env.PATH ?? "/usr/local/bin:/usr/bin:/bin",
              GIT_TERMINAL_PROMPT: "0",
              GIT_OPTIONAL_LOCKS: "0",
              GIT_CONFIG_NOSYSTEM: "1",
              GIT_CONFIG_GLOBAL: "/dev/null",
              GIT_CONFIG_SYSTEM: "/dev/null",
            },
          });
        } catch (error) {
          logger.error("Failed to spawn Git inspection command", {
            cause: describeError(error),
          });
          resolve(failedCommand());
          return;
        }

        let stdout = Buffer.alloc(0);
        let outputLimitExceeded = false;
        let timedOut = false;
        let settled = false;

        child.stdout?.on("data", (chunk: Buffer) => {
          const remaining = maxOutputBytes - stdout.length;

          if (chunk.length > remaining) {
            outputLimitExceeded = true;
            stdout = Buffer.concat([stdout, chunk.subarray(0, Math.max(remaining, 0))]);
            return;
          }

          stdout = Buffer.concat([stdout, chunk]);
        });
        child.stderr?.on("data", () => {
          // Git stderr is never surfaced as evidence.
        });

        const finish = (exitCode: number | null, started: boolean) => {
          if (settled) {
            return;
          }
          settled = true;
          clearTimeout(timeout);
          resolve({
            stdout: stdout.toString("utf8"),
            exitCode,
            timedOut,
            outputLimitExceeded,
            started,
          });
        };

        const timeout = setTimeout(() => {
          timedOut = true;
          child.kill("SIGKILL");
        }, timeoutMs);

        child.once("error", () => finish(null, false));
        child.once("close", (exitCode) => finish(exitCode, true));
      });
    },
  };
}

export function createControlledGitInspector({
  runner = createControlledGitCommandRunner(),
  maxDiffBytes = MAX_DIFF_BYTES,
  maxChangedFiles = MAX_CHANGED_FILES,
}: {
  runner?: GitCommandRunner;
  maxDiffBytes?: number;
  maxChangedFiles?: number;
} = {}): GitInspector {
  async function readStatus(
    repositoryRoot: string,
  ): Promise<readonly GitChangedFile[]> {
    const result = await run(runner, statusArgs, repositoryRoot, [0]);

    return parseStatusOutput(result.stdout);
  }

  return {
    async assertCleanBaseline(repositoryRoot) {
      const files = await readStatus(repositoryRoot);

      if (files.length > 0) {
        throw new GitInspectionError("prepared repository baseline is not clean");
      }
    },

    async captureEvidence(repositoryRoot) {
      const files = await readStatus(repositoryRoot);

      if (files.length === 0) {
        throw new GitInspectionError("repository reported no changes");
      }

      if (files.length > maxChangedFiles) {
        throw new GitInspectionError("changed file limit exceeded");
      }

      const stats = parseNumstatOutput(
        (await run(runner, trackedNumstatArgs, repositoryRoot, [0, 1])).stdout,
      );
      const patches: string[] = [
        (await run(runner, trackedPatchArgs, repositoryRoot, [0, 1])).stdout,
      ];
      const enriched: GitChangedFile[] = [];

      for (const file of files) {
        if (file.status === "UNTRACKED") {
          const untracked = await run(
            runner,
            untrackedDiffArgs(file.path),
            repositoryRoot,
            [0, 1],
          );
          const parsed = parseUntrackedDiff(untracked.stdout);

          patches.push(parsed.patch);
          enriched.push({ ...file, ...parsed.stats });
          continue;
        }

        const trackedStats = stats.get(file.path);
        enriched.push(trackedStats === undefined ? file : { ...file, ...trackedStats });
      }

      const diff = boundDiff(sanitizeDiff(patches.join("")), maxDiffBytes);

      return {
        files: enriched,
        summary: summarize(enriched),
        ...(diff === "" ? {} : { diff }),
      };
    },
  };
}

async function run(
  runner: GitCommandRunner,
  args: readonly string[],
  repositoryRoot: string,
  acceptedExitCodes: readonly number[],
): Promise<GitCommandResult> {
  const result = await runner.run(args, repositoryRoot);

  if (
    !result.started ||
    result.timedOut ||
    result.outputLimitExceeded ||
    result.exitCode === null ||
    !acceptedExitCodes.includes(result.exitCode)
  ) {
    logger.error("Git inspection command failed", {
      command: args[0],
      exitCode: result.exitCode,
      timedOut: result.timedOut,
      outputLimitExceeded: result.outputLimitExceeded,
      started: result.started,
    });
    throw new GitInspectionError("git inspection command failed");
  }

  return result;
}

export function parseStatusOutput(stdout: string): readonly GitChangedFile[] {
  const records = stdout.split("\0").filter((record) => record !== "");
  const files: GitChangedFile[] = [];

  for (const record of records) {
    if (record.length < 4) {
      throw new GitInspectionError("malformed git status output");
    }

    const code = record.slice(0, 2);
    const path = record.slice(3);

    if (!isSafeEvidencePath(path)) {
      throw new GitInspectionError("unsafe path in git status output");
    }

    files.push({ path, status: mapStatusCode(code) });
  }

  return files;
}

function mapStatusCode(code: string): GitFileStatus {
  if (code === "??") {
    return "UNTRACKED";
  }

  const flags = code.replace(/ /g, "");

  if (flags.includes("R")) {
    return "RENAMED";
  }
  if (flags.includes("D")) {
    return "DELETED";
  }
  if (flags.includes("A")) {
    return "ADDED";
  }
  if (flags.includes("M")) {
    return "MODIFIED";
  }

  return "UNKNOWN";
}

export function parseNumstatOutput(
  stdout: string,
): Map<string, { additions?: number; deletions?: number }> {
  const tokens = stdout.split("\0");
  const stats = new Map<string, { additions?: number; deletions?: number }>();

  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];

    if (token === "") {
      continue;
    }

    const match = /^(\d+|-)\t(\d+|-)\t(.*)$/.exec(token);

    if (match === null) {
      throw new GitInspectionError("malformed git numstat output");
    }

    let path = match[3];

    if (path === "") {
      path = tokens[index + 2] ?? "";
      index += 2;
    }

    if (!isSafeEvidencePath(path)) {
      throw new GitInspectionError("unsafe path in git numstat output");
    }

    stats.set(path, toStats(match[1], match[2]));
  }

  return stats;
}

function parseUntrackedDiff(stdout: string): {
  stats: { additions?: number; deletions?: number };
  patch: string;
} {
  const newlineIndex = stdout.indexOf("\n");

  if (newlineIndex === -1) {
    return { stats: {}, patch: stdout };
  }

  const firstLine = stdout.slice(0, newlineIndex);
  const match = /^(\d+|-)\t(\d+|-)\t/.exec(firstLine);

  if (match === null) {
    return { stats: {}, patch: stdout };
  }

  return {
    stats: toStats(match[1], match[2]),
    patch: stdout.slice(newlineIndex + 1),
  };
}

function toStats(
  additions: string,
  deletions: string,
): { additions?: number; deletions?: number } {
  if (additions === "-" || deletions === "-") {
    return {};
  }

  return {
    additions: Number.parseInt(additions, 10),
    deletions: Number.parseInt(deletions, 10),
  };
}

function summarize(files: readonly GitChangedFile[]): GitDiffSummary {
  const measurable = files.filter(
    (file) => file.additions !== undefined && file.deletions !== undefined,
  );

  if (measurable.length !== files.length) {
    return { filesChanged: files.length };
  }

  return {
    filesChanged: files.length,
    additions: measurable.reduce((total, file) => total + (file.additions ?? 0), 0),
    deletions: measurable.reduce((total, file) => total + (file.deletions ?? 0), 0),
  };
}

export function isSafeEvidencePath(path: string): boolean {
  return (
    path !== "" &&
    !path.includes("\0") &&
    !isAbsolute(path) &&
    !/^[A-Za-z]:[\\/]/.test(path) &&
    !path.split("/").includes("..") &&
    !/[\u0000-\u001f\u007f]/.test(path)
  );
}

export function sanitizeDiff(diff: string): string {
  const sanitized = diff
    .replace(/\u001b\[[0-9;?]*[ -/]*[@-~]/g, "")
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "\uFFFD");

  if (/(?:\/Users\/|\/home\/|\/private\/tmp|[A-Za-z]:\\)/.test(sanitized)) {
    throw new GitInspectionError("diff evidence contains a host path");
  }

  return sanitized;
}

function boundDiff(diff: string, maxDiffBytes: number): string {
  if (Buffer.byteLength(diff, "utf8") <= maxDiffBytes) {
    return diff;
  }

  return `${Buffer.from(diff, "utf8")
    .subarray(0, maxDiffBytes)
    .toString("utf8")}${DIFF_TRUNCATION_NOTICE}`;
}

function failedCommand(): GitCommandResult {
  return {
    stdout: "",
    exitCode: null,
    timedOut: false,
    outputLimitExceeded: false,
    started: false,
  };
}

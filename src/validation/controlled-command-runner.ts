import { spawn } from "node:child_process";
import { isAbsolute } from "node:path";

import type {
  CommandRunResult,
  ControlledCommandRunner,
  ValidationCheckDefinition,
} from "./types.js";

const MAX_OUTPUT_BYTES = 16 * 1024;
const FORCE_KILL_DELAY_MS = 100;

export interface ControlledCommandRunnerOptions {
  maxOutputBytes?: number;
  environment?: NodeJS.ProcessEnv;
}

export function createControlledCommandRunner({
  maxOutputBytes = MAX_OUTPUT_BYTES,
  environment = {
    CI: "true",
    NODE_ENV: "test",
    PATH: process.env.PATH ?? "/usr/local/bin:/usr/bin:/bin",
  },
}: ControlledCommandRunnerOptions = {}): ControlledCommandRunner {
  return {
    run(check, cwd) {
      if (
        !check ||
        !isAbsolute(cwd) ||
        typeof check.executable !== "string" ||
        check.executable.length === 0 ||
        !Array.isArray(check.args) ||
        check.args.some((arg) => typeof arg !== "string") ||
        !Number.isInteger(check.timeoutMs) ||
        check.timeoutMs <= 0 ||
        maxOutputBytes <= 0
      ) {
        return Promise.resolve(failedResult(false, false, false));
      }
      return runCommand(check, cwd, maxOutputBytes, environment);
    },
  };
}

function runCommand(
  check: ValidationCheckDefinition,
  cwd: string,
  maxOutputBytes: number,
  environment: NodeJS.ProcessEnv,
): Promise<CommandRunResult> {
  return new Promise((resolve) => {
    let child: ReturnType<typeof spawn>;
    try {
      child = spawn(check.executable, [...check.args], {
        cwd,
        env: { ...environment },
        shell: false,
        stdio: ["ignore", "pipe", "pipe"],
      });
    } catch {
      resolve(failedResult(false, false, false));
      return;
    }

    let stdout: Uint8Array = new Uint8Array();
    let stderr: Uint8Array = new Uint8Array();
    let outputLimitExceeded = false;
    let timedOut = false;
    let settled = false;
    let forceKillTimer: NodeJS.Timeout | undefined;

    const append = (current: Uint8Array, chunk: Uint8Array): Uint8Array => {
      const remaining = maxOutputBytes - current.length;
      if (remaining <= 0) {
        outputLimitExceeded = true;
        return current;
      }
      if (chunk.length > remaining) {
        outputLimitExceeded = true;
        return Buffer.concat([current, chunk.subarray(0, remaining)]);
      }
      return Buffer.concat([current, chunk]);
    };

    child.stdout?.on("data", (chunk: Buffer) => {
      stdout = append(stdout, chunk);
    });
    child.stderr?.on("data", (chunk: Buffer) => {
      stderr = append(stderr, chunk);
    });

    const finish = (exitCode: number | null, started: boolean) => {
      if (settled) return;
      settled = true;
      if (forceKillTimer !== undefined) clearTimeout(forceKillTimer);
      const safeStdout = sanitizeOutput(Buffer.from(stdout).toString("utf8"));
      const safeStderr = sanitizeOutput(Buffer.from(stderr).toString("utf8"));
      const unsafeEvidence = safeStdout.unsafe || safeStderr.unsafe;
      const passed =
        started &&
        !timedOut &&
        !outputLimitExceeded &&
        !unsafeEvidence &&
        exitCode === 0;

      resolve({
        status: passed ? "PASSED" : "FAILED",
        exitCode,
        timedOut,
        started,
        outputLimitExceeded,
        unsafeEvidence,
        stdout: safeStdout.value,
        stderr: safeStderr.value,
      });
    };

    child.once("error", () => finish(null, false));
    child.once("close", (exitCode) => finish(exitCode, true));

    const timeout = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
      forceKillTimer = setTimeout(() => {
        if (!settled) child.kill("SIGKILL");
      }, FORCE_KILL_DELAY_MS);
    }, check.timeoutMs);

    child.once("close", () => clearTimeout(timeout));
    child.once("error", () => clearTimeout(timeout));
  });
}

function failedResult(
  started: boolean,
  timedOut: boolean,
  outputLimitExceeded: boolean,
): CommandRunResult {
  return {
    status: "FAILED",
    exitCode: null,
    timedOut,
    started,
    outputLimitExceeded,
    unsafeEvidence: false,
    stdout: "",
    stderr: "",
  };
}

function sanitizeOutput(value: string): { value: string; unsafe: boolean } {
  const absolutePathPattern =
    /(?:^|[\s"'=])(\/(?:Users|private|tmp|home|var|opt|workspace|server)\/(?:[^\s"']+))/g;
  const unsafe =
    /(?:bearer\s+[a-z0-9._~+/=-]+|(?:api[_-]?key|authorization|token|secret)\s*[:=]\s*\S+|[A-Za-z]:\\\S+)/i.test(
      value,
    ) || new RegExp(absolutePathPattern.source).test(value);
  return {
    value: value
      .replace(/Bearer\s+\S+/gi, "Bearer [REDACTED]")
      .replace(/(?:api[_-]?key|authorization|token|secret)\s*[:=]\s*\S+/gi, "[REDACTED]")
      .replace(absolutePathPattern, "[PATH REDACTED]")
      .replace(/[A-Za-z]:\\[^\s"']+/g, "[PATH REDACTED]"),
    unsafe,
  };
}

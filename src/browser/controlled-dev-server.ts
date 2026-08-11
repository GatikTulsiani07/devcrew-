import { spawn } from "node:child_process";
import { isAbsolute } from "node:path";

import { describeError, logger } from "../observability/logger.js";
import {
  isTaskCancellationError,
  throwIfSignalCancelled,
} from "../tasks/task-cancellation.js";
import type {
  BrowserVerificationProfile,
  ControlledDevServer,
  DevServerChildProcess,
  DevServerSpawner,
  RunningDevServer,
} from "./browser-types.js";
import { localhostUrlForProfile } from "./controlled-browser-verifier.js";

export class ControlledDevServerError extends Error {
  constructor(readonly reason: string) {
    super(`Controlled development server failed: ${reason}`);
    this.name = "ControlledDevServerError";
  }
}

export const DEV_SERVER_OUTPUT_LIMIT_BYTES = 16 * 1024;

export const browserVerificationProfiles: readonly BrowserVerificationProfile[] = [
  {
    id: "next_localhost",
    executable: "npm",
    args: ["run", "dev:ui", "--", "--hostname", "127.0.0.1", "--port", "43117"],
    host: "127.0.0.1",
    port: 43117,
    path: "/",
    startupTimeoutMs: 20_000,
    pollIntervalMs: 250,
    navigationTimeoutMs: 8_000,
    shutdownTimeoutMs: 1_000,
  },
];

export interface ControlledDevServerDependencies {
  profiles?: readonly BrowserVerificationProfile[];
  fetchImpl?: typeof fetch;
  spawner?: DevServerSpawner;
  environment?: NodeJS.ProcessEnv;
  maxOutputBytes?: number;
}

export function createControlledDevServer({
  profiles = browserVerificationProfiles,
  fetchImpl = globalThis.fetch,
  spawner = (executable, args, options) =>
    spawn(executable, [...args], options) as DevServerChildProcess,
  environment = {
    NODE_ENV: "development",
    CI: "true",
    HOST: "127.0.0.1",
    PATH: process.env.PATH ?? "/usr/local/bin:/usr/bin:/bin",
  },
  maxOutputBytes = DEV_SERVER_OUTPUT_LIMIT_BYTES,
}: ControlledDevServerDependencies = {}): ControlledDevServer {
  return {
    async start(input) {
      throwIfSignalCancelled(input.signal);
      const profile = resolveProfile(profiles, input.profileId);

      if (!isAbsolute(input.repositoryRoot)) {
        throw new ControlledDevServerError("repository root is not absolute");
      }

      const url = localhostUrlForProfile(profile);
      let child: DevServerChildProcess;

      try {
        child = spawner(profile.executable, profile.args, {
          cwd: input.repositoryRoot,
          env: { ...environment, PORT: String(profile.port) },
          shell: false,
          stdio: ["ignore", "pipe", "pipe"],
        });
      } catch (error) {
        logger.error("Failed to spawn controlled development server", {
          profileId: profile.id,
          cause: describeError(error),
        });
        throw new ControlledDevServerError("server spawn failed");
      }

      const monitor = monitorProcess(child, maxOutputBytes);

      try {
        await waitForReadiness({
          url,
          fetchImpl,
          timeoutMs: profile.startupTimeoutMs,
          pollIntervalMs: profile.pollIntervalMs,
          monitor,
          signal: input.signal,
        });
      } catch (error) {
        await stopOwnedProcess(child, profile.shutdownTimeoutMs).catch(
          (cleanupError: unknown) => {
            logger.error("Failed to clean up development server after startup failure", {
              profileId: profile.id,
              cause: describeError(cleanupError),
            });
          },
        );

        if (error instanceof ControlledDevServerError) {
          throw error;
        }

        if (isTaskCancellationError(error)) {
          throw error;
        }

        throw new ControlledDevServerError("server readiness failed");
      }

      return {
        url,
        async stop() {
          await stopOwnedProcess(child, profile.shutdownTimeoutMs);
        },
      } satisfies RunningDevServer;
    },
  };
}

function resolveProfile(
  profiles: readonly BrowserVerificationProfile[],
  profileId: string,
): BrowserVerificationProfile {
  const profile = profiles.find((candidate) => candidate.id === profileId);

  if (profile === undefined || !isValidProfile(profile)) {
    throw new ControlledDevServerError("unsupported development server profile");
  }

  return profile;
}

function isValidProfile(profile: BrowserVerificationProfile): boolean {
  return (
    profile.executable === "npm" &&
    profile.args.length > 0 &&
    profile.args.every((arg) => typeof arg === "string" && arg.length > 0) &&
    profile.host === "127.0.0.1" &&
    Number.isInteger(profile.port) &&
    profile.port > 1024 &&
    profile.port < 65536 &&
    profile.path === "/" &&
    Number.isInteger(profile.startupTimeoutMs) &&
    profile.startupTimeoutMs > 0 &&
    Number.isInteger(profile.pollIntervalMs) &&
    profile.pollIntervalMs > 0 &&
    Number.isInteger(profile.shutdownTimeoutMs) &&
    profile.shutdownTimeoutMs > 0
  );
}

function monitorProcess(child: DevServerChildProcess, maxOutputBytes: number) {
  let exited = false;
  let outputBytes = 0;

  child.once("exit", () => {
    exited = true;
  });
  child.once("close", () => {
    exited = true;
  });
  child.once("error", () => {
    exited = true;
  });
  child.stdout?.on("data", (chunk: Buffer) => {
    outputBytes += chunk.length;
  });
  child.stderr?.on("data", (chunk: Buffer) => {
    outputBytes += chunk.length;
  });

  return {
    exited() {
      return exited;
    },
    outputLimitExceeded() {
      return outputBytes > maxOutputBytes;
    },
  };
}

async function waitForReadiness({
  url,
  fetchImpl,
  timeoutMs,
  pollIntervalMs,
  monitor,
  signal,
}: {
  url: string;
  fetchImpl: typeof fetch;
  timeoutMs: number;
  pollIntervalMs: number;
  monitor: { exited(): boolean; outputLimitExceeded(): boolean };
  signal?: AbortSignal;
}): Promise<void> {
  const startedAt = Date.now();

  while (Date.now() - startedAt <= timeoutMs) {
    throwIfSignalCancelled(signal);
    if (monitor.exited()) {
      throw new ControlledDevServerError("server exited before readiness");
    }

    if (monitor.outputLimitExceeded()) {
      throw new ControlledDevServerError("server output limit exceeded");
    }

    try {
      const response = await fetchImpl(url, {
        method: "GET",
        redirect: "manual",
        signal: timeoutOrCancellationSignal(Math.min(1_000, pollIntervalMs), signal),
      });

      if (response.ok) {
        return;
      }
    } catch {
      throwIfSignalCancelled(signal);
      // The server is expected to refuse connections until it is ready.
    }

    await delay(pollIntervalMs, signal);
  }

  throw new ControlledDevServerError("server startup timed out");
}

async function stopOwnedProcess(
  child: DevServerChildProcess,
  shutdownTimeoutMs: number,
): Promise<void> {
  if (child.killed === true) {
    return;
  }

  let closed = false;
  const closedPromise = new Promise<void>((resolve) => {
    child.once("exit", () => {
      closed = true;
      resolve();
    });
    child.once("close", () => {
      closed = true;
      resolve();
    });
  });

  child.kill("SIGTERM");

  await Promise.race([closedPromise, delay(shutdownTimeoutMs)]);

  if (!closed) {
    child.kill("SIGKILL");
    await Promise.race([closedPromise, delay(shutdownTimeoutMs)]);
  }
}

function delay(ms: number, signal?: AbortSignal): Promise<void> {
  throwIfSignalCancelled(signal);

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      cleanup();
      resolve();
    }, ms);
    const onAbort = () => {
      cleanup();
      reject(signal?.reason ?? new Error("Operation cancelled"));
    };
    const cleanup = () => {
      clearTimeout(timeout);
      signal?.removeEventListener("abort", onAbort);
    };

    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

function timeoutOrCancellationSignal(
  ms: number,
  signal?: AbortSignal,
): AbortSignal {
  if (signal === undefined) {
    return AbortSignal.timeout(ms);
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), ms);
  const onAbort = () => {
    clearTimeout(timeout);
    controller.abort(signal.reason);
  };

  signal.addEventListener("abort", onAbort, { once: true });
  controller.signal.addEventListener(
    "abort",
    () => {
      clearTimeout(timeout);
      signal.removeEventListener("abort", onAbort);
    },
    { once: true },
  );
  return controller.signal;
}

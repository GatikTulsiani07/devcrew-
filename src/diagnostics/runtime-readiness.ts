import { execFile } from "node:child_process";
import { constants as fsConstants } from "node:fs";
import { access } from "node:fs/promises";
import { tmpdir } from "node:os";

import {
  type ManagedScreenshotArtifactStore,
} from "../browser/browser-types.js";
import {
  createScreenshotArtifactStore,
} from "../browser/screenshot-store.js";

export type RuntimeReadinessStatus = "READY" | "DEGRADED";

export interface RuntimeReadinessCapabilities {
  gitAvailable: boolean;
  githubConfigured: boolean;
  openaiConfigured: boolean;
  browserAvailable: boolean;
  artifactStorageAvailable: boolean;
}

export interface RuntimeReadinessSnapshot {
  status: RuntimeReadinessStatus;
  capabilities: RuntimeReadinessCapabilities;
}

export interface RuntimeReadinessDiagnostics {
  check(): Promise<RuntimeReadinessSnapshot>;
}

export interface RuntimeReadinessDependencies {
  environment?: Record<string, string | undefined>;
  gitProbe?: () => Promise<boolean>;
  browserProbe?: () => Promise<boolean>;
  artifactStorageProbe?: () => Promise<boolean>;
  artifactStore?: ManagedScreenshotArtifactStore;
  timeoutMs?: number;
}

export const RUNTIME_READINESS_TIMEOUT_MS = 2_500;

const probePngBytes = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00,
]);

export function createRuntimeReadinessDiagnostics({
  environment = process.env,
  gitProbe = checkGitAvailable,
  browserProbe = () => checkBrowserAvailable(environment),
  artifactStore = createScreenshotArtifactStore(),
  artifactStorageProbe = () => checkArtifactStorageAvailable(artifactStore),
  timeoutMs = RUNTIME_READINESS_TIMEOUT_MS,
}: RuntimeReadinessDependencies = {}): RuntimeReadinessDiagnostics {
  return {
    async check(): Promise<RuntimeReadinessSnapshot> {
      const [
        gitAvailable,
        browserAvailable,
        artifactStorageAvailable,
      ] = await Promise.all([
        boundedBoolean(gitProbe, timeoutMs),
        boundedBoolean(browserProbe, timeoutMs),
        boundedBoolean(artifactStorageProbe, timeoutMs),
      ]);
      const capabilities: RuntimeReadinessCapabilities = {
        gitAvailable,
        githubConfigured: hasConfiguredSecret(environment.GITHUB_TOKEN),
        openaiConfigured: hasConfiguredSecret(environment.OPENAI_API_KEY),
        browserAvailable,
        artifactStorageAvailable,
      };

      return {
        status: Object.values(capabilities).every(Boolean) ? "READY" : "DEGRADED",
        capabilities,
      };
    },
  };
}

export function hasConfiguredSecret(value: string | undefined): boolean {
  return value !== undefined && value.trim() !== "";
}

export async function checkGitAvailable(): Promise<boolean> {
  return new Promise((resolve) => {
    const child = execFile(
      "git",
      ["--version"],
      {
        cwd: tmpdir(),
        shell: false,
        timeout: RUNTIME_READINESS_TIMEOUT_MS,
        maxBuffer: 256,
        env: {
          NODE_ENV: "production",
          PATH: process.env.PATH ?? "/usr/local/bin:/usr/bin:/bin",
          GIT_TERMINAL_PROMPT: "0",
          GIT_OPTIONAL_LOCKS: "0",
          GIT_CONFIG_NOSYSTEM: "1",
          GIT_CONFIG_GLOBAL: "/dev/null",
          GIT_CONFIG_SYSTEM: "/dev/null",
        },
      },
      (error: Error | null) => {
        resolve(error === null);
      },
    );

    child.stdout?.resume();
    child.stderr?.resume();
  });
}

export async function checkBrowserAvailable(
  environment: Record<string, string | undefined> = process.env,
): Promise<boolean> {
  const configuredPath = environment.DEVCREW_BROWSER_EXECUTABLE_PATH?.trim();

  if (configuredPath !== undefined && configuredPath !== "") {
    return executableExists(configuredPath);
  }

  try {
    const { chromium } = await import("playwright-core");
    const executablePath = chromium.executablePath();
    return executableExists(executablePath);
  } catch {
    return false;
  }
}

export async function checkArtifactStorageAvailable(
  store: ManagedScreenshotArtifactStore = createScreenshotArtifactStore(),
): Promise<boolean> {
  let artifact:
    | Awaited<ReturnType<ManagedScreenshotArtifactStore["store"]>>
    | undefined;

  try {
    artifact = await store.store({
      projectId: "readiness",
      taskId: "artifact_storage",
      pngBytes: probePngBytes,
    });
    return (
      (await store.delete({
        projectId: "readiness",
        taskId: "artifact_storage",
        artifactId: artifact.artifactId,
      })) === "DELETED"
    );
  } catch {
    return false;
  } finally {
    if (artifact !== undefined) {
      await store
        .delete({
          projectId: "readiness",
          taskId: "artifact_storage",
          artifactId: artifact.artifactId,
        })
        .catch(() => undefined);
    }
  }
}

async function boundedBoolean(
  probe: () => Promise<boolean>,
  timeoutMs: number,
): Promise<boolean> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      probe(),
      new Promise<boolean>((resolve) => {
        timeout = setTimeout(() => resolve(false), timeoutMs);
      }),
    ]);
  } catch {
    return false;
  } finally {
    if (timeout !== undefined) {
      clearTimeout(timeout);
    }
  }
}

async function executableExists(path: string): Promise<boolean> {
  try {
    await access(path, fsConstants.X_OK);
    return true;
  } catch {
    return false;
  }
}

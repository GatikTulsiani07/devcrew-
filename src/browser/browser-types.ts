import type { Readable } from "node:stream";

export interface BrowserVerificationEvidence {
  status: "PASSED";
  url: string;
  pageTitle?: string;
  verifiedAt: string;
  durationMs?: number;
}

export interface ScreenshotViewport {
  width: number;
  height: number;
}

export interface BrowserScreenshotEvidence {
  status: "CAPTURED";
  id: string;
  url: string;
  viewport: ScreenshotViewport;
  capturedAt: string;
  durationMs?: number;
}

export interface BrowserVerificationProfile {
  id: string;
  executable: string;
  args: readonly string[];
  host: "127.0.0.1" | "localhost";
  port: number;
  path: "/";
  startupTimeoutMs: number;
  pollIntervalMs: number;
  navigationTimeoutMs: number;
  shutdownTimeoutMs: number;
}

export interface RunningDevServer {
  url: string;
  stop(): Promise<void>;
}

export interface ControlledDevServer {
  start(input: {
    profileId: string;
    repositoryRoot: string;
    signal?: AbortSignal;
  }): Promise<RunningDevServer>;
}

export interface BrowserPageMetadata {
  url: string;
  pageTitle?: string;
}

export interface BrowserAdapter {
  verify(input: {
    url: string;
    expectedOrigin: string;
    timeoutMs: number;
    signal?: AbortSignal;
  }): Promise<BrowserPageMetadata>;
}

export interface BrowserScreenshotResult {
  url: string;
  pngBytes: Uint8Array;
}

export interface BrowserRenderer {
  captureScreenshot(input: {
    url: string;
    expectedOrigin: string;
    viewport: ScreenshotViewport;
    timeoutMs: number;
    maxBytes: number;
    signal?: AbortSignal;
  }): Promise<BrowserScreenshotResult>;
}

export interface StoredScreenshotArtifact {
  artifactId: string;
  absolutePath: string;
  byteCount: number;
}

export interface ScreenshotArtifactMetadata {
  artifactId: string;
  projectId: string;
  taskId: string;
  createdAt: string;
  byteCount: number;
}

export interface LoadedScreenshotArtifact {
  artifactId: string;
  pngBytes: Uint8Array;
  byteCount: number;
}

export interface ScreenshotArtifactStore {
  store(input: {
    projectId: string;
    taskId: string;
    pngBytes: Uint8Array;
    repositoryRoot?: string;
  }): Promise<StoredScreenshotArtifact>;
  load(input: {
    projectId: string;
    taskId: string;
    artifactId: string;
  }): Promise<LoadedScreenshotArtifact>;
}

export interface ManagedScreenshotArtifactStore extends ScreenshotArtifactStore {
  list(): Promise<ScreenshotArtifactMetadata[]>;
  delete(input: {
    projectId: string;
    taskId: string;
    artifactId: string;
  }): Promise<"DELETED" | "MISSING" | "FAILED">;
}

export interface DevServerChildProcess {
  pid?: number;
  stdout?: Readable | null;
  stderr?: Readable | null;
  killed?: boolean;
  kill(signal?: NodeJS.Signals): boolean;
  once(event: "exit" | "close", listener: (code: number | null) => void): this;
  once(event: "error", listener: (error: Error) => void): this;
}

export type DevServerSpawner = (
  executable: string,
  args: readonly string[],
  options: {
    cwd: string;
    env: NodeJS.ProcessEnv;
    shell: false;
    stdio: ["ignore", "pipe", "pipe"];
  },
) => DevServerChildProcess;

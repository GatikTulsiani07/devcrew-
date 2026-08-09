import type { Readable } from "node:stream";

export interface BrowserVerificationEvidence {
  status: "PASSED";
  url: string;
  pageTitle?: string;
  verifiedAt: string;
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
  }): Promise<BrowserPageMetadata>;
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

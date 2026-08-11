export interface ValidationCheckDefinition {
  name: string;
  executable: string;
  args: readonly string[];
  timeoutMs: number;
}

export interface ValidationProfile {
  id: string;
  checks: readonly ValidationCheckDefinition[];
}

export interface CommandRunResult {
  status: "PASSED" | "FAILED";
  exitCode: number | null;
  timedOut: boolean;
  started: boolean;
  outputLimitExceeded: boolean;
  unsafeEvidence: boolean;
  stdout: string;
  stderr: string;
}

export interface ControlledCommandRunner {
  run(
    check: ValidationCheckDefinition,
    cwd: string,
    options?: { signal?: AbortSignal },
  ): Promise<CommandRunResult>;
}

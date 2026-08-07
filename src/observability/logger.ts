export interface LogContext {
  [key: string]: unknown;
}

export interface Logger {
  error(message: string, context?: LogContext): void;
}

interface DescribedError {
  name: string;
  message: string;
  stack?: string;
}

/**
 * Normalizes an unknown thrown value into a structured, log-safe shape so the
 * original failure cause is preserved for operators instead of being discarded.
 */
export function describeError(error: unknown): DescribedError {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      ...(error.stack === undefined ? {} : { stack: error.stack }),
    };
  }

  return {
    name: "NonError",
    message: typeof error === "string" ? error : JSON.stringify(error),
  };
}

/**
 * A console-backed structured logger. Output is intentionally server-side only:
 * it records the underlying cause of failures that are otherwise sanitized
 * before reaching clients. Silenced under `NODE_ENV=test` to keep test output
 * clean; inject a custom logger to assert on logging in tests.
 */
export function createConsoleLogger(): Logger {
  return {
    error(message, context) {
      if (process.env.NODE_ENV === "test") return;

      console.error(
        JSON.stringify({
          level: "error",
          message,
          ...(context ?? {}),
        }),
      );
    },
  };
}

export const logger: Logger = createConsoleLogger();

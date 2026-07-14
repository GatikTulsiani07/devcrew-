import type { Context } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";

export interface ErrorBody {
  status: "error";
  error: {
    code: string;
    message: string;
  };
}

export class ApplicationError extends Error {
  constructor(
    readonly code: string,
    readonly status: ContentfulStatusCode,
    message: string,
  ) {
    super(message);
    this.name = "ApplicationError";
  }
}

export function jsonError(c: Context, error: ApplicationError) {
  return c.json<ErrorBody>(
    {
      status: "error",
      error: {
        code: error.code,
        message: error.message,
      },
    },
    error.status,
  );
}

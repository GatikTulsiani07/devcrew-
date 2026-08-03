import type { Context } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";

type RequestContext = Context<{
  Variables: {
    requestId: string;
  };
}>;

export interface ErrorBody {
  requestId: string;
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

export function jsonError(c: RequestContext, error: ApplicationError) {
  const requestId = c.get("requestId");
  c.header("X-Request-Id", requestId);

  return c.json<ErrorBody>(
    {
      requestId,
      status: "error",
      error: {
        code: error.code,
        message: error.message,
      },
    },
    error.status,
  );
}

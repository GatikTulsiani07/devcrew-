import { Hono } from "hono";
import { z } from "zod";

import { ApplicationError } from "../errors.js";
import { projectIdSchema } from "../projects/contracts.js";
import type { ActivityReadService } from "./activity-service.js";
import type { ActivityEvent, ActivitySequence } from "./types.js";

type ActivityRoutesEnv = {
  Variables: {
    requestId: string;
  };
};

export interface ActivityRoutesOptions {
  heartbeatIntervalMs?: number;
}

const activityPathParamsSchema = z.object({
  projectId: projectIdSchema,
});

const afterSchema = z
  .string()
  .regex(/^(0|[1-9][0-9]*)$/)
  .transform((value) => Number(value));

export function createActivityRoutes(
  activityReadService: ActivityReadService,
  { heartbeatIntervalMs = 15_000 }: ActivityRoutesOptions = {},
): Hono<ActivityRoutesEnv> {
  const routes = new Hono<ActivityRoutesEnv>();

  routes.get("/:projectId/activity", async (c) => {
    const params = activityPathParamsSchema.safeParse({
      projectId: c.req.param("projectId"),
    });
    const after = parseOptionalCursor(c.req.query("after"));

    if (!params.success || after === undefined) {
      throw validationError();
    }

    const snapshot = await activityReadService.list(
      params.data.projectId,
      after,
    );
    return c.json(snapshot);
  });

  routes.get("/:projectId/activity/stream", async (c) => {
    const params = activityPathParamsSchema.safeParse({
      projectId: c.req.param("projectId"),
    });
    const after = parseStreamCursor(
      c.req.query("after"),
      c.req.header("Last-Event-ID"),
    );

    if (!params.success || after === undefined) {
      throw validationError();
    }

    const projectId = params.data.projectId;
    const missed = await activityReadService.list(projectId, after);
    const encoder = new TextEncoder();
    let subscription: { unsubscribe(): void } | undefined;
    let heartbeat: ReturnType<typeof setInterval> | undefined;

    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        for (const event of missed.events) {
          controller.enqueue(encoder.encode(formatSseEvent(event)));
        }

        subscription = await activityReadService.subscribe(projectId, (event) => {
          controller.enqueue(encoder.encode(formatSseEvent(event)));
        });

        heartbeat = setInterval(() => {
          controller.enqueue(encoder.encode(": heartbeat\n\n"));
        }, heartbeatIntervalMs);
      },
      cancel() {
        subscription?.unsubscribe();
        if (heartbeat !== undefined) {
          clearInterval(heartbeat);
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
        "X-Request-Id": c.get("requestId"),
      },
    });
  });

  return routes;
}

function parseOptionalCursor(value: string | undefined): ActivitySequence | undefined {
  if (value === undefined) {
    return 0;
  }

  const result = afterSchema.safeParse(value);
  return result.success ? result.data : undefined;
}

function parseStreamCursor(
  afterQuery: string | undefined,
  lastEventId: string | undefined,
): ActivitySequence | undefined {
  if (afterQuery !== undefined) {
    return parseOptionalCursor(afterQuery);
  }

  if (lastEventId !== undefined) {
    return parseOptionalCursor(lastEventId);
  }

  return 0;
}

function formatSseEvent(event: ActivityEvent): string {
  return [
    `id: ${event.sequence}`,
    `event: ${event.type}`,
    `data: ${JSON.stringify(event)}`,
    "",
    "",
  ].join("\n");
}

function validationError(): ApplicationError {
  return new ApplicationError(
    "VALIDATION_FAILED",
    400,
    "Request validation failed",
  );
}

import { serve } from "@hono/node-server";

import { createApp } from "./app.js";
import { runtimeEnv } from "./config/runtime.js";
import { closeDatabase, databaseHealth } from "./db/client.js";
import { describeError, logger } from "./observability/logger.js";

const app = createApp({ databaseHealth });

const server = serve(
  {
    fetch: app.fetch,
    port: runtimeEnv.PORT,
    hostname: runtimeEnv.HOST,
  },
  (info) => {
    console.log(
      `devcrew-backend listening on ${runtimeEnv.HOST}:${info.port}`,
    );
  },
);

async function shutdown(signal: string): Promise<void> {
  server.close();
  try {
    await closeDatabase();
  } catch (error) {
    logger.error("Failed to close database during shutdown", {
      signal,
      cause: describeError(error),
    });
    process.exitCode = 1;
  }
}

process.once("SIGINT", () => void shutdown("SIGINT"));
process.once("SIGTERM", () => void shutdown("SIGTERM"));

process.on("unhandledRejection", (reason) => {
  logger.error("Unhandled promise rejection", {
    cause: describeError(reason),
  });
});

process.on("uncaughtException", (error) => {
  logger.error("Uncaught exception", {
    cause: describeError(error),
  });
  process.exitCode = 1;
});

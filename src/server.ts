import { serve } from "@hono/node-server";

import { createApp } from "./app.js";
import { runtimeEnv } from "./config/runtime.js";
import { closeDatabase, databaseHealth } from "./db/client.js";

const app = createApp({ databaseHealth });

const server = serve(
  {
    fetch: app.fetch,
    port: runtimeEnv.PORT,
  },
  (info) => {
    console.log(`devcrew-backend listening on port ${info.port}`);
  },
);

async function shutdown(): Promise<void> {
  server.close();
  await closeDatabase();
}

process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);

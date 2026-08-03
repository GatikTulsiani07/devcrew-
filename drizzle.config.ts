import { defineConfig } from "drizzle-kit";

import { readDrizzleEnv } from "./src/config/env.js";

const env = readDrizzleEnv(process.env);

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dbCredentials: {
    url: env.DIRECT_URL,
  },
});

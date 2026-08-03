import { sql as drizzleSql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import { runtimeEnv } from "../config/runtime.js";
import { createDatabaseHealth } from "./health.js";

export const postgresClient = postgres(runtimeEnv.DATABASE_URL, {
  prepare: false,
});

export const database = drizzle(postgresClient);

export const databaseHealth = createDatabaseHealth(async () => {
  await database.execute(drizzleSql`select 1`);
});

export async function closeDatabase(): Promise<void> {
  await postgresClient.end();
}

import { z } from "zod";

const runtimeEnvSchema = z.object({
  DATABASE_URL: z.url(),
  PORT: z.coerce.number().int().min(1).max(65_535).default(3001),
});

const drizzleEnvSchema = z.object({
  DIRECT_URL: z.url(),
});

type Environment = Record<string, string | undefined>;

export type RuntimeEnv = z.infer<typeof runtimeEnvSchema>;
export type DrizzleEnv = z.infer<typeof drizzleEnvSchema>;

export class EnvironmentValidationError extends Error {
  readonly variables: readonly string[];

  constructor(variables: readonly string[]) {
    super(`Invalid or missing environment variables: ${variables.join(", ")}`);
    this.name = "EnvironmentValidationError";
    this.variables = variables;
  }
}

function parseEnvironment<T>(
  schema: z.ZodType<T>,
  environment: Environment,
): T {
  const result = schema.safeParse(environment);

  if (result.success) {
    return result.data;
  }

  const variables = [
    ...new Set(
      result.error.issues
        .map((issue) => issue.path[0])
        .filter((key): key is string => typeof key === "string"),
    ),
  ].sort();

  throw new EnvironmentValidationError(variables);
}

export function readRuntimeEnv(environment: Environment): RuntimeEnv {
  return parseEnvironment(runtimeEnvSchema, environment);
}

export function readDrizzleEnv(environment: Environment): DrizzleEnv {
  return parseEnvironment(drizzleEnvSchema, environment);
}

const defaultAllowedOrigins = ["http://localhost:3000", "http://127.0.0.1:3000"];

export const MAX_REQUEST_BODY_BYTES = 64 * 1024;

export function readAllowedOrigins(
  environment: Record<string, string | undefined> = process.env,
): readonly string[] {
  const configured = environment.DEVCREW_ALLOWED_ORIGINS;

  if (configured === undefined || configured.trim() === "") {
    return defaultAllowedOrigins;
  }

  return configured
    .split(",")
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);
}

export function resolveAllowedOrigin(
  requestOrigin: string,
  allowedOrigins: readonly string[],
): string | null {
  return allowedOrigins.includes(requestOrigin) ? requestOrigin : null;
}

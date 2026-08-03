import { randomUUID } from "node:crypto";

const requestIdPattern = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;

export type RequestIdGenerator = () => string;

export function createRequestId(): string {
  return `req_${randomUUID()}`;
}

export function isValidRequestId(value: string): boolean {
  return requestIdPattern.test(value);
}

export function resolveRequestId(
  headerValue: string | undefined,
  generateRequestId: RequestIdGenerator = createRequestId,
): string {
  if (headerValue !== undefined && isValidRequestId(headerValue)) {
    return headerValue;
  }

  return generateRequestId();
}

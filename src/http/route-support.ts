import { ApplicationError } from "../errors.js";

export type RequestIdEnv = {
  Variables: {
    requestId: string;
  };
};

export function validationError(): ApplicationError {
  return new ApplicationError(
    "VALIDATION_FAILED",
    400,
    "Request validation failed",
  );
}

export async function readJsonBody(
  parseJson: () => Promise<unknown>,
): Promise<unknown> {
  try {
    return await parseJson();
  } catch {
    throw validationError();
  }
}

export async function readOptionalJsonBody(
  readText: () => Promise<string>,
): Promise<unknown> {
  let text: string;

  try {
    text = await readText();
  } catch {
    throw validationError();
  }

  if (text.trim() === "") {
    return {};
  }

  try {
    return JSON.parse(text);
  } catch {
    throw validationError();
  }
}

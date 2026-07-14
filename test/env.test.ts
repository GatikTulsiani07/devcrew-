import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  EnvironmentValidationError,
  readDrizzleEnv,
  readRuntimeEnv,
} from "../src/config/env.js";

describe("environment validation", () => {
  it("identifies a missing runtime variable without exposing values", () => {
    assert.throws(
      () => readRuntimeEnv({}),
      (error: unknown) => {
        assert.ok(error instanceof EnvironmentValidationError);
        assert.deepEqual(error.variables, ["DATABASE_URL"]);
        assert.equal(error.message.includes("DATABASE_URL"), true);
        return true;
      },
    );
  });

  it("identifies a missing Drizzle variable", () => {
    assert.throws(
      () => readDrizzleEnv({}),
      (error: unknown) => {
        assert.ok(error instanceof EnvironmentValidationError);
        assert.deepEqual(error.variables, ["DIRECT_URL"]);
        return true;
      },
    );
  });

  it("does not include an invalid secret value in its error", () => {
    const secretValue = "not-a-url-with-a-secret";

    assert.throws(
      () => readRuntimeEnv({ DATABASE_URL: secretValue }),
      (error: unknown) => {
        assert.ok(error instanceof EnvironmentValidationError);
        assert.equal(error.message.includes(secretValue), false);
        return true;
      },
    );
  });

  it("defaults the server port to 3001", () => {
    const env = readRuntimeEnv({ DATABASE_URL: "postgresql://localhost/test" });

    assert.equal(env.PORT, 3001);
  });

  it("accepts a valid configured server port", () => {
    const env = readRuntimeEnv({
      DATABASE_URL: "postgresql://localhost/test",
      PORT: "4100",
    });

    assert.equal(env.PORT, 4100);
  });

  it("identifies an invalid server port without echoing it", () => {
    const invalidPort = "70000";

    assert.throws(
      () =>
        readRuntimeEnv({
          DATABASE_URL: "postgresql://localhost/test",
          PORT: invalidPort,
        }),
      (error: unknown) => {
        assert.ok(error instanceof EnvironmentValidationError);
        assert.deepEqual(error.variables, ["PORT"]);
        assert.equal(error.message.includes(invalidPort), false);
        return true;
      },
    );
  });
});

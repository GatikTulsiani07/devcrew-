import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PassThrough } from "node:stream";
import { describe, it } from "node:test";

import { createControlledCommandRunner } from "../src/validation/controlled-command-runner.js";

describe("controlled command runner", () => {
  it("uses the approved executable, argument array, cwd, and bounded environment", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "devcrew-validation-"));
    try {
      const result = await createControlledCommandRunner({
        environment: {
          PATH: process.env.PATH ?? "/usr/bin:/bin",
          CI: "true",
          NODE_ENV: "test",
        },
      }).run(
        {
          name: "tests",
          executable: process.execPath,
          args: ["-e", "process.stdout.write(JSON.stringify(process.argv.slice(1)))", "approved"],
          timeoutMs: 1_000,
        },
        cwd,
      );

      assert.equal(result.status, "PASSED");
      assert.deepEqual(JSON.parse(result.stdout), ["approved"]);
      assert.equal(result.stderr, "");
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });

  it("fails closed on spawn failure and sanitizes unsafe output", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "devcrew-validation-"));
    try {
      const runner = createControlledCommandRunner();
      const spawnFailure = await runner.run(
        { name: "tests", executable: "/missing/devcrew-command", args: [], timeoutMs: 1_000 },
        cwd,
      );
      assert.equal(spawnFailure.status, "FAILED");
      assert.equal(spawnFailure.started, false);

      const unsafe = await runner.run(
        {
          name: "tests",
          executable: process.execPath,
          args: ["-e", "process.stdout.write('token=secret-value')"],
          timeoutMs: 1_000,
        },
        cwd,
      );
      assert.equal(unsafe.status, "FAILED");
      assert.equal(unsafe.unsafeEvidence, true);
      assert.equal(unsafe.stdout.includes("secret-value"), false);
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });

  it("terminates a command that exceeds its timeout", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "devcrew-validation-"));
    try {
      const result = await createControlledCommandRunner().run(
        {
          name: "tests",
          executable: process.execPath,
          args: ["-e", "setTimeout(() => {}, 10_000)"],
          timeoutMs: 25,
        },
        cwd,
      );
      assert.equal(result.status, "FAILED");
      assert.equal(result.timedOut, true);
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });

  it("cancels only the owned child with SIGTERM before bounded SIGKILL", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "devcrew-validation-"));
    const killedSignals: Array<NodeJS.Signals | number | undefined> = [];
    const child = new EventEmitter() as EventEmitter & {
      stdout: PassThrough;
      stderr: PassThrough;
      kill(signal?: NodeJS.Signals | number): boolean;
    };
    child.stdout = new PassThrough();
    child.stderr = new PassThrough();
    child.kill = (signal?: NodeJS.Signals | number) => {
      killedSignals.push(signal);
      if (signal === "SIGKILL") {
        child.emit("close", null);
      }
      return true;
    };

    try {
      const controller = new AbortController();
      const runner = createControlledCommandRunner({
        forceKillDelayMs: 0,
        spawnImpl: () => child,
      });
      const result = runner.run(
        {
          name: "tests",
          executable: process.execPath,
          args: ["-e", "setTimeout(() => {}, 10_000)"],
          timeoutMs: 1_000,
        },
        cwd,
        { signal: controller.signal },
      );

      controller.abort();
      await assert.rejects(result, { name: "TaskCancellationError" });
      assert.deepEqual(killedSignals, ["SIGTERM", "SIGKILL"]);
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });
});

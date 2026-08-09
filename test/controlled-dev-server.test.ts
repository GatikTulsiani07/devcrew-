import assert from "node:assert/strict";
import { PassThrough } from "node:stream";
import { EventEmitter } from "node:events";
import { describe, it } from "node:test";

import {
  createControlledDevServer,
  ControlledDevServerError,
} from "../src/browser/controlled-dev-server.js";
import type {
  BrowserVerificationProfile,
  DevServerChildProcess,
} from "../src/browser/browser-types.js";

const repositoryRoot = "/private/tmp/devcrew-prepared-repo";
const profile: BrowserVerificationProfile = {
  id: "test_frontend",
  executable: "npm",
  args: ["run", "dev:ui", "--", "--hostname", "127.0.0.1", "--port", "43119"],
  host: "127.0.0.1",
  port: 43119,
  path: "/",
  startupTimeoutMs: 30,
  pollIntervalMs: 1,
  navigationTimeoutMs: 100,
  shutdownTimeoutMs: 1,
};

class FakeChildProcess extends EventEmitter implements DevServerChildProcess {
  stdout = new PassThrough();
  stderr = new PassThrough();
  killed = false;
  signals: NodeJS.Signals[] = [];

  kill(signal: NodeJS.Signals = "SIGTERM"): boolean {
    this.killed = true;
    this.signals.push(signal);
    this.emit("exit", 0);
    this.emit("close", 0);
    return true;
  }
}

describe("controlled development server", () => {
  it("starts the approved server command with shell disabled in the prepared repository", async () => {
    const child = new FakeChildProcess();
    const calls: Array<{
      executable: string;
      args: readonly string[];
      cwd: string;
      shell: false;
    }> = [];
    const server = await createControlledDevServer({
      profiles: [profile],
      fetchImpl: async () => new Response("<html></html>", { status: 200 }),
      spawner(executable, args, options) {
        calls.push({
          executable,
          args,
          cwd: options.cwd,
          shell: options.shell,
        });
        return child;
      },
    }).start({ profileId: "test_frontend", repositoryRoot });

    assert.equal(server.url, "http://127.0.0.1:43119/");
    assert.deepEqual(calls, [
      {
        executable: "npm",
        args: profile.args,
        cwd: repositoryRoot,
        shell: false,
      },
    ]);
    await server.stop();
    assert.deepEqual(child.signals, ["SIGTERM"]);
  });

  it("times out startup and cleans up only the owned child process", async () => {
    const child = new FakeChildProcess();
    await assert.rejects(
      createControlledDevServer({
        profiles: [profile],
        fetchImpl: async () => {
          throw new Error("not ready");
        },
        spawner() {
          return child;
        },
      }).start({ profileId: "test_frontend", repositoryRoot }),
      (error: unknown) =>
        error instanceof ControlledDevServerError &&
        error.reason === "server startup timed out",
    );

    assert.deepEqual(child.signals, ["SIGTERM"]);
  });

  it("fails when the process exits before readiness and cleans up", async () => {
    const child = new FakeChildProcess();

    await assert.rejects(
      createControlledDevServer({
        profiles: [profile],
        fetchImpl: async () => {
          child.emit("exit", 1);
          return new Response("", { status: 503 });
        },
        spawner() {
          return child;
        },
      }).start({ profileId: "test_frontend", repositoryRoot }),
      (error: unknown) =>
        error instanceof ControlledDevServerError &&
        error.reason === "server exited before readiness",
    );

    assert.deepEqual(child.signals, ["SIGTERM"]);
  });

  it("rejects unsupported profiles and spawn failures with sanitized errors", async () => {
    await assert.rejects(
      createControlledDevServer({
        profiles: [{ ...profile, executable: "node" }],
      }).start({ profileId: "test_frontend", repositoryRoot }),
      (error: unknown) =>
        error instanceof ControlledDevServerError &&
        error.reason === "unsupported development server profile",
    );

    await assert.rejects(
      createControlledDevServer({
        profiles: [profile],
        spawner() {
          throw new Error("SENSITIVE_LOCAL_PATH_/Users/sunil/devcrew");
        },
      }).start({ profileId: "test_frontend", repositoryRoot }),
      (error: unknown) =>
        error instanceof ControlledDevServerError &&
        error.reason === "server spawn failed" &&
        !String(error).includes("/Users/"),
    );
  });

  it("cleans up after readiness succeeds when later verification fails", async () => {
    const child = new FakeChildProcess();
    const server = await createControlledDevServer({
      profiles: [profile],
      fetchImpl: async () => new Response("<html></html>", { status: 200 }),
      spawner() {
        return child;
      },
    }).start({ profileId: "test_frontend", repositoryRoot });

    await server.stop();
    assert.equal(child.killed, true);
  });
});

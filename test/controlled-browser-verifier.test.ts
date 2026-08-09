import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  createControlledBrowserVerifier,
  createFetchBrowserAdapter,
  ControlledBrowserVerificationError,
  validateLocalhostUrl,
} from "../src/browser/controlled-browser-verifier.js";
import type { BrowserVerificationProfile } from "../src/browser/browser-types.js";

const profile: BrowserVerificationProfile = {
  id: "test_frontend",
  executable: "npm",
  args: ["run", "dev:ui", "--", "--hostname", "127.0.0.1", "--port", "43119"],
  host: "127.0.0.1",
  port: 43119,
  path: "/",
  startupTimeoutMs: 100,
  pollIntervalMs: 5,
  navigationTimeoutMs: 100,
  shutdownTimeoutMs: 10,
};

describe("controlled browser verifier", () => {
  it("accepts approved 127.0.0.1 and localhost URLs on the server-owned port", () => {
    assert.equal(
      validateLocalhostUrl("http://127.0.0.1:43119/", profile).href,
      "http://127.0.0.1:43119/",
    );
    assert.equal(
      validateLocalhostUrl("http://localhost:43119/", profile).href,
      "http://localhost:43119/",
    );
  });

  it("rejects external, private-network, credential-bearing, and unsupported URLs", () => {
    for (const url of [
      "https://example.com/",
      "http://192.168.1.10:43119/",
      "file:///etc/passwd",
      "javascript:alert(1)",
      "data:text/html,ok",
      "ftp://127.0.0.1:43119/",
      "http://user:pass@127.0.0.1:43119/",
      "http://127.0.0.1:43120/",
    ]) {
      assert.throws(
        () => validateLocalhostUrl(url, profile),
        ControlledBrowserVerificationError,
      );
    }
  });

  it("captures safe page title metadata after successful navigation", async () => {
    const adapter = createFetchBrowserAdapter({
      fetchImpl: async () =>
        new Response("<html><head><title>Devcrew &amp; Tasks</title></head><body></body></html>", {
          status: 200,
        }),
    });

    const evidence = await createControlledBrowserVerifier({
      adapter,
      now: () => new Date("2026-08-03T08:00:00.000Z"),
    }).verify({
      profile,
      url: "http://127.0.0.1:43119/",
    });

    assert.deepEqual(evidence, {
      status: "PASSED",
      url: "http://127.0.0.1:43119/",
      pageTitle: "Devcrew & Tasks",
      verifiedAt: "2026-08-03T08:00:00.000Z",
    });
  });

  it("fails closed for navigation failure, timeout, non-documents, and external redirects", async () => {
    await assert.rejects(
      createFetchBrowserAdapter({
        fetchImpl: async () => new Response("missing", { status: 500 }),
      }).verify({
        url: "http://127.0.0.1:43119/",
        expectedOrigin: "http://127.0.0.1:43119",
        timeoutMs: 100,
      }),
      (error: unknown) =>
        error instanceof ControlledBrowserVerificationError &&
        error.reason === "browser navigation failed",
    );

    await assert.rejects(
      createFetchBrowserAdapter({
        fetchImpl: async () => new Response("plain text", { status: 200 }),
      }).verify({
        url: "http://127.0.0.1:43119/",
        expectedOrigin: "http://127.0.0.1:43119",
        timeoutMs: 100,
      }),
      (error: unknown) =>
        error instanceof ControlledBrowserVerificationError &&
        error.reason === "document was not rendered",
    );

    await assert.rejects(
      createFetchBrowserAdapter({
        fetchImpl: async () =>
          new Response("", {
            status: 302,
            headers: { Location: "https://example.com/" },
          }),
      }).verify({
        url: "http://127.0.0.1:43119/",
        expectedOrigin: "http://127.0.0.1:43119",
        timeoutMs: 100,
      }),
      (error: unknown) =>
        error instanceof ControlledBrowserVerificationError &&
        error.reason === "browser redirected externally",
    );

    const hangingFetch: typeof fetch = async (_url, init) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => {
          reject(new DOMException("aborted", "AbortError"));
        });
      });

    await assert.rejects(
      createFetchBrowserAdapter({ fetchImpl: hangingFetch }).verify({
        url: "http://127.0.0.1:43119/",
        expectedOrigin: "http://127.0.0.1:43119",
        timeoutMs: 1,
      }),
      (error: unknown) =>
        error instanceof ControlledBrowserVerificationError &&
        error.reason === "browser navigation timed out",
    );
  });

  it("closes the browser adapter after success and failure when injected", async () => {
    let successClosed = false;
    const successAdapter = {
      async verify() {
        try {
          return {
            url: "http://127.0.0.1:43119/",
            pageTitle: "Ready",
          };
        } finally {
          successClosed = true;
        }
      },
    };

    await createControlledBrowserVerifier({ adapter: successAdapter }).verify({
      profile,
      url: "http://127.0.0.1:43119/",
    });
    assert.equal(successClosed, true);

    let failureClosed = false;
    const failureAdapter = {
      async verify() {
        try {
          throw new ControlledBrowserVerificationError("browser launch failed");
        } finally {
          failureClosed = true;
        }
      },
    };

    await assert.rejects(
      createControlledBrowserVerifier({ adapter: failureAdapter }).verify({
        profile,
        url: "http://127.0.0.1:43119/",
      }),
      ControlledBrowserVerificationError,
    );
    assert.equal(failureClosed, true);
  });
});

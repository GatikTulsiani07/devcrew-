import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiClient, ApiClientError, createApiClient } from "@/lib/api-client";

const backendUrl = "http://backend.test";

function jsonResponse(body: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
    ...init,
  });
}

afterEach(() => {
  delete process.env.NEXT_PUBLIC_BACKEND_URL;
});

describe("ApiClient backend URL resolution", () => {
  it("fails with BACKEND_URL_MISSING when no backend URL is configured", async () => {
    const fetcher = vi.fn<typeof fetch>();
    const client = new ApiClient({ fetcher });

    await expect(client.getProject("proj_1")).rejects.toMatchObject({
      name: "ApiClientError",
      code: "BACKEND_URL_MISSING",
      status: undefined,
    } satisfies Partial<ApiClientError>);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("falls back to NEXT_PUBLIC_BACKEND_URL and preserves the backend path prefix", async () => {
    process.env.NEXT_PUBLIC_BACKEND_URL = "http://env-backend.test";
    const fetcher = vi
      .fn<typeof fetch>()
      .mockImplementation(async () => jsonResponse({ project: { id: "proj_1" } }));
    const client = createApiClient({ fetcher });

    await client.getProject("proj_1");

    expect(fetcher.mock.calls[0]?.[0]).toBe(
      "http://env-backend.test/api/v1/projects/proj_1",
    );
  });

  it("encodes path identifiers", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockImplementation(async () => jsonResponse({ task: { id: "task/1" } }));
    const client = new ApiClient({ backendUrl, fetcher });

    await client.getTask("proj 1", "task/1");

    expect(fetcher.mock.calls[0]?.[0]).toBe(
      "http://backend.test/api/v1/projects/proj%201/tasks/task%2F1",
    );
  });

  it("omits the JSON content type on bodyless requests", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockImplementation(async () => jsonResponse({ project: { id: "proj_1" } }));
    const client = new ApiClient({ backendUrl, fetcher });

    await client.getProject("proj_1");

    expect(fetcher.mock.calls[0]?.[1]?.headers).toEqual({ Accept: "application/json" });
  });
});

describe("ApiClient activity requests", () => {
  it("appends the after cursor to activity snapshot requests", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockImplementation(async () => jsonResponse({ events: [], lastSequence: 4 }));
    const client = new ApiClient({ backendUrl, fetcher });

    await client.getActivitySnapshot("proj_1", 4);

    expect(fetcher.mock.calls[0]?.[0]).toBe(
      "http://backend.test/api/v1/projects/proj_1/activity?after=4",
    );
  });

  it("returns the raw stream response without JSON parsing", async () => {
    const streamResponse = new Response("id: 1\ndata: {}\n\n", { status: 200 });
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(streamResponse);
    const client = new ApiClient({ backendUrl, fetcher });

    await expect(
      client.openActivityStream("proj_1", 1, new AbortController().signal),
    ).resolves.toBe(streamResponse);
  });
});

describe("ApiClient error translation", () => {
  it("uses BACKEND_ERROR and a status fallback message when the error body is not JSON", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response("upstream exploded", { status: 502 }));
    const client = new ApiClient({ backendUrl, fetcher });

    await expect(client.getProject("proj_1")).rejects.toMatchObject({
      code: "BACKEND_ERROR",
      message: "Backend request failed with status 502",
      status: 502,
      requestId: undefined,
    } satisfies Partial<ApiClientError>);
  });

  it("falls back to BACKEND_ERROR when a JSON error body omits the error envelope", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(jsonResponse({ requestId: "req_9" }, { status: 500 }));
    const client = new ApiClient({ backendUrl, fetcher });

    await expect(client.getProject("proj_1")).rejects.toMatchObject({
      code: "BACKEND_ERROR",
      message: "Backend request failed with status 500",
      status: 500,
      requestId: "req_9",
    } satisfies Partial<ApiClientError>);
  });

  it("propagates fetch transport failures unchanged", async () => {
    const transportFailure = new TypeError("Failed to fetch");
    const fetcher = vi.fn<typeof fetch>().mockRejectedValue(transportFailure);
    const client = new ApiClient({ backendUrl, fetcher });

    await expect(client.getProject("proj_1")).rejects.toBe(transportFailure);
  });
});

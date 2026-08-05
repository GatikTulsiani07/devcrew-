import { describe, expect, it, vi } from "vitest";
import { ApiClient, ApiClientError } from "@/lib/api-client";

const backendUrl = "http://backend.test";

function jsonResponse(body: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
    ...init,
  });
}

describe("Devcrew API client", () => {
  it("creates projects through NEXT_PUBLIC_BACKEND_URL", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      jsonResponse({ project: { id: "proj_1", name: "Devcrew" } }),
    );
    const client = new ApiClient({ backendUrl, fetcher });

    await expect(
      client.createProject({
        name: "Devcrew",
        publicRepositoryUrl: "https://github.com/example/devcrew",
        preparedRepositoryId: "prepared_devcrew_main",
      }),
    ).resolves.toMatchObject({ id: "proj_1" });

    expect(fetcher).toHaveBeenCalledWith("http://backend.test/api/v1/projects", {
      method: "POST",
      body: JSON.stringify({
        name: "Devcrew",
        publicRepositoryUrl: "https://github.com/example/devcrew",
        preparedRepositoryId: "prepared_devcrew_main",
      }),
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
    });
  });

  it("creates tasks and posts lifecycle commands", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      jsonResponse({ task: { id: "task_1", status: "WAITING_FOR_APPROVAL" } }),
    );
    const client = new ApiClient({ backendUrl, fetcher });

    await client.createTask("proj_1", { title: "Task", description: "Details" });
    await client.approvePlan("proj_1", "task_1");
    await client.rejectPlan("proj_1", "task_1", "Needs changes.");
    await client.executeTask("proj_1", "task_1");
    await client.validateTask("proj_1", "task_1");
    await client.reviewTask("proj_1", "task_1");

    expect(fetcher.mock.calls.map(([url]) => url)).toEqual([
      "http://backend.test/api/v1/projects/proj_1/tasks",
      "http://backend.test/api/v1/projects/proj_1/tasks/task_1/plan-decision",
      "http://backend.test/api/v1/projects/proj_1/tasks/task_1/plan-decision",
      "http://backend.test/api/v1/projects/proj_1/tasks/task_1/execute",
      "http://backend.test/api/v1/projects/proj_1/tasks/task_1/validate",
      "http://backend.test/api/v1/projects/proj_1/tasks/task_1/review",
    ]);
    expect(fetcher.mock.calls[1]?.[1]?.body).toBe(JSON.stringify({ decision: "APPROVE" }));
    expect(fetcher.mock.calls[2]?.[1]?.body).toBe(
      JSON.stringify({ decision: "REJECT", reason: "Needs changes." }),
    );
  });

  it("surfaces structured backend errors", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      jsonResponse(
        {
          requestId: "req_1",
          status: "error",
          error: {
            code: "INVALID_TASK_TRANSITION",
            message: "Task is not approved for implementation",
          },
        },
        { status: 409 },
      ),
    );
    const client = new ApiClient({ backendUrl, fetcher });

    await expect(client.executeTask("proj_1", "task_1")).rejects.toMatchObject({
      code: "INVALID_TASK_TRANSITION",
      status: 409,
      requestId: "req_1",
      message: "Task is not approved for implementation",
    } satisfies Partial<ApiClientError>);
  });

  it("fetches activity snapshots and opens SSE with Last-Event-ID", async () => {
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.close();
      },
    });
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ events: [], lastSequence: 2 }))
      .mockResolvedValueOnce(new Response(stream, { status: 200 }));
    const client = new ApiClient({ backendUrl, fetcher });

    await expect(client.getActivitySnapshot("proj_1")).resolves.toEqual({
      events: [],
      lastSequence: 2,
    });
    await client.openActivityStream("proj_1", 2, new AbortController().signal);

    expect(fetcher.mock.calls[0]?.[0]).toBe(
      "http://backend.test/api/v1/projects/proj_1/activity",
    );
    expect(fetcher.mock.calls[1]?.[0]).toBe(
      "http://backend.test/api/v1/projects/proj_1/activity/stream",
    );
    expect(fetcher.mock.calls[1]?.[1]?.headers).toMatchObject({
      Accept: "text/event-stream",
      "Last-Event-ID": "2",
    });
  });
});

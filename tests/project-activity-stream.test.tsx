import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import {
  mergeActivityEvents,
  useProjectActivity,
  type ProjectActivityState,
} from "@/hooks/use-project-activity";
import { ApiClientError, type ApiClient } from "@/lib/api-client";
import type { ActivityEvent, ActivitySnapshot } from "@/lib/api-types";

let root: Root | undefined;
let container: HTMLDivElement | undefined;

beforeAll(() => {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

afterEach(async () => {
  if (root) await act(async () => root?.unmount());
  container?.remove();
  root = undefined;
  container = undefined;
});

function event(sequence: number, id = `evt_${sequence}`): ActivityEvent {
  return {
    id,
    sequence,
    projectId: "proj_1",
    type: "PLAN_CREATED",
    actor: { kind: "AGENT", role: "MANAGER" },
    summary: `Event ${sequence}`,
    createdAt: "2026-08-03T12:00:00.000Z",
  };
}

function sseResponse(chunks: readonly string[]) {
  return new Response(
    new ReadableStream<Uint8Array>({
      start(controller) {
        const encoder = new TextEncoder();
        for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
        controller.close();
      },
    }),
    { status: 200 },
  );
}

function stubClient(overrides: Partial<Record<keyof ApiClient, unknown>> = {}) {
  return {
    getActivitySnapshot: vi.fn<() => Promise<ActivitySnapshot>>().mockResolvedValue({
      events: [],
      lastSequence: 0,
    }),
    openActivityStream: vi.fn().mockResolvedValue(sseResponse([])),
    ...overrides,
  } as unknown as ApiClient;
}

async function render(apiClient: ApiClient, projectId: string | undefined) {
  const states: ProjectActivityState[] = [];

  function Harness() {
    const state = useProjectActivity(projectId, apiClient);
    states.push(state);
    return <div>{state.events.map((item) => item.sequence).join(",")}</div>;
  }

  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () => root?.render(<Harness />));
  await act(async () => Promise.resolve());
  return { states, latest: () => states.at(-1)! };
}

describe("mergeActivityEvents", () => {
  it("orders by sequence and drops duplicate ids and sequences", () => {
    const merged = mergeActivityEvents(
      [event(3), event(1)],
      [event(1), event(2), event(2, "evt_2_duplicate")],
    );

    expect(merged.map((item) => item.sequence)).toEqual([1, 2, 3]);
    expect(merged.map((item) => item.id)).toEqual(["evt_1", "evt_2", "evt_3"]);
  });

  it("returns an empty list when there is nothing to merge", () => {
    expect(mergeActivityEvents([], [])).toEqual([]);
  });
});

describe("useProjectActivity connection states", () => {
  it("stays idle without a project id", async () => {
    const apiClient = stubClient();
    const { latest } = await render(apiClient, undefined);

    expect(latest().connection).toBe("idle");
    expect(latest().lastSequence).toBe(0);
    expect(apiClient.getActivitySnapshot).not.toHaveBeenCalled();
  });

  it("reports snapshot failures without opening a stream", async () => {
    const apiClient = stubClient({
      getActivitySnapshot: vi
        .fn()
        .mockRejectedValue(new ApiClientError("ACTIVITY_UNAVAILABLE", "Activity is offline", 503)),
    });
    const { latest } = await render(apiClient, "proj_1");

    expect(latest().connection).toBe("error");
    expect(latest().error).toBe("ACTIVITY_UNAVAILABLE: Activity is offline");
    expect(apiClient.openActivityStream).not.toHaveBeenCalled();
  });

  it("surfaces a structured stream rejection body", async () => {
    const apiClient = stubClient({
      openActivityStream: vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            requestId: "req_3",
            error: { code: "PROJECT_NOT_FOUND", message: "Unknown project" },
          }),
          { status: 404, headers: { "Content-Type": "application/json" } },
        ),
      ),
    });
    const { latest } = await render(apiClient, "proj_1");

    expect(latest().error).toBe("PROJECT_NOT_FOUND: Unknown project");
  });

  it("falls back to a status message when the stream rejection body is not JSON", async () => {
    const apiClient = stubClient({
      openActivityStream: vi
        .fn()
        .mockResolvedValue(new Response("gateway timeout", { status: 504 })),
    });
    const { latest } = await render(apiClient, "proj_1");

    expect(latest().error).toBe("ACTIVITY_STREAM_ERROR: Activity stream failed with status 504");
  });

  it("reports a stream response without a readable body", async () => {
    const apiClient = stubClient({
      openActivityStream: vi.fn().mockResolvedValue(new Response(null, { status: 200 })),
    });
    const { latest } = await render(apiClient, "proj_1");

    expect(latest().error).toBe("Activity stream response did not include a body");
    expect(latest().connection).toBe("reconnecting");
  });
});

describe("useProjectActivity stream parsing", () => {
  it("ignores comments and heartbeat chunks and applies events split across reads", async () => {
    const payload = JSON.stringify(event(1));
    const apiClient = stubClient({
      getActivitySnapshot: vi
        .fn<() => Promise<ActivitySnapshot>>()
        .mockResolvedValue({ events: [], lastSequence: 0 }),
      openActivityStream: vi
        .fn()
        .mockResolvedValue(
          sseResponse([": heartbeat\n\n", "\n\n", `id: 1\ndata: ${payload.slice(0, 10)}`, `${payload.slice(10)}\n\n`]),
        ),
    });
    const { latest } = await render(apiClient, "proj_1");

    expect(latest().events.map((item) => item.sequence)).toEqual([1]);
    expect(latest().lastSequence).toBe(1);
  });

  it("stops requesting after unmount", async () => {
    const apiClient = stubClient();
    await render(apiClient, "proj_1");
    const callsAfterRender = (apiClient.openActivityStream as unknown as ReturnType<typeof vi.fn>).mock
      .calls.length;

    await act(async () => root?.unmount());
    root = undefined;
    await act(async () => new Promise((resolve) => setTimeout(resolve, 1_100)));

    expect(
      (apiClient.openActivityStream as unknown as ReturnType<typeof vi.fn>).mock.calls.length,
    ).toBe(callsAfterRender);
  });
});

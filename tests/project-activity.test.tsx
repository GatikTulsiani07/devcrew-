import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { useProjectActivity } from "@/hooks/use-project-activity";
import type { ApiClient } from "@/lib/api-client";
import type { ActivityEvent, ActivitySnapshot } from "@/lib/api-types";

let root: Root | undefined;
let container: HTMLDivElement | undefined;

beforeAll(() => {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

afterEach(async () => {
  vi.useRealTimers();
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
    type: sequence === 7 ? "REVIEW_COMPLETED" : "PLAN_CREATED",
    actor: { kind: "AGENT", role: "MANAGER" },
    summary: `Event ${sequence}`,
    createdAt: "2026-08-03T12:00:00.000Z",
  };
}

function streamResponse(events: readonly ActivityEvent[]) {
  return new Response(
    new ReadableStream<Uint8Array>({
      start(controller) {
        const encoder = new TextEncoder();
        for (const item of events) {
          controller.enqueue(
            encoder.encode(`id: ${item.sequence}\nevent: ${item.type}\ndata: ${JSON.stringify(item)}\n\n`),
          );
        }
        controller.close();
      },
    }),
    { status: 200 },
  );
}

async function render(apiClient: ApiClient) {
  const states: Array<ReturnType<typeof useProjectActivity>> = [];

  function Harness() {
    const state = useProjectActivity("proj_1", apiClient);
    states.push(state);
    return <div>{state.events.map((item) => item.sequence).join(",")}</div>;
  }

  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () => root?.render(<Harness />));
  return { view: container, states };
}

describe("useProjectActivity", () => {
  it("renders the snapshot before applying ordered, deduped SSE updates", async () => {
    const apiClient = {
      getActivitySnapshot: vi.fn<() => Promise<ActivitySnapshot>>().mockResolvedValue({
        events: [event(2), event(1)],
        lastSequence: 2,
      }),
      openActivityStream: vi.fn().mockResolvedValue(
        streamResponse([event(2), event(4), event(3), event(4, "evt_4_duplicate")]),
      ),
    } as unknown as ApiClient;

    const { view } = await render(apiClient);
    await act(async () => Promise.resolve());

    expect(view.textContent).toBe("1,2,3,4");
  });

  it("reconnects with the latest sequence after an SSE disconnect", async () => {
    const apiClient = {
      getActivitySnapshot: vi.fn<() => Promise<ActivitySnapshot>>().mockResolvedValue({
        events: [event(5)],
        lastSequence: 5,
      }),
      openActivityStream: vi
        .fn()
        .mockResolvedValueOnce(streamResponse([event(6)]))
        .mockResolvedValueOnce(streamResponse([event(7)])),
    } as unknown as ApiClient;

    const { view } = await render(apiClient);
    await act(async () => Promise.resolve());
    await act(async () => new Promise((resolve) => setTimeout(resolve, 1_100)));

    expect(apiClient.openActivityStream).toHaveBeenNthCalledWith(
      1,
      "proj_1",
      5,
      expect.any(AbortSignal),
    );
    expect(apiClient.openActivityStream).toHaveBeenNthCalledWith(
      2,
      "proj_1",
      6,
      expect.any(AbortSignal),
    );
    expect(view.textContent).toBe("5,6,7");
  });
});

"use client";

import { useEffect, useMemo, useReducer, useRef } from "react";
import { ApiClientError, createApiClient, type ApiClient } from "@/lib/api-client";
import type { ActivityEvent } from "@/lib/api-types";

export interface ProjectActivityState {
  events: readonly ActivityEvent[];
  connection: "idle" | "connecting" | "connected" | "reconnecting" | "error";
  error?: string;
  lastSequence: number;
}

export function mergeActivityEvents(
  existing: readonly ActivityEvent[],
  incoming: readonly ActivityEvent[],
): ActivityEvent[] {
  const byIdentity = new Map<string, ActivityEvent>();
  const bySequence = new Map<number, string>();

  for (const event of [...existing, ...incoming]) {
    if (byIdentity.has(event.id) || bySequence.has(event.sequence)) continue;
    byIdentity.set(event.id, event);
    bySequence.set(event.sequence, event.id);
  }

  return [...byIdentity.values()].sort((first, second) => first.sequence - second.sequence);
}

interface ParsedSseEvent {
  id?: string;
  data?: string;
}

const RECONNECT_DELAY_MS = 1_000;

interface ActivityReducerState extends ProjectActivityState {
  projectId: string | undefined;
}

type ActivityReducerAction =
  | { type: "reset"; projectId: string | undefined }
  | { type: "begin-connection" }
  | { type: "connection"; connection: ProjectActivityState["connection"] }
  | { type: "error"; error?: string }
  | { type: "events"; incoming: readonly ActivityEvent[] }
  | { type: "last-sequence"; lastSequence: number };

function activityReducer(
  state: ActivityReducerState,
  action: ActivityReducerAction,
): ActivityReducerState {
  switch (action.type) {
    case "reset":
      return {
        projectId: action.projectId,
        events: [],
        connection: "idle",
        error: undefined,
        lastSequence: 0,
      };
    case "connection":
      return { ...state, connection: action.connection };
    case "begin-connection":
      return {
        ...state,
        connection:
          state.connection === "idle" || state.connection === "connecting"
            ? "connecting"
            : "reconnecting",
      };
    case "error":
      return { ...state, error: action.error };
    case "events": {
      const events = mergeActivityEvents(state.events, action.incoming);
      return { ...state, events, lastSequence: events.at(-1)?.sequence ?? 0 };
    }
    case "last-sequence":
      return { ...state, lastSequence: action.lastSequence };
  }
}

export function useProjectActivity(
  projectId: string | undefined,
  apiClient?: ApiClient,
): ProjectActivityState {
  const client = useMemo(() => apiClient ?? createApiClient(), [apiClient]);
  const [state, dispatch] = useReducer(activityReducer, {
    projectId,
    events: [],
    connection: "idle",
    error: undefined,
    lastSequence: 0,
  });
  const lastSequenceRef = useRef(0);

  useEffect(() => {
    dispatch({ type: "reset", projectId });
    lastSequenceRef.current = 0;

    if (!projectId) {
      return;
    }

    const activeProjectId = projectId;
    const controller = new AbortController();
    let cancelled = false;
    let reconnectTimer: ReturnType<typeof setTimeout> | undefined;

    const applyEvents = (incoming: readonly ActivityEvent[]) => {
      dispatch({ type: "events", incoming });
      lastSequenceRef.current = Math.max(
        lastSequenceRef.current,
        ...incoming.map((event) => event.sequence),
      );
    };

    async function connect() {
      if (cancelled) return;

      try {
        dispatch({ type: "begin-connection" });
        const response = await client.openActivityStream(
          activeProjectId,
          lastSequenceRef.current,
          controller.signal,
        );

        if (!response.ok) {
          throw await streamError(response);
        }

        dispatch({ type: "connection", connection: "connected" });
        dispatch({ type: "error", error: undefined });
        await readSseStream(response, (event) => {
          if (event.data) {
            applyEvents([JSON.parse(event.data) as ActivityEvent]);
          }
        });

        if (!cancelled) scheduleReconnect();
      } catch (streamFailure) {
        if (cancelled || controller.signal.aborted) return;
        dispatch({ type: "connection", connection: "error" });
        dispatch({ type: "error", error: errorMessage(streamFailure) });
        scheduleReconnect();
      }
    }

    function scheduleReconnect() {
      if (cancelled) return;
      dispatch({ type: "connection", connection: "reconnecting" });
      reconnectTimer = setTimeout(() => {
        void connect();
      }, RECONNECT_DELAY_MS);
    }

    async function start() {
      try {
        dispatch({ type: "connection", connection: "connecting" });
        dispatch({ type: "error", error: undefined });
        const snapshot = await client.getActivitySnapshot(activeProjectId);
        if (cancelled) return;
        applyEvents(snapshot.events);
        lastSequenceRef.current = snapshot.lastSequence;
        dispatch({ type: "last-sequence", lastSequence: snapshot.lastSequence });
        await connect();
      } catch (snapshotFailure) {
        if (cancelled) return;
        dispatch({ type: "connection", connection: "error" });
        dispatch({ type: "error", error: errorMessage(snapshotFailure) });
      }
    }

    void start();

    return () => {
      cancelled = true;
      controller.abort();
      if (reconnectTimer !== undefined) {
        clearTimeout(reconnectTimer);
      }
    };
  }, [client, projectId]);

  return {
    events: state.events,
    connection: state.connection,
    error: state.error,
    lastSequence: state.lastSequence,
  };
}

async function readSseStream(
  response: Response,
  onEvent: (event: ParsedSseEvent) => void,
): Promise<void> {
  const reader = response.body?.getReader();
  if (!reader) throw new Error("Activity stream response did not include a body");

  const decoder = new TextDecoder();
  let buffer = "";

  for (;;) {
    const result = await reader.read();
    if (result.done) break;
    buffer += decoder.decode(result.value, { stream: true });

    const chunks = buffer.split("\n\n");
    buffer = chunks.pop() ?? "";

    for (const chunk of chunks) {
      const event = parseSseChunk(chunk);
      if (event) onEvent(event);
    }
  }
}

function parseSseChunk(chunk: string): ParsedSseEvent | undefined {
  if (!chunk.trim() || chunk.trimStart().startsWith(":")) return undefined;

  const event: ParsedSseEvent = {};

  for (const line of chunk.split("\n")) {
    if (line.startsWith("id:")) event.id = line.slice(3).trimStart();
    if (line.startsWith("data:")) event.data = line.slice(5).trimStart();
  }

  return event.data === undefined ? undefined : event;
}

async function streamError(response: Response): Promise<ApiClientError> {
  try {
    const body = (await response.json()) as {
      requestId?: string;
      error?: { code?: string; message?: string };
    };
    return new ApiClientError(
      body.error?.code ?? "ACTIVITY_STREAM_ERROR",
      body.error?.message ?? `Activity stream failed with status ${response.status}`,
      response.status,
      body.requestId,
    );
  } catch {
    return new ApiClientError(
      "ACTIVITY_STREAM_ERROR",
      `Activity stream failed with status ${response.status}`,
      response.status,
    );
  }
}

function errorMessage(error: unknown): string {
  if (error instanceof ApiClientError) {
    return `${error.code}: ${error.message}`;
  }

  if (error instanceof Error) {
    return error.message;
  }

  return "Activity stream failed";
}

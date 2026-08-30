import { ApplicationError } from "../errors.js";
import type {
  ActivityEvent,
  ActivitySequence,
  ActivitySnapshot,
  ActivityStore,
  ActivitySubscriber,
  ActivitySubscription,
} from "./types.js";

export const MAX_ACTIVITY_SUMMARY_LENGTH = 500;

export interface InMemoryActivityStoreOptions {
  maxEventsPerProject?: number;
}

interface ProjectActivityState {
  events: ActivityEvent[];
  lastSequence: ActivitySequence;
  subscribers: Set<ActivitySubscriber>;
}

export class InMemoryActivityStore implements ActivityStore {
  readonly #maxEventsPerProject: number;
  readonly #states = new Map<string, ProjectActivityState>();

  constructor({ maxEventsPerProject = 200 }: InMemoryActivityStoreOptions = {}) {
    this.#maxEventsPerProject = maxEventsPerProject;
  }

  async append(event: ActivityEvent): Promise<ActivityEvent> {
    const state = this.#stateFor(event.projectId);

    if (state.events.some((storedEvent) => storedEvent.id === event.id)) {
      throw new ApplicationError(
        "ACTIVITY_EVENT_ALREADY_EXISTS",
        409,
        "Activity event already exists.",
      );
    }

    const expectedSequence = state.lastSequence + 1;
    if (
      !Number.isFinite(event.sequence) ||
      !Number.isInteger(event.sequence) ||
      event.sequence < 0 ||
      event.sequence !== expectedSequence
    ) {
      throw new ApplicationError(
        "INVALID_ACTIVITY_SEQUENCE",
        500,
        "Invalid Activity sequence.",
      );
    }

    if (!isCanonicalActivityTimestamp(event.createdAt)) {
      throw new ApplicationError(
        "INVALID_ACTIVITY_TIMESTAMP",
        500,
        "Invalid Activity timestamp.",
      );
    }

    if (!isValidActivitySummary(event.summary)) {
      throw new ApplicationError(
        "INVALID_ACTIVITY_SUMMARY",
        500,
        "Invalid Activity summary.",
      );
    }

    state.lastSequence = Math.max(state.lastSequence, event.sequence);
    state.events.push(copyEvent(event));

    if (state.events.length > this.#maxEventsPerProject) {
      state.events.splice(0, state.events.length - this.#maxEventsPerProject);
    }

    const storedEvent = copyEvent(event);
    for (const subscriber of state.subscribers) {
      subscriber(copyEvent(storedEvent));
    }

    return storedEvent;
  }

  async list(
    projectId: string,
    after: ActivitySequence = 0,
  ): Promise<ActivitySnapshot> {
    const state = this.#stateFor(projectId);
    return {
      events: state.events
        .filter((event) => event.sequence > after)
        .map(copyEvent),
      lastSequence: state.lastSequence,
    };
  }

  subscribe(
    projectId: string,
    subscriber: ActivitySubscriber,
  ): ActivitySubscription {
    const state = this.#stateFor(projectId);
    state.subscribers.add(subscriber);

    return {
      unsubscribe() {
        state.subscribers.delete(subscriber);
      },
    };
  }

  subscriberCount(projectId: string): number {
    return this.#stateFor(projectId).subscribers.size;
  }

  #stateFor(projectId: string): ProjectActivityState {
    const existing = this.#states.get(projectId);

    if (existing !== undefined) {
      return existing;
    }

    const state: ProjectActivityState = {
      events: [],
      lastSequence: 0,
      subscribers: new Set(),
    };
    this.#states.set(projectId, state);
    return state;
  }
}

function isCanonicalActivityTimestamp(value: string): boolean {
  if (value.length === 0) {
    return false;
  }

  const parsed = Date.parse(value);
  return Number.isFinite(parsed) && new Date(parsed).toISOString() === value;
}

function isValidActivitySummary(value: string): boolean {
  return (
    value.trim().length > 0 && value.length <= MAX_ACTIVITY_SUMMARY_LENGTH
  );
}

export function copyEvent(event: ActivityEvent): ActivityEvent {
  return {
    id: event.id,
    sequence: event.sequence,
    projectId: event.projectId,
    ...(event.taskId === undefined ? {} : { taskId: event.taskId }),
    ...(event.workflowCorrelationId === undefined
      ? {}
      : { workflowCorrelationId: event.workflowCorrelationId }),
    type: event.type,
    actor: { ...event.actor },
    summary: event.summary,
    createdAt: event.createdAt,
  };
}

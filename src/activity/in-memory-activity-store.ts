import type {
  ActivityEvent,
  ActivitySequence,
  ActivitySnapshot,
  ActivityStore,
  ActivitySubscriber,
  ActivitySubscription,
} from "./types.js";

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

export function copyEvent(event: ActivityEvent): ActivityEvent {
  return {
    id: event.id,
    sequence: event.sequence,
    projectId: event.projectId,
    ...(event.taskId === undefined ? {} : { taskId: event.taskId }),
    type: event.type,
    actor: { ...event.actor },
    summary: event.summary,
    createdAt: event.createdAt,
  };
}

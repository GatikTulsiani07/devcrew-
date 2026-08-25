import { randomUUID } from "node:crypto";

import type { ProjectService } from "../projects/project-service.js";
import type {
  ActivityEvent,
  ActivityEventId,
  ActivityEventInput,
  ActivitySequence,
  ActivitySnapshot,
  ActivityStore,
  ActivitySubscriber,
  ActivitySubscription,
} from "./types.js";

export type ActivityEventIdGenerator = () => ActivityEventId;
export type ActivityClock = () => Date;

export interface ActivityServiceDependencies {
  store: ActivityStore;
  generateEventId?: ActivityEventIdGenerator;
  now?: ActivityClock;
}

export interface ActivityReadServiceDependencies {
  projectService: ProjectService;
  activityService: ActivityService;
}

export interface ActivityService {
  append(input: ActivityEventInput): Promise<ActivityEvent>;
  list(projectId: string, after?: ActivitySequence): Promise<ActivitySnapshot>;
  subscribe(
    projectId: string,
    subscriber: ActivitySubscriber,
  ): ActivitySubscription;
  subscriberCount(projectId: string): number;
}

export interface ActivityReadService {
  list(projectId: string, after?: ActivitySequence): Promise<ActivitySnapshot>;
  subscribe(
    projectId: string,
    subscriber: ActivitySubscriber,
  ): Promise<ActivitySubscription>;
  subscriberCount(projectId: string): number;
}

export function createActivityService({
  store,
  generateEventId = () => `evt_${randomUUID()}`,
  now = () => new Date(),
}: ActivityServiceDependencies): ActivityService {
  return {
    async append(input) {
      const snapshot = await store.list(input.projectId);
      const event: ActivityEvent = {
        id: generateEventId(),
        sequence: snapshot.lastSequence + 1,
        projectId: input.projectId,
        ...(input.taskId === undefined ? {} : { taskId: input.taskId }),
        ...(input.workflowCorrelationId === undefined
          ? {}
          : { workflowCorrelationId: input.workflowCorrelationId }),
        type: input.type,
        actor: { ...input.actor },
        summary: input.summary,
        createdAt: now().toISOString(),
      };

      return store.append(event);
    },

    list(projectId, after) {
      return store.list(projectId, after);
    },

    subscribe(projectId, subscriber) {
      return store.subscribe(projectId, subscriber);
    },

    subscriberCount(projectId) {
      return store.subscriberCount(projectId);
    },
  };
}

export function createActivityReadService({
  projectService,
  activityService,
}: ActivityReadServiceDependencies): ActivityReadService {
  return {
    async list(projectId, after) {
      await projectService.getProject(projectId);
      return activityService.list(projectId, after);
    },

    async subscribe(projectId, subscriber) {
      await projectService.getProject(projectId);
      return activityService.subscribe(projectId, subscriber);
    },

    subscriberCount(projectId) {
      return activityService.subscriberCount(projectId);
    },
  };
}

export function createNoopActivityService(): ActivityService {
  return {
    async append(input) {
      return {
        id: "evt_noop",
        sequence: 0,
        projectId: input.projectId,
        ...(input.taskId === undefined ? {} : { taskId: input.taskId }),
        ...(input.workflowCorrelationId === undefined
          ? {}
          : { workflowCorrelationId: input.workflowCorrelationId }),
        type: input.type,
        actor: { ...input.actor },
        summary: input.summary,
        createdAt: new Date(0).toISOString(),
      };
    },
    async list() {
      return { events: [], lastSequence: 0 };
    },
    subscribe() {
      return { unsubscribe() {} };
    },
    subscriberCount() {
      return 0;
    },
  };
}

export type ActivityEventId = string;
export type ActivitySequence = number;

export type ActivityEventType =
  | "PROJECT_CREATED"
  | "TASK_CREATED"
  | "PLAN_CREATED"
  | "PLAN_APPROVED"
  | "PLAN_REJECTED"
  | "IMPLEMENTATION_COMPLETED"
  | "VALIDATION_COMPLETED"
  | "REVIEW_COMPLETED"
  | "BROWSER_VERIFICATION_COMPLETED"
  | "SCREENSHOT_CAPTURED"
  | "VISUAL_REVIEW_COMPLETED"
  | "VISUAL_REPAIR_STARTED"
  | "VISUAL_REPAIR_COMPLETED"
  | "VISUAL_REPAIR_EXHAUSTED"
  | "PULL_REQUEST_CREATED";

export type ActivityActor =
  | { kind: "HUMAN" }
  | {
      kind: "AGENT";
      role: "MANAGER" | "FULL_STACK_DEVELOPER" | "DEVOPS_ENGINEER" | "REVIEWER";
    }
  | { kind: "SYSTEM" };

export interface ActivityEvent {
  id: ActivityEventId;
  sequence: ActivitySequence;
  projectId: string;
  taskId?: string;
  type: ActivityEventType;
  actor: ActivityActor;
  summary: string;
  createdAt: string;
}

export interface ActivityEventInput {
  projectId: string;
  taskId?: string;
  type: ActivityEventType;
  actor: ActivityActor;
  summary: string;
}

export interface ActivitySnapshot {
  events: readonly ActivityEvent[];
  lastSequence: ActivitySequence;
}

export type ActivitySubscriber = (event: ActivityEvent) => void;

export interface ActivitySubscription {
  unsubscribe(): void;
}

export interface ActivityStore {
  append(event: ActivityEvent): Promise<ActivityEvent>;
  list(projectId: string, after?: ActivitySequence): Promise<ActivitySnapshot>;
  subscribe(
    projectId: string,
    subscriber: ActivitySubscriber,
  ): ActivitySubscription;
  subscriberCount(projectId: string): number;
}

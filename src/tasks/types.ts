export type TaskStatus =
  | "WAITING_FOR_APPROVAL"
  | "PLAN_APPROVED"
  | "PLAN_REJECTED";

export type PlanDecisionType = "APPROVE" | "REJECT";

export interface TaskPlan {
  summary: string;
  steps: readonly string[];
}

export interface PlanDecision {
  decision: PlanDecisionType;
  reason?: string;
  decidedAt: string;
}

export interface TaskSnapshot {
  id: string;
  projectId: string;
  title: string;
  description: string;
  status: TaskStatus;
  plan: TaskPlan;
  planDecision?: PlanDecision;
  createdAt: string;
  updatedAt: string;
}

export interface CreateTaskInput {
  title: string;
  description: string;
}

export interface PlanDecisionInput {
  decision: PlanDecisionType;
  reason?: string;
}

export interface TaskStore {
  create(task: TaskSnapshot): Promise<TaskSnapshot>;
  update(task: TaskSnapshot): Promise<TaskSnapshot>;
  findByProjectAndId(
    projectId: string,
    taskId: string,
  ): Promise<TaskSnapshot | undefined>;
}

export interface TaskPlanner {
  createPlan(input: CreateTaskInput): Promise<TaskPlan>;
}

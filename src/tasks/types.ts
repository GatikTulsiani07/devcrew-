export type TaskStatus =
  | "WAITING_FOR_APPROVAL"
  | "PLAN_APPROVED"
  | "PLAN_REJECTED"
  | "IMPLEMENTATION_COMPLETED";

export type PlanDecisionType = "APPROVE" | "REJECT";
export type ExecutionId = string;
export type ExecutionRole = "FULL_STACK_DEVELOPER";
export type ExecutionStatus = "COMPLETED";

export interface TaskPlan {
  summary: string;
  steps: readonly string[];
}

export interface PlanDecision {
  decision: PlanDecisionType;
  reason?: string;
  decidedAt: string;
}

export interface ImplementationResult {
  summary: string;
  changedFiles: readonly string[];
  verification: readonly string[];
}

export interface TaskExecution {
  id: ExecutionId;
  role: ExecutionRole;
  status: ExecutionStatus;
  attempt: 1;
  startedAt: string;
  completedAt: string;
  result: ImplementationResult;
}

export interface TaskSnapshot {
  id: string;
  projectId: string;
  title: string;
  description: string;
  status: TaskStatus;
  plan: TaskPlan;
  planDecision?: PlanDecision;
  execution?: TaskExecution;
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

export interface DeveloperExecutor {
  execute(task: TaskSnapshot): Promise<TaskExecution>;
}

export type TaskStatus = "WAITING_FOR_APPROVAL";

export interface TaskPlan {
  summary: string;
  steps: readonly string[];
}

export interface TaskSnapshot {
  id: string;
  projectId: string;
  title: string;
  description: string;
  status: TaskStatus;
  plan: TaskPlan;
  createdAt: string;
  updatedAt: string;
}

export interface CreateTaskInput {
  title: string;
  description: string;
}

export interface TaskStore {
  create(task: TaskSnapshot): Promise<TaskSnapshot>;
  findByProjectAndId(
    projectId: string,
    taskId: string,
  ): Promise<TaskSnapshot | undefined>;
}

export interface TaskPlanner {
  createPlan(input: CreateTaskInput): Promise<TaskPlan>;
}

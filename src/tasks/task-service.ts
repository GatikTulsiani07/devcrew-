import { randomUUID } from "node:crypto";

import { ApplicationError } from "../errors.js";
import type { ProjectService } from "../projects/project-service.js";
import type {
  CreateTaskInput,
  TaskPlanner,
  TaskSnapshot,
  TaskStore,
} from "./types.js";

export type TaskIdGenerator = () => string;
export type TaskClock = () => Date;

export interface TaskServiceDependencies {
  projectService: ProjectService;
  planner: TaskPlanner;
  store: TaskStore;
  generateTaskId?: TaskIdGenerator;
  now?: TaskClock;
}

export interface TaskService {
  createTask(
    projectId: string,
    input: CreateTaskInput,
  ): Promise<TaskSnapshot>;
  getTask(projectId: string, taskId: string): Promise<TaskSnapshot>;
}

export function createTaskService({
  projectService,
  planner,
  store,
  generateTaskId = () => `task_${randomUUID()}`,
  now = () => new Date(),
}: TaskServiceDependencies): TaskService {
  return {
    async createTask(projectId, input) {
      await projectService.getProject(projectId);

      const plan = await planner.createPlan(input);
      const timestamp = now().toISOString();
      const task: TaskSnapshot = {
        id: generateTaskId(),
        projectId,
        title: input.title,
        description: input.description,
        status: "WAITING_FOR_APPROVAL",
        plan,
        createdAt: timestamp,
        updatedAt: timestamp,
      };

      return copyTask(await store.create(task));
    },

    async getTask(projectId, taskId) {
      await projectService.getProject(projectId);

      const task = await store.findByProjectAndId(projectId, taskId);

      if (task === undefined) {
        throw new ApplicationError("TASK_NOT_FOUND", 404, "Task not found");
      }

      return copyTask(task);
    },
  };
}

function copyTask(task: TaskSnapshot): TaskSnapshot {
  return {
    id: task.id,
    projectId: task.projectId,
    title: task.title,
    description: task.description,
    status: task.status,
    plan: {
      summary: task.plan.summary,
      steps: [...task.plan.steps],
    },
    createdAt: task.createdAt,
    updatedAt: task.updatedAt,
  };
}

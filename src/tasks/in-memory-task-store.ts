import { ApplicationError } from "../errors.js";
import type { TaskSnapshot, TaskStore } from "./types.js";

export class InMemoryTaskStore implements TaskStore {
  readonly #tasksByProjectAndId = new Map<string, TaskSnapshot>();

  async create(task: TaskSnapshot): Promise<TaskSnapshot> {
    const key = taskKey(task.projectId, task.id);

    if (this.#tasksByProjectAndId.has(key)) {
      throw new ApplicationError(
        "TASK_ALREADY_EXISTS",
        409,
        "Task already exists.",
      );
    }

    this.#tasksByProjectAndId.set(key, task);
    return task;
  }

  async update(task: TaskSnapshot): Promise<TaskSnapshot> {
    this.#tasksByProjectAndId.set(taskKey(task.projectId, task.id), task);
    return task;
  }

  async findByProjectAndId(
    projectId: string,
    taskId: string,
  ): Promise<TaskSnapshot | undefined> {
    return this.#tasksByProjectAndId.get(taskKey(projectId, taskId));
  }
}

function taskKey(projectId: string, taskId: string): string {
  return `${projectId}:${taskId}`;
}

import { ApplicationError } from "../errors.js";
import type { CancellationStage } from "./types.js";

export class TaskCancellationError extends ApplicationError {
  constructor() {
    super("TASK_CANCELLED", 409, "Task cancelled");
    this.name = "TaskCancellationError";
  }
}

export interface ActiveTaskExecution {
  projectId: string;
  taskId: string;
  signal: AbortSignal;
  stage: CancellationStage;
  setStage(stage: CancellationStage): void;
  abort(): void;
  unregister(): void;
  throwIfCancelled(): void;
}

export interface TaskCancellationRegistry {
  register(input: {
    projectId: string;
    taskId: string;
    stage: CancellationStage;
  }): ActiveTaskExecution;
  find(projectId: string, taskId: string): ActiveTaskExecution | undefined;
}

export function createTaskCancellationRegistry(): TaskCancellationRegistry {
  const active = new Map<string, ActiveTaskExecution>();

  return {
    register(input) {
      const key = taskKey(input.projectId, input.taskId);
      const controller = new AbortController();
      let stage = input.stage;
      const execution: ActiveTaskExecution = {
        projectId: input.projectId,
        taskId: input.taskId,
        signal: controller.signal,
        get stage() {
          return stage;
        },
        setStage(nextStage) {
          stage = nextStage;
        },
        abort() {
          controller.abort(new TaskCancellationError());
        },
        unregister() {
          if (active.get(key) === execution) {
            active.delete(key);
          }
        },
        throwIfCancelled() {
          throwIfSignalCancelled(controller.signal);
        },
      };

      active.set(key, execution);
      return execution;
    },

    find(projectId, taskId) {
      return active.get(taskKey(projectId, taskId));
    },
  };
}

export function throwIfSignalCancelled(signal?: AbortSignal): void {
  if (signal?.aborted === true) {
    throw new TaskCancellationError();
  }
}

export function isTaskCancellationError(error: unknown): error is TaskCancellationError {
  return error instanceof TaskCancellationError;
}

function taskKey(projectId: string, taskId: string): string {
  return `${projectId}\0${taskId}`;
}

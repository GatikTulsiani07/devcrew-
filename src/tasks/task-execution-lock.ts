import { ApplicationError } from "../errors.js";

export interface TaskExecutionLock {
  withLock<T>(
    projectId: string,
    taskId: string,
    operation: () => Promise<T>,
  ): Promise<T>;
}

export function createTaskExecutionLock(): TaskExecutionLock {
  const activeTasks = new Set<string>();

  return {
    async withLock(projectId, taskId, operation) {
      const key = taskKey(projectId, taskId);

      if (activeTasks.has(key)) {
        throw taskExecutionInProgressError();
      }

      activeTasks.add(key);
      try {
        return await operation();
      } finally {
        activeTasks.delete(key);
      }
    },
  };
}

export function taskExecutionInProgressError(): ApplicationError {
  return new ApplicationError(
    "TASK_EXECUTION_IN_PROGRESS",
    409,
    "Task execution is already in progress",
  );
}

function taskKey(projectId: string, taskId: string): string {
  return `${projectId}\0${taskId}`;
}

import { ApplicationError } from "../errors.js";
import type { RetryStage } from "./types.js";

export const DEFAULT_TASK_EXECUTION_TIMEOUT_MS = 5 * 60 * 1000;

export class TaskExecutionTimeoutError extends ApplicationError {
  constructor(readonly stage: RetryStage) {
    super("TASK_EXECUTION_TIMEOUT", 500, "Task execution timed out");
    this.name = "TaskExecutionTimeoutError";
  }
}

export interface TaskExecutionBudget {
  readonly startedAt: number;
  readonly deadline: number;
  readonly signal: AbortSignal;
  remainingMs(): number;
  setStage(stage: RetryStage): void;
  throwIfExpired(stage: RetryStage): void;
  composeSignal(signal?: AbortSignal, stage?: RetryStage): AbortSignal;
  dispose(): void;
}

export interface TaskExecutionBudgetDependencies {
  now?: () => number;
  timeoutMs?: number;
  setTimeoutFn?: typeof setTimeout;
  clearTimeoutFn?: typeof clearTimeout;
}

export function createTaskExecutionBudget({
  now = () => Date.now(),
  timeoutMs = DEFAULT_TASK_EXECUTION_TIMEOUT_MS,
  setTimeoutFn = setTimeout,
  clearTimeoutFn = clearTimeout,
}: TaskExecutionBudgetDependencies = {}): TaskExecutionBudget {
  const startedAt = now();
  const deadline = startedAt + timeoutMs;
  const controller = new AbortController();
  let currentStage: RetryStage = "DEVELOPER";
  const timer = setTimeoutFn(() => {
    if (!controller.signal.aborted) {
      controller.abort(new TaskExecutionTimeoutError(currentStage));
    }
  }, Math.max(0, timeoutMs));

  const budget: TaskExecutionBudget = {
    startedAt,
    deadline,
    signal: controller.signal,
    remainingMs() {
      return Math.max(0, deadline - now());
    },
    setStage(stage) {
      currentStage = stage;
    },
    throwIfExpired(stage) {
      currentStage = stage;
      if (budget.remainingMs() <= 0) {
        throw new TaskExecutionTimeoutError(stage);
      }
      if (controller.signal.aborted) {
        throw controller.signal.reason;
      }
    },
    composeSignal(signal, stage = currentStage) {
      currentStage = stage;
      if (signal === undefined) {
        return controller.signal;
      }
      if (typeof AbortSignal.any === "function") {
        return AbortSignal.any([signal, controller.signal]);
      }
      return composeAbortSignals(signal, controller.signal);
    },
    dispose() {
      clearTimeoutFn(timer);
    },
  };

  return budget;
}

function composeAbortSignals(
  left: AbortSignal,
  right: AbortSignal,
): AbortSignal {
  const controller = new AbortController();
  const abort = (signal: AbortSignal) => {
    if (!controller.signal.aborted) {
      controller.abort(signal.reason);
    }
  };

  if (left.aborted) {
    abort(left);
  } else if (right.aborted) {
    abort(right);
  } else {
    left.addEventListener("abort", () => abort(left), { once: true });
    right.addEventListener("abort", () => abort(right), { once: true });
  }

  return controller.signal;
}

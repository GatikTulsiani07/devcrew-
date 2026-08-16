export const MAX_WORKFLOW_DURATION_MS = 10 * 60 * 1000;

export type MonotonicClock = () => number;

export interface WorkflowDurationTimer {
  finish(): number;
}

export function startWorkflowDurationTimer(
  clock: MonotonicClock = defaultMonotonicClock,
): WorkflowDurationTimer {
  const startedAt = safeClockValue(clock);

  return {
    finish() {
      return safeDurationMs(safeClockValue(clock) - startedAt);
    },
  };
}

export function safeDurationMs(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.min(
    Math.max(0, Math.round(value)),
    MAX_WORKFLOW_DURATION_MS,
  );
}

function safeClockValue(clock: MonotonicClock): number {
  try {
    const value = clock();
    return Number.isFinite(value) ? value : 0;
  } catch {
    return 0;
  }
}

function defaultMonotonicClock(): number {
  return performance.now();
}

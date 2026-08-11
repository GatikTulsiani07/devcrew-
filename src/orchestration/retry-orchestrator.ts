import { ApplicationError } from "../errors.js";
import { ControlledBrowserVerificationError } from "../browser/controlled-browser-verifier.js";
import { ControlledDevServerError } from "../browser/controlled-dev-server.js";
import { ControlledScreenshotCaptureError } from "../browser/controlled-screenshot-capture.js";
import { ScreenshotArtifactStoreError } from "../browser/screenshot-store.js";
import { GitHubPullRequestClientError } from "../github/github-pull-request-client.js";
import { GitCheckpointError } from "../repositories/git-checkpoint.js";
import { GitRemotePushError } from "../repositories/git-remote-push.js";
import type { ActivityService } from "../activity/activity-service.js";
import { PullRequestServiceError } from "../tasks/pull-request-service.js";
import {
  isTaskCancellationError,
  throwIfSignalCancelled,
} from "../tasks/task-cancellation.js";
import type { CancellationStage } from "../tasks/types.js";
import type {
  RetryAttemptEvidence,
  RetryFailureCategory,
  RetryRecoveryEvidence,
  RetryStage,
  TaskSnapshot,
  TaskStore,
} from "../tasks/types.js";

export const MAX_RETRY_ATTEMPTS = 2;
const MAX_RETRY_ATTEMPT_EVIDENCE = 20;
const RETRY_BACKOFF_MS = 250;

export interface RetryClassification {
  stage: RetryStage;
  category: RetryFailureCategory;
  retryable: boolean;
  summary: string;
}

export class RetryStageFailureError extends ApplicationError {
  constructor(
    readonly classification: RetryClassification,
    publicMessage = "An unexpected error occurred",
  ) {
    super("INTERNAL_ERROR", 500, publicMessage);
    this.name = "RetryStageFailureError";
  }
}

export interface RetryOrchestratorDependencies {
  store: TaskStore;
  now?: () => Date;
  sleep?: (ms: number, signal?: AbortSignal) => Promise<void>;
  activityService: ActivityService;
  runStage(stage: RetryStage, task: TaskSnapshot): Promise<TaskSnapshot>;
}

export interface RetryOrchestrator {
  recordFailure(
    task: TaskSnapshot,
    fallbackStage: RetryStage,
    error: unknown,
  ): Promise<TaskSnapshot>;
  retry(
    task: TaskSnapshot,
    options?: {
      signal?: AbortSignal;
      setStage?: (stage: CancellationStage) => void;
    },
  ): Promise<TaskSnapshot>;
}

export function createRetryOrchestrator({
  store,
  now = () => new Date(),
  sleep = abortableSleep,
  activityService,
  runStage,
}: RetryOrchestratorDependencies): RetryOrchestrator {
  return {
    async recordFailure(task, fallbackStage, error) {
      const classification = classifyRetryFailure(error, fallbackStage);
      const attemptNumber = attemptsForStage(
        task.retryRecovery?.attempts ?? [],
        classification.stage,
      ).length + 1;
      const maxAttempts = retryPolicyForStage(classification.stage).maxAttempts;
      const retryAvailable =
        classification.retryable && attemptNumber < maxAttempts;
      const exhausted = classification.retryable && attemptNumber >= maxAttempts;
      const timestamp = now().toISOString();
      const evidence = failureAttemptEvidence({
        classification,
        attempt: attemptNumber,
        startedAt: timestamp,
        completedAt: timestamp,
      });

      return copyTask(
        await store.update({
          ...copyTask(task),
          retryRecovery: boundedRecovery({
            failedStage: classification.stage,
            retryAvailable,
            exhausted,
            attempts: [...(task.retryRecovery?.attempts ?? []), evidence],
          }),
          updatedAt: timestamp,
        }),
      );
    },

    async retry(task, options = {}) {
      const recovery = task.retryRecovery;
      const stage = recovery?.failedStage;

      if (recovery === undefined || stage === undefined || recovery.retryAvailable !== true) {
        throw new ApplicationError(
          "INVALID_TASK_TRANSITION",
          409,
          "Task has no retryable failed stage",
        );
      }

      const previousStageAttempts = attemptsForStage(recovery.attempts, stage);
      const attemptNumber = previousStageAttempts.length + 1;
      const policy = retryPolicyForStage(stage);
      throwIfSignalCancelled(options.signal);

      if (attemptNumber > policy.maxAttempts) {
        throw new ApplicationError(
          "INVALID_TASK_TRANSITION",
          409,
          "Task retry limit has been reached",
        );
      }

      if (attemptNumber > 1) {
        options.setStage?.("RETRY_WAIT");
        await sleep(RETRY_BACKOFF_MS, options.signal);
      }
      options.setStage?.(stage);
      throwIfSignalCancelled(options.signal);

      await activityService.append({
        projectId: task.projectId,
        taskId: task.id,
        type: "RETRY_STARTED",
        actor: { kind: "SYSTEM" },
        summary: `Retrying ${stageLabel(stage)}.`,
      });

      const startedAt = now().toISOString();
      try {
        const retried = await runStage(stage, copyTask(task));
        throwIfSignalCancelled(options.signal);
        const completedAt = now().toISOString();
        const success = successAttemptEvidence({
          stage,
          attempt: attemptNumber,
          startedAt,
          completedAt,
          previousCategory: previousStageAttempts.at(-1)?.category,
        });
        const updated = await store.update({
          ...copyTask(retried),
          retryRecovery: boundedRecovery({
            retryAvailable: false,
            exhausted: false,
            attempts: [...recovery.attempts, success],
          }),
          updatedAt: completedAt,
        });

        await activityService.append({
          projectId: task.projectId,
          taskId: task.id,
          type: "RETRY_COMPLETED",
          actor: { kind: "SYSTEM" },
          summary: `${stageLabel(stage)} retry succeeded.`,
        });

        return copyTask(updated);
      } catch (error) {
        if (isTaskCancellationError(error)) {
          throw error;
        }
        const classification = classifyRetryFailure(error, stage);
        const completedAt = now().toISOString();
        const exhausted = attemptNumber >= policy.maxAttempts;
        const failure = failureAttemptEvidence({
          classification,
          attempt: attemptNumber,
          startedAt,
          completedAt,
        });
        const latest =
          (await store.findByProjectAndId(task.projectId, task.id)) ?? task;

        await store.update({
          ...copyTask(latest),
          retryRecovery: boundedRecovery({
            failedStage: classification.stage,
            retryAvailable: classification.retryable && !exhausted,
            exhausted: classification.retryable && exhausted,
            attempts: [...recovery.attempts, failure],
          }),
          updatedAt: completedAt,
        });

        if (classification.retryable && exhausted) {
          await activityService.append({
            projectId: task.projectId,
            taskId: task.id,
            type: "RETRY_EXHAUSTED",
            actor: { kind: "SYSTEM" },
            summary: `${stageLabel(stage)} retry limit reached.`,
          });
        }

        throw sanitizeStageError(classification.stage);
      }
    },
  };
}

export function createRetryStageFailure(
  stage: RetryStage,
  category: RetryFailureCategory,
  retryable: boolean,
  publicMessage?: string,
): RetryStageFailureError {
  return new RetryStageFailureError({
    stage,
    category,
    retryable,
    summary: safeSummary(stage, category, retryable),
  }, publicMessage);
}

export function classifyRetryFailure(
  error: unknown,
  fallbackStage: RetryStage,
): RetryClassification {
  if (error instanceof RetryStageFailureError) {
    return error.classification;
  }

  if (error instanceof ControlledDevServerError) {
    return classifyReason("BROWSER", error.reason);
  }

  if (error instanceof ControlledBrowserVerificationError) {
    return classifyReason("BROWSER", error.reason);
  }

  if (error instanceof ControlledScreenshotCaptureError) {
    return classifyReason("SCREENSHOT", error.reason);
  }

  if (error instanceof ScreenshotArtifactStoreError) {
    return classifyReason("SCREENSHOT", error.reason);
  }

  if (error instanceof GitCheckpointError) {
    return classifyReason("CHECKPOINT", error.reason);
  }

  if (error instanceof GitRemotePushError) {
    return classifyReason("REMOTE_PUSH", error.reason);
  }

  if (error instanceof GitHubPullRequestClientError) {
    return classifyReason("PULL_REQUEST", error.reason);
  }

  if (error instanceof PullRequestServiceError) {
    return classifyReason("PULL_REQUEST", error.reason);
  }

  if (error instanceof ApplicationError && error.code === "INVALID_TASK_TRANSITION") {
    return classification(fallbackStage, "INVALID_TRANSITION", false);
  }

  return classification(fallbackStage, "UNKNOWN_FAILURE", false);
}

export function classifyProviderFailure(
  stage: "DEVELOPER" | "VISUAL_REVIEW" | "REVIEWER",
  error: unknown,
): RetryStageFailureError {
  const message = errorMessage(error);

  if (error instanceof DOMException && error.name === "AbortError") {
    return createRetryStageFailure(stage, "PROVIDER_TIMEOUT", true);
  }

  if (/\b(timeout|timed out|aborted)\b/i.test(message)) {
    return createRetryStageFailure(stage, "PROVIDER_TIMEOUT", true);
  }

  if (/\b(network|fetch|econnreset|econnrefused|enotfound|etimedout|socket)\b/i.test(message)) {
    return createRetryStageFailure(stage, "PROVIDER_NETWORK", true);
  }

  return createRetryStageFailure(stage, "UNKNOWN_FAILURE", false);
}

export function retryPolicyForStage(
  stage: RetryStage,
): { maxAttempts: number } {
  if (stage === "CHECKPOINT") {
    return { maxAttempts: 1 };
  }

  return { maxAttempts: MAX_RETRY_ATTEMPTS };
}

export function sanitizeStageError(stage: RetryStage): ApplicationError {
  void stage;
  return new ApplicationError(
    "INTERNAL_ERROR",
    500,
    "An unexpected error occurred",
  );
}

function classifyReason(stage: RetryStage, reason: string): RetryClassification {
  const normalized = reason.toLowerCase();

  if (stage === "BROWSER") {
    if (normalized.includes("startup timed out")) {
      return classification(stage, "LOCALHOST_STARTUP_TIMEOUT", true);
    }
    if (
      normalized.includes("spawn failed") ||
      normalized.includes("readiness failed") ||
      normalized.includes("navigation timed out") ||
      normalized.includes("navigation failed") ||
      normalized.includes("server exited before readiness")
    ) {
      return classification(stage, "BROWSER_STARTUP_TRANSIENT", true);
    }
    if (normalized.includes("localhost url is not approved")) {
      return classification(stage, "UNSAFE_PATH", false);
    }
    if (normalized.includes("unsupported")) {
      return classification(stage, "UNSUPPORTED_CONFIGURATION", false);
    }
    return classification(stage, "UNKNOWN_FAILURE", false);
  }

  if (stage === "SCREENSHOT") {
    if (
      normalized.includes("capture failed") ||
      normalized.includes("storage failed") ||
      normalized.includes("artifact write failed") ||
      normalized.includes("artifact read failed")
    ) {
      return classification(stage, "BROWSER_STARTUP_TRANSIENT", true);
    }
    if (
      normalized.includes("artifact path escaped") ||
      normalized.includes("overlaps repository") ||
      normalized.includes("unsafe") ||
      normalized.includes("not absolute")
    ) {
      return classification(stage, "SCREENSHOT_ARTIFACT_MISMATCH", false);
    }
    return classification(stage, "UNKNOWN_FAILURE", false);
  }

  if (stage === "CHECKPOINT") {
    if (
      normalized.includes("unsafe") ||
      normalized.includes("dirty") ||
      normalized.includes("missing") ||
      normalized.includes("does not match") ||
      normalized.includes("current branch")
    ) {
      return classification(stage, "CHECKPOINT_MISMATCH", false);
    }
    return classification(stage, "UNKNOWN_FAILURE", false);
  }

  if (stage === "REMOTE_PUSH") {
    if (
      normalized.includes("different commit") ||
      normalized.includes("does not match") ||
      normalized.includes("working tree") ||
      normalized.includes("current branch")
    ) {
      return classification(stage, "BRANCH_DIVERGENCE", false);
    }
    if (
      normalized.includes("configured remote") ||
      normalized.includes("unsafe") ||
      normalized.includes("malformed") ||
      normalized.includes("ambiguous")
    ) {
      return classification(stage, "REPOSITORY_MISMATCH", false);
    }
    if (normalized.includes("git remote push command failed")) {
      return classification(stage, "GIT_PUSH_TRANSIENT", true);
    }
    return classification(stage, "UNKNOWN_FAILURE", false);
  }

  if (stage === "PULL_REQUEST") {
    if (normalized.includes("timed out")) {
      return classification(stage, "GITHUB_TIMEOUT", true);
    }
    if (normalized.includes("provider request failed")) {
      return classification(stage, "GITHUB_TRANSIENT", true);
    }
    if (normalized.includes("malformed provider response")) {
      return classification(stage, "MODEL_OUTPUT_SCHEMA_INVALID", false);
    }
    if (
      normalized.includes("missing github token") ||
      normalized.includes("not authoritative") ||
      normalized.includes("unsafe") ||
      normalized.includes("mismatch") ||
      normalized.includes("required")
    ) {
      return classification(stage, "UNSUPPORTED_CONFIGURATION", false);
    }
    return classification(stage, "UNKNOWN_FAILURE", false);
  }

  return classification(stage, "UNKNOWN_FAILURE", false);
}

function classification(
  stage: RetryStage,
  category: RetryFailureCategory,
  retryable: boolean,
): RetryClassification {
  return {
    stage,
    category,
    retryable,
    summary: safeSummary(stage, category, retryable),
  };
}

function failureAttemptEvidence(input: {
  classification: RetryClassification;
  attempt: number;
  startedAt: string;
  completedAt: string;
}): RetryAttemptEvidence {
  return {
    stage: input.classification.stage,
    attempt: input.attempt,
    status: "FAILED",
    category: input.classification.category,
    startedAt: input.startedAt,
    completedAt: input.completedAt,
    retryable: input.classification.retryable,
    summary: safeText(input.classification.summary, 300),
  };
}

function successAttemptEvidence(input: {
  stage: RetryStage;
  attempt: number;
  startedAt: string;
  completedAt: string;
  previousCategory?: RetryFailureCategory;
}): RetryAttemptEvidence {
  return {
    stage: input.stage,
    attempt: input.attempt,
    status: "SUCCEEDED",
    category: input.previousCategory ?? "UNKNOWN_FAILURE",
    startedAt: input.startedAt,
    completedAt: input.completedAt,
    retryable: true,
    summary: `${stageLabel(input.stage)} retry succeeded.`,
  };
}

function boundedRecovery(recovery: RetryRecoveryEvidence): RetryRecoveryEvidence {
  return {
    ...(recovery.failedStage === undefined ? {} : { failedStage: recovery.failedStage }),
    retryAvailable: recovery.retryAvailable,
    exhausted: recovery.exhausted === true,
    attempts: recovery.attempts.slice(-MAX_RETRY_ATTEMPT_EVIDENCE).map((attempt) => ({
      stage: attempt.stage,
      attempt: attempt.attempt,
      status: attempt.status,
      category: attempt.category,
      startedAt: attempt.startedAt,
      completedAt: attempt.completedAt,
      retryable: attempt.retryable,
      summary: safeText(attempt.summary, 300),
    })),
  };
}

function attemptsForStage(
  attempts: readonly RetryAttemptEvidence[],
  stage: RetryStage,
): readonly RetryAttemptEvidence[] {
  return attempts.filter((attempt) => attempt.stage === stage);
}

function safeSummary(
  stage: RetryStage,
  category: RetryFailureCategory,
  retryable: boolean,
): string {
  const retryText = retryable ? "retryable" : "non-retryable";
  return `${stageLabel(stage)} failed with ${retryText} category ${category}.`;
}

function stageLabel(stage: RetryStage): string {
  return stage
    .toLowerCase()
    .replace(/_/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return "";
}

function safeText(value: string, maxLength: number): string {
  return value
    .replace(
      /(?:^|[\s:])(?:\/(?:Users|private\/tmp|tmp|var|etc)\/|[A-Za-z]:\\|\\\\)[^\s]*/g,
      "[redacted path]",
    )
    .replace(/(?:OPENAI_API_KEY|DATABASE_URL|DIRECT_URL|GITHUB_TOKEN|sk-[A-Za-z0-9_-]+)/g, "[redacted secret]")
    .replace(/(?:Authorization:\s*\S+|Bearer\s+[A-Za-z0-9._~+/=-]+)/gi, "[redacted secret]")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

function copyTask(task: TaskSnapshot): TaskSnapshot {
  return JSON.parse(JSON.stringify(task)) as TaskSnapshot;
}

function abortableSleep(ms: number, signal?: AbortSignal): Promise<void> {
  throwIfSignalCancelled(signal);

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      cleanup();
      resolve();
    }, ms);
    const onAbort = () => {
      cleanup();
      reject(signal?.reason ?? new Error("Operation cancelled"));
    };
    const cleanup = () => {
      clearTimeout(timeout);
      signal?.removeEventListener("abort", onAbort);
    };

    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

import { randomUUID } from "node:crypto";

import {
  createNoopActivityService,
  type ActivityService,
} from "../activity/activity-service.js";
import { ApplicationError } from "../errors.js";
import type { ProjectService } from "../projects/project-service.js";
import type {
  GitChangeEvidence,
  GitRepositoryChangeSummary,
} from "../repositories/git-inspector.js";
import {
  createNoopRepositoryDriftVerifier,
  RepositoryDriftError,
  REPOSITORY_DRIFT_SUMMARY,
  type RepositoryDriftVerifier,
} from "../repositories/repository-drift.js";
import type { ValidationSelectionEvidence } from "../validation/validation-selection.js";
import {
  createNoopValidationIntegrityService,
  ValidationIntegrityError,
  VALIDATION_INTEGRITY_SUMMARY,
  type ValidationIntegrityEvidence,
  type ValidationIntegrityService,
} from "../validation/validation-integrity.js";
import {
  createVisualRepairOrchestrator,
} from "../orchestration/visual-repair-orchestrator.js";
import {
  classifyRetryFailure,
  createRetryOrchestrator,
  sanitizeStageError,
} from "../orchestration/retry-orchestrator.js";
import {
  createTaskCancellationRegistry,
  isTaskCancellationError,
  throwIfSignalCancelled,
  type ActiveTaskExecution,
  type TaskCancellationRegistry,
} from "./task-cancellation.js";
import {
  createTaskExecutionLock,
  type TaskExecutionLock,
} from "./task-execution-lock.js";
import {
  createTaskExecutionBudget,
  TaskExecutionTimeoutError,
  type TaskExecutionBudget,
} from "./task-execution-budget.js";
import {
  startWorkflowDurationTimer,
  safeDurationMs,
  type MonotonicClock,
} from "./workflow-duration.js";
import { createWorkflowFailureEvidence } from "./workflow-failure.js";
import {
  createWorkflowCorrelationId as defaultCreateWorkflowCorrelationId,
  workflowCommandContext,
  type WorkflowCommandContext,
  type WorkflowCorrelationIdFactory,
} from "./workflow-correlation.js";
import {
  deriveWorkflowResumeMetadata,
  type WorkflowResumeMetadata,
  type WorkflowResumeStage,
} from "./workflow-resume.js";
import { deriveTaskOutcome } from "./task-outcome.js";
import type {
  CancellationStage,
  CreateTaskInput,
  DeveloperExecutor,
  DevOpsPublisher,
  DevOpsValidator,
  ManagerPlanner,
  PlanDecisionInput,
  RetryStage,
  TaskPullRequestCreator,
  TaskReviewer,
  TaskSnapshot,
  TaskStore,
} from "./types.js";
import {
  appendCommandAudit,
  type CommandAuditOperation,
  type CommandAuditStatus,
} from "./task-command-audit.js";

export type TaskIdGenerator = () => string;
export type TaskClock = () => Date;

export interface TaskServiceDependencies {
  projectService: ProjectService;
  planner: ManagerPlanner;
  developerExecutor: DeveloperExecutor;
  devOpsValidator: DevOpsValidator;
  taskReviewer: TaskReviewer;
  pullRequestCreator?: TaskPullRequestCreator;
  store: TaskStore;
  generateTaskId?: TaskIdGenerator;
  now?: TaskClock;
  auditNow?: TaskClock;
  activityService?: ActivityService;
  cancellationRegistry?: TaskCancellationRegistry;
  executionLock?: TaskExecutionLock;
  createExecutionBudget?: () => TaskExecutionBudget;
  durationClock?: MonotonicClock;
  auditDurationClock?: MonotonicClock;
  repositoryDriftVerifier?: RepositoryDriftVerifier;
  validationIntegrityService?: ValidationIntegrityService;
  createWorkflowCorrelationId?: WorkflowCorrelationIdFactory;
}

export interface TaskService {
  createTask(
    projectId: string,
    input: CreateTaskInput,
  ): Promise<TaskSnapshot>;
  getTask(projectId: string, taskId: string): Promise<TaskSnapshot>;
  decidePlan(
    projectId: string,
    taskId: string,
    input: PlanDecisionInput,
  ): Promise<TaskSnapshot>;
  executeTask(projectId: string, taskId: string): Promise<TaskSnapshot>;
  validateTask(projectId: string, taskId: string): Promise<TaskSnapshot>;
  reviewTask(projectId: string, taskId: string): Promise<TaskSnapshot>;
  retryTask(projectId: string, taskId: string): Promise<TaskSnapshot>;
  cancelTask(projectId: string, taskId: string): Promise<TaskSnapshot>;
  createPullRequest(projectId: string, taskId: string): Promise<TaskSnapshot>;
  refreshPullRequest(projectId: string, taskId: string): Promise<TaskSnapshot>;
  publishPullRequestSummaryComment(
    projectId: string,
    taskId: string,
  ): Promise<TaskSnapshot>;
  resumeTask(projectId: string, taskId: string): Promise<TaskSnapshot>;
}

export function createTaskService({
  projectService,
  planner,
  developerExecutor,
  devOpsValidator,
  taskReviewer,
  pullRequestCreator = unavailablePullRequestCreator(),
  store,
  generateTaskId = () => `task_${randomUUID()}`,
  now = () => new Date(),
  auditNow = () => new Date(),
  activityService = createNoopActivityService(),
  cancellationRegistry = createTaskCancellationRegistry(),
  executionLock = createTaskExecutionLock(),
  createExecutionBudget = () => createTaskExecutionBudget(),
  durationClock,
  auditDurationClock,
  repositoryDriftVerifier = createNoopRepositoryDriftVerifier(),
  validationIntegrityService = createNoopValidationIntegrityService(),
  createWorkflowCorrelationId = defaultCreateWorkflowCorrelationId,
}: TaskServiceDependencies): TaskService {
  const newWorkflowCommand = () =>
    workflowCommandContext(createWorkflowCorrelationId());
  const retryOrchestrator = createRetryOrchestrator({
    store,
    now,
    activityService,
    runStage: retryStage,
    durationClock,
  });

  return {
    async createTask(projectId, input) {
      const project = await projectService.getProject(projectId);
      const taskId = generateTaskId();

      if ((await store.findByProjectAndId(projectId, taskId)) !== undefined) {
        throw new ApplicationError(
          "TASK_ALREADY_EXISTS",
          409,
          "Task already exists.",
        );
      }

      const plan = await planner.createPlan({ ...input, project });
      const timestamp = now().toISOString();
      const task: TaskSnapshot = {
        id: taskId,
        projectId,
        title: input.title,
        description: input.description,
        status: "WAITING_FOR_APPROVAL",
        plan,
        createdAt: timestamp,
        updatedAt: timestamp,
      };

      const createdTask = copyTask(await store.create(task));
      await activityService.append({
        projectId,
        taskId: createdTask.id,
        type: "TASK_CREATED",
        actor: { kind: "HUMAN" },
        summary: "Engineering task created.",
      });
      await activityService.append({
        projectId,
        taskId: createdTask.id,
        type: "PLAN_CREATED",
        actor: { kind: "AGENT", role: "MANAGER" },
        summary: "Manager created an engineering plan.",
      });

      return createdTask;
    },

    async getTask(projectId, taskId) {
      await projectService.getProject(projectId);

      const task = await store.findByProjectAndId(projectId, taskId);

      if (task === undefined) {
        throw new ApplicationError("TASK_NOT_FOUND", 404, "Task not found");
      }

      return withTaskOutcome(task);
    },

    async decidePlan(projectId, taskId, input) {
      await projectService.getProject(projectId);

      await assertTaskExists(projectId, taskId);

      return executionLock.withLock(projectId, taskId, async () => {
        const task = await requireTask(projectId, taskId);

        if (task.status !== "WAITING_FOR_APPROVAL") {
          throw new ApplicationError(
            "INVALID_TASK_TRANSITION",
            409,
            "Task plan has already been decided",
          );
        }

        const timestamp = now().toISOString();
        const updatedTask: TaskSnapshot = {
          ...copyTask(task),
          status:
            input.decision === "APPROVE" ? "PLAN_APPROVED" : "PLAN_REJECTED",
          planDecision: {
            decision: input.decision,
            ...(input.reason === undefined ? {} : { reason: input.reason }),
            decidedAt: timestamp,
          },
          updatedAt: timestamp,
        };

        const decidedTask = copyTask(await store.update(updatedTask));
        await activityService.append({
          projectId,
          taskId,
          type:
            input.decision === "APPROVE" ? "PLAN_APPROVED" : "PLAN_REJECTED",
          actor: { kind: "HUMAN" },
          summary:
            input.decision === "APPROVE"
              ? "Plan approved for implementation."
              : "Plan rejected by human reviewer.",
        });

        return decidedTask;
      });
    },

    async executeTask(projectId, taskId) {
      const project = await projectService.getProject(projectId);
      const command = newWorkflowCommand();

      await assertTaskExists(projectId, taskId);

      return executionLock.withLock(
        projectId,
        taskId,
        () => runCommandAudit(
        "EXECUTE",
        projectId,
        taskId,
        command,
        async () => {
        const task = await requireTask(projectId, taskId);

        if (task.status !== "PLAN_APPROVED" || task.execution !== undefined) {
          throw new ApplicationError(
            "INVALID_TASK_TRANSITION",
            409,
            "Task is not approved for implementation",
          );
        }

        assertNoPendingRetry(task);
        assertTaskNotCancelled(task);

        const active = cancellationRegistry.register({
          projectId,
          taskId,
          stage: "DEVELOPER",
        });
        const budget = createExecutionBudget();
        try {
          return await runDeveloperStage(project, task, active, budget, undefined, command);
        } catch (error) {
          if (isTaskCancellationError(error)) {
            await completeCancellation(await latestTaskOr(task), active.stage);
            throw error;
          }
          if (isRepositoryDriftApplicationError(error)) {
            throw error;
          }
          if (isValidationIntegrityApplicationError(error)) {
            throw error;
          }
          const latest = await latestTaskOr(task);
          await retryOrchestrator.recordFailure(
            latest,
            currentWorkflowStage(active, "DEVELOPER"),
            error,
            command,
          );
          throw sanitizeStageError("DEVELOPER");
        } finally {
          budget.dispose();
          active.unregister();
        }
        },
        ),
      );
    },

    async validateTask(projectId, taskId) {
      const project = await projectService.getProject(projectId);
      const command = newWorkflowCommand();

      await assertTaskExists(projectId, taskId);

      return executionLock.withLock(
        projectId,
        taskId,
        () => runCommandAudit(
        "VALIDATE",
        projectId,
        taskId,
        command,
        async () => {
        const task = await requireTask(projectId, taskId);

        if (
          task.status !== "IMPLEMENTATION_COMPLETED" ||
          task.validation !== undefined
        ) {
          throw new ApplicationError(
            "INVALID_TASK_TRANSITION",
            409,
            "Task implementation is not ready for validation",
          );
        }

        assertNoPendingRetry(task);
        assertTaskNotCancelled(task);

        const active = cancellationRegistry.register({
          projectId,
          taskId,
          stage: "DEVOPS",
        });
        const budget = createExecutionBudget();
        try {
          return await runValidationWorkflow(project, task, active, budget, undefined, command);
        } catch (error) {
          if (isTaskCancellationError(error)) {
            await completeCancellation(await latestTaskOr(task), active.stage);
            throw error;
          }
          if (isRepositoryDriftApplicationError(error)) {
            throw error;
          }
          if (isValidationIntegrityApplicationError(error)) {
            throw error;
          }
          const latest = await latestTaskOr(task);
          await retryOrchestrator.recordFailure(
            latest,
            currentWorkflowStage(active, "DEVOPS"),
            error,
            command,
          );
          throw sanitizeStageError("DEVOPS");
        } finally {
          budget.dispose();
          active.unregister();
        }
        },
        ),
      );
    },

    async reviewTask(projectId, taskId) {
      const project = await projectService.getProject(projectId);
      const command = newWorkflowCommand();

      await assertTaskExists(projectId, taskId);

      return executionLock.withLock(
        projectId,
        taskId,
        () => runCommandAudit(
        "REVIEW",
        projectId,
        taskId,
        command,
        async () => {
        const task = await requireTask(projectId, taskId);

        if (task.status !== "VALIDATION_COMPLETED" || task.review !== undefined) {
          throw new ApplicationError(
            "INVALID_TASK_TRANSITION",
            409,
            "Task validation is not ready for review",
          );
        }

        if (
          task.validation?.visualReview?.status === "FAILED" ||
          task.visualRepair?.outcome === "EXHAUSTED"
        ) {
          throw new ApplicationError(
            "INVALID_TASK_TRANSITION",
            409,
            "Task visual review is not approved for review",
          );
        }

        assertNoPendingRetry(task);
        assertTaskNotCancelled(task);

        const active = cancellationRegistry.register({
          projectId,
          taskId,
          stage: "REVIEWER",
        });
        const budget = createExecutionBudget();
        try {
          return await runReviewerStage(project, task, active, budget, undefined, command);
        } catch (error) {
          if (isTaskCancellationError(error)) {
            await completeCancellation(await latestTaskOr(task), active.stage);
            throw error;
          }
          if (isRepositoryDriftApplicationError(error)) {
            throw error;
          }
          if (isValidationIntegrityApplicationError(error)) {
            throw error;
          }
          const latest = await latestTaskOr(task);
          await retryOrchestrator.recordFailure(
            latest,
            currentWorkflowStage(active, "REVIEWER"),
            error,
            command,
          );
          throw sanitizeStageError("REVIEWER");
        } finally {
          budget.dispose();
          active.unregister();
        }
        },
        ),
      );
    },

    async retryTask(projectId, taskId) {
      await projectService.getProject(projectId);
      const command = newWorkflowCommand();

      await assertTaskExists(projectId, taskId);

      return executionLock.withLock(
        projectId,
        taskId,
        () => runCommandAudit(
        "RETRY",
        projectId,
        taskId,
        command,
        async () => {
        const task = await requireTask(projectId, taskId);

        assertTaskNotCancelled(task);

        const stage = task.retryRecovery?.failedStage ?? "RETRY_WAIT";
        const active = cancellationRegistry.register({
          projectId,
          taskId,
          stage,
        });
        const budget = createExecutionBudget();
        try {
          return await retryOrchestrator.retry(copyTask(task), {
            signal: budget.composeSignal(
              active.signal,
              stage === "RETRY_WAIT" ? "DEVELOPER" : stage,
            ),
            setStage: (nextStage) => {
              active.setStage(nextStage);
              if (nextStage !== "RETRY_WAIT") {
                budget.setStage(nextStage);
              }
            },
            command,
          });
        } catch (error) {
          if (isTaskCancellationError(error)) {
            await completeCancellation(await latestTaskOr(task), active.stage);
          }
          if (error instanceof TaskExecutionTimeoutError) {
            const latest = await latestTaskOr(task);
            await retryOrchestrator.recordFailure(latest, error.stage, error, command);
            throw sanitizeStageError(error.stage);
          }
          throw error;
        } finally {
          budget.dispose();
          active.unregister();
        }
        },
        ),
      );
    },

    async cancelTask(projectId, taskId) {
      await projectService.getProject(projectId);

      const task = await store.findByProjectAndId(projectId, taskId);

      if (task === undefined) {
        throw new ApplicationError("TASK_NOT_FOUND", 404, "Task not found");
      }

      if (task.cancellation?.status === "CANCELLED") {
        return copyTask(task);
      }

      if (task.cancellation?.status === "FAILED") {
        throw new ApplicationError(
          "INVALID_TASK_TRANSITION",
          409,
          "Task cancellation could not be completed safely",
        );
      }

      if (task.pullRequest !== undefined || task.status === "PLAN_REJECTED") {
        throw new ApplicationError(
          "INVALID_TASK_TRANSITION",
          409,
          "Task cannot be cancelled",
        );
      }

      if (task.cancellation?.status === "REQUESTED") {
        return copyTask(task);
      }

      const active = cancellationRegistry.find(projectId, taskId);
      const requested = await persistCancellationRequested(
        task,
        active?.stage,
      );

      if (active !== undefined) {
        active.abort();
        return requested;
      }

      return completeCancellation(requested, requested.cancellation?.stage);
    },

    async createPullRequest(projectId, taskId) {
      const project = await projectService.getProject(projectId);
      const command = newWorkflowCommand();

      await assertTaskExists(projectId, taskId);

      return executionLock.withLock(
        projectId,
        taskId,
        () => runCommandAudit(
        "PULL_REQUEST_CREATE",
        projectId,
        taskId,
        command,
        async () => {
        const task = await requireTask(projectId, taskId);

        assertNoPendingRetry(task);
        assertTaskNotCancelled(task);

        const active = cancellationRegistry.register({
          projectId,
          taskId,
          stage: "PULL_REQUEST",
        });
        const budget = createExecutionBudget();
        try {
          return await runPullRequestStage(project, task, active, budget, undefined, command);
        } catch (error) {
          if (isTaskCancellationError(error)) {
            await completeCancellation(await latestTaskOr(task), active.stage);
            throw error;
          }
          if (isRepositoryDriftApplicationError(error)) {
            throw error;
          }
          if (isValidationIntegrityApplicationError(error)) {
            throw error;
          }
          const latest = await latestTaskOr(task);
          await retryOrchestrator.recordFailure(
            latest,
            currentWorkflowStage(active, "PULL_REQUEST"),
            error,
            command,
          );
          throw sanitizeStageError("PULL_REQUEST");
        } finally {
          budget.dispose();
          active.unregister();
        }
        },
        ),
      );
    },

    async refreshPullRequest(projectId, taskId) {
      const project = await projectService.getProject(projectId);
      const command = newWorkflowCommand();

      await assertTaskExists(projectId, taskId);

      return executionLock.withLock(
        projectId,
        taskId,
        () => runCommandAudit(
        "PULL_REQUEST_REFRESH",
        projectId,
        taskId,
        command,
        async () => {
        const task = await requireTask(projectId, taskId);

        assertNoPendingRetry(task);
        assertTaskNotCancelled(task);

        if (task.pullRequest === undefined) {
          throw new ApplicationError(
            "INVALID_TASK_TRANSITION",
            409,
            "Task pull request has not been created",
          );
        }

        const timestamp = now().toISOString();
        let pullRequest;
        const budget = createExecutionBudget();

        try {
          budget.throwIfExpired("PULL_REQUEST");
          await assertNoRepositoryDrift(project, task, "PULL_REQUEST", {
            signal: budget.composeSignal(undefined, "PULL_REQUEST"),
          }, command);
          await assertValidationIntegrity(project, task, "PULL_REQUEST", {
            signal: budget.composeSignal(undefined, "PULL_REQUEST"),
          }, command);
          pullRequest = await refreshPullRequestEvidence(
            project,
            task,
            budget.composeSignal(undefined, "PULL_REQUEST"),
            command,
          );
          budget.throwIfExpired("PULL_REQUEST");
        } catch (error) {
          const latest = await latestTaskOr(task);
          const failedAt = now().toISOString();
          const classification = classifyRetryFailure(error, "PULL_REQUEST");
          await store.update({
            ...copyTask(latest),
            workflowFailure: createWorkflowFailureEvidence(
              classification,
              failedAt,
              "GITHUB_PULL_REQUEST_REFRESH",
              command.workflowCorrelationId,
            ),
            updatedAt: failedAt,
          });
          throw sanitizeStageError("PULL_REQUEST");
        } finally {
          budget.dispose();
        }

        return copyTask(
          await store.update({
            ...copyTask(task),
            pullRequest: withWorkflowCorrelation(pullRequest, command),
            workflowFailure: undefined,
            updatedAt: timestamp,
          }),
        );
        },
        ),
      );
    },

    async publishPullRequestSummaryComment(projectId, taskId) {
      const project = await projectService.getProject(projectId);
      const command = newWorkflowCommand();

      await assertTaskExists(projectId, taskId);

      return executionLock.withLock(
        projectId,
        taskId,
        () => runCommandAudit(
        "PULL_REQUEST_SUMMARY_COMMENT",
        projectId,
        taskId,
        command,
        async () => {
        const task = await requireTask(projectId, taskId);

        assertNoPendingRetry(task);
        assertTaskNotCancelled(task);

        if (task.workflowFailure !== undefined) {
          throw new ApplicationError(
            "INVALID_TASK_TRANSITION",
            409,
            "Task has an unresolved workflow failure",
          );
        }

        if (task.pullRequest === undefined) {
          throw new ApplicationError(
            "INVALID_TASK_TRANSITION",
            409,
            "Task pull request has not been created",
          );
        }

        const active = cancellationRegistry.register({
          projectId,
          taskId,
          stage: "PULL_REQUEST",
        });
        const budget = createExecutionBudget();

        try {
          budget.throwIfExpired("PULL_REQUEST");
          await assertNoRepositoryDrift(project, task, "PULL_REQUEST", {
            signal: budget.composeSignal(active.signal, "PULL_REQUEST"),
          }, command);
          await assertValidationIntegrity(project, task, "PULL_REQUEST", {
            signal: budget.composeSignal(active.signal, "PULL_REQUEST"),
          }, command);
          const result = await publishPullRequestSummaryCommentEvidence(
            project,
            task,
            budget.composeSignal(active.signal, "PULL_REQUEST"),
            command,
          );
          budget.throwIfExpired("PULL_REQUEST");
          active.throwIfCancelled();

          const timestamp = now().toISOString();
          return copyTask(
            await store.update({
              ...copyTask(task),
              pullRequestSummaryComment: withWorkflowCorrelation(
                result.evidence,
                command,
              ),
              workflowFailure: undefined,
              updatedAt: timestamp,
            }),
          );
        } catch (error) {
          if (isTaskCancellationError(error)) {
            await completeCancellation(await latestTaskOr(task), active.stage);
            throw error;
          }
          if (isRepositoryDriftApplicationError(error)) {
            throw error;
          }
          if (isValidationIntegrityApplicationError(error)) {
            throw error;
          }
          const latest = await latestTaskOr(task);
          const failedAt = now().toISOString();
          const classification = classifyRetryFailure(error, "PULL_REQUEST");
          await store.update({
            ...copyTask(latest),
            workflowFailure: createWorkflowFailureEvidence(
              classification,
              failedAt,
              "GITHUB_PULL_REQUEST_SUMMARY_COMMENT",
              command.workflowCorrelationId,
            ),
            updatedAt: failedAt,
          });
          throw sanitizeStageError("PULL_REQUEST");
        } finally {
          budget.dispose();
          active.unregister();
        }
        },
        ),
      );
    },

    async resumeTask(projectId, taskId) {
      const project = await projectService.getProject(projectId);
      const command = newWorkflowCommand();

      await assertTaskExists(projectId, taskId);

      return executionLock.withLock(
        projectId,
        taskId,
        () => runCommandAudit(
        "RESUME",
        projectId,
        taskId,
        command,
        async () => {
        const task = await requireTask(projectId, taskId);
        const resume = deriveResumeMetadata(task, isDevOpsPublisher(devOpsValidator));

        if (!resume.resumable || resume.nextStage === null) {
          return withResume(task, resume);
        }

        if (resume.nextStage !== "DEVELOPER") {
          const drifted = await persistRepositoryDriftIfPresent(
            project,
            task,
            retryStageForResume(resume.nextStage),
            undefined,
            command,
          );

          if (drifted !== undefined) {
            return withResume(drifted, {
              resumable: false,
              lastCompletedStage: resume.lastCompletedStage,
              nextStage: null,
              reason: "REPOSITORY_STATE_MISMATCH",
            });
          }

          const staleValidation =
            await persistValidationIntegrityFailureIfPresent(
              project,
              task,
              retryStageForResume(resume.nextStage),
              undefined,
              command,
            );

          if (staleValidation !== undefined) {
            return withResume(staleValidation, {
              resumable: false,
              lastCompletedStage: resume.lastCompletedStage,
              nextStage: null,
              reason: "REPOSITORY_STATE_MISMATCH",
            });
          }
        }

        const active = cancellationRegistry.register({
          projectId,
          taskId,
          stage: cancellationStageForResume(resume.nextStage),
        });
        const budget = createExecutionBudget();

        try {
          const resumed = await runResumeStage(
            resume.nextStage,
            project,
            task,
            active,
            budget,
            command,
          );
          return withResume(
            resumed,
            deriveResumeMetadata(resumed, isDevOpsPublisher(devOpsValidator)),
          );
        } catch (error) {
          if (isTaskCancellationError(error)) {
            await completeCancellation(await latestTaskOr(task), active.stage);
            throw error;
          }
          const latest = await latestTaskOr(task);
          const fallbackStage = retryStageForResume(resume.nextStage);
          await retryOrchestrator.recordFailure(
            latest,
            currentWorkflowStage(active, fallbackStage),
            error,
            command,
          );
          throw sanitizeStageError(fallbackStage);
        } finally {
          budget.dispose();
          active.unregister();
        }
        },
        ),
      );
    },
  };

  async function assertTaskExists(
    projectId: string,
    taskId: string,
  ): Promise<void> {
    await requireTask(projectId, taskId);
  }

  async function requireTask(
    projectId: string,
    taskId: string,
  ): Promise<TaskSnapshot> {
    const task = await store.findByProjectAndId(projectId, taskId);

    if (task === undefined) {
      throw new ApplicationError("TASK_NOT_FOUND", 404, "Task not found");
    }

    return task;
  }

  async function runCommandAudit(
    operation: CommandAuditOperation,
    projectId: string,
    taskId: string,
    command: WorkflowCommandContext,
    execute: () => Promise<TaskSnapshot>,
  ): Promise<TaskSnapshot> {
    const startedAt = auditNow().toISOString();
    const timer = startWorkflowDurationTimer(auditDurationClock);

    try {
      const result = await execute();
      const completedAt = auditNow().toISOString();
      const status = commandAuditSuccessStatus(result);
      const failureCategory =
        status === "FAILED"
          ? result.workflowFailure?.category ?? "REPOSITORY_MISMATCH"
          : undefined;
      const audited = appendCommandAudit(result, {
        operation,
        workflowCorrelationId: command.workflowCorrelationId,
        status,
        startedAt,
        completedAt,
        durationMs: safeDurationMs(timer.finish()),
        ...(failureCategory === undefined ? {} : { failureCategory }),
      });

      return copyTask(
        await store.update({
          ...audited,
          updatedAt: result.updatedAt,
        }),
      );
    } catch (error) {
      const latest = await store.findByProjectAndId(projectId, taskId);

      if (latest === undefined) {
        throw error;
      }

      const completedAt = auditNow().toISOString();
      const status = commandAuditStatus(error, latest);
      const failureCategory =
        status === "SUCCEEDED" || status === "CANCELLED"
          ? undefined
          : latest.workflowFailure?.category ??
            classifyRetryFailure(error, commandAuditFallbackStage(operation))
              .category;
      const audited = appendCommandAudit(latest, {
        operation,
        workflowCorrelationId: command.workflowCorrelationId,
        status,
        startedAt,
        completedAt,
        durationMs: safeDurationMs(timer.finish()),
        ...(failureCategory === undefined ? {} : { failureCategory }),
      });

      await store.update({
        ...audited,
        updatedAt: latest.updatedAt,
      });
      throw error;
    }
  }

  async function retryStage(
    stage: RetryStage,
    task: TaskSnapshot,
    signal?: AbortSignal,
    command?: WorkflowCommandContext,
  ): Promise<TaskSnapshot> {
    const project = await projectService.getProject(task.projectId);
    const active = cancellationRegistry.find(task.projectId, task.id);
    active?.setStage(stage);

    switch (stage) {
      case "DEVELOPER":
        return runDeveloperStage(project, task, active, undefined, signal, command);
      case "DEVOPS":
      case "BROWSER":
      case "SCREENSHOT":
      case "VISUAL_REVIEW":
        return runValidationWorkflow(project, task, active, undefined, signal, command);
      case "CHECKPOINT":
      case "REMOTE_PUSH":
        return maybePublishValidatedTask(task, active, undefined, signal, command);
      case "REVIEWER":
        return runReviewerStage(project, task, active, undefined, signal, command);
      case "PULL_REQUEST":
        return runPullRequestStage(project, task, active, undefined, signal, command);
    }
  }

  async function runResumeStage(
    stage: WorkflowResumeStage,
    project: Awaited<ReturnType<ProjectService["getProject"]>>,
    task: TaskSnapshot,
    active: ActiveTaskExecution,
    budget: TaskExecutionBudget,
    command: WorkflowCommandContext,
  ): Promise<TaskSnapshot> {
    switch (stage) {
      case "DEVELOPER":
        return runDeveloperStage(project, task, active, budget, undefined, command);
      case "VALIDATION":
        return runValidationWorkflow(project, task, active, budget, undefined, command);
      case "CHECKPOINT":
      case "PUSH":
        return maybePublishValidatedTask(task, active, budget, undefined, command);
      case "REVIEWER": {
        const verified = await verifyPublishedTaskForResume(task, active, budget, command);
        return runReviewerStage(project, verified, active, budget, undefined, command);
      }
      case "PULL_REQUEST": {
        const verified = await verifyPublishedTaskForResume(task, active, budget, command);
        return runPullRequestStage(project, verified, active, budget, undefined, command);
      }
      case "PLAN":
      case "VISUAL_REPAIR":
      case "COMPLETED":
        return copyTask(task);
    }
  }

  async function runDeveloperStage(
    project: Awaited<ReturnType<ProjectService["getProject"]>>,
    task: TaskSnapshot,
    active?: ActiveTaskExecution,
    budget?: TaskExecutionBudget,
    signal?: AbortSignal,
    command?: WorkflowCommandContext,
  ): Promise<TaskSnapshot> {
    active?.setStage("DEVELOPER");
    budget?.throwIfExpired("DEVELOPER");
    throwIfSignalCancelled(signal);
    active?.throwIfCancelled();
    const timer = startWorkflowDurationTimer(durationClock);
    const execution = withDuration(
      await developerExecutor.execute({
      project,
      task: copyTask(task),
      signal:
        signal ??
        budget?.composeSignal(active?.signal, "DEVELOPER") ??
        active?.signal,
      }),
      timer.finish(),
    );
    const correlatedExecution = withWorkflowCorrelation(execution, command);
    budget?.throwIfExpired("DEVELOPER");
    throwIfSignalCancelled(signal);
    active?.throwIfCancelled();
    const timestamp = now().toISOString();
    const updatedTask: TaskSnapshot = {
      ...copyTask(task),
      status: "IMPLEMENTATION_COMPLETED",
      execution: correlatedExecution,
      workflowFailure: undefined,
      updatedAt: timestamp,
    };

    const executedTask = copyTask(await store.update(updatedTask));
    await activityService.append({
      projectId: task.projectId,
      taskId: task.id,
      workflowCorrelationId: command?.workflowCorrelationId,
      type: "IMPLEMENTATION_COMPLETED",
      actor: { kind: "AGENT", role: "FULL_STACK_DEVELOPER" },
      summary: "Full Stack Developer completed implementation.",
    });

    return executedTask;
  }

  async function runValidationWorkflow(
    project: Awaited<ReturnType<ProjectService["getProject"]>>,
    task: TaskSnapshot,
    active?: ActiveTaskExecution,
    budget?: TaskExecutionBudget,
    signal?: AbortSignal,
    command?: WorkflowCommandContext,
  ): Promise<TaskSnapshot> {
    active?.setStage("DEVOPS");
    budget?.throwIfExpired("DEVOPS");
    throwIfSignalCancelled(signal);
    active?.throwIfCancelled();
    await assertNoRepositoryDrift(project, task, "DEVOPS", {
      signal:
        signal ??
        budget?.composeSignal(active?.signal, "DEVOPS") ??
        active?.signal,
    }, command);
    budget?.throwIfExpired("DEVOPS");
    throwIfSignalCancelled(signal);
    active?.throwIfCancelled();
    const timer = startWorkflowDurationTimer(durationClock);
    const validation = withDuration(
      await devOpsValidator.validate(copyTask(task), {
      signal:
        signal ??
        budget?.composeSignal(active?.signal, "DEVOPS") ??
        active?.signal,
      setStage: (stage) => {
        active?.setStage(stage);
        if (stage !== "RETRY_WAIT") {
          budget?.setStage(stage);
        }
      },
      }),
      timer.finish(),
    );
    const correlatedValidation = correlateValidationEvidence(validation, command);
    budget?.throwIfExpired(currentWorkflowStage(active, "DEVOPS"));
    throwIfSignalCancelled(signal);
    active?.throwIfCancelled();
    const integrityBoundValidation =
      await validationIntegrityService.bindValidation({
        project,
        task: copyTask(task),
        validation: correlatedValidation,
        signal:
          signal ??
          budget?.composeSignal(
            active?.signal,
            currentWorkflowStage(active, "DEVOPS"),
          ) ??
          active?.signal,
      });
    budget?.throwIfExpired(currentWorkflowStage(active, "DEVOPS"));
    throwIfSignalCancelled(signal);
    active?.throwIfCancelled();
    const timestamp = now().toISOString();
    const updatedTask: TaskSnapshot = {
      ...copyTask(task),
      status: "VALIDATION_COMPLETED",
      validation: correlateValidationEvidence(integrityBoundValidation, command),
      workflowFailure: undefined,
      updatedAt: timestamp,
    };

    const validatedTask = copyTask(await store.update(updatedTask));
    await appendValidationActivity(
      task.projectId,
      task.id,
      correlateValidationEvidence(integrityBoundValidation, command),
      command,
    );

    const repairedTask = await createVisualRepairOrchestrator({
      project,
      developerExecutor,
      devOpsValidator,
      store,
      now,
      activityService,
      durationClock,
      validationIntegrityService,
      command,
      signal:
        signal ??
        budget?.composeSignal(active?.signal, currentWorkflowStage(active, "DEVOPS")) ??
        active?.signal,
      setStage: (stage) => {
        active?.setStage(stage);
        if (stage !== "RETRY_WAIT") {
          budget?.setStage(stage);
        }
      },
    }).repairIfRequired(validatedTask);

    budget?.throwIfExpired(currentWorkflowStage(active, "DEVOPS"));
    throwIfSignalCancelled(signal);
    active?.throwIfCancelled();
    return maybePublishValidatedTask(repairedTask, active, budget, undefined, command);
  }

  async function runReviewerStage(
    project: Awaited<ReturnType<ProjectService["getProject"]>>,
    task: TaskSnapshot,
    active?: ActiveTaskExecution,
    budget?: TaskExecutionBudget,
    signal?: AbortSignal,
    command?: WorkflowCommandContext,
  ): Promise<TaskSnapshot> {
    active?.setStage("REVIEWER");
    budget?.throwIfExpired("REVIEWER");
    throwIfSignalCancelled(signal);
    active?.throwIfCancelled();
    await assertNoRepositoryDrift(project, task, "REVIEWER", {
      signal:
        signal ??
        budget?.composeSignal(active?.signal, "REVIEWER") ??
        active?.signal,
    }, command);
    await assertValidationIntegrity(project, task, "REVIEWER", {
      signal:
        signal ??
        budget?.composeSignal(active?.signal, "REVIEWER") ??
        active?.signal,
    }, command);
    budget?.throwIfExpired("REVIEWER");
    throwIfSignalCancelled(signal);
    active?.throwIfCancelled();
    const timer = startWorkflowDurationTimer(durationClock);
    const review = withDuration(
      await taskReviewer.review(copyTask(task), project, {
      signal:
        signal ??
        budget?.composeSignal(active?.signal, "REVIEWER") ??
        active?.signal,
      }),
      timer.finish(),
    );
    const correlatedReview = withWorkflowCorrelation(review, command);
    budget?.throwIfExpired("REVIEWER");
    throwIfSignalCancelled(signal);
    active?.throwIfCancelled();
    const timestamp = now().toISOString();
    const updatedTask: TaskSnapshot = {
      ...copyTask(task),
      status: "REVIEW_COMPLETED",
      review: correlatedReview,
      workflowFailure: undefined,
      updatedAt: timestamp,
    };

    const reviewedTask = copyTask(await store.update(updatedTask));
    await activityService.append({
      projectId: task.projectId,
      taskId: task.id,
      workflowCorrelationId: command?.workflowCorrelationId,
      type: "REVIEW_COMPLETED",
      actor: { kind: "AGENT", role: "REVIEWER" },
      summary: "Reviewer approved the completed work.",
    });

    return reviewedTask;
  }

  async function runPullRequestStage(
    project: Awaited<ReturnType<ProjectService["getProject"]>>,
    task: TaskSnapshot,
    active?: ActiveTaskExecution,
    budget?: TaskExecutionBudget,
    signal?: AbortSignal,
    command?: WorkflowCommandContext,
  ): Promise<TaskSnapshot> {
    active?.setStage("PULL_REQUEST");
    budget?.throwIfExpired("PULL_REQUEST");
    throwIfSignalCancelled(signal);
    active?.throwIfCancelled();
    await assertNoRepositoryDrift(project, task, "PULL_REQUEST", {
      signal:
        signal ??
        budget?.composeSignal(active?.signal, "PULL_REQUEST") ??
        active?.signal,
    }, command);
    await assertValidationIntegrity(project, task, "PULL_REQUEST", {
      signal:
        signal ??
        budget?.composeSignal(active?.signal, "PULL_REQUEST") ??
        active?.signal,
    }, command);
    budget?.throwIfExpired("PULL_REQUEST");
    throwIfSignalCancelled(signal);
    active?.throwIfCancelled();
    const timer = startWorkflowDurationTimer(durationClock);
    const result = await pullRequestCreator.createPullRequest({
      project,
      task: copyTask(task),
      signal:
        signal ??
        budget?.composeSignal(active?.signal, "PULL_REQUEST") ??
        active?.signal,
    });
    budget?.throwIfExpired("PULL_REQUEST");
    throwIfSignalCancelled(signal);
    active?.throwIfCancelled();

    if (task.pullRequest !== undefined) {
      return copyTask(task);
    }

    const durationMs = timer.finish();
    const timestamp = now().toISOString();
    const updatedTask: TaskSnapshot = {
      ...copyTask(task),
      pullRequest: {
        number: result.evidence.number,
        ...(command === undefined
          ? {}
          : { workflowCorrelationId: command.workflowCorrelationId }),
        url: result.evidence.url,
        state: result.evidence.state,
        headBranch: result.evidence.headBranch,
        baseBranch: result.evidence.baseBranch,
        commitSha: result.evidence.commitSha,
        createdAt: result.evidence.createdAt,
        durationMs,
      },
      workflowFailure: undefined,
      updatedAt: timestamp,
    };

    const taskWithPullRequest = copyTask(await store.update(updatedTask));

    if (result.created) {
      await activityService.append({
        projectId: task.projectId,
        taskId: task.id,
        workflowCorrelationId: command?.workflowCorrelationId,
        type: "PULL_REQUEST_CREATED",
        actor: { kind: "SYSTEM" },
        summary: `Pull request #${result.evidence.number} created.`,
      });
    }

    return taskWithPullRequest;
  }

  async function refreshPullRequestEvidence(
    project: Awaited<ReturnType<ProjectService["getProject"]>>,
    task: TaskSnapshot,
    signal?: AbortSignal,
    command?: WorkflowCommandContext,
  ) {
    if (pullRequestCreator.refreshPullRequest === undefined) {
      throw new ApplicationError(
        "PULL_REQUEST_UNAVAILABLE",
        503,
        "Pull request refresh is not configured",
      );
    }

    return withWorkflowCorrelation(await pullRequestCreator.refreshPullRequest({
      project,
      task: copyTask(task),
      ...(signal === undefined ? {} : { signal }),
    }), command);
  }

  async function publishPullRequestSummaryCommentEvidence(
    project: Awaited<ReturnType<ProjectService["getProject"]>>,
    task: TaskSnapshot,
    signal?: AbortSignal,
    command?: WorkflowCommandContext,
  ) {
    if (pullRequestCreator.publishSummaryComment === undefined) {
      throw new ApplicationError(
        "PULL_REQUEST_UNAVAILABLE",
        503,
        "Pull request summary comment is not configured",
      );
    }

    const result = await pullRequestCreator.publishSummaryComment({
      project,
      task: copyTask(task),
      ...(signal === undefined ? {} : { signal }),
    });

    return {
      ...result,
      evidence: withWorkflowCorrelation(result.evidence, command),
    };
  }

  async function maybePublishValidatedTask(
    task: TaskSnapshot,
    active?: ActiveTaskExecution,
    budget?: TaskExecutionBudget,
    signal?: AbortSignal,
    command?: WorkflowCommandContext,
  ): Promise<TaskSnapshot> {
    if (
      task.status !== "VALIDATION_COMPLETED" ||
      task.visualRepair?.outcome === "EXHAUSTED" ||
      task.validation?.visualReview?.status === "FAILED" ||
      task.validation?.checkpoint !== undefined ||
      task.validation?.remoteBranch !== undefined
    ) {
      return copyTask(task);
    }

    if (!isDevOpsPublisher(devOpsValidator)) {
      return copyTask(task);
    }

    active?.setStage("CHECKPOINT");
    budget?.throwIfExpired("CHECKPOINT");
    throwIfSignalCancelled(signal);
    active?.throwIfCancelled();
    await assertNoRepositoryDrift(undefined, task, "CHECKPOINT", {
      signal:
        signal ??
        budget?.composeSignal(active?.signal, "CHECKPOINT") ??
        active?.signal,
    }, command);
    await assertValidationIntegrity(undefined, task, "CHECKPOINT", {
      signal:
        signal ??
        budget?.composeSignal(active?.signal, "CHECKPOINT") ??
        active?.signal,
    }, command);
    budget?.throwIfExpired("CHECKPOINT");
    throwIfSignalCancelled(signal);
    active?.throwIfCancelled();
    const validation = await devOpsValidator.publishValidatedTask(copyTask(task), {
      signal:
        signal ??
        budget?.composeSignal(active?.signal, "CHECKPOINT") ??
        active?.signal,
      setStage: (stage) => {
        active?.setStage(stage);
        if (stage !== "RETRY_WAIT") {
          budget?.setStage(stage);
        }
      },
    });
    budget?.throwIfExpired(currentWorkflowStage(active, "CHECKPOINT"));
    throwIfSignalCancelled(signal);
    active?.throwIfCancelled();
    const timestamp = now().toISOString();
    return copyTask(
      await store.update({
        ...copyTask(task),
        validation: correlateValidationEvidence(validation, command),
        workflowFailure: undefined,
        updatedAt: timestamp,
      }),
    );
  }

  async function verifyPublishedTaskForResume(
    task: TaskSnapshot,
    active: ActiveTaskExecution,
    budget: TaskExecutionBudget,
    command?: WorkflowCommandContext,
  ): Promise<TaskSnapshot> {
    if (
      task.validation?.checkpoint === undefined ||
      task.validation.remoteBranch === undefined ||
      !isDevOpsPublisher(devOpsValidator)
    ) {
      return copyTask(task);
    }

    active.setStage("CHECKPOINT");
    budget.throwIfExpired("CHECKPOINT");
    active.throwIfCancelled();
    await assertNoRepositoryDrift(undefined, task, "CHECKPOINT", {
      signal: budget.composeSignal(active.signal, "CHECKPOINT"),
    }, command);
    await assertValidationIntegrity(undefined, task, "CHECKPOINT", {
      signal: budget.composeSignal(active.signal, "CHECKPOINT"),
    }, command);
    budget.throwIfExpired("CHECKPOINT");
    active.throwIfCancelled();
    const validation = await devOpsValidator.publishValidatedTask(copyTask(task), {
      signal: budget.composeSignal(active.signal, "CHECKPOINT"),
      setStage: (stage) => {
        active.setStage(stage);
        if (stage !== "RETRY_WAIT") {
          budget.setStage(stage);
        }
      },
    });
    budget.throwIfExpired(currentWorkflowStage(active, "CHECKPOINT"));
    active.throwIfCancelled();
    const timestamp = now().toISOString();
    return copyTask(
      await store.update({
        ...copyTask(task),
        validation: correlateValidationEvidence(validation, command),
        workflowFailure: undefined,
        updatedAt: timestamp,
      }),
    );
  }

  async function assertNoRepositoryDrift(
    project:
      | Awaited<ReturnType<ProjectService["getProject"]>>
      | undefined,
    task: TaskSnapshot,
    stage: RetryStage,
    options: { signal?: AbortSignal } = {},
    command?: WorkflowCommandContext,
  ): Promise<void> {
    const drifted = await persistRepositoryDriftIfPresent(
      project ?? (await projectService.getProject(task.projectId)),
      task,
      stage,
      options.signal,
      command,
    );

    if (drifted !== undefined) {
      throw repositoryDriftApplicationError();
    }
  }

  async function assertValidationIntegrity(
    project:
      | Awaited<ReturnType<ProjectService["getProject"]>>
      | undefined,
    task: TaskSnapshot,
    stage: RetryStage,
    options: { signal?: AbortSignal } = {},
    command?: WorkflowCommandContext,
  ): Promise<void> {
    const stale = await persistValidationIntegrityFailureIfPresent(
      project ?? (await projectService.getProject(task.projectId)),
      task,
      stage,
      options.signal,
      command,
    );

    if (stale !== undefined) {
      throw validationIntegrityApplicationError();
    }
  }

  async function persistValidationIntegrityFailureIfPresent(
    project:
      | Awaited<ReturnType<ProjectService["getProject"]>>
      | undefined,
    task: TaskSnapshot,
    stage: RetryStage,
    signal?: AbortSignal,
    command?: WorkflowCommandContext,
  ): Promise<TaskSnapshot | undefined> {
    const resolvedProject =
      project ?? (await projectService.getProject(task.projectId));

    try {
      await validationIntegrityService.verifyValidation({
        project: resolvedProject,
        task: copyTask(task),
        signal,
      });
      return undefined;
    } catch (error) {
      if (isTaskCancellationError(error)) {
        throw error;
      }
      if (!(error instanceof ValidationIntegrityError)) {
        throw error;
      }

      const latest = await latestTaskOr(task);
      const timestamp = now().toISOString();
      return copyTask(
        await store.update({
          ...copyTask(latest),
          workflowFailure: createWorkflowFailureEvidence(
            {
              stage,
              category: "REPOSITORY_MISMATCH",
              retryable: false,
              summary: VALIDATION_INTEGRITY_SUMMARY,
            },
            timestamp,
            undefined,
            command?.workflowCorrelationId,
          ),
          updatedAt: timestamp,
        }),
      );
    }
  }

  async function persistRepositoryDriftIfPresent(
    project:
      | Awaited<ReturnType<ProjectService["getProject"]>>
      | undefined,
    task: TaskSnapshot,
    stage: RetryStage,
    signal?: AbortSignal,
    command?: WorkflowCommandContext,
  ): Promise<TaskSnapshot | undefined> {
    const resolvedProject =
      project ?? (await projectService.getProject(task.projectId));

    try {
      await repositoryDriftVerifier.verifyTaskRepository({
        project: resolvedProject,
        task: copyTask(task),
        signal,
      });
      return undefined;
    } catch (error) {
      if (isTaskCancellationError(error)) {
        throw error;
      }
      if (!(error instanceof RepositoryDriftError)) {
        throw error;
      }

      const latest = await latestTaskOr(task);
      const timestamp = now().toISOString();
      return copyTask(
        await store.update({
          ...copyTask(latest),
          workflowFailure: createWorkflowFailureEvidence(
            {
              stage,
              category: "REPOSITORY_MISMATCH",
              retryable: false,
              summary: REPOSITORY_DRIFT_SUMMARY,
            },
            timestamp,
            undefined,
            command?.workflowCorrelationId,
          ),
          updatedAt: timestamp,
        }),
      );
    }
  }

  async function latestTaskOr(task: TaskSnapshot): Promise<TaskSnapshot> {
    return (
      (await store.findByProjectAndId(task.projectId, task.id)) ?? copyTask(task)
    );
  }

  async function persistCancellationRequested(
    task: TaskSnapshot,
    stage?: CancellationStage,
  ): Promise<TaskSnapshot> {
    const timestamp = now().toISOString();
    return copyTask(
      await store.update({
        ...copyTask(task),
        cancellation: {
          status: "REQUESTED",
          requestedAt: task.cancellation?.requestedAt ?? timestamp,
          ...(stage === undefined ? {} : { stage }),
          summary: "Task cancellation requested.",
        },
        updatedAt: timestamp,
      }),
    );
  }

  async function completeCancellation(
    task: TaskSnapshot,
    stage?: CancellationStage,
  ): Promise<TaskSnapshot> {
    if (task.cancellation?.status === "CANCELLED") {
      return copyTask(task);
    }

    const timestamp = now().toISOString();
    const requestedAt = task.cancellation?.requestedAt ?? timestamp;
    const resolvedStage = stage ?? task.cancellation?.stage;
    const cancelledTask = copyTask(
      await store.update({
        ...copyTask(task),
        cancellation: {
          status: "CANCELLED",
          requestedAt,
          cancelledAt: task.cancellation?.cancelledAt ?? timestamp,
          ...(resolvedStage === undefined ? {} : { stage: resolvedStage }),
          summary: "Task cancelled.",
        },
        updatedAt: timestamp,
      }),
    );

    if (task.cancellation?.cancelledAt === undefined) {
      await activityService.append({
        projectId: task.projectId,
        taskId: task.id,
        type: "TASK_CANCELLED",
        actor: { kind: "SYSTEM" },
        summary: "Task cancelled.",
      });
    }

    return cancelledTask;
  }

  async function appendValidationActivity(
    projectId: string,
    taskId: string,
    validation: TaskSnapshot["validation"],
    command?: WorkflowCommandContext,
  ): Promise<void> {
    if (validation === undefined) return;

    await activityService.append({
      projectId,
      taskId,
      type: "VALIDATION_COMPLETED",
      actor: { kind: "AGENT", role: "DEVOPS_ENGINEER" },
      summary: "DevOps Engineer completed validation.",
      workflowCorrelationId: command?.workflowCorrelationId,
    });

    if (validation.browserVerification !== undefined) {
      await activityService.append({
        projectId,
        taskId,
        type: "BROWSER_VERIFICATION_COMPLETED",
        actor: { kind: "SYSTEM" },
        summary: "Localhost application verified.",
        workflowCorrelationId: command?.workflowCorrelationId,
      });
    }

    if (validation.browserScreenshot !== undefined) {
      await activityService.append({
        projectId,
        taskId,
        type: "SCREENSHOT_CAPTURED",
        actor: { kind: "SYSTEM" },
        summary: "Frontend screenshot captured.",
        workflowCorrelationId: command?.workflowCorrelationId,
      });
    }

    if (validation.visualReview !== undefined) {
      await activityService.append({
        projectId,
        taskId,
        type: "VISUAL_REVIEW_COMPLETED",
        actor: { kind: "SYSTEM" },
        summary:
          validation.visualReview.status === "PASSED"
            ? "Visual review passed."
            : `Visual review found ${validation.visualReview.findings.length} issues.`,
        workflowCorrelationId: command?.workflowCorrelationId,
      });
    }
  }
}

function deriveResumeMetadata(
  task: TaskSnapshot,
  publisherAvailable: boolean,
): WorkflowResumeMetadata {
  return deriveWorkflowResumeMetadata({
    task,
    publisherAvailable,
  });
}

function withResume(
  task: TaskSnapshot,
  resume: WorkflowResumeMetadata,
): TaskSnapshot {
  return {
    ...copyTask(task),
    resume: copyResumeMetadata(resume),
  };
}

function withTaskOutcome(task: TaskSnapshot): TaskSnapshot {
  const copied = copyTask(task);

  return {
    ...copied,
    taskOutcome: deriveTaskOutcome(copied),
  };
}

function copyResumeMetadata(resume: WorkflowResumeMetadata): WorkflowResumeMetadata {
  return {
    resumable: resume.resumable,
    lastCompletedStage: resume.lastCompletedStage,
    nextStage: resume.nextStage,
    reason: resume.reason,
  };
}

function cancellationStageForResume(stage: WorkflowResumeStage): CancellationStage {
  switch (stage) {
    case "DEVELOPER":
      return "DEVELOPER";
    case "VALIDATION":
    case "VISUAL_REPAIR":
      return "DEVOPS";
    case "CHECKPOINT":
      return "CHECKPOINT";
    case "PUSH":
      return "REMOTE_PUSH";
    case "REVIEWER":
      return "REVIEWER";
    case "PULL_REQUEST":
      return "PULL_REQUEST";
    case "PLAN":
    case "COMPLETED":
      return "RETRY_WAIT";
  }
}

function retryStageForResume(stage: WorkflowResumeStage): RetryStage {
  switch (stage) {
    case "DEVELOPER":
      return "DEVELOPER";
    case "VALIDATION":
    case "VISUAL_REPAIR":
      return "DEVOPS";
    case "CHECKPOINT":
      return "CHECKPOINT";
    case "PUSH":
      return "REMOTE_PUSH";
    case "REVIEWER":
      return "REVIEWER";
    case "PULL_REQUEST":
      return "PULL_REQUEST";
    case "PLAN":
    case "COMPLETED":
      return "DEVELOPER";
  }
}

function assertNoPendingRetry(task: TaskSnapshot): void {
  if (task.retryRecovery?.failedStage !== undefined) {
    throw new ApplicationError(
      "INVALID_TASK_TRANSITION",
      409,
      "Task has an unresolved controlled retry state",
    );
  }
}

function assertTaskNotCancelled(task: TaskSnapshot): void {
  if (task.cancellation !== undefined) {
    throw new ApplicationError(
      "INVALID_TASK_TRANSITION",
      409,
      "Task has been cancelled",
    );
  }
}

function repositoryDriftApplicationError(): ApplicationError {
  return new ApplicationError(
    "REPOSITORY_DRIFT",
    409,
    REPOSITORY_DRIFT_SUMMARY,
  );
}

function isRepositoryDriftApplicationError(error: unknown): boolean {
  return error instanceof ApplicationError && error.code === "REPOSITORY_DRIFT";
}

function validationIntegrityApplicationError(): ApplicationError {
  return new ApplicationError(
    "VALIDATION_EVIDENCE_STALE",
    409,
    VALIDATION_INTEGRITY_SUMMARY,
  );
}

function isValidationIntegrityApplicationError(error: unknown): boolean {
  return (
    error instanceof ApplicationError &&
    error.code === "VALIDATION_EVIDENCE_STALE"
  );
}

function isDevOpsPublisher(
  devOpsValidator: DevOpsValidator,
): devOpsValidator is DevOpsValidator & DevOpsPublisher {
  return "publishValidatedTask" in devOpsValidator;
}

function commandAuditStatus(
  error: unknown,
  latest: TaskSnapshot,
): CommandAuditStatus {
  if (isTaskCancellationError(error)) {
    return "CANCELLED";
  }

  if (
    error instanceof TaskExecutionTimeoutError ||
    latest.workflowFailure?.category === "TASK_EXECUTION_TIMEOUT"
  ) {
    return "TIMED_OUT";
  }

  return "FAILED";
}

function commandAuditSuccessStatus(
  result: TaskSnapshot,
): CommandAuditStatus {
  return result.resume?.reason === "REPOSITORY_STATE_MISMATCH"
    ? "FAILED"
    : "SUCCEEDED";
}

function commandAuditFallbackStage(
  operation: CommandAuditOperation,
): RetryStage {
  switch (operation) {
    case "EXECUTE":
      return "DEVELOPER";
    case "VALIDATE":
      return "DEVOPS";
    case "REVIEW":
      return "REVIEWER";
    case "RETRY":
      return "DEVELOPER";
    case "RESUME":
      return "DEVELOPER";
    case "PULL_REQUEST_CREATE":
    case "PULL_REQUEST_REFRESH":
    case "PULL_REQUEST_SUMMARY_COMMENT":
      return "PULL_REQUEST";
  }
}

function withDuration<T extends object>(evidence: T, durationMs: number): T & { durationMs: number } {
  return {
    ...evidence,
    durationMs,
  };
}

function withWorkflowCorrelation<T extends object>(
  evidence: T,
  command?: WorkflowCommandContext,
): T & { workflowCorrelationId?: string } {
  return {
    ...evidence,
    ...(command === undefined
      ? {}
      : { workflowCorrelationId: command.workflowCorrelationId }),
  };
}

function correlateValidationEvidence(
  validation: NonNullable<TaskSnapshot["validation"]>,
  command?: WorkflowCommandContext,
): NonNullable<TaskSnapshot["validation"]> {
  return {
    ...withWorkflowCorrelation(validation, command),
    ...(validation.browserVerification === undefined
      ? {}
      : {
          browserVerification: withWorkflowCorrelation(
            validation.browserVerification,
            command,
          ),
        }),
    ...(validation.browserScreenshot === undefined
      ? {}
      : {
          browserScreenshot: withWorkflowCorrelation(
            validation.browserScreenshot,
            command,
          ),
        }),
    ...(validation.visualReview === undefined
      ? {}
      : {
          visualReview: withWorkflowCorrelation(
            validation.visualReview,
            command,
          ),
        }),
  };
}

function currentWorkflowStage(
  active: ActiveTaskExecution | undefined,
  fallback: RetryStage,
): RetryStage {
  if (active === undefined || active.stage === "RETRY_WAIT") {
    return fallback;
  }

  return active.stage;
}

function unavailablePullRequestCreator(): TaskPullRequestCreator {
  return {
    async createPullRequest() {
      throw new ApplicationError(
        "PULL_REQUEST_UNAVAILABLE",
        503,
        "Pull request creation is not configured",
      );
    },
    async refreshPullRequest() {
      throw new ApplicationError(
        "PULL_REQUEST_UNAVAILABLE",
        503,
        "Pull request refresh is not configured",
      );
    },
    async publishSummaryComment() {
      throw new ApplicationError(
        "PULL_REQUEST_UNAVAILABLE",
        503,
        "Pull request summary comment is not configured",
      );
    },
  };
}

function copyChangeEvidence(evidence: GitChangeEvidence): GitChangeEvidence {
  return {
    files: evidence.files.map((file) => ({ ...file })),
    summary: { ...evidence.summary },
  };
}

function copyRepositoryChanges(
  evidence: GitRepositoryChangeSummary,
): GitRepositoryChangeSummary {
  return {
    filesChanged: [...evidence.filesChanged],
    filesAdded: [...evidence.filesAdded],
    filesModified: [...evidence.filesModified],
    filesDeleted: [...evidence.filesDeleted],
    totalFilesChanged: evidence.totalFilesChanged,
    insertions: evidence.insertions,
    deletions: evidence.deletions,
  };
}

function copyValidationIntegrity(
  evidence: ValidationIntegrityEvidence,
): ValidationIntegrityEvidence {
  return {
    repositoryStateId: evidence.repositoryStateId,
    headSha: evidence.headSha,
    branch: evidence.branch,
    validatedAt: evidence.validatedAt,
  };
}

function copyValidationSelection(
  evidence: ValidationSelectionEvidence,
): ValidationSelectionEvidence {
  return {
    strategy: evidence.strategy,
    categories: [...evidence.categories],
    browserVerificationSelected: evidence.browserVerificationSelected,
    reason: evidence.reason,
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
    ...(task.planDecision === undefined
      ? {}
      : {
          planDecision: {
            decision: task.planDecision.decision,
            ...(task.planDecision.reason === undefined
              ? {}
              : { reason: task.planDecision.reason }),
            decidedAt: task.planDecision.decidedAt,
          },
        }),
    ...(task.execution === undefined
      ? {}
      : {
          execution: {
            id: task.execution.id,
            role: task.execution.role,
            status: task.execution.status,
            attempt: task.execution.attempt,
            ...(task.execution.workflowCorrelationId === undefined
              ? {}
              : { workflowCorrelationId: task.execution.workflowCorrelationId }),
            startedAt: task.execution.startedAt,
            completedAt: task.execution.completedAt,
            ...(task.execution.durationMs === undefined
              ? {}
              : { durationMs: task.execution.durationMs }),
            result: {
              summary: task.execution.result.summary,
              changedFiles: [...task.execution.result.changedFiles],
              verification: [...task.execution.result.verification],
              ...(task.execution.result.repositoryChanges === undefined
                ? {}
                : {
                    repositoryChanges: copyRepositoryChanges(
                      task.execution.result.repositoryChanges,
                    ),
                  }),
              ...(task.execution.result.changeEvidence === undefined
                ? {}
                : {
                    changeEvidence: copyChangeEvidence(
                      task.execution.result.changeEvidence,
                    ),
                  }),
            },
          },
        }),
    ...(task.validation === undefined
      ? {}
      : {
          validation: {
            id: task.validation.id,
            role: task.validation.role,
            status: task.validation.status,
            attempt: task.validation.attempt,
            ...(task.validation.workflowCorrelationId === undefined
              ? {}
              : { workflowCorrelationId: task.validation.workflowCorrelationId }),
            startedAt: task.validation.startedAt,
            completedAt: task.validation.completedAt,
            ...(task.validation.durationMs === undefined
              ? {}
              : { durationMs: task.validation.durationMs }),
            checks: task.validation.checks.map((check) => ({
              name: check.name,
              status: check.status,
              summary: check.summary,
            })),
            summary: task.validation.summary,
            ...(task.validation.validationSelection === undefined
              ? {}
              : {
                  validationSelection: copyValidationSelection(
                    task.validation.validationSelection,
                  ),
                }),
            ...(task.validation.integrity === undefined
              ? {}
              : {
                  integrity: copyValidationIntegrity(task.validation.integrity),
                }),
            ...(task.validation.checkpoint === undefined
              ? {}
              : {
                  checkpoint: {
                    sha: task.validation.checkpoint.sha,
                    shortSha: task.validation.checkpoint.shortSha,
                    message: task.validation.checkpoint.message,
                    createdAt: task.validation.checkpoint.createdAt,
                    filesChanged: [...task.validation.checkpoint.filesChanged],
                  },
                }),
            ...(task.validation.remoteBranch === undefined
              ? {}
              : {
                  remoteBranch: {
                    remote: task.validation.remoteBranch.remote,
                    branch: task.validation.remoteBranch.branch,
                    commitSha: task.validation.remoteBranch.commitSha,
                    pushedAt: task.validation.remoteBranch.pushedAt,
                  },
                }),
            ...(task.validation.browserVerification === undefined
              ? {}
              : {
                  browserVerification: {
                    status: task.validation.browserVerification.status,
                    ...(task.validation.browserVerification.workflowCorrelationId === undefined
                      ? {}
                      : {
                          workflowCorrelationId:
                            task.validation.browserVerification.workflowCorrelationId,
                        }),
                    url: task.validation.browserVerification.url,
                    ...(task.validation.browserVerification.pageTitle === undefined
                      ? {}
                      : {
                          pageTitle:
                            task.validation.browserVerification.pageTitle,
                        }),
                    verifiedAt: task.validation.browserVerification.verifiedAt,
                    ...(task.validation.browserVerification.durationMs === undefined
                      ? {}
                      : {
                          durationMs:
                            task.validation.browserVerification.durationMs,
                        }),
                  },
                }),
            ...(task.validation.browserScreenshot === undefined
              ? {}
              : {
                  browserScreenshot: {
                    status: task.validation.browserScreenshot.status,
                    ...(task.validation.browserScreenshot.workflowCorrelationId === undefined
                      ? {}
                      : {
                          workflowCorrelationId:
                            task.validation.browserScreenshot.workflowCorrelationId,
                        }),
                    id: task.validation.browserScreenshot.id,
                    url: task.validation.browserScreenshot.url,
                    viewport: {
                      width: task.validation.browserScreenshot.viewport.width,
                      height: task.validation.browserScreenshot.viewport.height,
                    },
                    capturedAt: task.validation.browserScreenshot.capturedAt,
                    ...(task.validation.browserScreenshot.durationMs === undefined
                      ? {}
                      : {
                          durationMs:
                            task.validation.browserScreenshot.durationMs,
                        }),
                  },
                }),
            ...(task.validation.visualReview === undefined
              ? {}
              : {
                  visualReview: {
                    status: task.validation.visualReview.status,
                    ...(task.validation.visualReview.workflowCorrelationId === undefined
                      ? {}
                      : {
                          workflowCorrelationId:
                            task.validation.visualReview.workflowCorrelationId,
                        }),
                    summary: task.validation.visualReview.summary,
                    findings: task.validation.visualReview.findings.map(
                      (finding) => ({ ...finding }),
                    ),
                    screenshotId: task.validation.visualReview.screenshotId,
                    reviewedAt: task.validation.visualReview.reviewedAt,
                    ...(task.validation.visualReview.durationMs === undefined
                      ? {}
                      : { durationMs: task.validation.visualReview.durationMs }),
                  },
            }),
          },
        }),
    ...(task.visualRepair === undefined
      ? {}
      : {
          visualRepair: {
            maxAttempts: task.visualRepair.maxAttempts,
            ...(task.visualRepair.outcome === undefined
              ? {}
              : { outcome: task.visualRepair.outcome }),
            attempts: task.visualRepair.attempts.map((attempt) => ({
              attempt: attempt.attempt,
              ...(attempt.workflowCorrelationId === undefined
                ? {}
                : { workflowCorrelationId: attempt.workflowCorrelationId }),
              startedAt: attempt.startedAt,
              ...(attempt.completedAt === undefined
                ? {}
                : { completedAt: attempt.completedAt }),
              ...(attempt.durationMs === undefined
                ? {}
                : { durationMs: attempt.durationMs }),
              sourceScreenshotId: attempt.sourceScreenshotId,
              sourceVisualReview: {
                status: attempt.sourceVisualReview.status,
                summary: attempt.sourceVisualReview.summary,
                findingCount: attempt.sourceVisualReview.findingCount,
              },
              ...(attempt.developer === undefined
                ? {}
                : {
                    developer: {
                      summary: attempt.developer.summary,
                      ...(attempt.developer.workflowCorrelationId === undefined
                        ? {}
                        : {
                            workflowCorrelationId:
                              attempt.developer.workflowCorrelationId,
                          }),
                      changedFiles: [...attempt.developer.changedFiles],
                    },
                  }),
              ...(attempt.validation === undefined
                ? {}
                : {
                    validation: {
                      status: attempt.validation.status,
                      ...(attempt.validation.workflowCorrelationId === undefined
                        ? {}
                        : {
                            workflowCorrelationId:
                              attempt.validation.workflowCorrelationId,
                          }),
                    },
                  }),
              ...(attempt.screenshotId === undefined
                ? {}
                : { screenshotId: attempt.screenshotId }),
              ...(attempt.visualReview === undefined
                ? {}
                : {
                    visualReview: {
                      status: attempt.visualReview.status,
                      ...(attempt.visualReview.workflowCorrelationId === undefined
                        ? {}
                        : {
                            workflowCorrelationId:
                              attempt.visualReview.workflowCorrelationId,
                          }),
                      summary: attempt.visualReview.summary,
                      findingCount: attempt.visualReview.findingCount,
                    },
                  }),
            })),
          },
        }),
    ...(task.retryRecovery === undefined
      ? {}
      : {
          retryRecovery: {
            ...(task.retryRecovery.workflowCorrelationId === undefined
              ? {}
              : {
                  workflowCorrelationId:
                    task.retryRecovery.workflowCorrelationId,
                }),
            ...(task.retryRecovery.failedStage === undefined
              ? {}
              : { failedStage: task.retryRecovery.failedStage }),
            retryAvailable: task.retryRecovery.retryAvailable,
            ...(task.retryRecovery.exhausted === undefined
              ? {}
              : { exhausted: task.retryRecovery.exhausted }),
            attempts: task.retryRecovery.attempts.map((attempt) => ({
              stage: attempt.stage,
              attempt: attempt.attempt,
              ...(attempt.workflowCorrelationId === undefined
                ? {}
                : { workflowCorrelationId: attempt.workflowCorrelationId }),
              status: attempt.status,
              category: attempt.category,
              startedAt: attempt.startedAt,
              completedAt: attempt.completedAt,
              ...(attempt.durationMs === undefined
                ? {}
                : { durationMs: attempt.durationMs }),
              retryable: attempt.retryable,
              summary: attempt.summary,
            })),
          },
        }),
    ...(task.workflowFailure === undefined
      ? {}
      : {
          workflowFailure: {
            stage: task.workflowFailure.stage,
            ...(task.workflowFailure.workflowCorrelationId === undefined
              ? {}
              : {
                  workflowCorrelationId:
                    task.workflowFailure.workflowCorrelationId,
                }),
            category: task.workflowFailure.category,
            summary: task.workflowFailure.summary,
            failedAt: task.workflowFailure.failedAt,
          },
        }),
    ...(task.cancellation === undefined
      ? {}
      : {
          cancellation: {
            status: task.cancellation.status,
            requestedAt: task.cancellation.requestedAt,
            ...(task.cancellation.cancelledAt === undefined
              ? {}
              : { cancelledAt: task.cancellation.cancelledAt }),
            ...(task.cancellation.stage === undefined
              ? {}
              : { stage: task.cancellation.stage }),
            ...(task.cancellation.summary === undefined
              ? {}
              : { summary: task.cancellation.summary }),
          },
        }),
    ...(task.review === undefined
      ? {}
      : {
          review: {
            id: task.review.id,
            role: task.review.role,
            status: task.review.status,
            verdict: task.review.verdict,
            attempt: task.review.attempt,
            ...(task.review.workflowCorrelationId === undefined
              ? {}
              : { workflowCorrelationId: task.review.workflowCorrelationId }),
            startedAt: task.review.startedAt,
            completedAt: task.review.completedAt,
            ...(task.review.durationMs === undefined
              ? {}
              : { durationMs: task.review.durationMs }),
            summary: task.review.summary,
            findings: task.review.findings.map((finding) => ({
              severity: finding.severity,
              title: finding.title,
              description: finding.description,
            })),
          },
        }),
    ...(task.pullRequest === undefined
      ? {}
      : {
          pullRequest: {
            number: task.pullRequest.number,
            ...(task.pullRequest.workflowCorrelationId === undefined
              ? {}
              : {
                  workflowCorrelationId:
                    task.pullRequest.workflowCorrelationId,
                }),
            url: task.pullRequest.url,
            state: task.pullRequest.state,
            headBranch: task.pullRequest.headBranch,
            baseBranch: task.pullRequest.baseBranch,
            commitSha: task.pullRequest.commitSha,
            createdAt: task.pullRequest.createdAt,
            ...(task.pullRequest.durationMs === undefined
              ? {}
              : { durationMs: task.pullRequest.durationMs }),
          },
        }),
    ...(task.pullRequestSummaryComment === undefined
      ? {}
      : {
          pullRequestSummaryComment: {
            commentId: task.pullRequestSummaryComment.commentId,
            ...(task.pullRequestSummaryComment.workflowCorrelationId === undefined
              ? {}
              : {
                  workflowCorrelationId:
                    task.pullRequestSummaryComment.workflowCorrelationId,
                }),
            updatedAt: task.pullRequestSummaryComment.updatedAt,
        },
      }),
    ...(task.resume === undefined
      ? {}
      : { resume: copyResumeMetadata(task.resume) }),
    ...(task.commandAudit === undefined
      ? {}
      : {
          commandAudit: task.commandAudit.map((entry) => ({
            operation: entry.operation,
            workflowCorrelationId: entry.workflowCorrelationId,
            status: entry.status,
            startedAt: entry.startedAt,
            completedAt: entry.completedAt,
            durationMs: entry.durationMs,
            ...(entry.failureCategory === undefined
              ? {}
              : { failureCategory: entry.failureCategory }),
          })),
        }),
    createdAt: task.createdAt,
    updatedAt: task.updatedAt,
  };
}

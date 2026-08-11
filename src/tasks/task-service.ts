import { randomUUID } from "node:crypto";

import {
  createNoopActivityService,
  type ActivityService,
} from "../activity/activity-service.js";
import { ApplicationError } from "../errors.js";
import type { ProjectService } from "../projects/project-service.js";
import type { GitChangeEvidence } from "../repositories/git-inspector.js";
import {
  createVisualRepairOrchestrator,
} from "../orchestration/visual-repair-orchestrator.js";
import {
  createRetryOrchestrator,
  sanitizeStageError,
} from "../orchestration/retry-orchestrator.js";
import type {
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
  activityService?: ActivityService;
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
  createPullRequest(projectId: string, taskId: string): Promise<TaskSnapshot>;
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
  activityService = createNoopActivityService(),
}: TaskServiceDependencies): TaskService {
  const retryOrchestrator = createRetryOrchestrator({
    store,
    now,
    activityService,
    runStage: retryStage,
  });

  return {
    async createTask(projectId, input) {
      const project = await projectService.getProject(projectId);

      const plan = await planner.createPlan({ ...input, project });
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

      return copyTask(task);
    },

    async decidePlan(projectId, taskId, input) {
      await projectService.getProject(projectId);

      const task = await store.findByProjectAndId(projectId, taskId);

      if (task === undefined) {
        throw new ApplicationError("TASK_NOT_FOUND", 404, "Task not found");
      }

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
    },

    async executeTask(projectId, taskId) {
      const project = await projectService.getProject(projectId);

      const task = await store.findByProjectAndId(projectId, taskId);

      if (task === undefined) {
        throw new ApplicationError("TASK_NOT_FOUND", 404, "Task not found");
      }

      if (task.status !== "PLAN_APPROVED" || task.execution !== undefined) {
        throw new ApplicationError(
          "INVALID_TASK_TRANSITION",
          409,
          "Task is not approved for implementation",
        );
      }

      assertNoPendingRetry(task);

      try {
        return await runDeveloperStage(project, task);
      } catch (error) {
        const latest = await latestTaskOr(task);
        await retryOrchestrator.recordFailure(latest, "DEVELOPER", error);
        throw sanitizeStageError("DEVELOPER");
      }
    },

    async validateTask(projectId, taskId) {
      const project = await projectService.getProject(projectId);

      const task = await store.findByProjectAndId(projectId, taskId);

      if (task === undefined) {
        throw new ApplicationError("TASK_NOT_FOUND", 404, "Task not found");
      }

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

      try {
        return await runValidationWorkflow(project, task);
      } catch (error) {
        const latest = await latestTaskOr(task);
        await retryOrchestrator.recordFailure(latest, "DEVOPS", error);
        throw sanitizeStageError("DEVOPS");
      }
    },

    async reviewTask(projectId, taskId) {
      const project = await projectService.getProject(projectId);

      const task = await store.findByProjectAndId(projectId, taskId);

      if (task === undefined) {
        throw new ApplicationError("TASK_NOT_FOUND", 404, "Task not found");
      }

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

      try {
        return await runReviewerStage(project, task);
      } catch (error) {
        const latest = await latestTaskOr(task);
        await retryOrchestrator.recordFailure(latest, "REVIEWER", error);
        throw sanitizeStageError("REVIEWER");
      }
    },

    async retryTask(projectId, taskId) {
      await projectService.getProject(projectId);

      const task = await store.findByProjectAndId(projectId, taskId);

      if (task === undefined) {
        throw new ApplicationError("TASK_NOT_FOUND", 404, "Task not found");
      }

      return retryOrchestrator.retry(copyTask(task));
    },

    async createPullRequest(projectId, taskId) {
      const project = await projectService.getProject(projectId);

      const task = await store.findByProjectAndId(projectId, taskId);

      if (task === undefined) {
        throw new ApplicationError("TASK_NOT_FOUND", 404, "Task not found");
      }

      assertNoPendingRetry(task);

      try {
        return await runPullRequestStage(project, task);
      } catch (error) {
        const latest = await latestTaskOr(task);
        await retryOrchestrator.recordFailure(latest, "PULL_REQUEST", error);
        throw sanitizeStageError("PULL_REQUEST");
      }
    },
  };

  async function retryStage(
    stage: RetryStage,
    task: TaskSnapshot,
  ): Promise<TaskSnapshot> {
    const project = await projectService.getProject(task.projectId);

    switch (stage) {
      case "DEVELOPER":
        return runDeveloperStage(project, task);
      case "DEVOPS":
      case "BROWSER":
      case "SCREENSHOT":
      case "VISUAL_REVIEW":
        return runValidationWorkflow(project, task);
      case "CHECKPOINT":
      case "REMOTE_PUSH":
        return maybePublishValidatedTask(task);
      case "REVIEWER":
        return runReviewerStage(project, task);
      case "PULL_REQUEST":
        return runPullRequestStage(project, task);
    }
  }

  async function runDeveloperStage(
    project: Awaited<ReturnType<ProjectService["getProject"]>>,
    task: TaskSnapshot,
  ): Promise<TaskSnapshot> {
    const execution = await developerExecutor.execute({
      project,
      task: copyTask(task),
    });
    const timestamp = now().toISOString();
    const updatedTask: TaskSnapshot = {
      ...copyTask(task),
      status: "IMPLEMENTATION_COMPLETED",
      execution,
      updatedAt: timestamp,
    };

    const executedTask = copyTask(await store.update(updatedTask));
    await activityService.append({
      projectId: task.projectId,
      taskId: task.id,
      type: "IMPLEMENTATION_COMPLETED",
      actor: { kind: "AGENT", role: "FULL_STACK_DEVELOPER" },
      summary: "Full Stack Developer completed implementation.",
    });

    return executedTask;
  }

  async function runValidationWorkflow(
    project: Awaited<ReturnType<ProjectService["getProject"]>>,
    task: TaskSnapshot,
  ): Promise<TaskSnapshot> {
    const validation = await devOpsValidator.validate(copyTask(task));
    const timestamp = now().toISOString();
    const updatedTask: TaskSnapshot = {
      ...copyTask(task),
      status: "VALIDATION_COMPLETED",
      validation,
      updatedAt: timestamp,
    };

    const validatedTask = copyTask(await store.update(updatedTask));
    await appendValidationActivity(task.projectId, task.id, validation);

    const repairedTask = await createVisualRepairOrchestrator({
      project,
      developerExecutor,
      devOpsValidator,
      store,
      now,
      activityService,
    }).repairIfRequired(validatedTask);

    return maybePublishValidatedTask(repairedTask);
  }

  async function runReviewerStage(
    project: Awaited<ReturnType<ProjectService["getProject"]>>,
    task: TaskSnapshot,
  ): Promise<TaskSnapshot> {
    const review = await taskReviewer.review(copyTask(task), project);
    const timestamp = now().toISOString();
    const updatedTask: TaskSnapshot = {
      ...copyTask(task),
      status: "REVIEW_COMPLETED",
      review,
      updatedAt: timestamp,
    };

    const reviewedTask = copyTask(await store.update(updatedTask));
    await activityService.append({
      projectId: task.projectId,
      taskId: task.id,
      type: "REVIEW_COMPLETED",
      actor: { kind: "AGENT", role: "REVIEWER" },
      summary: "Reviewer approved the completed work.",
    });

    return reviewedTask;
  }

  async function runPullRequestStage(
    project: Awaited<ReturnType<ProjectService["getProject"]>>,
    task: TaskSnapshot,
  ): Promise<TaskSnapshot> {
    const result = await pullRequestCreator.createPullRequest({
      project,
      task: copyTask(task),
    });

    if (task.pullRequest !== undefined) {
      return copyTask(task);
    }

    const timestamp = now().toISOString();
    const updatedTask: TaskSnapshot = {
      ...copyTask(task),
      pullRequest: {
        number: result.evidence.number,
        url: result.evidence.url,
        state: result.evidence.state,
        headBranch: result.evidence.headBranch,
        baseBranch: result.evidence.baseBranch,
        commitSha: result.evidence.commitSha,
        createdAt: result.evidence.createdAt,
      },
      updatedAt: timestamp,
    };

    const taskWithPullRequest = copyTask(await store.update(updatedTask));

    if (result.created) {
      await activityService.append({
        projectId: task.projectId,
        taskId: task.id,
        type: "PULL_REQUEST_CREATED",
        actor: { kind: "SYSTEM" },
        summary: `Pull request #${result.evidence.number} created.`,
      });
    }

    return taskWithPullRequest;
  }

  async function maybePublishValidatedTask(
    task: TaskSnapshot,
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

    const validation = await devOpsValidator.publishValidatedTask(copyTask(task));
    const timestamp = now().toISOString();
    return copyTask(
      await store.update({
        ...copyTask(task),
        validation,
        updatedAt: timestamp,
      }),
    );
  }

  async function latestTaskOr(task: TaskSnapshot): Promise<TaskSnapshot> {
    return (
      (await store.findByProjectAndId(task.projectId, task.id)) ?? copyTask(task)
    );
  }

  async function appendValidationActivity(
    projectId: string,
    taskId: string,
    validation: TaskSnapshot["validation"],
  ): Promise<void> {
    if (validation === undefined) return;

    await activityService.append({
      projectId,
      taskId,
      type: "VALIDATION_COMPLETED",
      actor: { kind: "AGENT", role: "DEVOPS_ENGINEER" },
      summary: "DevOps Engineer completed validation.",
    });

    if (validation.browserVerification !== undefined) {
      await activityService.append({
        projectId,
        taskId,
        type: "BROWSER_VERIFICATION_COMPLETED",
        actor: { kind: "SYSTEM" },
        summary: "Localhost application verified.",
      });
    }

    if (validation.browserScreenshot !== undefined) {
      await activityService.append({
        projectId,
        taskId,
        type: "SCREENSHOT_CAPTURED",
        actor: { kind: "SYSTEM" },
        summary: "Frontend screenshot captured.",
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
      });
    }
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

function isDevOpsPublisher(
  devOpsValidator: DevOpsValidator,
): devOpsValidator is DevOpsValidator & DevOpsPublisher {
  return "publishValidatedTask" in devOpsValidator;
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
  };
}

function copyChangeEvidence(evidence: GitChangeEvidence): GitChangeEvidence {
  return {
    files: evidence.files.map((file) => ({ ...file })),
    summary: { ...evidence.summary },
    ...(evidence.diff === undefined ? {} : { diff: evidence.diff }),
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
            startedAt: task.execution.startedAt,
            completedAt: task.execution.completedAt,
            result: {
              summary: task.execution.result.summary,
              changedFiles: [...task.execution.result.changedFiles],
              verification: [...task.execution.result.verification],
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
            startedAt: task.validation.startedAt,
            completedAt: task.validation.completedAt,
            checks: task.validation.checks.map((check) => ({
              name: check.name,
              status: check.status,
              summary: check.summary,
            })),
            summary: task.validation.summary,
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
                    url: task.validation.browserVerification.url,
                    ...(task.validation.browserVerification.pageTitle === undefined
                      ? {}
                      : {
                          pageTitle:
                            task.validation.browserVerification.pageTitle,
                        }),
                    verifiedAt: task.validation.browserVerification.verifiedAt,
                  },
                }),
            ...(task.validation.browserScreenshot === undefined
              ? {}
              : {
                  browserScreenshot: {
                    status: task.validation.browserScreenshot.status,
                    id: task.validation.browserScreenshot.id,
                    url: task.validation.browserScreenshot.url,
                    viewport: {
                      width: task.validation.browserScreenshot.viewport.width,
                      height: task.validation.browserScreenshot.viewport.height,
                    },
                    capturedAt: task.validation.browserScreenshot.capturedAt,
                  },
                }),
            ...(task.validation.visualReview === undefined
              ? {}
              : {
                  visualReview: {
                    status: task.validation.visualReview.status,
                    summary: task.validation.visualReview.summary,
                    findings: task.validation.visualReview.findings.map(
                      (finding) => ({ ...finding }),
                    ),
                    screenshotId: task.validation.visualReview.screenshotId,
                    reviewedAt: task.validation.visualReview.reviewedAt,
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
              startedAt: attempt.startedAt,
              ...(attempt.completedAt === undefined
                ? {}
                : { completedAt: attempt.completedAt }),
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
                      changedFiles: [...attempt.developer.changedFiles],
                    },
                  }),
              ...(attempt.validation === undefined
                ? {}
                : {
                    validation: {
                      status: attempt.validation.status,
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
              status: attempt.status,
              category: attempt.category,
              startedAt: attempt.startedAt,
              completedAt: attempt.completedAt,
              retryable: attempt.retryable,
              summary: attempt.summary,
            })),
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
            startedAt: task.review.startedAt,
            completedAt: task.review.completedAt,
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
            url: task.pullRequest.url,
            state: task.pullRequest.state,
            headBranch: task.pullRequest.headBranch,
            baseBranch: task.pullRequest.baseBranch,
            commitSha: task.pullRequest.commitSha,
            createdAt: task.pullRequest.createdAt,
          },
        }),
    createdAt: task.createdAt,
    updatedAt: task.updatedAt,
  };
}

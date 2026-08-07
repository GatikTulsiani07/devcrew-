import { randomUUID } from "node:crypto";

import {
  createNoopActivityService,
  type ActivityService,
} from "../activity/activity-service.js";
import { ApplicationError } from "../errors.js";
import type { ProjectService } from "../projects/project-service.js";
import type { GitChangeEvidence } from "../repositories/git-inspector.js";
import type {
  CreateTaskInput,
  DeveloperExecutor,
  DevOpsValidator,
  ManagerPlanner,
  PlanDecisionInput,
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
}

export function createTaskService({
  projectService,
  planner,
  developerExecutor,
  devOpsValidator,
  taskReviewer,
  store,
  generateTaskId = () => `task_${randomUUID()}`,
  now = () => new Date(),
  activityService = createNoopActivityService(),
}: TaskServiceDependencies): TaskService {
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
        projectId,
        taskId,
        type: "IMPLEMENTATION_COMPLETED",
        actor: { kind: "AGENT", role: "FULL_STACK_DEVELOPER" },
        summary: "Full Stack Developer completed implementation.",
      });

      return executedTask;
    },

    async validateTask(projectId, taskId) {
      await projectService.getProject(projectId);

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

      const validation = await devOpsValidator.validate(copyTask(task));
      const timestamp = now().toISOString();
      const updatedTask: TaskSnapshot = {
        ...copyTask(task),
        status: "VALIDATION_COMPLETED",
        validation,
        updatedAt: timestamp,
      };

      const validatedTask = copyTask(await store.update(updatedTask));
      await activityService.append({
        projectId,
        taskId,
        type: "VALIDATION_COMPLETED",
        actor: { kind: "AGENT", role: "DEVOPS_ENGINEER" },
        summary: "DevOps Engineer completed validation.",
      });

      return validatedTask;
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
        projectId,
        taskId,
        type: "REVIEW_COMPLETED",
        actor: { kind: "AGENT", role: "REVIEWER" },
        summary: "Reviewer approved the completed work.",
      });

      return reviewedTask;
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
    createdAt: task.createdAt,
    updatedAt: task.updatedAt,
  };
}

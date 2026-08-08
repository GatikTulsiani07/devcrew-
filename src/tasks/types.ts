import type { GitChangeEvidence } from "../repositories/git-inspector.js";
import type { GitCheckpointEvidence } from "../repositories/git-checkpoint.js";
import type { ProjectSnapshot } from "../projects/types.js";

export type TaskStatus =
  | "WAITING_FOR_APPROVAL"
  | "PLAN_APPROVED"
  | "PLAN_REJECTED"
  | "IMPLEMENTATION_COMPLETED"
  | "VALIDATION_COMPLETED"
  | "REVIEW_COMPLETED";

export type PlanDecisionType = "APPROVE" | "REJECT";
export type ExecutionId = string;
export type ExecutionRole = "FULL_STACK_DEVELOPER";
export type ExecutionStatus = "COMPLETED";
export type ValidationId = string;
export type ValidationRole = "DEVOPS_ENGINEER";
export type ValidationStatus = "PASSED";
export type ValidationCheckName = "typecheck" | "tests" | "build";
export type ValidationCheckStatus = "PASSED";
export type ReviewId = string;
export type ReviewRole = "REVIEWER";
export type ReviewStatus = "COMPLETED";
export type ReviewVerdict = "APPROVED";
export type ReviewFindingSeverity = "INFO";

export interface TaskPlan {
  summary: string;
  steps: readonly string[];
}

export interface PlanDecision {
  decision: PlanDecisionType;
  reason?: string;
  decidedAt: string;
}

export interface ImplementationResult {
  summary: string;
  changedFiles: readonly string[];
  verification: readonly string[];
  changeEvidence?: GitChangeEvidence;
}

export interface TaskExecution {
  id: ExecutionId;
  role: ExecutionRole;
  status: ExecutionStatus;
  attempt: 1;
  startedAt: string;
  completedAt: string;
  result: ImplementationResult;
}

export interface ValidationCheck {
  name: ValidationCheckName;
  status: ValidationCheckStatus;
  summary: string;
}

export interface TaskValidation {
  id: ValidationId;
  role: ValidationRole;
  status: ValidationStatus;
  attempt: 1;
  startedAt: string;
  completedAt: string;
  checks: readonly ValidationCheck[];
  summary: string;
  checkpoint?: GitCheckpointEvidence;
}

export interface ReviewFinding {
  severity: ReviewFindingSeverity;
  title: string;
  description: string;
}

export interface TaskReview {
  id: ReviewId;
  role: ReviewRole;
  status: ReviewStatus;
  verdict: ReviewVerdict;
  attempt: 1;
  startedAt: string;
  completedAt: string;
  summary: string;
  findings: readonly ReviewFinding[];
}

export interface TaskSnapshot {
  id: string;
  projectId: string;
  title: string;
  description: string;
  status: TaskStatus;
  plan: TaskPlan;
  planDecision?: PlanDecision;
  execution?: TaskExecution;
  validation?: TaskValidation;
  review?: TaskReview;
  createdAt: string;
  updatedAt: string;
}

export interface CreateTaskInput {
  title: string;
  description: string;
}

export interface ManagerPlanInput extends CreateTaskInput {
  project: ProjectSnapshot;
}

export interface PlanDecisionInput {
  decision: PlanDecisionType;
  reason?: string;
}

export interface DeveloperExecutionInput {
  project: ProjectSnapshot;
  task: TaskSnapshot;
}

export interface TaskStore {
  create(task: TaskSnapshot): Promise<TaskSnapshot>;
  update(task: TaskSnapshot): Promise<TaskSnapshot>;
  findByProjectAndId(
    projectId: string,
    taskId: string,
  ): Promise<TaskSnapshot | undefined>;
}

export interface ManagerPlanner {
  createPlan(input: ManagerPlanInput): Promise<TaskPlan>;
}

export interface DeveloperExecutor {
  execute(input: DeveloperExecutionInput): Promise<TaskExecution>;
}

export interface DevOpsValidator {
  validate(task: TaskSnapshot): Promise<TaskValidation>;
}

export interface TaskReviewer {
  review(task: TaskSnapshot, project?: ProjectSnapshot): Promise<TaskReview>;
}

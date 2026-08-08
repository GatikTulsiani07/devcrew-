export type ProjectStatus = "REPOSITORY_CONNECTED";

export interface ProjectRepositorySnapshot {
  id: string;
  publicRepositoryUrl: string;
  preparedRepositoryId: string;
}

export interface ProjectSnapshot {
  id: string;
  name: string;
  status: ProjectStatus;
  repository: ProjectRepositorySnapshot;
  createdAt: string;
  updatedAt: string;
}

export interface CreateProjectRequest {
  name: string;
  publicRepositoryUrl: string;
  preparedRepositoryId: string;
}

export type TaskStatus =
  | "WAITING_FOR_APPROVAL"
  | "PLAN_APPROVED"
  | "PLAN_REJECTED"
  | "IMPLEMENTATION_COMPLETED"
  | "VALIDATION_COMPLETED"
  | "REVIEW_COMPLETED";

export interface TaskPlan {
  summary: string;
  steps: readonly string[];
}

export type PlanDecisionType = "APPROVE" | "REJECT";

export interface PlanDecision {
  decision: PlanDecisionType;
  reason?: string;
  decidedAt: string;
}

export interface ImplementationResult {
  summary: string;
  changedFiles: readonly string[];
  verification: readonly string[];
}

export interface GitCheckpointEvidence {
  sha: string;
  shortSha: string;
  message: string;
  createdAt: string;
  filesChanged: readonly string[];
}

export interface GitRemotePushEvidence {
  remote: "origin";
  branch: string;
  commitSha: string;
  pushedAt: string;
}

export type PullRequestState = "OPEN" | "CLOSED" | "MERGED";

export interface TaskPullRequestEvidence {
  number: number;
  url: string;
  state: PullRequestState;
  headBranch: string;
  baseBranch: string;
  commitSha: string;
  createdAt: string;
}

export interface TaskExecution {
  id: string;
  role: "FULL_STACK_DEVELOPER";
  status: "COMPLETED";
  attempt: 1;
  startedAt: string;
  completedAt: string;
  result: ImplementationResult;
}

export interface ValidationCheck {
  name: "typecheck" | "tests" | "build";
  status: "PASSED";
  summary: string;
}

export interface TaskValidation {
  id: string;
  role: "DEVOPS_ENGINEER";
  status: "PASSED";
  attempt: 1;
  startedAt: string;
  completedAt: string;
  checks: readonly ValidationCheck[];
  summary: string;
  checkpoint?: GitCheckpointEvidence;
  remoteBranch?: GitRemotePushEvidence;
}

export interface ReviewFinding {
  severity: "INFO";
  title: string;
  description: string;
}

export interface TaskReview {
  id: string;
  role: "REVIEWER";
  status: "COMPLETED";
  verdict: "APPROVED";
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
  pullRequest?: TaskPullRequestEvidence;
  createdAt: string;
  updatedAt: string;
}

export interface CreateTaskRequest {
  title: string;
  description: string;
}

export interface PlanDecisionRequest {
  decision: PlanDecisionType;
  reason?: string;
}

export type ActivityEventType =
  | "PROJECT_CREATED"
  | "TASK_CREATED"
  | "PLAN_CREATED"
  | "PLAN_APPROVED"
  | "PLAN_REJECTED"
  | "IMPLEMENTATION_COMPLETED"
  | "VALIDATION_COMPLETED"
  | "REVIEW_COMPLETED"
  | "PULL_REQUEST_CREATED";

export type ActivityActor =
  | { kind: "HUMAN" }
  | {
      kind: "AGENT";
      role: "MANAGER" | "FULL_STACK_DEVELOPER" | "DEVOPS_ENGINEER" | "REVIEWER";
    }
  | { kind: "SYSTEM" };

export interface ActivityEvent {
  id: string;
  sequence: number;
  projectId: string;
  taskId?: string;
  type: ActivityEventType;
  actor: ActivityActor;
  summary: string;
  createdAt: string;
}

export interface ActivitySnapshot {
  events: readonly ActivityEvent[];
  lastSequence: number;
}

export interface ApiErrorBody {
  requestId?: string;
  status?: "error";
  error?: {
    code?: string;
    message?: string;
  };
}

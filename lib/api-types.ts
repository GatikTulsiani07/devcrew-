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

export interface BrowserVerificationEvidence {
  status: "PASSED";
  url: string;
  pageTitle?: string;
  verifiedAt: string;
}

export interface BrowserScreenshotEvidence {
  status: "CAPTURED";
  id: string;
  url: string;
  viewport: {
    width: number;
    height: number;
  };
  capturedAt: string;
}

export interface VisualReviewFinding {
  title: string;
  description: string;
  severity: "INFO" | "WARNING" | "ERROR";
  category:
    | "layout"
    | "spacing"
    | "typography"
    | "missing-element"
    | "incorrect-component"
    | "responsive"
    | "accessibility"
    | "requirement-mismatch"
    | "other";
}

export interface VisualReviewEvidence {
  status: "PASSED" | "FAILED";
  summary: string;
  findings: readonly VisualReviewFinding[];
  screenshotId: string;
  reviewedAt: string;
}

export interface VisualRepairAttempt {
  attempt: number;
  startedAt: string;
  completedAt?: string;
  sourceScreenshotId: string;
  sourceVisualReview: {
    status: "FAILED";
    summary: string;
    findingCount: number;
  };
  developer?: {
    summary: string;
    changedFiles: readonly string[];
  };
  validation?: {
    status: "PASSED";
  };
  screenshotId?: string;
  visualReview?: {
    status: "PASSED" | "FAILED";
    summary: string;
    findingCount: number;
  };
}

export interface VisualRepairEvidence {
  maxAttempts: 2;
  outcome?: "PASSED" | "EXHAUSTED";
  attempts: readonly VisualRepairAttempt[];
}

export type RetryStage =
  | "DEVELOPER"
  | "DEVOPS"
  | "BROWSER"
  | "SCREENSHOT"
  | "VISUAL_REVIEW"
  | "REVIEWER"
  | "CHECKPOINT"
  | "REMOTE_PUSH"
  | "PULL_REQUEST";

export type CancellationStage = RetryStage | "RETRY_WAIT";

export type RetryFailureCategory =
  | "PROVIDER_TIMEOUT"
  | "PROVIDER_NETWORK"
  | "BROWSER_STARTUP_TRANSIENT"
  | "LOCALHOST_STARTUP_TIMEOUT"
  | "GITHUB_TIMEOUT"
  | "GITHUB_TRANSIENT"
  | "GIT_PUSH_TRANSIENT"
  | "UNSAFE_PATH"
  | "SECURITY_VIOLATION"
  | "REPOSITORY_MISMATCH"
  | "INVALID_TASK_STATE"
  | "INVALID_TRANSITION"
  | "MALFORMED_AUTHORITATIVE_STATE"
  | "BRANCH_DIVERGENCE"
  | "CHECKPOINT_MISMATCH"
  | "SCREENSHOT_ARTIFACT_MISMATCH"
  | "VISUAL_REVIEW_FAILED_VERDICT"
  | "REVIEWER_REJECTED_VERDICT"
  | "MODEL_OUTPUT_SCHEMA_INVALID"
  | "UNSUPPORTED_CONFIGURATION"
  | "UNKNOWN_FAILURE";

export interface RetryAttemptEvidence {
  stage: RetryStage;
  attempt: number;
  status: "FAILED" | "SUCCEEDED";
  category: RetryFailureCategory;
  startedAt: string;
  completedAt: string;
  retryable: boolean;
  summary: string;
}

export interface RetryRecoveryEvidence {
  failedStage?: RetryStage;
  retryAvailable: boolean;
  exhausted?: boolean;
  attempts: readonly RetryAttemptEvidence[];
}

export interface TaskCancellationEvidence {
  status: "REQUESTED" | "CANCELLED" | "FAILED";
  requestedAt: string;
  cancelledAt?: string;
  stage?: CancellationStage;
  summary?: string;
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
  browserVerification?: BrowserVerificationEvidence;
  browserScreenshot?: BrowserScreenshotEvidence;
  visualReview?: VisualReviewEvidence;
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
  visualRepair?: VisualRepairEvidence;
  retryRecovery?: RetryRecoveryEvidence;
  cancellation?: TaskCancellationEvidence;
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
  | "BROWSER_VERIFICATION_COMPLETED"
  | "SCREENSHOT_CAPTURED"
  | "VISUAL_REVIEW_COMPLETED"
  | "VISUAL_REPAIR_STARTED"
  | "VISUAL_REPAIR_COMPLETED"
  | "VISUAL_REPAIR_EXHAUSTED"
  | "RETRY_STARTED"
  | "RETRY_COMPLETED"
  | "RETRY_EXHAUSTED"
  | "TASK_CANCELLED"
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

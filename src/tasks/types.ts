import type {
  GitChangeEvidence,
  GitRepositoryChangeSummary,
} from "../repositories/git-inspector.js";
import type { GitCheckpointEvidence } from "../repositories/git-checkpoint.js";
import type { GitRemotePushEvidence } from "../repositories/git-remote-push.js";
import type {
  BrowserScreenshotEvidence,
  BrowserVerificationEvidence,
} from "../browser/browser-types.js";
import type { VisualReviewEvidence } from "../review/visual-reviewer.js";
import type { ProjectSnapshot } from "../projects/types.js";
import type { ValidationSelectionEvidence } from "../validation/validation-selection.js";
import type { ValidationIntegrityEvidence } from "../validation/validation-integrity.js";
import type { WorkflowResumeMetadata } from "./workflow-resume.js";

export type TaskStatus =
  | "WAITING_FOR_APPROVAL"
  | "PLAN_APPROVED"
  | "PLAN_REJECTED"
  | "IMPLEMENTATION_COMPLETED"
  | "VALIDATION_COMPLETED"
  | "REVIEW_COMPLETED";
export type TaskOutcomeStatus =
  | "IN_PROGRESS"
  | "SUCCEEDED"
  | "FAILED"
  | "CANCELLED";

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
export type PullRequestState = "OPEN" | "CLOSED" | "MERGED";
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
  | "TASK_EXECUTION_TIMEOUT"
  | "UNKNOWN_FAILURE";
export type WorkflowFailureStage =
  | "DEVELOPER"
  | "DEVOPS"
  | "BROWSER_VERIFICATION"
  | "SCREENSHOT_CAPTURE"
  | "VISUAL_REVIEW_PROVIDER"
  | "GIT_CHECKPOINT"
  | "GIT_PUSH"
  | "REVIEWER"
  | "GITHUB_PULL_REQUEST"
  | "GITHUB_PULL_REQUEST_REFRESH";

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
  repositoryChanges?: GitRepositoryChangeSummary;
  changeEvidence?: GitChangeEvidence;
}

export interface TaskExecution {
  id: ExecutionId;
  role: ExecutionRole;
  status: ExecutionStatus;
  attempt: 1;
  startedAt: string;
  completedAt: string;
  durationMs?: number;
  result: ImplementationResult;
}

export interface VisualRepairSourceReview {
  status: "FAILED";
  summary: string;
  findingCount: number;
}

export interface VisualRepairAttemptDeveloperEvidence {
  summary: string;
  changedFiles: readonly string[];
}

export interface VisualRepairAttemptValidationEvidence {
  status: "PASSED";
}

export interface VisualRepairAttemptReviewEvidence {
  status: "PASSED" | "FAILED";
  summary: string;
  findingCount: number;
}

export interface VisualRepairAttempt {
  attempt: number;
  startedAt: string;
  completedAt?: string;
  durationMs?: number;
  sourceScreenshotId: string;
  sourceVisualReview: VisualRepairSourceReview;
  developer?: VisualRepairAttemptDeveloperEvidence;
  validation?: VisualRepairAttemptValidationEvidence;
  screenshotId?: string;
  visualReview?: VisualRepairAttemptReviewEvidence;
}

export interface VisualRepairEvidence {
  maxAttempts: 2;
  outcome?: "PASSED" | "EXHAUSTED";
  attempts: readonly VisualRepairAttempt[];
}

export interface RetryAttemptEvidence {
  stage: RetryStage;
  attempt: number;
  status: "FAILED" | "SUCCEEDED";
  category: RetryFailureCategory;
  startedAt: string;
  completedAt: string;
  durationMs?: number;
  retryable: boolean;
  summary: string;
}

export interface RetryRecoveryEvidence {
  failedStage?: RetryStage;
  retryAvailable: boolean;
  exhausted?: boolean;
  attempts: readonly RetryAttemptEvidence[];
}

export interface WorkflowFailureEvidence {
  stage: WorkflowFailureStage;
  category: RetryFailureCategory;
  summary: string;
  failedAt: string;
}

export interface TaskCancellationEvidence {
  status: "REQUESTED" | "CANCELLED" | "FAILED";
  requestedAt: string;
  cancelledAt?: string;
  stage?: CancellationStage;
  summary?: string;
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
  durationMs?: number;
  checks: readonly ValidationCheck[];
  summary: string;
  validationSelection?: ValidationSelectionEvidence;
  integrity?: ValidationIntegrityEvidence;
  checkpoint?: GitCheckpointEvidence;
  remoteBranch?: GitRemotePushEvidence;
  browserVerification?: BrowserVerificationEvidence;
  browserScreenshot?: BrowserScreenshotEvidence;
  visualReview?: VisualReviewEvidence;
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
  durationMs?: number;
  summary: string;
  findings: readonly ReviewFinding[];
}

export interface TaskPullRequestEvidence {
  number: number;
  url: string;
  state: PullRequestState;
  headBranch: string;
  baseBranch: string;
  commitSha: string;
  createdAt: string;
  durationMs?: number;
}

export interface TaskOutcome {
  outcome: TaskOutcomeStatus;
  implementationCompleted: boolean;
  validationPassed: boolean;
  visualReviewPassed: boolean | null;
  reviewerPassed: boolean;
  pullRequestCreated: boolean;
  repairAttempts: number;
  retryAttempts: number;
  changedFileCount: number | null;
  completedAt: string | null;
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
  workflowFailure?: WorkflowFailureEvidence;
  cancellation?: TaskCancellationEvidence;
  review?: TaskReview;
  pullRequest?: TaskPullRequestEvidence;
  resume?: WorkflowResumeMetadata;
  taskOutcome?: TaskOutcome;
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
  repairContext?: DeveloperRepairContext;
  signal?: AbortSignal;
}

export interface DeveloperRepairFindingContext {
  title: string;
  description: string;
  severity: "INFO" | "WARNING" | "ERROR";
  category: string;
}

export interface DeveloperRepairContext {
  attempt: number;
  originalTaskTitle: string;
  originalTaskDescription: string;
  approvedPlanSummary: string;
  approvedPlanSteps: readonly string[];
  previousDeveloperSummary: string;
  failedVisualReviewSummary: string;
  findings: readonly DeveloperRepairFindingContext[];
  screenshotId: string;
  screenshotViewport: {
    width: number;
    height: number;
  };
  browserPage?: {
    url: string;
    pageTitle?: string;
  };
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
  validate(
    task: TaskSnapshot,
    options?: {
      signal?: AbortSignal;
      setStage?: (stage: CancellationStage) => void;
    },
  ): Promise<TaskValidation>;
}

export interface DevOpsPublisher {
  publishValidatedTask(
    task: TaskSnapshot,
    options?: {
      signal?: AbortSignal;
      setStage?: (stage: CancellationStage) => void;
    },
  ): Promise<TaskValidation>;
}

export interface TaskReviewer {
  review(
    task: TaskSnapshot,
    project?: ProjectSnapshot,
    options?: { signal?: AbortSignal },
  ): Promise<TaskReview>;
}

export interface TaskPullRequestCreatorInput {
  project: ProjectSnapshot;
  task: TaskSnapshot;
  signal?: AbortSignal;
}

export interface TaskPullRequestCreatorResult {
  evidence: TaskPullRequestEvidence;
  created: boolean;
}

export interface TaskPullRequestCreator {
  createPullRequest(
    input: TaskPullRequestCreatorInput,
  ): Promise<TaskPullRequestCreatorResult>;
  refreshPullRequest?(
    input: TaskPullRequestCreatorInput,
  ): Promise<TaskPullRequestEvidence>;
}

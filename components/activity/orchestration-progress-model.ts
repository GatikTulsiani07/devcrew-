import type { TaskSnapshot, TaskStatus } from "@/lib/api-types";

export type OrchestrationStageId =
  | "manager"
  | "approval"
  | "developer"
  | "devops"
  | "reviewer"
  | "pullRequest";

export type OrchestrationStageState = "completed" | "current" | "upcoming" | "stopped";

export interface OrchestrationStage {
  id: OrchestrationStageId;
  label: string;
  state: OrchestrationStageState;
  accessibleLabel: string;
}

export interface OrchestrationProgressModel {
  hasTask: boolean;
  status?: TaskStatus | string;
  currentStageId?: OrchestrationStageId;
  cancelled: boolean;
  rejectionReason?: string;
  fallback: boolean;
  stages: readonly OrchestrationStage[];
}

const stageLabels: Readonly<Record<OrchestrationStageId, string>> = {
  manager: "Manager Plan",
  approval: "Human Approval",
  developer: "Developer",
  devops: "DevOps",
  reviewer: "Reviewer",
  pullRequest: "Pull Request",
};

const stageIds: readonly OrchestrationStageId[] = [
  "manager",
  "approval",
  "developer",
  "devops",
  "reviewer",
  "pullRequest",
];

type StageStateMap = Readonly<Record<OrchestrationStageId, OrchestrationStageState>>;

const statusMappings: Readonly<Partial<Record<TaskStatus, StageStateMap>>> = {
  WAITING_FOR_APPROVAL: {
    manager: "completed",
    approval: "current",
    developer: "upcoming",
    devops: "upcoming",
    reviewer: "upcoming",
    pullRequest: "upcoming",
  },
  PLAN_APPROVED: {
    manager: "completed",
    approval: "completed",
    developer: "current",
    devops: "upcoming",
    reviewer: "upcoming",
    pullRequest: "upcoming",
  },
  PLAN_REJECTED: {
    manager: "completed",
    approval: "stopped",
    developer: "upcoming",
    devops: "upcoming",
    reviewer: "upcoming",
    pullRequest: "upcoming",
  },
  IMPLEMENTATION_COMPLETED: {
    manager: "completed",
    approval: "completed",
    developer: "completed",
    devops: "current",
    reviewer: "upcoming",
    pullRequest: "upcoming",
  },
  VALIDATION_COMPLETED: {
    manager: "completed",
    approval: "completed",
    developer: "completed",
    devops: "completed",
    reviewer: "current",
    pullRequest: "upcoming",
  },
  REVIEW_COMPLETED: {
    manager: "completed",
    approval: "completed",
    developer: "completed",
    devops: "completed",
    reviewer: "completed",
    pullRequest: "current",
  },
};

export function getOrchestrationProgress(
  task?: Pick<TaskSnapshot, "status" | "planDecision" | "pullRequest" | "cancellation">,
): OrchestrationProgressModel {
  if (!task) {
    return {
      hasTask: false,
      cancelled: false,
      fallback: false,
      stages: [],
    };
  }

  const mapping = statusMappings[task.status as TaskStatus];
  if (!mapping) {
    return {
      hasTask: true,
      status: task.status,
      cancelled: false,
      fallback: true,
      stages: [],
    };
  }

  const cancelled = task.cancellation?.status === "CANCELLED";
  const stages = stageIds.map((id) => {
    const mappedState = id === "pullRequest" && task.status === "REVIEW_COMPLETED" && task.pullRequest ? "completed" : mapping[id];
    const state = cancelled && mappedState === "current" ? "upcoming" : mappedState;
    return {
      id,
      label: stageLabels[id],
      state,
      accessibleLabel: `${stageLabels[id]}: ${stateLabel(state)}`,
    };
  });

  return {
    hasTask: true,
    status: task.status,
    cancelled,
    currentStageId: stages.find((stage) => stage.state === "current")?.id,
    rejectionReason: task.status === "PLAN_REJECTED" ? task.planDecision?.reason : undefined,
    fallback: false,
    stages,
  };
}

function stateLabel(state: OrchestrationStageState): string {
  return state[0].toUpperCase() + state.slice(1);
}

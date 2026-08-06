import type { TaskSnapshot, TaskStatus } from "@/lib/api-types";

export type OrchestrationStageId =
  | "manager"
  | "approval"
  | "developer"
  | "devops"
  | "reviewer"
  | "complete";

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
  complete: "Complete",
};

const stageIds: readonly OrchestrationStageId[] = [
  "manager",
  "approval",
  "developer",
  "devops",
  "reviewer",
  "complete",
];

type StageStateMap = Readonly<Record<OrchestrationStageId, OrchestrationStageState>>;

const statusMappings: Readonly<Partial<Record<TaskStatus, StageStateMap>>> = {
  WAITING_FOR_APPROVAL: {
    manager: "completed",
    approval: "current",
    developer: "upcoming",
    devops: "upcoming",
    reviewer: "upcoming",
    complete: "upcoming",
  },
  PLAN_APPROVED: {
    manager: "completed",
    approval: "completed",
    developer: "current",
    devops: "upcoming",
    reviewer: "upcoming",
    complete: "upcoming",
  },
  PLAN_REJECTED: {
    manager: "completed",
    approval: "stopped",
    developer: "upcoming",
    devops: "upcoming",
    reviewer: "upcoming",
    complete: "upcoming",
  },
  IMPLEMENTATION_COMPLETED: {
    manager: "completed",
    approval: "completed",
    developer: "completed",
    devops: "current",
    reviewer: "upcoming",
    complete: "upcoming",
  },
  VALIDATION_COMPLETED: {
    manager: "completed",
    approval: "completed",
    developer: "completed",
    devops: "completed",
    reviewer: "current",
    complete: "upcoming",
  },
  REVIEW_COMPLETED: {
    manager: "completed",
    approval: "completed",
    developer: "completed",
    devops: "completed",
    reviewer: "completed",
    complete: "completed",
  },
};

export function getOrchestrationProgress(
  task?: Pick<TaskSnapshot, "status" | "planDecision">,
): OrchestrationProgressModel {
  if (!task) {
    return {
      hasTask: false,
      fallback: false,
      stages: [],
    };
  }

  const mapping = statusMappings[task.status as TaskStatus];
  if (!mapping) {
    return {
      hasTask: true,
      status: task.status,
      fallback: true,
      stages: [],
    };
  }

  const stages = stageIds.map((id) => {
    const state = mapping[id];
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
    currentStageId: stages.find((stage) => stage.state === "current")?.id,
    rejectionReason: task.status === "PLAN_REJECTED" ? task.planDecision?.reason : undefined,
    fallback: false,
    stages,
  };
}

function stateLabel(state: OrchestrationStageState): string {
  return state[0].toUpperCase() + state.slice(1);
}

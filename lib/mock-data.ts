// Deterministic UI-only fixtures for Sprint 1. These are not backend contracts
// and must be replaced by approved consumer types when integration begins.

export type AgentStatus = "active" | "queued" | "idle" | "stopped";

export type Agent = {
  id: "manager" | "full-stack" | "devops" | "reviewer";
  name: string;
  shortName: string;
  role: string;
  status: AgentStatus;
  statusLabel: string;
  currentFocus: string;
  model: string;
  avatarTone: "ember" | "moss" | "slate" | "plum";
};

export type TimelineEvent = {
  id: string;
  agentId: Agent["id"];
  time: string;
  title: string;
  detail: string;
  kind: "progress" | "success" | "warning" | "error" | "queued";
};

export type QueueItem = {
  id: string;
  title: string;
  owner: string;
  priority: "P0" | "P1";
  estimate: string;
};

export const agents: Agent[] = [
  {
    id: "manager",
    name: "Manager",
    shortName: "MG",
    role: "Planning & coordination",
    status: "active",
    statusLabel: "Planning",
    currentFocus: "Preparing the repository connection plan",
    model: "gpt-5.4",
    avatarTone: "ember",
  },
  {
    id: "full-stack",
    name: "Full-stack Developer",
    shortName: "FS",
    role: "Product implementation",
    status: "queued",
    statusLabel: "Queued",
    currentFocus: "Waiting for the approved implementation plan",
    model: "gpt-5.4-codex",
    avatarTone: "moss",
  },
  {
    id: "devops",
    name: "DevOps Engineer",
    shortName: "DO",
    role: "Validation & release checks",
    status: "idle",
    statusLabel: "Ready",
    currentFocus: "Validation environment is ready",
    model: "gpt-5.4-mini",
    avatarTone: "slate",
  },
  {
    id: "reviewer",
    name: "Reviewer",
    shortName: "RV",
    role: "Independent quality review",
    status: "stopped",
    statusLabel: "Stopped",
    currentFocus: "Paused until verification evidence is available",
    model: "gpt-5.4",
    avatarTone: "plum",
  },
];

export const timelineEvents: TimelineEvent[] = [
  {
    id: "event-01",
    agentId: "manager",
    time: "10:42",
    title: "Implementation plan drafted",
    detail: "Separated repository setup, shell implementation, validation, and review into four accountable stages.",
    kind: "progress",
  },
  {
    id: "event-02",
    agentId: "manager",
    time: "10:38",
    title: "Project context indexed",
    detail: "Read the product specification, architecture boundaries, design language, and delivery backlog.",
    kind: "success",
  },
  {
    id: "event-03",
    agentId: "full-stack",
    time: "10:35",
    title: "Implementation work queued",
    detail: "The developer will begin after the Manager plan receives human approval.",
    kind: "queued",
  },
  {
    id: "event-04",
    agentId: "devops",
    time: "10:31",
    title: "Preview check needs attention",
    detail: "The local preview port was occupied. A clean retry is ready when implementation begins.",
    kind: "warning",
  },
  {
    id: "event-05",
    agentId: "reviewer",
    time: "10:24",
    title: "Review correctly held",
    detail: "No verdict was issued because implementation and verification evidence are not available yet.",
    kind: "error",
  },
];

export const queuedWork: QueueItem[] = [
  {
    id: "DEV-142",
    title: "Build the repository connection step",
    owner: "Full-stack Developer",
    priority: "P0",
    estimate: "Next",
  },
  {
    id: "DEV-143",
    title: "Validate the planning approval boundary",
    owner: "DevOps Engineer",
    priority: "P0",
    estimate: "After DEV-142",
  },
  {
    id: "DEV-144",
    title: "Review traceability and accessible states",
    owner: "Reviewer",
    priority: "P1",
    estimate: "Final stage",
  },
];

export const project = {
  name: "Devcrew MVP",
  repository: "suniltulsiani/devcrew",
  branch: "feat/ui-shell",
};

export const workshopNotes = [
  {
    label: "Current objective",
    title: "Connect the first end-to-end engineering workflow",
    meta: "8 workflow stages",
  },
  {
    label: "Decision needed",
    title: "Approve the Manager plan before implementation starts",
    meta: "Human checkpoint",
  },
  {
    label: "Workspace health",
    title: "Three agents ready, one intentionally stopped",
    meta: "Local preview",
  },
];

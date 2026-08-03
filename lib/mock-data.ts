// Deterministic browser-only fixtures for the UI fidelity prototype.
// These shapes are presentation models, not backend contracts or persisted state.

export type AgentStatus = "active" | "queued" | "idle" | "stopped";

export type Agent = {
  id: "manager" | "full-stack" | "devops" | "reviewer";
  name: string;
  shortName: string;
  role: string;
  handle: string;
  status: AgentStatus;
  statusLabel: string;
  currentFocus: string;
  model: string;
  avatarTone: "ember" | "moss" | "slate" | "plum";
  instructions: string;
  skills: string[];
  memory: string[];
  secretReferences: string[];
  tools: string[];
};

export type TimelineEvent = {
  id: string;
  agentId: Agent["id"];
  time: string;
  title: string;
  detail: string;
  kind: "progress" | "success" | "warning" | "error" | "queued";
  output?: string;
};

export type QueueItem = {
  id: string;
  title: string;
  owner: Agent["name"];
  priority: "P0" | "P1";
  dependency: string;
};

export const agents: Agent[] = [
  {
    id: "manager",
    name: "Manager",
    shortName: "MG",
    role: "Planning and coordination",
    handle: "manager",
    status: "active",
    statusLabel: "Planning",
    currentFocus: "Preparing the repository connection plan",
    model: "gpt-5.4",
    avatarTone: "ember",
    instructions: "Break approved goals into accountable stages, keep ownership explicit, and pause before implementation until a person approves the plan.",
    skills: ["Planning", "Ticket shaping", "Context routing"],
    memory: ["Human approval precedes implementation", "Devcrew MVP is local-first"],
    secretReferences: ["OpenAI workspace credential · referenced"],
    tools: ["Read project context", "Draft plan", "Assign queued work"],
  },
  {
    id: "full-stack",
    name: "Full Stack Developer",
    shortName: "FS",
    role: "Product implementation",
    handle: "full-stack",
    status: "queued",
    statusLabel: "Queued",
    currentFocus: "Waiting for the approved implementation plan",
    model: "gpt-5.4-codex",
    avatarTone: "moss",
    instructions: "Implement only approved ticket scope, preserve worktree boundaries, and return changed files plus verification evidence.",
    skills: ["Next.js", "TypeScript", "UI implementation"],
    memory: ["Do not redefine backend contracts", "Use the existing package manager"],
    secretReferences: ["No secret references assigned"],
    tools: ["Edit worktree", "Run allowed checks", "Inspect local diff"],
  },
  {
    id: "devops",
    name: "DevOps Engineer",
    shortName: "DO",
    role: "Validation and release checks",
    handle: "devops",
    status: "idle",
    statusLabel: "Ready",
    currentFocus: "Validation environment is ready",
    model: "gpt-5.4-mini",
    avatarTone: "slate",
    instructions: "Run the approved quality gates, report exact evidence, and never convert an unavailable check into a passing result.",
    skills: ["Build verification", "Accessibility checks", "Release evidence"],
    memory: ["Local preview is authoritative", "Missing tests remain unverified"],
    secretReferences: ["No secret references assigned"],
    tools: ["Run lint", "Run typecheck", "Run production build"],
  },
  {
    id: "reviewer",
    name: "Reviewer",
    shortName: "RV",
    role: "Independent quality review",
    handle: "reviewer",
    status: "stopped",
    statusLabel: "Stopped",
    currentFocus: "Paused until verification evidence is available",
    model: "gpt-5.4",
    avatarTone: "plum",
    instructions: "Review independently against requirements and issue approved, changes required, or blocked by missing evidence.",
    skills: ["Code review", "Accessibility review", "Evidence analysis"],
    memory: ["Silence never means approval", "Material corrections reopen review"],
    secretReferences: ["No secret references assigned"],
    tools: ["Read diff", "Inspect evidence", "Record verdict"],
  },
];

export const timelineEvents: TimelineEvent[] = [
  {
    id: "event-01",
    agentId: "manager",
    time: "10:42",
    title: "Implementation plan drafted",
    detail: "Separated repository setup, shell reconstruction, route anatomy, validation, and review into accountable stages.",
    kind: "progress",
    output: "Plan ready for human approval. No implementation has started.",
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
    title: "Validation workspace prepared",
    detail: "Lint, typecheck, production build, responsive inspection, and diff checks are ready.",
    kind: "success",
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
  { id: "DEV-142", title: "Reconstruct the workspace shell", owner: "Full Stack Developer", priority: "P0", dependency: "After approval" },
  { id: "DEV-143", title: "Validate interaction and responsive boundaries", owner: "DevOps Engineer", priority: "P0", dependency: "After DEV-142" },
  { id: "DEV-144", title: "Review fidelity and accessible states", owner: "Reviewer", priority: "P1", dependency: "Final stage" },
];

export const project = {
  name: "Devcrew MVP",
  repository: "suniltulsiani/devcrew",
  branch: "sprint-2-ui-fidelity",
  path: "/Desktop/devcrew-ui",
  indexedAt: "2 min ago",
};

export const projects = [
  { id: "project-1", name: "Devcrew MVP", repository: "suniltulsiani/devcrew", branch: "sprint-2-ui-fidelity", state: "Connected", indexing: "Current" },
  { id: "project-2", name: "Design reference", repository: "Local research folder", branch: "Read only", state: "Available", indexing: "Not indexed" },
];

export const ideas = [
  { id: "IDEA-18", title: "Add an approval checkpoint summary", state: "Reviewed", author: "Manager", time: "12 min ago", detail: "Collect plan scope, affected files, and validation intent in one human-readable checkpoint before implementation." },
  { id: "IDEA-17", title: "Remember the last selected agent", state: "Draft", author: "You", time: "Yesterday", detail: "Restore the most recently inspected teammate when returning to Activity." },
  { id: "IDEA-14", title: "Link review findings to evidence", state: "Promoted", author: "Reviewer", time: "2 days ago", detail: "Keep every finding connected to the exact requirement and verification artifact." },
];

export const tickets = [
  { id: "DEV-142", title: "Reconstruct the workspace shell", priority: "P0", assignee: "Full Stack Developer", state: "In progress", dependency: "Human-approved plan", criteria: ["Persistent shell across routes", "Accessible mobile navigation", "No backend integration"] },
  { id: "DEV-143", title: "Validate responsive boundaries", priority: "P0", assignee: "DevOps Engineer", state: "Queued", dependency: "DEV-142", criteria: ["No horizontal overflow", "Desktop workshop remains visible", "Mobile workflow remains usable"] },
  { id: "DEV-144", title: "Review implementation evidence", priority: "P1", assignee: "Reviewer", state: "Blocked", dependency: "DEV-143", criteria: ["Requirements traced", "Checks independently reviewed", "Explicit verdict recorded"] },
  { id: "DEV-137", title: "Establish the dark design tokens", priority: "P1", assignee: "Full Stack Developer", state: "Done", dependency: "None", criteria: ["Warm semantic palette", "Visible focus", "Reduced motion"] },
];

export const documents = [
  { id: "DOC-01", title: "Product specification", type: "Spec", author: "Product", updated: "18 min ago", linked: "DEV-142", summary: "Defines Devcrew scope, users, workflows, trust boundaries, and success criteria." },
  { id: "DOC-02", title: "Workspace architecture", type: "Architecture", author: "Platform", updated: "24 min ago", linked: "DEV-143", summary: "Records worktree ownership, dependency direction, and the browser-to-backend boundary." },
  { id: "DOC-03", title: "Sprint 2 implementation plan", type: "Plan", author: "Manager", updated: "32 min ago", linked: "DEV-142", summary: "Sequences the UI fidelity reconstruction and its validation gates." },
  { id: "DOC-04", title: "Visual inspection notes", type: "Notes", author: "Reviewer", updated: "Yesterday", linked: "DEV-144", summary: "Captures density, hierarchy, responsive, and accessibility observations." },
];

export const reviews = [
  { id: "REV-24", title: "Sprint 2 UI fidelity", severity: "Medium", status: "Awaiting evidence", reviewer: "Reviewer", linked: "DEV-142", evidence: ["Desktop viewport matrix pending", "Mobile focus-trap verification pending"], outcome: "Blocked by missing evidence" },
  { id: "REV-21", title: "Sprint 1 shell foundation", severity: "Low", status: "Changes required", reviewer: "Reviewer", linked: "DEV-137", evidence: ["Shell compiled", "Visual composition remained dashboard-like"], outcome: "Changes required" },
  { id: "REV-18", title: "Design token baseline", severity: "None", status: "Approved", reviewer: "Reviewer", linked: "DEV-137", evidence: ["Dark palette checked", "Focus styling verified"], outcome: "Approved" },
];

export const recentEvents = [
  { actor: "System", detail: "Local fixture workspace ready", tone: "success" },
  { actor: "Manager", detail: "Plan awaiting approval", tone: "active" },
  { actor: "Full Stack Developer", detail: "One task queued", tone: "queued" },
];

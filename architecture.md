# Devcrew Workspace Architecture

## Purpose and Authority

This document defines worktree ownership, dependency direction, and information flow for the complete Devcrew workspace. It is maintained only in `devcrew-docs` and applies to every Devcrew implementation worktree in the shared Git repository.

## Git Repository and Worktree Model

Devcrew uses one Git repository with one GitHub repository and five local worktrees:

| Worktree | Branch | Primary ownership |
| --- | --- | --- |
| `devcrew` | `main` | Integration and release readiness. |
| `devcrew-ui` | `feat/ui-shell` | User interface and interaction. |
| `devcrew-backend` | `feat/orchestrator` | Server behavior and orchestration. |
| `devcrew-docs` | `docs/context` | Canonical platform documentation. |
| `devcrew-review` | `review/integration` | Independent verification and merge readiness. |

Each worktree is a complete checkout of the same Git repository at its assigned branch. Repeated folders and files across worktrees are therefore expected; they do not indicate separate applications or separate Git repositories. Worktree names describe branch ownership and responsibility, while shared history and integration remain within the single repository.

`Guildly-Reference` is a shared read-only research folder. It is not a Git worktree, is not part of the product implementation, and does not create another GitHub repository.


## Architecture Decision Records

Significant engineering decisions must be captured before implementation begins.

Examples include post-MVP changes to:

- authentication strategy
- database selection
- deployment topology
- event transport
- execution model
- caching strategy
- agent orchestration

Every decision should document:

- problem
- alternatives
- selected approach
- trade-offs
- migration strategy
- rollback strategy

Architecture decisions become part of the canonical documentation and are reviewed before dependent implementation.

The architecture distinguishes verified current state from the intended platform structure. At present, the implementation worktrees contain minimal Next.js scaffolds; the approved MVP choices below are not evidence that the API, in-memory persistence, agent runtime, contracts, or local execution adapter are implemented. Post-MVP replacements require documented architecture decisions before dependent implementation proceeds.

## Architectural Principles

- Centralize durable platform documentation and keep branch ownership distributed across worktrees.
- Keep presentation, business behavior, review authority, integration, and documentation as separate responsibilities.
- Define contracts before integrating dependent work.
- Enforce trust boundaries on the server; never rely on interface state for authorization.
- Preserve project context and traceability across ideas, tickets, execution, activity, documents, and review.
- Prefer explicit lifecycle state and audit evidence over implicit workflow behavior.
- Introduce infrastructure only when a validated requirement and an approved decision justify it.

## Worktree Responsibilities

### `devcrew`

`devcrew` is the main integration and release worktree. It owns final assembly of accepted UI and backend work, reconciliation of cross-layer contracts, compatibility checks, shared product polish, end-to-end validation, and release readiness.

Its `main` branch must not become a substitute implementation branch for large UI or backend features. Incoming work should be bounded, reviewed, and compatible with the canonical documentation before integration.

### `devcrew-ui`

`devcrew-ui` owns the presentation layer:

- Page and layout composition.
- Persistent navigation and project context.
- Components, approved dark-theme presentation, typography, responsive behavior, and motion.
- Client interaction and state needed to present server-owned processes.
- Loading, empty, success, error, disabled, and partial-data states.
- Keyboard, focus, semantic, and assistive-technology behavior.

It consumes documented backend contracts. It does not define authorization, persistence, workflow truth, or server business rules.

### `devcrew-backend`

`devcrew-backend` owns the server-side platform:

- Transport contracts and backend routes.
- Application services and workflow orchestration.
- Authentication and authorization enforcement.
- Input validation and stable error behavior.
- Domain state, persistence boundaries, and migrations when a datastore is selected.
- Work lifecycle, agent lifecycle, activity generation, and review-state integrity.
- External adapters, background processing, caching, and operational controls when requirements justify them.
- Structured observability and backend verification.

It provides presentation-neutral capabilities. It does not own pages, layout, visual tokens, or client-only interaction.

### `devcrew-review`

`devcrew-review` is the independent quality gate. It evaluates proposed changes against the specification, architecture, design system, acceptance criteria, and worktree conventions. Its outputs are evidence-backed findings, verification results, residual risks, and one merge-readiness decision: approved, changes required, or blocked by missing evidence.

It does not own feature delivery or architecture redesign. Small corrections are permitted only when explicitly authorized and must be disclosed and re-verified.

### `devcrew-docs`

`devcrew-docs` is the single source of truth for platform-wide product and engineering documentation. It owns:

- `spec.md` for product scope and requirements.
- `architecture.md` for repository and system boundaries.
- `design-system.md` for the official design language.
- `plan.md` for delivery sequencing and gates.
- `tasks.md` for the living engineering backlog.

Implementation worktrees consume these documents from the `docs/context` branch by reference. They may contain worktree operating instructions and implementation-local README material, but must not contain copies or competing versions of the canonical documents.

### `Guildly-Reference`

`Guildly-Reference` contains research used to understand workflow and design principles. Its audit supports direction such as persistent agents, connected work stages, calm dark presentation, and typography-led hierarchy. It is not a code dependency, a screen specification, a copy source, or authority to reproduce Guildly.

## Approved MVP Technology Stack

The following choices are frozen for the local-first hackathon vertical slice. They define implementation constraints, not evidence of current implementation.

### Application

- Next.js App Router.
- React.
- TypeScript with strict checking.
- Node.js runtime.
- npm.

### UI

- Tailwind CSS.
- shadcn/ui where useful.
- Lucide React.
- Restrained CSS transitions.
- Zustand only when shared client state is genuinely required.

### Server

- Next.js Route Handlers under `app/api`.
- Zod for validation.
- Server-Sent Events for one-way activity updates.
- Structured JSON errors.
- In-memory stores for the MVP.

### AI

- Official OpenAI JavaScript/TypeScript SDK.
- OpenAI Responses API.
- Structured outputs.
- Fixed roles: Manager, Full Stack Developer, DevOps Engineer, and Reviewer.

### Local Execution

- Codex CLI through a controlled server-side adapter.
- Node `child_process` only on the server.
- Git CLI for status, diff, branches, and worktree-safe operations.
- Command allowlists, timeouts, and redaction.
- No browser-side shell execution.

### GitHub

- Public repository URL connection for the MVP.
- A prepared local repository for judged execution.
- GitHub OAuth, private repositories, GitHub App installation, pull-request creation, and webhooks are deferred.

### Persistence

- Deterministic in-memory persistence for the judged MVP.
- Store interfaces that allow later replacement.
- Durable storage is deferred.

### Authentication

- No production authentication system for the hackathon MVP.
- OpenAI access remains server-side.
- Credentials never reach the browser or logs.

### Deployment

- The local environment is the authoritative judged environment.
- Vercel presentation deployment is optional.
- A deployed presentation must not falsely claim local shell or Git execution.

### Validation

- ESLint.
- TypeScript.
- Focused tests.
- Next.js production build.
- Manual critical-flow verification.

The MVP introduces no additional frameworks, databases, queues, authentication providers, deployment systems, microservices, Redis, Kafka, or Kubernetes. These and other post-MVP choices remain deferred unless the canonical documentation is explicitly updated and approved.

## Logical Platform Boundaries

The intended platform has four logical layers regardless of the eventual packaging or deployment model:

| Layer | Owner | Responsibility |
| --- | --- | --- |
| Experience | `devcrew-ui` | Presents project context and workflows; sends validated user intent to backend contracts. |
| Application and domain | `devcrew-backend` | Authorizes commands, enforces lifecycle rules, coordinates work, and returns stable outcomes. |
| Integration and release | `devcrew` | Assembles accepted work, reconciles contract versions, and validates the complete product. |
| Governance and assurance | `devcrew-docs` and `devcrew-review` | Defines expected behavior and independently verifies conformance. |

The logical boundaries are intended even though the approved in-memory store, local execution adapter, Server-Sent Events transport, and local runtime flow are not yet implemented. Durable persistence, production identity, queueing, and production deployment remain deferred post-MVP choices and require approved documentation before implementation.

## Dependency Direction

Dependencies always flow downward.


devcrew
↓
devcrew-ui
↓
devcrew-backend
↓
devcrew-docs


Review remains independent and depends only on approved documentation and implementation evidence.

Worktrees must never introduce circular ownership or undocumented cross-dependencies.

## Information Flow

### User and Work Flow

1. The UI establishes the active project context and presents the relevant workspace state.
2. A user action produces a request against a documented backend contract.
3. The backend validates the request and applies server-side project and execution boundaries. Production authentication is deferred for the hackathon MVP.
4. The relevant application service applies domain and lifecycle rules.
5. The backend records the state change and an attributable activity event in the deterministic in-memory store.
6. The backend returns a stable result or actionable error without exposing internal or secret data.
7. The UI updates the visible state from authoritative contract data and communicates progress or failure accessibly.

Long-running execution must preserve the initiating project, user, work item, and agent identifiers across queued, active, stopped, completed, failed, and reviewed states. Server-Sent Events provide one-way activity updates for the MVP and must preserve ordering, recovery behavior, and server-side boundaries.


## Trust Boundaries

The UI is never considered authoritative.

Only the backend may:

- authorize actions
- validate requests
- enforce lifecycle rules
- persist state
- expose protected information

The review worktree never modifies production behaviour.

The documentation worktree never owns runtime logic.

The integration worktree never bypasses branch ownership.

### Knowledge and Configuration Flow

Project documents, product requirements, skills, memory, and agent configuration provide controlled context to execution. Canonical project knowledge is not changed merely because an agent consumed it. Durable changes require an authorized write, attribution, validation, and corresponding activity evidence.

Secrets flow only through server-controlled references. A client may manage secret metadata and assignment when authorized, but secret values must not return through ordinary read contracts or appear in activity, review evidence, or logs.

## Review Flow

1. Implementation begins from an approved task and acceptance criteria in the canonical backlog and specification.
2. UI or backend work is produced in its owning worktree with focused verification evidence.
3. Cross-layer changes identify the affected contract and dependent worktree behavior.
4. `devcrew-review` inspects the complete proposed change and its context, runs applicable gates, and manually verifies affected journeys.
5. Findings return to the owning worktree for correction unless an explicitly authorized narrow review fix is appropriate.
6. Corrected work is re-verified. Review then records approved, changes required, or blocked by missing evidence.
7. Only approved work advances to `devcrew` for integration.
8. `devcrew` reconciles combined behavior and runs full integration and release gates. Integration failures return to the responsible owner and require renewed review of affected scope.

Review approval is evidence, not a replacement for integration testing. Main-branch integration is not permission to bypass unresolved findings.

## Documentation Flow

1. Product scope, architecture, design language, delivery sequencing, or backlog changes are proposed in `devcrew-docs`.
2. The change is checked against all five canonical documents for contradictions and against implemented behavior for accuracy.
3. Architecture-sensitive changes are made explicit before dependent code is built.
4. Implementation worktrees consume the canonical files through Git references, workspace links, or documentation tooling selected by the team.
5. Implementation changes that alter approved behavior must update `devcrew-docs` in the same delivery cycle.
6. Documentation conformance is checked during review and again during release validation.

The consumption mechanism must not copy the files into implementation worktrees. A link or generated index may point to the `docs/context` branch, but the canonical Markdown must remain in `devcrew-docs`.

## Why Documentation Is Centralized

Separate copies create ambiguous authority, delayed updates, and incompatible requirements across UI, backend, review, and integration work. Centralization provides:

- One review history for platform decisions and scope.
- One vocabulary for contracts, lifecycle states, quality gates, and ownership.
- Immediate visibility of cross-worktree impact.
- No synchronization process for duplicate files.
- A clear rule when code and documentation disagree: verify the discrepancy against the canonical document, then correct the appropriate source through review.

Centralization does not move implementation-specific operating instructions into the documentation worktree. A worktree may document local commands, structure, and contribution rules as long as it links to, and does not redefine, platform requirements.

## Contract and Change Governance

- Backend contracts must define inputs, outputs, errors, authentication expectations, and lifecycle effects before UI integration.
- Breaking changes require an explicit migration path and coordinated updates across owners.
- Contract verification must exist on both producer and consumer sides before release.
- Architecture changes must state the requirement, alternatives considered, operational effect, security effect, migration, and rollback.
- Replacing the approved in-memory store, local execution adapter, Server-Sent Events transport, or local judged environment requires an approved documentation update and architecture decision.
- `tasks.md` tracks delivery work; durable decisions belong in the canonical documentation rather than issue comments or worktree-local copies.

## Quality Boundaries

Each owner verifies its own work before independent review. `devcrew-review` verifies conformance and residual risk. `devcrew` verifies the integrated product. Release requires all three levels; no level inherits an automatic pass from another.

At minimum, applicable lint, type, automated test, build, accessibility, security, and critical-journey checks must pass without suppression. Missing checks are disclosed as gaps and resolved before the release gate defined in `plan.md`.
## Future Evolution

The architecture intentionally preserves flexibility for future expansion.

Potential additions include:

- distributed execution
- external providers
- multi-workspace support
- plugin architecture
- event-driven services
- enterprise governance

These additions must preserve the worktree and branch ownership model defined in this document.

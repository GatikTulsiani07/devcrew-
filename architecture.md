# Devcrew Workspace Architecture

## Purpose and Authority

This document defines repository ownership, dependency direction, and information flow for the complete Devcrew workspace. It is maintained only in `devcrew-docs` and applies to every Devcrew code repository.

The architecture distinguishes verified current state from the intended platform structure. At present, `devcrew`, `devcrew-ui`, `devcrew-backend`, and `devcrew-review` are independent minimal Next.js scaffolds. No production API, persistence layer, agent runtime, shared contract package, or deployment topology is established in the inspected code. Those choices must be made through documented architecture decisions as implementation proceeds.

## Architectural Principles

- Centralize durable platform documentation and keep code ownership distributed.
- Keep presentation, business behavior, review authority, integration, and documentation as separate responsibilities.
- Define contracts before integrating dependent work.
- Enforce trust boundaries on the server; never rely on interface state for authorization.
- Preserve project context and traceability across ideas, tickets, execution, activity, documents, and review.
- Prefer explicit lifecycle state and audit evidence over implicit workflow behavior.
- Introduce infrastructure only when a validated requirement and an approved decision justify it.

## Workspace Repositories

### `devcrew`

`devcrew` is the main integration and release repository. It owns final assembly of accepted UI and backend work, reconciliation of cross-layer contracts, compatibility checks, shared product polish, end-to-end validation, and release readiness.

It must not become a substitute implementation branch for large UI or backend features. Incoming work should be bounded, reviewed, and compatible with the canonical documentation before integration.

### `devcrew-ui`

`devcrew-ui` owns the presentation layer:

- Page and layout composition.
- Persistent navigation and project context.
- Components, themes, typography, responsive behavior, and motion.
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

`devcrew-review` is the independent quality gate. It evaluates proposed changes against the specification, architecture, design system, acceptance criteria, and repository conventions. Its outputs are evidence-backed findings, verification results, residual risks, and one merge-readiness decision: approved, changes required, or blocked by missing evidence.

It does not own feature delivery or architecture redesign. Small corrections are permitted only when explicitly authorized and must be disclosed and re-verified.

### `devcrew-docs`

`devcrew-docs` is the single source of truth for platform-wide product and engineering documentation. It owns:

- `spec.md` for product scope and requirements.
- `architecture.md` for repository and system boundaries.
- `design-system.md` for the official design language.
- `plan.md` for delivery sequencing and gates.
- `tasks.md` for the living engineering backlog.

Code repositories consume these documents by reference. They may contain repository operating instructions and implementation-local README material, but must not contain copies or competing versions of the canonical documents.

### `Guildly-Reference`

`Guildly-Reference` contains research used to understand workflow and design principles. Its audit supports direction such as persistent agents, connected work stages, calm dark presentation, and typography-led hierarchy. It is not a code dependency, a screen specification, a copy source, or authority to reproduce Guildly.

## Logical Platform Boundaries

The intended platform has four logical layers regardless of the eventual packaging or deployment model:

| Layer | Owner | Responsibility |
| --- | --- | --- |
| Experience | `devcrew-ui` | Presents project context and workflows; sends validated user intent to backend contracts. |
| Application and domain | `devcrew-backend` | Authorizes commands, enforces lifecycle rules, coordinates work, and returns stable outcomes. |
| Integration and release | `devcrew` | Assembles accepted work, reconciles contract versions, and validates the complete product. |
| Governance and assurance | `devcrew-docs` and `devcrew-review` | Defines expected behavior and independently verifies conformance. |

Persistence, execution runtime, identity provider, queueing, and deployment boundaries are not yet implemented or selected. Their future designs must preserve these ownership boundaries and be recorded before dependent implementation.

## Information Flow

### User and Work Flow

1. The UI establishes the active project context and presents the relevant workspace state.
2. A user action produces a request against a documented backend contract.
3. The backend authenticates the request, authorizes the action within the project, and validates the input.
4. The relevant application service applies domain and lifecycle rules.
5. The backend records the state change and an attributable activity event through the selected persistence boundary.
6. The backend returns a stable result or actionable error without exposing internal or secret data.
7. The UI updates the visible state from authoritative contract data and communicates progress or failure accessibly.

Long-running execution must preserve the initiating project, user, work item, and agent identifiers across queued, active, stopped, completed, failed, and reviewed states. The concrete delivery mechanism for live updates is not yet selected; whichever mechanism is adopted must preserve ordering, recovery, and authorization.

### Knowledge and Configuration Flow

Project documents, product requirements, skills, memory, and agent configuration provide controlled context to execution. Canonical project knowledge is not changed merely because an agent consumed it. Durable changes require an authorized write, attribution, validation, and corresponding activity evidence.

Secrets flow only through server-controlled references. A client may manage secret metadata and assignment when authorized, but secret values must not return through ordinary read contracts or appear in activity, review evidence, or logs.

## Review Flow

1. Implementation begins from an approved task and acceptance criteria in the canonical backlog and specification.
2. UI or backend work is produced in its owning repository with focused verification evidence.
3. Cross-layer changes identify the affected contract and dependent repository behavior.
4. `devcrew-review` inspects the complete proposed change and its context, runs applicable gates, and manually verifies affected journeys.
5. Findings return to the owning repository for correction unless an explicitly authorized narrow review fix is appropriate.
6. Corrected work is re-verified. Review then records approved, changes required, or blocked by missing evidence.
7. Only approved work advances to `devcrew` for integration.
8. `devcrew` reconciles combined behavior and runs full integration and release gates. Integration failures return to the responsible owner and require renewed review of affected scope.

Review approval is evidence, not a replacement for integration testing. Main-branch integration is not permission to bypass unresolved findings.

## Documentation Flow

1. Product scope, architecture, design language, delivery sequencing, or backlog changes are proposed in `devcrew-docs`.
2. The change is checked against all five canonical documents for contradictions and against implemented behavior for accuracy.
3. Architecture-sensitive changes are made explicit before dependent code is built.
4. Code repositories consume the canonical files through workspace links, repository references, or documentation tooling selected by the team.
5. Implementation changes that alter approved behavior must update `devcrew-docs` in the same delivery cycle.
6. Documentation conformance is checked during review and again during release validation.

The consumption mechanism must not copy the files into code repositories. A link or generated index may point to this repository, but the canonical Markdown must remain here.

## Why Documentation Is Centralized

Separate copies create ambiguous authority, delayed updates, and incompatible requirements across UI, backend, review, and integration work. Centralization provides:

- One review history for platform decisions and scope.
- One vocabulary for contracts, lifecycle states, quality gates, and ownership.
- Immediate visibility of cross-repository impact.
- No synchronization process for duplicate files.
- A clear rule when code and documentation disagree: verify the discrepancy against the canonical document, then correct the appropriate source through review.

Centralization does not move code-specific operating instructions into this repository. A repository may document local commands, structure, and contribution rules as long as it links to, and does not redefine, platform requirements.

## Contract and Change Governance

- Backend contracts must define inputs, outputs, errors, authentication expectations, and lifecycle effects before UI integration.
- Breaking changes require an explicit migration path and coordinated updates across owners.
- Contract verification must exist on both producer and consumer sides before release.
- Architecture changes must state the requirement, alternatives considered, operational effect, security effect, migration, and rollback.
- The selected datastore, identity mechanism, execution model, update transport, and deployment topology require documented decisions because none is established today.
- `tasks.md` tracks delivery work; durable decisions belong in the canonical documentation rather than issue comments or repository-specific copies.

## Quality Boundaries

Each owner verifies its own work before independent review. `devcrew-review` verifies conformance and residual risk. `devcrew` verifies the integrated product. Release requires all three levels; no level inherits an automatic pass from another.

At minimum, applicable lint, type, automated test, build, accessibility, security, and critical-journey checks must pass without suppression. Missing checks are disclosed as gaps and resolved before the release gate defined in `plan.md`.

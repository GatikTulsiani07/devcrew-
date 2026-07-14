# Devcrew Engineering Backlog

## Backlog Policy

This is the canonical living backlog for the Devcrew platform. Entries describe incomplete deliverables even where the verified baseline already satisfies part of a task. A task may move to `In progress`, `Blocked`, or `Done` only with an accountable owner and verifiable evidence. `Done` requires every acceptance criterion and applicable quality gate to pass.

Priorities are `P0` for release-blocking foundation or risk, `P1` for required MVP capability, and `P2` for important hardening or post-foundation improvement. Dependencies use task identifiers; `None` means the task can begin from the current documented baseline.

## Verified Current Implementation

- `devcrew-ui` is a browser-only Next.js App Router, React, TypeScript, and Tailwind CSS application.
- `devcrew-backend` is a separate Hono, TypeScript, and Zod HTTP service on local port `3001`.
- The backend uses Drizzle ORM and Postgres.js with Supabase PostgreSQL. Runtime `DATABASE_URL` uses the transaction pooler with `prepare: false`; Drizzle inspection and migrations use `DIRECT_URL` with the session pooler.
- Only `GET /health` and `GET /health/database` are implemented backend contracts.
- No product schema, authentication, projects, agents, tickets, activity, reviews, execution, or associated persistence is implemented.

## Hackathon Execution Boundary

The hackathon implementation scope is one local-first, deterministic vertical slice:

1. Connect a prepared repository.
2. Submit one engineering task.
3. The Manager creates a plan.
4. A human approves the plan.
5. The Full Stack Developer produces the implementation result.
6. The DevOps Engineer validates the result.
7. The Reviewer issues a verdict.
8. Activity and the final result remain visible.

Only tasks explicitly tagged or identified as `Hackathon P0` may enter implementation during the event. Production hardening tasks remain in this canonical backlog but must not block the judged prototype. Local UI fixture data may support unfinished presentation surfaces, but it must be labeled as fixture data and must never become authoritative product state. Any real project, agent, ticket, activity, review, or execution state is owned by the backend and persisted through the approved Supabase PostgreSQL boundary once its product schema exists. The core workflow itself must be real, connected, and demonstrable.


## Task Status Lifecycle

Every task must move through the following lifecycle.

Backlog
↓
Ready
↓
In Progress
↓
In Review
↓
Blocked (optional)
↓
Done

Only the assigned owner may move a task into **In Progress**.

Only the Reviewer working through the review worktree may approve movement into **Done**.

A task is never considered complete merely because code exists.

Completion requires every documented acceptance criterion and applicable review gate.


## Milestones

### Milestone 1

Workspace Foundation

- documentation
- architecture
- worktree setup

---

### Milestone 2

Core Platform

- projects
- agents
- activity

---

### Milestone 3

Engineering Workflow

- ideas
- tickets
- review

---

### Milestone 4

Integration

- backend
- ui
- review

---

### Milestone 5

Release Candidate

- testing
- polish
- deployment

## Main

### MAIN-01 — Define the cross-worktree integration strategy

- Priority: P0
- Description: Define how reviewed UI and backend deliverables are reconciled and assembled in the `devcrew` worktree, including contract versioning and ownership of integration conflicts.
- Dependencies: DOC-01, BACK-01
- Status: Not started
- Acceptance criteria:
  - The strategy identifies the source, target, review evidence, and validation required for each integration unit.
  - Contract-breaking changes have an explicit coordination and migration process.
  - The approach does not create canonical-document copies in implementation worktrees.

### MAIN-02 — Integrate the project foundation slice

- Priority: P0
- Description: Assemble the reviewed project context, application shell, and backend project boundary in `devcrew`.
- Dependencies: BACK-03, UI-02, REV-02, INFRA-02
- Status: Not started
- Acceptance criteria:
  - Project creation, selection, viewing, and settings operate through the agreed contract.
  - Loading, empty, error, authorization, responsive, and keyboard behavior pass integration verification.
  - Cross-project access is rejected and no contract mismatch remains.

### MAIN-03 — Integrate the core work lifecycle

- Priority: P0
- Description: Assemble agents, activity, ideas, tickets, assignment, and lifecycle behavior into a coherent end-to-end workflow.
- Dependencies: MAIN-02, BACK-04, BACK-05, UI-03, UI-04, REV-03
- Status: Not started
- Acceptance criteria:
  - A user can move from idea intake through ticket assignment and observe agent work state in activity.
  - Invalid, stopped, failed, retried, and completed states remain consistent across UI and backend.
  - Activity retains attributable, ordered links to the relevant project, agent, and work item.

### MAIN-04 — Integrate knowledge and review

- Priority: P1
- Description: Connect documents, product requirements, controlled agent context, and explicit review outcomes to the work lifecycle.
- Dependencies: MAIN-03, BACK-06, UI-05, REV-04
- Status: Not started
- Acceptance criteria:
  - Project knowledge is searchable, project-scoped, and consumable without implicit mutation.
  - Work can reach approved, changes required, or blocked by missing evidence through a recorded review.
  - Review and knowledge events appear in the associated work history.

### MAIN-05 — Produce the MVP release candidate

- Priority: P0
- Description: Harden and validate the integrated product for release without expanding MVP scope.
- Dependencies: MAIN-04, REV-05, INFRA-03, INFRA-04, DOC-02
- Status: Not started
- Acceptance criteria:
  - The critical workflow passes the complete release gate in a production-representative environment.
  - All release-blocking findings are resolved and re-verified.
  - Deployment, monitoring, rollback, and support evidence is complete and matches the reviewed artifact.

## Backend

### BACK-01 — Verify and document the backend foundation

- Priority: P0
- Description: Verify and document the approved separate Hono service, backend authority, Supabase PostgreSQL persistence boundary, Drizzle/Postgres.js connection model, local execution boundary, and deferred decisions without treating health connectivity as completed product persistence.
- Dependencies: DOC-01
- Status: Not started
- Acceptance criteria:
  - The local Hono service runs on port `3001`, and `GET /health` and `GET /health/database` have focused verification.
  - Runtime access uses `DATABASE_URL` through the Supabase transaction pooler with Postgres.js `prepare: false`; Drizzle inspection and migrations use `DIRECT_URL` through the session pooler.
  - The UI, main, and review owners approve the HTTP contract and authority implications.
  - Verified connection behavior, unimplemented product schemas and authentication, and deferred transport or infrastructure choices are explicitly distinguished.

### BACK-02 — Define platform contracts and lifecycle rules

- Priority: P0
- Description: Define versioned HTTP JSON behavior, stable backend-owned errors, and valid states and transitions for projects, agents, work, tickets, activity, knowledge, and reviews.
- Dependencies: BACK-01
- Status: Not started
- Acceptance criteria:
  - Inputs, outputs, authorization expectations, errors, pagination, and lifecycle effects are documented.
  - Invalid transitions and retry behavior are explicit and testable.
  - Producer verification and UI-consumable contract artifacts use one authoritative definition.
  - Contracts do not require the UI to import backend or database modules or connect directly to Supabase.

### BACK-03 — Implement identity and project isolation

- Priority: P0
- Description: Extend the verified Hono and database-health foundation with the minimum approved Drizzle product schema, server configuration, project boundaries, validation, persistence access, error handling, and baseline observability. Add authentication and authorization only to the extent approved for the MVP flow; neither exists in the current implementation.
- Dependencies: BACK-02, INFRA-01
- Status: Not started
- Acceptance criteria:
  - Product migrations run through `DIRECT_URL`, while runtime product access uses `DATABASE_URL` with `prepare: false`.
  - Project operations, once implemented, enforce backend-owned identity and ownership rules defined by the approved contract.
  - Cross-project access, malformed input, and missing configuration fail safely with stable errors.
  - Tests cover authorized, unauthorized, absent, and conflicting project operations.

### BACK-04 — Implement agent execution and activity

- Priority: P0
- Description: Implement persistent agent configuration and the approved queued, active, stopped, completed, failed, and retry lifecycle with attributable activity.
- Dependencies: BACK-03
- Status: Not started
- Acceptance criteria:
  - State transitions are atomic or recoverable and reject invalid changes.
  - Retry and stop behavior do not create silent duplicate work or discard state.
  - Activity ordering, correlation, authorization, and failure behavior have automated coverage.

### BACK-05 — Implement ideas and tickets

- Priority: P1
- Description: Implement idea intake, promotion to tickets, ticket priority, assignment, filtering, lifecycle history, and bounded collection access.
- Dependencies: BACK-03, BACK-04
- Status: Not started
- Acceptance criteria:
  - Promotion retains the idea origin and is safe to retry.
  - Ticket assignment references a valid project agent and generates activity.
  - Filtering, pagination, concurrency, and invalid transitions have automated coverage.

### BACK-06 — Implement knowledge, review, and secret boundaries

- Priority: P1
- Description: Implement documents, product requirement classification, search, controlled agent context, review outcomes, skills, memory, and secret-reference behavior.
- Dependencies: BACK-03, BACK-04
- Status: Not started
- Acceptance criteria:
  - Knowledge, skills, and memory remain correctly project- and agent-scoped with attributable changes.
  - Review cannot produce approval when required evidence is absent.
  - Secret values never appear in ordinary responses, logs, activity, or review records.

## UI

### UI-01 — Establish the design foundation

- Priority: P0
- Description: Translate `design-system.md` into reusable tokens, primitives, component behavior, and verification examples within `devcrew-ui`.
- Dependencies: DOC-01
- Status: Not started
- Acceptance criteria:
  - Semantic tokens cover the approved dark theme, typography, spacing, radius, elevation, motion, focus, and status.
  - Core components define keyboard and screen-reader behavior plus loading, empty, error, disabled, and validation states.
  - The approved dark theme meets applicable contrast requirements without component-specific hard-coded semantics.

### UI-02 — Build the application shell and project flow

- Priority: P0
- Description: Deliver persistent navigation, visible project context, responsive layout, project selection, and project settings against approved contracts.
- Dependencies: UI-01, BACK-02
- Status: Not started
- Acceptance criteria:
  - Navigation preserves project and section context across supported viewport sizes.
  - The project flow handles loading, empty, error, unsaved, unauthorized, and success states.
  - Keyboard navigation, focus management, landmarks, headings, and announcements pass manual review.
  - All product data comes through versioned backend HTTP JSON contracts; the UI imports no backend or database modules and never connects directly to Supabase.

### UI-03 — Build agents and activity experiences

- Priority: P0
- Description: Present persistent agent configuration, operational state, queued work, chronological activity, and start or stop interactions.
- Dependencies: UI-02, BACK-04
- Status: Not started
- Acceptance criteria:
  - Users can determine what each agent is doing, what is queued, and where intervention is required.
  - Lifecycle states use consistent labels and non-color cues.
  - Long, empty, delayed, failed, retried, and stopped activity states remain understandable and accessible.

### UI-04 — Build ideas and ticket management

- Priority: P1
- Description: Deliver idea intake and backlog, idea promotion, ticket filtering, assignment, history, and list and board-oriented views.
- Dependencies: UI-02, BACK-05
- Status: Not started
- Acceptance criteria:
  - The origin of a promoted idea remains visible from the ticket.
  - List and board views express the same authoritative ticket state.
  - Filtering, keyboard operation, narrow viewports, empty data, long content, and action errors are verified.

### UI-05 — Build knowledge and review experiences

- Priority: P1
- Description: Deliver documents, product requirements, search, skills, memory, secret metadata, review findings, and review outcomes.
- Dependencies: UI-02, BACK-06
- Status: Not started
- Acceptance criteria:
  - Product requirements are distinguishable from general documents without fragmenting project navigation.
  - Secret interfaces never reveal stored values after submission.
  - Review evidence, severity, disposition, and outcome are understandable and completely keyboard accessible.

## Review

### REV-01 — Establish the review evidence model

- Priority: P0
- Description: Define the required evidence, severity model, finding disposition, and merge-readiness record used across milestone reviews.
- Dependencies: DOC-01
- Status: Not started
- Acceptance criteria:
  - The model distinguishes approved, changes required, and blocked by missing evidence.
  - Findings include location, expected behavior, observed behavior, impact, and reproduction or verification evidence.
  - Material changes after approval explicitly reopen affected review scope.

### REV-02 — Review the foundation slice

- Priority: P0
- Description: Review architecture decisions, project isolation, backend contracts, design foundation, and the project user journey.
- Dependencies: BACK-03, UI-02, REV-01
- Status: Not started
- Acceptance criteria:
  - Architecture, contract, security, accessibility, responsive, failure, and build evidence is recorded.
  - Cross-project authorization is negatively tested.
  - A merge-readiness outcome is issued with residual risk stated.

### REV-03 — Review agents and work lifecycle

- Priority: P0
- Description: Review agents, execution, activity, ideas, tickets, assignment, concurrency, retry, stop, and failure behavior.
- Dependencies: BACK-05, UI-04, REV-01
- Status: Not started
- Acceptance criteria:
  - Lifecycle and activity states are traced through UI, contracts, services, and persistence.
  - Negative, concurrent, partial-failure, and recovery paths have reproducible evidence.
  - Accessibility and performance are assessed with representative work volume.

### REV-04 — Review knowledge, secrets, and review behavior

- Priority: P0
- Description: Review project knowledge, agent context, memory, skills, secret isolation, and the product review workflow.
- Dependencies: BACK-06, UI-05, REV-01
- Status: Not started
- Acceptance criteria:
  - Project isolation, authorization, attribution, and knowledge mutation rules are verified.
  - Secret exposure checks cover responses, client bundles, logs, activity, URLs, and review evidence.
  - Incomplete evidence cannot result in approval.

### REV-05 — Perform release review

- Priority: P0
- Description: Evaluate the complete integrated candidate and issue the final merge- and release-readiness decision.
- Dependencies: MAIN-04, INFRA-03, INFRA-04
- Status: Not started
- Acceptance criteria:
  - All required static, automated, manual, security, accessibility, performance, deployment, and rollback evidence is complete.
  - Every blocking finding is resolved and re-verified against the exact candidate.
  - Residual risks and the final decision are recorded without unsupported pass claims.

## Documentation

### DOC-01 — Ratify canonical platform documentation

- Priority: P0
- Description: Review the specification, architecture, design system, execution plan, and backlog with all worktree owners before implementation relies on them.
- Dependencies: None
- Status: Not started
- Acceptance criteria:
  - UI, backend, main, and review responsibilities contain no conflicts.
  - Product scope, lifecycle terminology, milestone gates, and backlog dependencies are consistent.
  - Implementation worktrees reference these files and contain no duplicate canonical documents.

### DOC-02 — Reconcile documentation with the release candidate

- Priority: P0
- Description: Verify canonical documentation against the implemented release candidate and correct approved behavior or documentation discrepancies.
- Dependencies: MAIN-04
- Status: Not started
- Acceptance criteria:
  - Requirements and architecture claims match observable implementation.
  - Deferred features remain outside MVP unless separately approved.
  - Markdown, links, terminology, and cross-document references pass validation.

### DOC-03 — Establish documentation change governance

- Priority: P1
- Description: Add a review rule that makes canonical documentation impact explicit for product, contract, architecture, design, and release changes.
- Dependencies: DOC-01, INFRA-01
- Status: Not started
- Acceptance criteria:
  - Change review identifies whether canonical documentation is affected.
  - Automated checks reject worktree-local copies of the five canonical files.
  - Documentation changes remain reviewable independently of generated or worktree-local guidance.

## Infrastructure

### INFRA-01 — Establish workspace quality gates

- Priority: P0
- Description: Define consistent continuous-integration gates for each worktree and branch based on its actual scripts and responsibilities.
- Dependencies: DOC-01
- Status: Not started
- Acceptance criteria:
  - Every implementation branch runs applicable lint, type, test, and production-build checks without suppressions.
  - Missing test capabilities are tracked as blocking gaps rather than reported as passing.
  - Gate output identifies the worktree, branch, revision, command, environment, and result.

### INFRA-02 — Provide an integration test environment

- Priority: P0
- Description: Provision a controlled environment for the browser UI and separate Hono backend contract integration using the approved Supabase connection model and safe configuration handling.
- Dependencies: BACK-01, INFRA-01
- Status: Not started
- Acceptance criteria:
  - The environment uses documented, validated configuration and contains no committed secrets.
  - UI and backend remain separated by HTTP, and only the backend receives `DATABASE_URL` or `DIRECT_URL`.
  - Health, logs, test-data isolation, and repeatable deployment are available to review and integration work.
  - The environment represents production boundaries closely enough for milestone verification.

### INFRA-03 — Implement release observability and operations

- Priority: P0
- Description: Provide health checks, structured operational signals, alert ownership, and runbooks for the selected deployment topology.
- Dependencies: BACK-03, INFRA-02
- Status: Not started
- Acceptance criteria:
  - Requests and work execution can be correlated without logging secrets or unnecessary private content.
  - Health and alert conditions are measurable and have named response ownership.
  - Failure, recovery, and escalation procedures are exercised in the integration environment.

### INFRA-04 — Define deployment and rollback

- Priority: P0
- Description: Establish reproducible promotion, migration, health verification, and rollback for the exact reviewed artifact.
- Dependencies: INFRA-02, INFRA-03
- Status: Not started
- Acceptance criteria:
  - Deployment is repeatable and identifies the source revision and configuration requirements.
  - Data migration and rollback behavior are documented and rehearsed when persistence changes apply.
  - A failed post-deployment gate triggers a clear stop or rollback decision.

### INFRA-05 — Establish measured release budgets

- Priority: P1
- Description: Define representative data volumes and measurable performance and reliability budgets for critical MVP workflows.
- Dependencies: MAIN-03, INFRA-02
- Status: Not started
- Acceptance criteria:
  - Budgets cover user-perceived response, long-running work feedback, collection scale, error rate, and recovery behavior.
  - Measurements record environment, dataset, method, result, and allowed threshold.
  - Release review treats missed required budgets as explicit findings.


## Definition of Done

A task reaches Done only when:

- Acceptance Criteria pass.
- Review approves.
- Tests pass.
- Lint passes.
- Type checks pass.
- Build succeeds.
- Documentation updated.
- No blocker remains.

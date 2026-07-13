# Devcrew Engineering Execution Plan

## Purpose

This plan sequences delivery of the Devcrew MVP across the workspace. It defines milestones and exit gates, not implementation details or proof of completion. Current implementation worktrees are minimal scaffolds; no milestone in this plan is considered complete without the stated evidence and an updated backlog.

## Hackathon Delivery Override

The OpenAI Build Week implementation window compresses the larger plan into one local-first, deterministic vertical slice:

1. Connect a prepared repository.
2. Submit one engineering task.
3. The Manager creates a plan.
4. A human approves the plan.
5. The Full Stack Developer produces the implementation result.
6. The DevOps Engineer validates the result.
7. The Reviewer issues a verdict.
8. Activity and the final result remain visible.

The hackathon MVP does not require production authentication, a durable database, GitHub OAuth, private repository support, an external connector ecosystem, autonomous merge, production deployment, or full enterprise hardening. The local environment is the authoritative judged environment, and deterministic local behavior takes priority over incomplete production infrastructure.

This override proves the intended architecture through a real end-to-end workflow; it does not delete, weaken, or complete the production-grade milestones below. The full plan remains the long-term execution model after the judged prototype.

## Execution Philosophy

Devcrew is developed through incremental vertical slices rather than isolated technical layers.

Every milestone should deliver a reviewable improvement that moves the product closer to a usable engineering workflow.

No worktree is considered complete independently.

Backend, UI, Review, and Integration evolve together through documented contracts and continuous review.

Large rewrites are avoided.

Stable iteration is preferred over rapid expansion.

## Delivery Principles

- Establish requirements and contracts before dependent implementation.
- Deliver vertical, reviewable workflow slices instead of isolated screen inventories.
- Keep worktree and branch ownership explicit and integrate only reviewed work.
- Validate security, accessibility, failure behavior, and observability throughout delivery.
- Use `tasks.md` as the operational backlog and this document as the milestone sequence.
- Record architecture choices before introducing identity, persistence, execution, update transport, or deployment infrastructure.

## Engineering Rules

Throughout implementation:

- Documentation precedes implementation.
- Architecture precedes optimization.
- Contracts precede integration.
- Review precedes merge.
- Release follows verification.

No implementation should bypass these stages.

## Worktree Completion Order

The worktree order expresses dependency and release progression rather than a prohibition on safe parallel work:

1. `devcrew-docs` establishes product scope, architecture boundaries, design rules, milestones, and acceptance criteria.
2. `devcrew-backend` defines contracts and builds authoritative domain behavior, state transitions, security boundaries, and operational foundations.
3. `devcrew-ui` establishes the design system and application shell, then connects complete user journeys to stable contracts.
4. `devcrew-review` evaluates each deliverable continuously and issues merge-readiness decisions.
5. `devcrew` integrates approved work, resolves cross-layer compatibility, and becomes the release candidate.

`Guildly-Reference` remains research input and has no completion milestone in Devcrew delivery.


## Parallel Development Strategy

Worktrees may progress independently when:

- contracts remain stable
- ownership boundaries are respected
- shared documentation remains authoritative
- review occurs before integration

The main worktree integrates only reviewed deliverables.

The review worktree never owns implementation.

The documentation worktree never owns runtime code.

## MVP Milestones

### Milestone 0: Baseline and Decisions

Scope:

- Ratify canonical documentation and worktree ownership.
- Inventory scaffold code, existing scripts, and framework constraints.
- Define lifecycle vocabularies for agents, tickets, execution, and reviews.
- Record the approved hackathon identity boundary, in-memory persistence, local agent execution, Server-Sent Events transport, and local deployment model, plus the decisions deferred until post-MVP.
- Define versioned backend contracts and an integration strategy.

Exit gate:

- Required decisions contain security, operational, migration, and rollback consequences.
- The initial contract is reviewable by UI, backend, integration, and review owners.
- Backlog items map to requirements and contain verifiable acceptance criteria.

### Milestone 1: Project and Application Foundation

Scope:

- Establish the accessible application shell, persistent navigation, project context, approved dark theme, and shared component foundations.
- Implement server-side identity, project isolation, configuration validation, error conventions, persistence boundaries, and observability foundations.
- Deliver project creation, selection, viewing, and settings behavior as the first integrated slice.

Exit gate:

- Project context remains consistent across UI and backend behavior.
- Unauthorized cross-project access is rejected by the server.
- Loading, empty, error, keyboard, focus, responsive, and theme behavior are verified.
- Contract and integration checks pass for the project slice.

### Milestone 2: Agents and Activity

Scope:

- Deliver persistent agent identity and configuration for role, instructions, model, skills, memory, secret references, and status.
- Implement the approved agent and work lifecycle with start, stop, queue, failure, retry, and completion behavior.
- Deliver activity as the authoritative view of agent status, queued work, lifecycle events, and intervention needs.

Exit gate:

- Lifecycle transitions reject invalid state and survive refresh and recoverable failure.
- Agent actions are attributable and visible through ordered activity.
- Secrets remain server-controlled and absent from client data, logs, and activity.
- Execution and activity behavior pass contract, authorization, recovery, and accessibility review.

### Milestone 3: Ideas, Tickets, and Assignment

Scope:

- Deliver idea intake and backlog management.
- Support promotion of an idea to a ticket with origin retained.
- Deliver ticket priority, assignment, filtering, lifecycle history, and list and board-oriented views.
- Connect ticket assignment to persistent agents and activity.

Exit gate:

- The idea-to-ticket-to-assignment journey works end to end.
- Concurrent, invalid, and retrying transitions preserve data integrity.
- Lists remain usable with empty, long, filtered, and paginated data.
- Review verifies requirements, responsiveness, accessibility, and regression coverage.

### Milestone 4: Knowledge and Review

Scope:

- Deliver project documents, organization, search, and product requirement distinction.
- Connect authorized knowledge to agent execution without implicit mutation.
- Deliver review submission, evidence, severity, disposition, and merge-readiness outcomes.
- Connect review events to the work item and activity history.

Exit gate:

- Knowledge remains project-scoped, attributable, searchable, and safe to consume.
- A reviewer can issue approved, changes required, or blocked by missing evidence.
- An approval cannot be produced from incomplete verification.
- The complete planning-through-review journey passes integration and review gates.

### Milestone 5: MVP Release Candidate

Scope:

- Integrate all reviewed slices in `devcrew`.
- Resolve contract, navigation, state, and terminology inconsistencies.
- Complete security, accessibility, performance, reliability, and operational hardening.
- Produce release configuration, deployment evidence, rollback procedure, and support ownership.

Exit gate:

- The critical workflow in `spec.md` passes automated and manual end-to-end verification.
- All required static checks, tests, builds, migrations, and environment checks pass in a production-representative environment.
- Measured performance budgets are met.
- No release-blocking review findings remain open.
- Canonical documentation matches shipped behavior and no worktree-local copies exist.

## Integration Milestones

### Contract Integration

Before feature integration, backend producer tests and UI consumer expectations must agree on request, response, error, authorization, and lifecycle semantics. Contract changes are reviewed before either side relies on them.

### Vertical Slice Integration

Each MVP milestone reaches `devcrew` as a coherent user journey. Integration checks navigation, persistence, failure recovery, accessibility, and state reconciliation rather than only verifying that code merges cleanly.

### Full Product Integration

After knowledge and review are connected, the product is exercised from project setup through work approval. Shared terminology, status meaning, and activity history are reconciled before release hardening.

## Testing Milestones

### Foundation Testing

- Static analysis, type safety, configuration validation, and production builds.
- Unit tests for lifecycle rules, authorization, validation, and error mapping.
- Component checks for semantic behavior, keyboard use, and state variants.

### Contract and Integration Testing

- Producer and consumer contract verification.
- Persistence and migration checks once the selected datastore exists.
- Integration coverage for project isolation, agent execution, activity, ticket transitions, knowledge access, and review outcomes.
- Failure, retry, cancellation, partial-result, and concurrency paths.

### Release Testing

- End-to-end coverage of the critical workflow in a production-representative environment.
- Manual keyboard and assistive-technology-oriented verification.
- Security review of authentication, authorization, secrets, inputs, data exposure, and dependencies.
- Measured performance and reliability checks under representative data and work volume.
- Deployment, health, observability, backup or recovery as applicable, and rollback rehearsal.

## Review Milestones

- Architecture review approves foundation decisions before implementation depends on them.
- Slice review evaluates every milestone against requirements, contracts, design rules, and negative paths.
- Integration review evaluates combined behavior in `devcrew` after each accepted slice.
- Release review evaluates the full candidate, all evidence, unresolved risk, operations, and documentation.
- Any material correction after approval reopens review for the affected scope.


## Risk Management

Every milestone should identify:

- technical risk
- integration risk
- security risk
- schedule risk

Risks are reduced through:

- small deliverables
- worktree isolation
- continuous review
- contract validation
- integration checkpoints

No milestone advances while unresolved release-blocking risks remain.

## Release Milestones

### Internal Candidate

Deploy the integrated product to a controlled environment with representative configuration and data. Complete smoke, migration, and observability checks.

### Release Candidate

Freeze feature scope, resolve blocking findings, verify the critical workflow, rehearse rollback, and confirm documentation and support ownership.

### MVP Release

Promote the exact reviewed artifact, run post-deployment health and smoke checks, and monitor errors and workflow completion. Roll back when release criteria are not sustained.

### Stabilization

Prioritize verified defects, measure workflow completion and operational reliability, and avoid roadmap expansion until release risks are understood.



## MVP Success Metrics

The execution plan is considered successful when:

- all MVP milestones reach their exit gates
- critical workflow passes end-to-end verification
- release contains no blocking review findings
- worktree and branch ownership boundaries remain intact
- documentation accurately reflects shipped behaviour

## Post-MVP Roadmap

Post-MVP work is evaluated from observed user need, security impact, and operational cost. Candidate themes are:

1. Agent hiring and guided role creation.
2. Controlled external service connections.
3. Advanced automation with explicit policy and intervention controls.
4. An embedded terminal with strong isolation and auditability.
5. Richer permission models.
6. Multi-workspace collaboration.

No candidate is committed scope until `spec.md`, `architecture.md`, and `tasks.md` are updated and reviewed.

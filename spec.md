# Devcrew Product Specification

## Document Authority

This specification defines the Devcrew platform across the `devcrew`, `devcrew-ui`, `devcrew-backend`, `devcrew-review`, and `devcrew-docs` worktrees in one shared Git repository. It is maintained only in the `devcrew-docs` documentation worktree. Worktree operating manuals may link to it but must not copy or redefine it.

The implementation worktrees are currently minimal Next.js application scaffolds. The capabilities below define the intended product and its required behavior; they do not imply that those capabilities are already implemented.

## Product Vision

Devcrew is a focused engineering workspace in which people direct persistent AI teammates through a traceable software-delivery workflow. Work begins as an idea or ticket, is executed by role-based agents, becomes visible through activity, and passes through explicit review before completion. The product treats agents as accountable team members with durable configuration and context rather than as disposable chat sessions.


## Design Principles

Devcrew follows several core principles that influence every product decision.

- Persistent context over disposable conversations.
- Explicit workflows over hidden automation.
- Human approval over autonomous deployment.
- Calm interfaces over visually noisy dashboards.
- Traceability over opaque AI behaviour.
- Shared documentation over duplicated knowledge.
- Worktree and branch ownership over blurred responsibilities.
- Review before release.


## Product Scope

The MVP focuses on one engineering workspace used by a single engineering organization.

The product includes:

- project management
- persistent AI teammates
- planning
- tickets
- documentation
- reviews
- execution tracking

The MVP intentionally excludes generalized collaboration software, source control replacement, deployment infrastructure, and enterprise administration.

## MVP Technical Constraints

The hackathon MVP is a local-first, deterministic vertical slice executed from a prepared local checkout. Its implementation choices are frozen as follows:

- Application: Next.js App Router, React, strict TypeScript, the Node.js runtime, and npm.
- UI: Tailwind CSS, shadcn/ui where useful, Lucide React, restrained CSS transitions, and Zustand only when shared client state is genuinely required.
- Server: Next.js Route Handlers under `app/api`, Zod validation, Server-Sent Events for one-way activity updates, structured JSON errors, and in-memory stores.
- AI: the official OpenAI JavaScript/TypeScript SDK, the OpenAI Responses API, structured outputs, and the fixed Manager, Full Stack Developer, DevOps Engineer, and Reviewer roles.
- Local execution: Codex CLI behind a controlled server-side adapter, server-only Node `child_process`, Git CLI operations that remain worktree-safe, command allowlists, timeouts, and redaction. Browser-side shell execution is prohibited.
- GitHub: connect a public repository URL first and use a prepared local repository for judged execution. GitHub OAuth, private repositories, GitHub App installation, pull-request creation, and webhooks are deferred.
- Persistence and access: use deterministic in-memory persistence behind replaceable store interfaces. Durable storage and production authentication are deferred; OpenAI access remains server-side and credentials must never reach the browser or logs.
- Presentation and validation: deliver the approved dark-mode-only interface and validate with ESLint, TypeScript, focused tests, a Next.js production build, and manual critical-flow verification.

The local environment is the authoritative judged environment. A Vercel presentation deployment is optional and must not claim local shell or Git execution. The MVP uses no microservices, Redis, Kafka, Kubernetes, complex infrastructure, autonomous merge, or production deployment. Any change to these constraints requires an approved update to the canonical documentation before implementation.

## Goals

- Provide one coherent workflow for planning, assigning, executing, reviewing, and tracking engineering work.
- Give each agent a stable identity, role, instructions, skills, memory, secrets, model configuration, and status.
- Make current work, queued work, ownership, and review state understandable from the workspace.
- Keep project knowledge, product requirements, and work records connected to execution.
- Provide a calm, accessible, desktop-oriented interface with predictable navigation and interaction.
- Preserve clear trust boundaries for credentials, agent actions, data access, and review approval.
- Support incremental delivery across independently owned branches and worktrees without duplicating product documentation.

## Non-Goals

The MVP does not include:

- Natural-language hiring or generation of new teammates.
- An embedded terminal.
- General-purpose external service connections.
- Advanced or autonomous workflow automation.
- Complex permission-policy construction.
- Multi-workspace collaboration.
- Feature-for-feature reproduction of Guildly.
- Replacement of source control, continuous integration, or deployment systems.

## Users

### Engineering Lead

Creates and configures a project, establishes agent responsibilities, prioritizes work, monitors execution, and decides when reviewed work is ready to advance.

### Product or Project Owner

Captures ideas, creates and refines tickets and product requirements, maintains project knowledge, and follows delivery status without needing raw agent logs.

### Engineer or Technical Operator

Uses agents and project context to execute work, inspects activity and outputs, responds to failures, and participates in review and release preparation.

### Reviewer

Evaluates proposed work against requirements and quality gates, records evidence-backed findings, and issues a clear merge-readiness outcome.

A person may perform more than one of these roles in the MVP.

## Core Features

### Projects

A project is the primary context boundary. Its agents, ideas, tickets, documents, product requirement documents, reviews, activity, and settings must be presented as belonging to that project.

### Persistent Agents

Agents represent durable engineering roles. An agent has an identity, operating instructions, model selection, skills, memory, secret references, and an operational status. Agent configuration persists independently of an individual work session.

### Activity

The activity view provides a current, chronological account of project execution. It shows agent state, current and queued work, significant lifecycle events, and failures or interventions that require attention.

### Ideas and Tickets

Ideas form an intake backlog. A user may retain an idea in the backlog or promote it into planned work. Tickets provide explicit priority, status, assignment, and lifecycle tracking in list and board-oriented views.

### Documents and Product Requirements

Project documents provide searchable internal knowledge organized into understandable groups. Product requirement documents remain distinguishable from general documentation while participating in the same project context.

### Reviews

Review is an explicit delivery stage with scope, findings, evidence, status, and a merge-readiness decision. Review outcomes must remain associated with the work evaluated.

### Settings, Skills, Memory, and Secrets

Settings organize project and agent configuration. Skills are reusable operating playbooks. Memory stores durable agent knowledge rather than a transcript of conversation. Secrets are referenced through agent configuration and must not be exposed as ordinary project content.

## Functional Requirements

### Project Context

- The system must allow a user to create, select, view, and update a project.
- Every project-owned record must retain an unambiguous project association.
- Navigation must preserve visible project and section context.
- Project isolation must be enforced by server-side access rules, not solely by the interface.

### Agent Management

- The system must allow users to create, inspect, configure, activate, stop, and deactivate persistent agents.
- Agent configuration must cover role, instructions, model, skills, memory, secret references, and status.
- The system must expose whether an agent is idle, queued, active, stopped, completed, or failed using a documented lifecycle.
- Agent actions and status changes must generate traceable activity records.
- Stopping an agent must produce a visible outcome and must not silently discard work state.

### Work Intake and Tracking

- The system must allow users to create, edit, prioritize, filter, and retain ideas.
- An idea may be promoted to a ticket without losing its origin.
- Tickets must support assignment, priority, status, lifecycle history, and both list and board-oriented presentation.
- Work assignment must reference a persistent agent and the relevant project context.
- Invalid lifecycle transitions must be rejected consistently.

### Knowledge

- Users must be able to create, update, organize, browse, and search project documents.
- Product requirement documents must be identifiable separately from general documents.
- Agents must be able to receive authorized project knowledge as execution context without changing canonical content implicitly.
- Changes to durable knowledge must be attributable and recoverable through history or equivalent audit evidence.

### Execution and Activity

- Authorized work must be queued and associated with its initiating user, ticket, and assigned agent.
- Activity must distinguish queued, started, progressed, stopped, completed, failed, and reviewed events.
- Users must be able to determine what is happening, who owns it, and whether intervention is required.
- Errors must be expressed as actionable product states rather than raw internal failures.
- Retrying or resuming work must retain its relationship to the original work item.

### Review

- Work submitted for review must identify its requirements, changed scope, and available verification evidence.
- Review must support findings with severity, disposition, and supporting evidence.
- The reviewer must issue one of three outcomes: approved, changes required, or blocked by missing evidence.
- Approval must not be inferred from the absence of findings or from an incomplete review.
- Review events and outcomes must appear in the associated work history.

### Configuration and Secrets

- Project and agent settings must be grouped by responsibility and use clear save, error, and unsaved-change states.
- Skills must be attachable to agents as reusable, inspectable instructions.
- Memory must remain distinct from activity history and transient conversation.
- Secret values must not appear in client-delivered data, URLs, activity text, logs, screenshots, or documentation.
- Secret access must follow least privilege and must be auditable without recording secret values.

## Non-Functional Requirements

### Security and Privacy

- Enforce project, agent, work, document, review, memory, and secret boundaries on the server. Production request authentication is a post-MVP requirement.
- Validate all untrusted input and fail closed for authorization and secret access.
- Keep sensitive configuration out of source control and client bundles.
- Record security-relevant actions without collecting credentials or unnecessary personal data.

### Reliability and Data Integrity

- Preserve valid work and review state across refreshes, retries, and recoverable service failures.
- Make commands that may be retried safe against unintended duplicate effects.
- Define ownership for partial failure, cancellation, and recovery at service boundaries.
- Prevent invalid or contradictory lifecycle states.

### Performance

- Keep primary navigation and local interaction responsive under representative project data.
- Paginate or progressively load potentially unbounded activity, tickets, documents, and reviews.
- Avoid duplicate network work and unbounded server-side processing.
- Establish measured performance budgets before release and enforce them in the release gate.

### Accessibility

- Target WCAG 2.2 Level AA for user-facing workflows.
- Support complete keyboard operation, visible focus, semantic structure, meaningful control names, sufficient contrast, zoom and reflow, and reduced motion.
- Communicate dynamic state, validation, and errors to assistive technologies.

### Observability

- Emit structured, correlation-friendly records for backend requests, work execution, lifecycle changes, and failures.
- Provide enough operational evidence to diagnose an incident without exposing secrets or private content.
- Make health and release state verifiable in each deployed environment.

### Maintainability and Compatibility

- Keep UI, backend, review, integration, and documentation ownership explicit.
- Define and test shared contracts before dependent integration.
- Use the installed framework documentation for version-sensitive implementation decisions.
- Do not introduce a framework, datastore, service, or deployment assumption without an approved architecture decision.

### Quality

- Require linting, type safety, focused automated tests, production builds, and applicable manual verification before release.
- Cover successful, empty, loading, error, retry, authorization, and boundary behavior where relevant.
- Treat missing verification as unverified, not as passing.

## Worktree Responsibilities

| Worktree | Branch | Platform responsibility |
| --- | --- | --- |
| `devcrew` | `main` | Main integration point, cross-layer reconciliation, final product assembly, release validation, and release readiness. |
| `devcrew-ui` | `feat/ui-shell` | Pages, components, layout, navigation, dark-theme presentation, responsive behavior, accessibility, and client interactions. It consumes backend contracts and does not own server business rules. |
| `devcrew-backend` | `feat/orchestrator` | Server routes, services, orchestration, data models, persistence boundaries, validation, authorization, integrations, and operational behavior. It does not own presentation. |
| `devcrew-review` | `review/integration` | Independent code, architecture, UX, accessibility, security, performance, and release review. It produces findings and merge-readiness decisions rather than product features. |
| `devcrew-docs` | `docs/context` | Canonical documentation worktree and sole source of truth for platform specification, architecture, design language, execution plan, and backlog. |

`Guildly-Reference` is a shared read-only research folder. It is not a Git worktree, a product implementation source, or an authoritative feature specification.

## Success Criteria

The MVP is successful when:

- A user can establish a project and persistent agents, capture an idea, convert it into a ticket, assign and follow the work, and reach an explicit review outcome through one coherent workflow.
- The activity experience accurately explains active, queued, failed, stopped, completed, and review work without requiring raw system inspection.
- Documents, product requirements, skills, memory, settings, and secret references support the workflow with correct project boundaries.
- The critical workflow passes documented functional, contract, accessibility, security, and release verification.
- The interface follows the official design language consistently across MVP surfaces.
- The five Devcrew worktrees operate within their documented branch boundaries and consume this canonical documentation without duplicate copies.
- No release-blocking findings remain open at release approval.

## Future Roadmap Summary

After the MVP is stable and measured, roadmap evaluation may cover agent hiring, embedded terminal access, external service connections, advanced automation, richer permission models, and multi-workspace collaboration. Each addition requires validated user need, explicit security and architecture review, and an update to this canonical specification before implementation.


## Glossary

Agent
Persistent AI teammate.

Idea
Unstructured work before planning.

Ticket
Tracked engineering task.

Review
Formal quality gate.

Skill
Reusable operating capability.

Memory
Persistent agent knowledge.

Activity
Chronological execution history.

Project
Primary ownership boundary.

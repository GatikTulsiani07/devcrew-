# Devcrew Backend Codex Operating Manual

## Authority and Applicability

This file is the permanent operating manual for Codex sessions working in the Devcrew backend worktree.

It governs investigation, design, implementation, validation, and handoff of backend changes.

It is not a product README, onboarding guide, or substitute for task-specific requirements.

Every future Codex instance must read and follow it before modifying backend-owned code.

Instructions apply to both direct edits and changes produced through scripts, generators, migrations, or delegated work.

The instruction precedence for this worktree is:

1. System and platform safety requirements.
2. The current user's explicit request.
3. The nearest applicable `AGENTS.md` file.
4. Approved architecture, audit, specification, and task documents.
5. This operating manual.
6. Existing repository conventions, when they do not conflict with higher authority.

When instructions conflict, stop before the conflicting edit, identify the exact conflict, and request clarification.

Do not silently choose the more convenient interpretation.

## Purpose of This Worktree

This worktree exists to build and maintain the engineering foundation of Devcrew.

Its output powers the product interface through stable server-side capabilities and contracts.

The UI consumes backend APIs and server-side behavior; backend code must not depend on presentation details.

The backend owns business behavior, data integrity, trust boundaries, and integration reliability.

Backend-owned concerns include:

- API contracts and backend route handlers.
- Application and domain services.
- Authentication and authorization enforcement.
- Data models, persistence access, and migrations.
- Request and configuration validation.
- State orchestration and workflow coordination.
- Caching, queues, jobs, and event processing.
- External service integrations and adapters.
- Server-side observability and operational controls.
- Backend-focused tests and fixtures.

This worktree must not become a second frontend worktree.

It must never be used to implement:

- Pages, layouts, or visual components.
- Styling, themes, responsive behavior, or animation.
- Branding, icons, imagery, or other presentation assets.
- Marketing copy or product content.
- Client-only interaction behavior.
- UI state that does not represent a server-side business process.
- Unrequested infrastructure or platform redesigns.

## Current Repository Baseline

At the time this manual was established, the repository is a minimal Next.js App Router scaffold.

The installed framework version is Next.js `16.2.10` with React `19.2.4` and TypeScript strict mode.

The package manager represented by the lockfile is npm.

The available scripts are `npm run dev`, `npm run build`, `npm run start`, and `npm run lint`.

The `@/*` TypeScript alias resolves from the repository root.

No backend routes, `services/`, `lib/`, database layer, authentication layer, validation library, queue, cache, or test framework currently exists.

The existing `app/` and `public/` contents are scaffold presentation code and are read-only for backend work.

The existing files under `docs/` and `prompts/` are currently empty, but their future contents are authoritative once populated.

`CLAUDE.md`, root `../Guildly-Reference/audit.md`, and `../Guildly-Reference/audit.md` were absent when this manual was written.

This baseline is historical context, not a permanent claim.

Future sessions must inspect the live repository and update their understanding from current evidence.

Never assume that the baseline still describes the codebase.

## Mandatory Reading Order

Before making any change, Codex must read in this exact order:

1. Read the root `AGENTS.md` completely.
2. Discover and read any more specific `AGENTS.md` that governs the target path.
3. Read `CLAUDE.md` completely when it exists.
4. Read `../Guildly-Reference/audit.md` completely when it exists.
5. Read root `../Guildly-Reference/audit.md` completely when it exists.
6. Read every relevant document under `docs/`, including architecture, specification, plan, and task material.
7. Read every file under `prompts/` as required by the root `AGENTS.md`.
8. Read relevant existing backend code, configuration, tests, and package scripts.
9. Read the current task again after repository context is understood.

This order is mandatory even for apparently small changes.

Do not rely on a summary, memory from an earlier session, or assumptions from another Next.js project.

If a mandated file is absent, explicitly verify its absence.

Do not fabricate its contents or infer audit approval.

If the current task can be completed without the missing document, record the absence as a constraint and proceed conservatively.

If the task requires requirements, decisions, or approvals that only the missing document could provide, stop and request direction.

An audit finding is a requirement unless a higher-authority instruction explicitly supersedes it.

Do not weaken, bypass, or reinterpret an audit control for implementation convenience.

## Repository Inspection Protocol

Before editing, establish the actual repository state.

Inspection must include:

- Current working directory and worktree identity.
- Current branch and concise Git status.
- Tracked and untracked files relevant to the task.
- Applicable instruction files.
- Route structure and all existing backend entry points.
- Service, library, model, integration, and orchestration directories.
- Configuration files and environment-variable conventions.
- Package manifest, lockfile, scripts, and installed versions.
- Existing tests, fixtures, mocks, and test configuration.
- Existing naming, import, error, response, and logging patterns.
- Recent relevant history when intent is not clear from current code.

Use `rg --files` and `rg` for repository discovery and text search.

Inspect hidden project instruction and automation files when relevant.

Inspect the diff before editing so pre-existing user changes are not mistaken for Codex changes.

Treat a dirty worktree as user-owned state.

Preserve unrelated modifications and work around them.

Never assume architecture from folder names alone.

Trace behavior from its entry point through validation, authorization, service logic, persistence, integration calls, and response mapping.

Search for all call sites before changing a shared type, function, schema, or contract.

Search for an existing abstraction before creating a new one.

Verify dependency APIs against installed versions rather than recollection.

For Next.js work, read the relevant guide in `node_modules/next/dist/docs/` before writing code.

This repository uses a Next.js version with breaking changes and may not match model training knowledge.

Heed local documentation deprecations and version-specific runtime constraints.

## Architectural Model

Use a layered backend architecture unless current approved repository architecture defines a more specific model.

The expected dependency direction is:

`route or job adapter -> application service -> domain/data abstractions -> infrastructure adapter`

Transport concerns belong at the boundary.

Business rules belong in services or domain modules.

Persistence details belong in repositories or data-access modules.

External SDK details belong in integration adapters.

Shared utilities must remain small, cohesive, and free of domain policy.

Dependencies must point inward toward stable business behavior.

Domain and application services must not depend on HTTP request or response objects.

Core business behavior must be callable from a route, job, test, or future interface without duplication.

Route handlers must remain thin.

A route handler may:

- Parse transport inputs.
- Invoke shared validation.
- Establish request context.
- Authenticate and authorize.
- Call an application service.
- Map a known result or error to an HTTP response.
- Emit boundary-level telemetry.

A route handler must not contain reusable business workflows, raw persistence logic, or vendor-specific orchestration.

Server Components must call the data-access or service layer directly when appropriate.

Do not call an internal Route Handler from a Server Component merely to reach the same server-side logic.

That creates an unnecessary HTTP round trip and can create build-time or deployment failures.

Client Components may call Route Handlers when a client-to-server boundary is required.

## Ownership Boundaries

Backend-owned paths and concepts are:

- `services/`.
- `lib/` server-side modules.
- Data-access and model modules.
- Integration adapters.
- Backend route handlers.
- Server-side orchestration and operational code.
- Backend tests and test support.

Read-only paths and concepts are:

- Presentation pages and layouts under `app/`.
- UI components under `components/`.
- `public/` assets.
- Visual styling and design-system implementation.
- `prompts/`.
- Documentation, except when the current task explicitly authorizes a documentation change.

Because Next.js App Router places Route Handlers under `app/`, a file whose sole purpose is a backend `route.ts` or `route.js` is the narrow backend-owned exception inside `app/`.

That exception does not authorize edits to sibling pages, layouts, loading states, error UI, metadata, CSS, components, or assets.

If a requested backend capability requires a UI or read-only change, implement the backend portion only and report the remaining cross-worktree dependency.

Do not edit a read-only file just because doing so would make a demonstration easier.

Do not expand backend ownership through opportunistic refactors.

## Backend Engineering Principles

Design backend behavior before shaping it around a particular UI.

Prefer explicit, typed contracts over implicit object shapes.

Keep business rules centralized and reusable.

Eliminate duplicated logic through appropriately scoped abstractions.

Do not introduce abstractions before there is a concrete responsibility to isolate.

Favor composition over inheritance and global mutable state.

Keep functions small enough to have one clear reason to change.

Make side effects explicit at module boundaries.

Keep pure transformations pure whenever practical.

Make state transitions deterministic, validated, and observable.

Prefer idempotent operations for retries, webhooks, jobs, and externally triggered mutations.

Use dependency injection or explicit parameters where it improves testability and separation.

Do not hide network, database, filesystem, or clock access inside innocent-looking helpers.

Optimize for correctness, clarity, maintainability, and operability before cleverness.

Keep public interfaces smaller and more stable than internal implementation details.

Treat backward compatibility as a design requirement for consumed APIs.

Do not add a dependency when the platform or a small local implementation already solves the problem safely.

When a dependency is justified, verify maintenance, runtime compatibility, security posture, bundle impact, and lockfile effects.

## Folder and Module Organization

Follow the repository's established structure once backend architecture exists.

Until then, use these responsibilities as guidance rather than creating every directory preemptively:

- `app/api/**/route.ts`: thin HTTP transport adapters.
- `services/`: application use cases and business workflow orchestration.
- `lib/auth/`: server-only authentication and authorization primitives.
- `lib/data/`: server-only data-access abstractions and repositories.
- `lib/integrations/`: external system adapters.
- `lib/validation/`: shared schemas and input normalization.
- `lib/errors/`: stable backend error types and mappings.
- `lib/observability/`: structured logging, metrics, and tracing helpers.
- `lib/config/`: validated server configuration.

Do not create empty architecture scaffolding.

Create a directory only when the task introduces a responsibility that belongs there.

Group code by cohesive responsibility, not by arbitrary file size.

Avoid catch-all modules named `utils`, `helpers`, `common`, or `misc` when a precise domain name exists.

Avoid barrel files when they obscure server/client boundaries, introduce cycles, or increase import side effects.

Keep server-only code out of client import graphs.

Use `server-only` protection for sensitive data-access and secret-bearing modules where appropriate.

## Naming and File Standards

Use names that describe domain intent rather than implementation mechanics.

Use consistent casing with surrounding code.

Prefer `camelCase` for values and functions, `PascalCase` for types and classes, and `UPPER_SNAKE_CASE` for true constants.

Name booleans as predicates such as `isActive`, `hasAccess`, or `canRetry`.

Name asynchronous operations by effect, not by the fact that they are asynchronous.

Use singular names for one entity and plural names for collections.

Use conventional Next.js filenames only for their documented framework purpose.

Give tests a name that identifies the unit or behavior under test.

Keep one primary responsibility per module.

Co-locate private types and helpers when they are used by only one module.

Promote types or helpers only when multiple cohesive consumers require them.

Do not encode changing business values as unexplained literals.

Use comments to explain constraints, invariants, or non-obvious decisions, not to narrate obvious code.

Delete stale comments when behavior changes.

## TypeScript Standards

Preserve strict TypeScript behavior.

Do not weaken `strict`, bypass checks globally, or expand `skipLibCheck`-style exceptions.

Do not introduce `any` unless an untyped boundary makes it unavoidable and the value is immediately narrowed.

Prefer `unknown` for untrusted inputs.

Narrow external data through runtime validation before using it as a domain type.

Do not use unsafe type assertions to claim validation that did not occur.

Model finite states with discriminated unions or enums when that prevents invalid combinations.

Represent absence deliberately; distinguish missing, null, empty, and defaulted values.

Use readonly data where mutation is not part of the contract.

Prefer inferred local types and explicit exported contract types.

Do not duplicate schema-derived types manually when safe inference is available.

Keep transport DTOs distinct from persistence records and domain models when their responsibilities differ.

Handle every union case; use exhaustive checks for critical state machines.

## Imports and Dependency Rules

Use the configured `@/*` alias for stable cross-directory imports when consistent with surrounding code.

Use relative imports for tightly colocated modules when they remain clearer.

Do not create dependency cycles.

Do not import a route handler into a service.

Do not import infrastructure adapters into domain-only modules unless mediated by an explicit interface.

Do not import client components or presentation code into backend modules.

Do not expose server-only modules through an entry point that client code can import.

Keep module initialization free of unexpected I/O.

Do not instantiate heavyweight SDK clients per request when a safe module-scoped singleton is appropriate.

Account for development hot reload and serverless execution when managing shared clients.

## API Design Rules

Treat every endpoint as a public contract even when only the current UI consumes it.

Use Next.js App Router Route Handlers for HTTP endpoints unless approved architecture specifies another server boundary.

Confirm Route Handler conventions in the installed Next.js documentation before implementation.

Choose resource-oriented URLs and conventional HTTP methods.

Use nouns in paths and verbs only for actions that cannot be expressed as resource state changes.

Keep path naming, casing, nesting, and versioning consistent across the API.

Do not add versioning without a compatibility requirement or approved API strategy.

Validate path parameters, query parameters, headers, cookies, and bodies at the boundary.

Reject malformed content types and unsupported methods predictably.

Set request-size limits appropriate to the endpoint.

Do not trust client-provided identifiers, roles, ownership, prices, totals, or derived state.

Return only fields required by the contract.

Never serialize database rows, ORM entities, SDK responses, or thrown errors directly.

Use a consistent success and error response shape already established by the repository.

If no shape exists, define the smallest stable contract required by the task and document it in types and tests.

Do not introduce a universal response envelope without a demonstrated need.

Use accurate status codes:

- `200` for successful retrieval or mutation with a response body.
- `201` for successful resource creation.
- `202` for accepted asynchronous work that is not yet complete.
- `204` for successful operations with no response body.
- `400` for malformed requests that do not fit a more specific class.
- `401` when authentication is absent or invalid.
- `403` when an authenticated principal lacks permission.
- `404` when a permitted lookup cannot find the resource.
- `409` for state conflicts, duplicate constraints, or failed concurrency preconditions.
- `422` for semantically invalid input when that distinction is part of the API convention.
- `429` for rate-limit enforcement.
- `500` for unexpected internal failures without exposing internals.
- `502`, `503`, or `504` only when the upstream or availability condition is accurately known.

Do not return `200` with an error payload.

Make error codes stable and machine-readable when consumers must branch on them.

Keep human-readable error messages safe and non-sensitive.

Attach a request or correlation identifier to operational errors when observability supports it.

For collections, define deterministic ordering.

Use bounded pagination for potentially large result sets.

Prefer cursor pagination for mutable or high-volume collections; use offset pagination only when its consistency and cost are acceptable.

Enforce a maximum page size server-side.

Validate cursors as opaque values and never expose sensitive internal data through them.

Support filtering and sorting only through explicit allowlists.

For mutations vulnerable to retries, use idempotency keys or naturally idempotent semantics when appropriate.

For concurrent updates, use transactions, versions, or conditional writes rather than last-writer-wins by accident.

## Authentication and Authorization

Authentication identifies the principal.

Authorization decides whether that principal may perform the specific operation on the specific resource.

Perform both checks on the server at every protected entry point.

Do not rely on UI hiding, layouts, middleware, Proxy, or a prior request as the sole authorization control.

Centralize session verification and principal construction.

Keep authorization policy reusable and testable.

Prefer deny-by-default behavior.

Verify resource ownership and tenant boundaries in the same trusted operation that accesses or mutates data.

Do not accept roles, tenant identifiers, or ownership claims from an untrusted body without reconciling them to the authenticated principal.

Use least privilege for application credentials and integration scopes.

Expire, rotate, and revoke credentials according to the selected authentication system.

Protect state-changing browser requests against CSRF when cookie-based authentication and request semantics require it.

Set secure cookie attributes appropriate to environment and usage.

Rate-limit authentication, recovery, verification, and other abuse-sensitive operations.

Avoid account enumeration through response differences unless product requirements explicitly accept the risk.

## Validation and Data Normalization

Every external boundary is untrusted.

Validate runtime values even when TypeScript types exist.

Use a shared schema system once one is adopted; do not mix validation libraries without a reason.

Validate configuration at process startup or first controlled access.

Validate webhook signatures against the exact raw payload required by the provider.

Normalize only intentional variations such as case, whitespace, or canonical formats.

Do not silently coerce ambiguous or lossy input.

Use explicit limits for strings, arrays, nesting, files, dates, and numeric ranges.

Use allowlists for enum-like values and externally selected fields.

Validate dates and time zones semantically, not only syntactically.

Return field-level validation details only when they are safe and useful to the caller.

Do not leak internal schema, table, class, or stack information in validation errors.

## Error Handling

Use typed or classified errors for expected failure modes.

Separate expected operational errors from programmer defects and infrastructure failures.

Map errors to transport responses at the route boundary.

Do not couple services to HTTP status codes unless the service is explicitly transport-specific.

Catch an error only when the code can add context, translate it, compensate for it, or recover.

Do not swallow exceptions.

Preserve causal information for server-side diagnostics.

Do not expose stack traces, raw database errors, provider bodies, filesystem paths, SQL, or secret-bearing context to clients.

Handle partial failure explicitly in multi-step workflows.

Use compensation, retry, or durable state only when the workflow semantics support it.

Set timeouts on outbound operations.

Retry only transient failures, with bounded attempts, backoff, and jitter.

Do not retry non-idempotent work unless duplication is prevented.

## Logging and Observability

Use structured logs once a logging facility exists.

Log events with stable names and useful context rather than prose-only messages.

Include correlation identifiers, operation names, duration, outcome, and safe entity identifiers where useful.

Use severity levels consistently.

Do not use routine `console.log` statements as production observability.

Never log secrets, tokens, session contents, passwords, authorization headers, private keys, full cookies, or raw sensitive payloads.

Redact personal and regulated data by default.

Avoid duplicate logging of the same error at every layer.

Record the error once at the boundary with accumulated context unless another layer owns recovery.

Use metrics for rates, latency, saturation, retries, queue depth, and failure categories where operationally valuable.

Use tracing across database and external-service boundaries when supported.

Keep health and readiness checks cheap, deterministic, and free of sensitive details.

Use the version-appropriate Next.js instrumentation convention when server-startup registration is required.

## Database and Persistence Rules

Do not choose or introduce a database, ORM, or migration tool without task requirements or approved architecture.

Once selected, use one canonical schema and migration workflow.

Every schema change must be represented by a reviewable migration.

Do not edit an already-applied migration except under an explicitly approved recovery process.

Make migrations forward-safe and compatible with rolling deployment when the deployment model requires it.

Separate destructive cleanup from additive rollout when old and new application versions may overlap.

Backfill large datasets in bounded batches rather than one unbounded transaction.

Provide a rollback or roll-forward strategy for risky migrations.

Enforce durable invariants in the database when possible through constraints.

Use foreign keys and relationship actions deliberately.

Name constraints and indexes consistently when the selected database supports it.

Add indexes for demonstrated access patterns, joins, uniqueness, and ordering needs.

Evaluate index write cost and storage cost; do not add speculative indexes.

Inspect query plans for performance-sensitive queries.

Select only required columns.

Avoid unbounded reads and writes.

Avoid N+1 access patterns through joins, batching, or preloading appropriate to the data layer.

Use transactions when multiple writes must succeed or fail as one invariant-preserving unit.

Keep transactions short and avoid network calls while a transaction is open.

Choose isolation and locking based on the actual concurrency hazard.

Handle unique and concurrency conflicts as expected outcomes when applicable.

Use parameterized queries or safe query builders; never interpolate untrusted input into query text.

Use a repository or data-access boundary when it protects business logic from persistence details.

Do not return persistence records directly across public API boundaries.

## Caching Rules

Caching is a correctness decision, not only a performance optimization.

Define the cache owner, key, scope, lifetime, invalidation trigger, and stale-data tolerance before adding a cache.

Never cache user-specific or tenant-specific data under a shared key.

Never cache authorization results beyond the period in which their inputs remain valid.

Do not cache secrets or unnecessarily sensitive data.

Ensure cache keys include every input that changes the result.

Prefer explicit invalidation after mutation when freshness is required.

Design for cache misses and cache outages.

Prevent stampedes for expensive or high-volume keys when needed.

Verify installed Next.js caching semantics before using framework cache directives or APIs.

Do not assume `fetch`, Route Handlers, Server Components, or dynamic request APIs have the caching behavior of an older Next.js release.

## Queues, Jobs, Events, and Webhooks

Treat at-least-once delivery as the default unless the selected system proves otherwise.

Make consumers idempotent.

Persist deduplication or operation state when in-memory tracking is insufficient.

Define retry limits, backoff, timeout, and dead-letter behavior.

Do not acknowledge work before durable completion unless loss is explicitly acceptable.

Make job payloads versionable and minimal.

Avoid embedding secrets or large mutable objects in messages.

Validate event payloads at consumption time.

Preserve ordering only where the business invariant requires it.

Verify webhook authenticity before parsing trusted fields or causing side effects.

Return provider-appropriate responses quickly and move expensive work to a durable queue when available.

Record webhook event identifiers to prevent duplicate processing.

## External Integration Rules

Wrap vendor SDKs and HTTP clients behind a narrow integration adapter.

Keep vendor response shapes out of domain and API contracts.

Set explicit connection and request timeouts.

Classify provider errors into stable internal outcomes.

Respect provider rate limits and retry guidance.

Use circuit breaking or load shedding for critical high-volume dependencies when justified.

Validate external responses before trusting them.

Use sandbox or test environments for validation when available.

Do not make live external mutations merely to prove local code works unless the user explicitly authorizes them.

Document required environment variables through the repository's approved mechanism without recording secret values.

## Security Requirements

Apply least privilege and deny by default.

Keep secrets in server-side environment variables or an approved secret manager.

Never commit `.env` files, credentials, private keys, tokens, or production identifiers.

Only variables intentionally safe for browser exposure may use the `NEXT_PUBLIC_` prefix.

Assume every `NEXT_PUBLIC_` value is permanently embedded in client-visible output.

Do not expose server environment objects wholesale.

Validate and allowlist redirect destinations, callback URLs, file paths, sort fields, and outbound hosts.

Prevent injection through parameterization and context-appropriate encoding.

Prevent server-side request forgery when a user can influence outbound URLs.

Guard against path traversal in file operations.

Use cryptographically secure randomness for security-sensitive tokens.

Use established password-hashing and cryptographic libraries; do not design custom cryptography.

Compare signatures and security tokens with timing-safe primitives where appropriate.

Enforce request and upload size limits.

Validate file type by content when security depends on it, not only by extension or client MIME type.

Apply rate limits and abuse controls at expensive and sensitive boundaries.

Return minimal data and prevent mass-assignment of protected fields.

Keep dependencies patched through deliberate, reviewed upgrades.

Review new packages for install scripts, transitive risk, licensing, and runtime support.

Treat generated code, webhook payloads, AI output, and third-party data as untrusted input.

## Performance and Reliability Requirements

Prevent N+1 queries and unbounded collection operations.

Avoid serial request waterfalls when independent operations can execute concurrently.

Do not parallelize work that must be ordered or that would overload a constrained dependency.

Use bounded concurrency for batch work.

Avoid blocking filesystem, CPU, or synchronous cryptographic operations on request paths.

Move CPU-heavy or long-running work to an appropriate background mechanism when architecture supports it.

Limit payload sizes and avoid returning unused fields.

Stream only when it improves behavior and failure semantics remain clear.

Avoid duplicate outbound calls within one operation.

Reuse connections and clients safely.

Close or release resources on success, error, cancellation, and timeout.

Propagate cancellation signals to supported downstream operations.

Avoid retaining request data in module-level state.

Do not create timers, listeners, or caches that grow without bounds.

Measure before applying complex optimization.

Preserve correctness under retries, concurrency, partial failure, and process restarts.

## Testing Requirements

Every behavior change requires validation proportional to its risk.

Add or update tests when changing:

- Business rules or state transitions.
- Request validation or response contracts.
- Authentication or authorization behavior.
- Persistence queries, constraints, or migrations.
- Cache keys or invalidation.
- Retry, timeout, or idempotency behavior.
- External integration mapping.
- A previously failing regression case.

Prefer the smallest test layer that proves the behavior.

Use unit tests for pure business rules and transformations.

Use integration tests for route-to-service, persistence, authentication, and adapter boundaries.

Use contract tests for externally consumed APIs and provider assumptions.

Use end-to-end tests only when the complete boundary interaction is necessary.

Test successful behavior, expected failures, boundary values, and authorization denial.

Test tenant and ownership isolation where applicable.

Test concurrency and retry behavior for critical state transitions.

Keep tests deterministic.

Control clocks, random values, identifiers, and external I/O.

Do not call production services from automated tests.

Do not make assertions depend on test execution order.

Do not weaken or delete a valid test merely to make a change pass.

If no test framework exists, do not introduce one casually for an unrelated trivial task.

For substantive backend behavior in the current scaffold, select a test approach consistent with approved architecture and add only the minimal justified tooling.

## Validation Protocol

Before handoff, inspect the final diff and run the strongest relevant checks available.

At minimum, consider:

1. Focused tests for changed behavior.
2. Broader regression tests for affected modules.
3. `npm run lint`.
4. Type checking through the project's configured command or `npx tsc --noEmit` when no script exists.
5. `npm run build` for framework, route, configuration, or production-bundling changes.
6. Migration validation and query checks for persistence changes.
7. A security and data-exposure review for changed boundaries.
8. `git diff --check` for whitespace and conflict artifacts.

Use repository scripts rather than inventing alternative commands.

Do not claim a check passed unless it was actually run and exited successfully.

If a check cannot run, report the exact command, failure, and likely impact.

Distinguish failures caused by the change from pre-existing repository failures.

Do not alter unrelated code to silence an unrelated validation failure.

For documentation-only changes, validate content, scope, formatting, and the final diff; application build execution is unnecessary unless the document changes executable configuration.

## Git and Worktree Discipline

Inspect `git status --short` before and after work.

Modify only files required by the current task.

Never discard, overwrite, stage, or reformat unrelated user changes.

Never use destructive Git commands such as `git reset --hard` or forced checkout without explicit authorization.

Never rewrite published history.

Do not force-push.

Do not amend or create commits unless the user requests it.

Do not stage files unless the user requests staging or a commit workflow requires it.

Keep commits focused when commits are requested.

Do not mix formatting, dependency upgrades, generated changes, and behavior changes without necessity.

Do not delete unrelated files.

Do not commit build output, coverage, local caches, logs, environment files, or generated artifacts already excluded by `.gitignore`.

Commit lockfile changes when and only when an intentional dependency change requires them.

Review lockfile diffs for unexpected package changes.

Use non-interactive Git commands in automated work.

Do not bypass hooks or checks without explicit approval and a documented reason.

## Change Management

Make the smallest coherent change that completely satisfies the task.

Do not combine requested work with speculative cleanup.

Preserve public contracts unless the task explicitly authorizes a breaking change.

When a breaking change is authorized, identify all consumers and provide a migration strategy.

Use additive changes and compatibility windows where deployment ordering requires them.

Feature flags must have an owner, default, rollout behavior, observability, and removal condition.

Do not leave dead code paths or permanent temporary flags.

Do not leave placeholders, commented-out implementations, or unactionable TODOs.

Update documentation only when authorized and when behavior or operational requirements require it.

Do not use documentation changes to compensate for unclear code or contracts.

## Communication and Handoff

During substantial work, communicate concise progress and material discoveries.

Raise instruction conflicts, missing authority, unexpected scope, destructive operations, and external side effects before acting.

The final handoff must state:

- What changed.
- Why the change was necessary.
- Important architectural decisions.
- Security, compatibility, migration, or operational risks.
- Validation commands run and their outcomes.
- Any checks not run and why.
- Any required follow-up work outside backend ownership.

Lead with the completed outcome.

Do not overstate confidence or conceal limitations.

Do not report unrelated repository issues as work completed.

When no follow-up is required, say so only if that conclusion is supported by validation.

## Prohibited Practices

Codex must never:

- Skip the mandatory reading order.
- Assume generic Next.js behavior without checking installed documentation.
- Build UI features in this worktree.
- Modify visual layout, styling, branding, or public assets.
- Put reusable business logic in Route Handlers.
- Put secrets or sensitive server data into client-reachable modules.
- Trust client-side validation or authorization.
- Duplicate an existing service, schema, policy, or adapter.
- Introduce a second architectural pattern without an explicit migration plan.
- Add speculative abstractions, dependencies, infrastructure, or directories.
- Swallow errors or return raw internal failures to clients.
- Log secrets or sensitive payloads.
- Perform unbounded reads, writes, retries, concurrency, or memory growth.
- Make production mutations as an implementation test without authorization.
- Weaken types, tests, security controls, or lint rules to obtain a passing result.
- Modify unrelated files.
- Claim validation that was not performed.
- Treat generated output as reviewed source code.
- Leave the repository in a knowingly broken state without clearly reporting the blocker.

## Definition of Done

A backend task is complete only when all applicable conditions are true:

- The mandatory instruction and audit material was read in order.
- The current repository architecture and affected call paths were inspected.
- The change stays within backend ownership.
- The implementation satisfies the current task and approved specifications.
- Existing architecture and dependency direction are respected.
- Business logic is centralized and not duplicated.
- Route and integration adapters remain thin.
- Inputs and configuration are validated at trusted boundaries.
- Authentication and authorization are enforced server-side where required.
- Errors are classified, safely exposed, and observably recorded.
- Types accurately model the behavior without unsafe shortcuts.
- Data access preserves integrity, isolation, and performance.
- External operations have appropriate timeout, retry, and idempotency behavior.
- Security and privacy risks were reviewed.
- Performance hazards such as N+1 queries, waterfalls, and unbounded work were addressed.
- Tests cover new behavior and relevant regressions.
- Relevant lint, type, test, build, and migration checks pass.
- The final diff contains no unrelated edits or accidental generated files.
- No user-owned work was overwritten.
- Required contract, migration, or operational documentation was updated when authorized.
- The handoff accurately reports changes, reasons, risks, validation, and remaining work.

If any applicable condition is not met, the task is not done.

Report the precise remaining blocker instead of declaring completion.

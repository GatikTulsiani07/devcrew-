# Devcrew Backend Codex Operating Manual

## 1. Purpose and Authority

This is the permanent operating manual for Codex in the Devcrew backend
worktree. It governs investigation, planning, implementation, validation, and
handoff for backend and orchestration work.

Instruction precedence is:

1. System and platform safety requirements.
2. The user's current explicit request.
3. The nearest applicable `AGENTS.md`.
4. The canonical shared audit and Devcrew documentation.
5. This manual.
6. Existing repository conventions that do not conflict with higher authority.

The canonical documents define product scope, architecture, design language,
delivery sequence, and backlog. This manual applies them to this worktree; it
does not replace or redefine them. When requirements conflict or a material
decision lacks authority, stop before the affected edit and report the exact
conflict.

## 2. Worktree Identity and Ownership Boundary

The required identity is:

- Directory: `/Users/suniltulsiani/Desktop/devcrew-backend`.
- Branch: `feat/orchestrator`.
- Role: backend and orchestration owner.

Devcrew uses one Git repository with multiple worktrees. Repeated files across
worktrees are normal and must not be treated as duplicates to remove.

This worktree is a standalone Hono HTTP service. It owns backend behavior only:

- HTTP transport contracts and Hono routes.
- Environment and request validation.
- Application services and domain behavior.
- Lifecycle and authorization enforcement when approved and implemented.
- Drizzle schema and migration ownership when product schema work is approved.
- Supabase PostgreSQL persistence through Drizzle ORM and Postgres.js.
- Server-side configuration, secrets, redaction, and stable API errors.
- Controlled AI, Codex CLI, Git, and other external adapters when approved.
- Backend-focused automated and manual verification.

It does not own presentation, pages, layout, styling, branding, navigation, or
client-only interaction. This repository must not contain a Next.js or React
application. The browser UI consumes versioned HTTP JSON contracts and never
imports backend modules or accesses Supabase directly.

## 3. Verified Implementation Boundary

The verified Sprint 1 implementation consists of:

- A Hono application that can be imported without binding a network port.
- Separate server startup with configurable `PORT`, defaulting to `3001`.
- Zod environment validation.
- `GET /health`.
- `GET /health/database`.
- A lightweight database connectivity query behind an injectable interface.
- Centralized, stable, sanitized JSON error responses.
- A module-scoped Postgres.js client used through Drizzle ORM.
- Automated health, failure-sanitization, and environment tests.

Runtime database access uses `DATABASE_URL` through the Supabase transaction
pooler and must configure Postgres.js with `prepare: false`. Drizzle inspection
and migrations use `DIRECT_URL` through the session pooler.

No product schema, authentication, project routes, agent routes, ticket routes,
activity transport, review workflow, execution workflow, or product persistence
exists yet. Approved future architecture is not evidence of implementation.

## 4. Mandatory Reading Order

Before planning or modifying files, read completely in this exact order:

1. `AGENTS.md`.
2. `CODEX.md`.
3. `/Users/suniltulsiani/Desktop/Guildly-Reference/audit.md`.
4. `/Users/suniltulsiani/Desktop/devcrew-docs/spec.md`.
5. `/Users/suniltulsiani/Desktop/devcrew-docs/architecture.md`.
6. `/Users/suniltulsiani/Desktop/devcrew-docs/design-system.md`.
7. `/Users/suniltulsiani/Desktop/devcrew-docs/plan.md`.
8. `/Users/suniltulsiani/Desktop/devcrew-docs/tasks.md`.
9. Relevant source, tests, package scripts, compiler and lint configuration,
   Drizzle configuration, environment example, and installed framework
   guidance.
10. The current task again.

Do not substitute memory, summaries, or worktree-local copies. The audit is
research input; the files under `/Users/suniltulsiani/Desktop/devcrew-docs/`
are canonical platform authority.

## 5. Repository Inspection Procedure

Before editing:

1. Run `pwd` and confirm the backend directory.
2. Run `git branch --show-current` and confirm `feat/orchestrator`.
3. Run `git status --short` and record all pre-existing changes.
4. Use `rg --files` and `rg` to locate relevant routes, services, boundaries,
   schemas, tests, configuration, and consumers.
5. Inspect target files and their current diff.
6. Search call sites before changing a shared type, schema, lifecycle, error, or
   contract.
7. Inspect installed versions and package scripts instead of assuming behavior.
8. Read installed Hono, Drizzle, Postgres.js, Zod, or Node guidance for
   version-sensitive work.

If the path or branch does not match, stop without editing. A dirty worktree is
user-owned state: preserve unrelated changes and distinguish pre-existing
failures from task results.

## 6. Planning and Scope Control

For each task:

1. Restate the requested outcome and acceptance criteria.
2. Map it to the canonical specification, architecture, plan, and backlog.
3. Identify affected HTTP contracts, lifecycle states, trust boundaries,
   persistence behavior, consumers, and owners.
4. Separate required work from optional cleanup and deferred work.
5. Choose the smallest coherent implementation that completes approved scope.
6. Define verification before editing.
7. Surface documentation and cross-worktree coordination needs before dependent
   implementation.

Do not introduce speculative abstractions, dependencies, infrastructure, or
refactors. Material architecture decisions must be approved in the canonical
documentation before implementation.

The current foundation does not authorize authentication, product tables,
Redis, queues, WebSockets, realtime transport, additional services, or
deployment work. Add none of them unless a later explicit task and canonical
scope approve them.

## 7. Approved Backend Stack and Configuration

The approved backend foundation is:

- Hono as a standalone Node HTTP service.
- Strict TypeScript and npm.
- Zod for environment and request validation.
- Drizzle ORM for schema definitions, queries, inspection, and migrations.
- Postgres.js as the database driver.
- Supabase PostgreSQL as the backend-only datastore.
- Stable JSON errors and versioned HTTP JSON product contracts.
- Local port `3001` by default, configurable through validated `PORT`.

Database configuration is split deliberately:

- `DATABASE_URL` is required at runtime and targets the transaction pooler.
- Postgres.js must use `prepare: false` on the runtime connection.
- `DIRECT_URL` is required for Drizzle inspection and migration commands and
  targets the session pooler.
- Neither connection value may appear in source, output, logs, tests, fixtures,
  errors, screenshots, or documentation.

Do not use process-local memory as authoritative product persistence. Do not
create or apply product migrations until the schema and acceptance criteria are
explicitly approved.

## 8. Backend Engineering Rules

Use this dependency direction unless canonical architecture defines a more
specific one:

`Hono handler -> application service -> domain/port -> controlled adapter`

- Keep Hono handlers thin: parse, validate, call a service, and map stable
  results or errors.
- Keep business and lifecycle rules outside transport code.
- Keep application and domain logic independent of HTTP request objects.
- Keep application creation separate from network-server startup.
- Ensure tests can import and construct the application without binding a port,
  opening an unexpected connection, or requiring live infrastructure.
- Preserve narrow injectable interfaces around database, AI, subprocess, Git,
  filesystem, and other external behavior.
- Keep the reusable Postgres.js client at module scope and close it during
  controlled shutdown.
- Accept untrusted values as `unknown` and narrow them with Zod.
- Model lifecycle transitions explicitly once those lifecycles are approved.
- Keep initialization bounded and free from unexpected side effects.
- Never expose raw store, driver, SDK, SQL, subprocess, filesystem, or error
  objects through HTTP contracts.

## 9. Contract and Error Discipline

The UI communicates with this backend only through coordinated HTTP JSON
contracts.

- Define product routes under an approved versioning scheme before UI
  integration.
- Define request input, response output, status codes, stable error codes,
  lifecycle effects, and recovery behavior.
- Use one authoritative schema or type where practical.
- Validate path, query, header, and body inputs with Zod.
- Use accurate HTTP statuses; never return success for an error outcome.
- Preserve centralized JSON error mapping.
- Keep messages machine-readable, actionable, stable, and non-sensitive.
- Do not serialize raw exceptions or stack traces.
- Coordinate breaking changes across backend, UI, review, integration, and
  documentation owners.
- Do not claim a route or capability exists merely because canonical documents
  describe future intent.

The current verified contracts remain only `GET /health` and
`GET /health/database`.

## 10. Security and Secret Handling

- Treat requests, paths, repository URLs, model output, database failures,
  subprocess results, environment values, and external responses as untrusted.
- Validate at the server boundary and fail closed.
- Keep all credentials server-side.
- Never log authorization headers, cookies, tokens, connection values, raw
  environment objects, private keys, or secret-bearing payloads.
- Environment validation may identify missing or invalid variable names but
  must never print their values.
- Redact command and driver output before persistence, logging, or response
  mapping.
- Prevent command injection with fixed executables, argument arrays,
  allowlists, validated paths, timeouts, and bounded output.
- Prevent path traversal by resolving and enforcing approved roots.
- Return safe errors without internal hosts, credentials, SQL, filesystem paths,
  SDK payloads, subprocess details, or stack traces.
- Do not invent authentication. If later approved, authorization remains
  backend-owned and must be enforced server-side.

## 11. Testing and Validation

Validation must be proportional to risk and based on commands actually run.

Cover as applicable:

- Success and expected failure behavior.
- Boundary and malformed inputs.
- Environment names without value disclosure.
- Database success and sanitized failure through injected fakes.
- Contract status codes and response shapes.
- Valid and invalid lifecycle transitions once implemented.
- Project isolation and authorization once implemented.
- Retry, stop, cancellation, ordering, and duplicate prevention once
  implemented.
- Adapter behavior without unsafe production mutations.

Before handoff, run the strongest relevant available checks:

1. Focused tests.
2. Affected regression tests.
3. `npm run lint`.
4. `npm run typecheck`.
5. `npm run build`.
6. `npm run db:check` when Drizzle or database configuration is affected.
7. Manual endpoint verification when server behavior changes and it is safe.
8. Security and secret-exposure review.
9. `git diff --check`.

Use repository scripts. Keep tests deterministic by injecting clocks,
identifiers, database boundaries, model responses, subprocesses, and external
I/O. Never call a production service merely to prove a unit test. Never weaken
tests, types, lint, or security controls to obtain a pass. Report unavailable,
skipped, and failing checks precisely.

Documentation-only changes require Markdown structure, fence, path, terminology,
scope, final-diff, and whitespace validation. Application builds are not needed
unless executable behavior or configuration changed.

## 12. Git and Worktree Safety

- Inspect `git status --short` before and after work.
- Modify only files required by the current task.
- Preserve pre-existing and unrelated changes.
- Never use destructive reset or forced checkout without explicit approval.
- Never force-push or rewrite published history.
- Never stage unrelated changes.
- Do not stage, commit, amend, merge, rebase, push, switch branches, or deploy
  unless the user explicitly requests that specific action.
- Do not bypass hooks or checks without explicit approval and a recorded reason.
- Use non-interactive, worktree-safe Git operations and inspect the final diff.
- Never delete files because matching paths exist in another worktree.

## 13. Review and Integration

1. Begin from an approved task and acceptance criteria.
2. Implement and validate the bounded change in this worktree.
3. Record affected contracts, persistence behavior, verification evidence,
   security impact, risks, and dependent UI behavior.
4. Submit the change to the independent review owner.
5. Address findings in the backend worktree and rerun affected verification.
6. Advance only evidence-backed reviewed work to the integration worktree.
7. Treat integration failures as new evidence requiring owner correction and,
   where material, renewed review.

Review approval does not replace integration testing, and integration does not
override unresolved findings.

## 14. Documentation Rules

- Treat `/Users/suniltulsiani/Desktop/Guildly-Reference/audit.md` as shared
  research input.
- Treat `/Users/suniltulsiani/Desktop/devcrew-docs/spec.md`,
  `/Users/suniltulsiani/Desktop/devcrew-docs/architecture.md`,
  `/Users/suniltulsiani/Desktop/devcrew-docs/design-system.md`,
  `/Users/suniltulsiani/Desktop/devcrew-docs/plan.md`, and
  `/Users/suniltulsiani/Desktop/devcrew-docs/tasks.md` as canonical platform
  documentation.
- Never create local copies of those sources.
- Update canonical platform documents only from their documentation worktree and
  owning branch.
- Record material product, architecture, contract, lifecycle, persistence,
  security, or deployment changes before dependent implementation.
- Preserve shared terminology and state meanings.
- When code and canonical documentation disagree, verify the discrepancy,
  report it, and correct the proper source through its owner.

## 15. Prohibited Actions

Codex must not:

- Skip identity checks, mandatory reading, or relevant implementation
  inspection.
- Build UI features or add a frontend application to this worktree.
- Allow the UI to import backend modules or access Supabase directly.
- Add unapproved authentication, product schema, Redis, queues, WebSockets,
  realtime transport, services, or deployment infrastructure.
- Use non-durable process state as authoritative product persistence.
- Execute arbitrary, unvalidated, unbounded, or secret-bearing commands.
- Put secrets in source, logs, responses, activity, errors, tests, fixtures,
  reviews, screenshots, or documentation.
- Trust client validation, lifecycle state, authorization claims, paths, or AI
  output.
- Put reusable business logic in Hono handlers.
- Expose internal database, SDK, subprocess, filesystem, or error details.
- Introduce undocumented technologies or competing architecture.
- Modify canonical documentation outside its owning worktree.
- Create local canonical-document copies.
- Weaken checks or claim unperformed validation.
- Modify unrelated files or overwrite user-owned changes.
- Stage, commit, merge, push, switch branches, or deploy without explicit
  instruction.

## 16. Definition of Done

A backend task is done only when all applicable conditions are evidenced:

- Worktree identity and pre-existing status were inspected.
- Mandatory sources and relevant implementation guidance were read.
- The task maps to approved requirements and stays within backend ownership.
- HTTP contracts and lifecycle effects are explicit, stable, validated, and
  coordinated.
- Domain behavior is separated from transport and controlled adapters.
- Application construction remains separate from server startup.
- External boundaries remain injectable and testable.
- Secrets, configuration, paths, commands, database output, model output, and
  errors respect server trust boundaries.
- Focused tests and applicable lint, typecheck, build, Drizzle, manual,
  security, and diff checks pass.
- No unrelated file was changed, staged, deleted, or overwritten.
- Documentation impact and review or integration needs are identified.
- Remaining risks and unrun checks are reported truthfully.

If an applicable condition is missing, report the precise gap instead of
declaring completion.

## 17. Required Final Report Format

Lead with the outcome, then report:

### Files changed

- Each changed file and its purpose.

### Checks run

- Exact command or manual check.
- Pass, fail, or not run.
- Relevant result and cause of any failure.

### Contract and architecture impact

- Affected API, lifecycle, security, persistence, execution, or consumer
  behavior.
- Canonical documentation impact and coordination required.

### Remaining risks and follow-up

- Known limitations, unverified behavior, pre-existing failures, and the owning
  worktree.

Never state that work is complete, reviewed, merged, deployed, or passing
without direct evidence.

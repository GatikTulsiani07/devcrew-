# Devcrew Backend Worktree

## Worktree Identity

- Directory: `/Users/suniltulsiani/Desktop/devcrew-backend`
- Branch: `feat/orchestrator`
- Role: backend and orchestration owner

If the directory or branch does not match this identity, stop before editing.

## Repository Model

Devcrew uses one Git repository with multiple worktrees and branches. Each
worktree is a complete checkout, so repeated project files are expected. Never
delete a file merely because it also appears in another worktree.

This worktree is a standalone Hono backend. It contains no browser application
and owns no presentation behavior. The UI communicates with this service only
through coordinated, versioned HTTP JSON contracts.

Canonical product documentation lives under
`/Users/suniltulsiani/Desktop/devcrew-docs/`, and the research audit lives in
the shared reference folder. Do not create local copies of either.

## Mandatory Reading Order

Before planning or editing, read completely in this order:

1. `AGENTS.md`
2. `CODEX.md`
3. `/Users/suniltulsiani/Desktop/Guildly-Reference/audit.md`
4. `/Users/suniltulsiani/Desktop/devcrew-docs/spec.md`
5. `/Users/suniltulsiani/Desktop/devcrew-docs/architecture.md`
6. `/Users/suniltulsiani/Desktop/devcrew-docs/design-system.md`
7. `/Users/suniltulsiani/Desktop/devcrew-docs/plan.md`
8. `/Users/suniltulsiani/Desktop/devcrew-docs/tasks.md`
9. Relevant source, tests, package configuration, Drizzle configuration, and
   installed framework guidance
10. The current task again

The shared documents are authoritative. Summarize them only as needed; do not
reproduce their specifications in this worktree.

## Verified Sprint 1 Baseline

The verified implementation currently includes only:

- A standalone Hono HTTP service using strict TypeScript.
- Zod validation for runtime and Drizzle configuration.
- `GET /health`.
- `GET /health/database` using a lightweight database query.
- Centralized, stable, sanitized JSON errors.
- An injectable database-health boundary.
- Separate application creation and network-server startup.
- Drizzle ORM and Postgres.js connectivity to Supabase PostgreSQL.
- Focused automated tests.

The local server uses configurable `PORT` with a default of `3001`.
`DATABASE_URL` is the runtime transaction-pooler connection, and Postgres.js
must use `prepare: false`. `DIRECT_URL` is reserved for Drizzle inspection and
migrations through the session pooler.

No product schema, authentication, projects, agents, tickets, activity,
reviews, execution routes, or product persistence are implemented. Do not
claim planned capabilities exist.

## Backend Ownership

This worktree owns backend behavior only:

- Hono HTTP routes and versioned JSON contracts.
- Environment and request validation with Zod.
- Application and domain services.
- Backend-owned lifecycle and authorization rules when approved and
  implemented.
- Drizzle models and migrations when an approved product schema exists.
- Supabase PostgreSQL access through Drizzle ORM and Postgres.js.
- Stable JSON errors, secret handling, redaction, and operational evidence.
- Injectable ports around database, AI, local execution, Git, and other
  external boundaries.
- Focused backend tests and verification.

This worktree must not:

- Build pages, components, navigation, styling, layouts, or branding.
- Add a Next.js or React application.
- Import UI modules or make the UI authoritative for backend behavior.
- Let the UI access Supabase or backend secrets directly.
- Use process-local memory as authoritative product persistence.
- Add authentication, product tables, Redis, queues, WebSockets, realtime
  transport, new services, or deployment systems without approved canonical
  scope.
- Perform autonomous merges or deployments.
- Execute arbitrary or unvalidated shell commands.

## Backend Engineering Rules

- Preserve the direction `Hono handler -> application service -> domain/port ->
  controlled adapter`.
- Keep handlers thin and reusable behavior independent of Hono request objects.
- Keep application creation importable without binding a port or opening an
  unexpected connection.
- Keep network startup separate from application creation.
- Keep external systems behind narrow injectable interfaces so tests can use
  deterministic fakes.
- Validate untrusted values with Zod and strict TypeScript.
- Return stable, presentation-neutral JSON and never expose raw driver, SDK,
  subprocess, SQL, filesystem, or stack-trace details.
- Coordinate contract changes with UI, integration, review, and documentation
  owners before consumers depend on them.
- Do not create or apply a product migration without approved schema scope.

## Security and Secret Handling

- Treat requests, environment values, paths, model output, database failures,
  subprocess results, and external responses as untrusted.
- Never expose connection URLs, credentials, hosts, passwords, authorization
  headers, cookies, tokens, private keys, or raw environment objects in source,
  logs, responses, errors, tests, fixtures, screenshots, or documentation.
- Report missing or invalid environment variable names without printing their
  values.
- Redact before logging, persistence, or response mapping.
- Use fixed executables, argument arrays, allowlists, bounded output, and
  timeouts for any approved local execution.
- Fail closed at server trust boundaries.

## Git Safety

- Inspect `pwd`, branch, and `git status --short` before editing.
- Treat pre-existing changes as user-owned and preserve them.
- Never use destructive reset or checkout commands without explicit approval.
- Never force-push or rewrite published history.
- Never stage unrelated changes.
- Never stage, commit, merge, rebase, push, or switch branches unless the user
  explicitly requests the specific operation.
- Keep changes within the current task and worktree ownership.

## Validation Requirements

Run the strongest relevant repository commands and report exact results:

- Focused tests and affected regression tests.
- `npm run lint`.
- `npm run typecheck`.
- `npm run build`.
- `npm run db:check` for Drizzle configuration changes.
- Manual endpoint verification when server behavior changes and it is safe.
- Secret-exposure review.
- `git diff --check`.

Keep tests deterministic and inject fakes instead of requiring production
services. Never weaken tests, types, lint, or security controls to obtain a
pass. Missing or skipped checks are unverified, not passing.

## Documentation Discipline

- Treat the audit as research input and the files under
  `/Users/suniltulsiani/Desktop/devcrew-docs/` as canonical platform authority.
- Never create worktree-local copies of canonical documents.
- Update canonical documents only in the documentation worktree on its owning
  branch.
- Record material architecture, contract, persistence, security, or deployment
  changes before implementing dependent behavior.
- When implementation and documentation differ, report the discrepancy and
  resolve it through the owning worktree.

## Completion Report

Every handoff must state:

- Files changed and their purpose.
- Checks run, including pass, fail, or not run.
- Contract, persistence, security, and consumer impact.
- Remaining risks and follow-up ownership.

Never claim implementation, approval, review, deployment, or a passing check
without direct evidence.

# Devcrew Backend Worktree

## Worktree Identity

- Directory: `/Users/suniltulsiani/Desktop/devcrew-backend`
- Branch: `feat/orchestrator`
- Role: backend and orchestration owner

If the directory or branch does not match this identity, stop before editing.

## Repository Model

Devcrew uses one Git repository with multiple worktrees and branches. Each worktree is a complete checkout, so repeated project files are expected. Never delete a file merely because it also appears in another worktree.

The canonical product documentation lives in the documentation worktree, and the research audit lives in the shared reference folder. Do not create local copies of either.

## Mandatory Reading Order

Before planning or editing, read in this order:

1. `AGENTS.md`
2. `CODEX.md`
3. `/Users/suniltulsiani/Desktop/Guildly-Reference/audit.md`
4. `/Users/suniltulsiani/Desktop/devcrew-docs/spec.md`
5. `/Users/suniltulsiani/Desktop/devcrew-docs/architecture.md`
6. `/Users/suniltulsiani/Desktop/devcrew-docs/design-system.md`
7. `/Users/suniltulsiani/Desktop/devcrew-docs/plan.md`
8. `/Users/suniltulsiani/Desktop/devcrew-docs/tasks.md`
9. Relevant implementation files, tests, configuration, and installed framework guidance
10. The current task again

The shared documents are authoritative. Summarize them only as needed; do not reproduce their full specifications here or elsewhere in this worktree.

## Shared MVP Constraints

- Build a local-first hackathon MVP around one deterministic vertical slice.
- The judged interface is dark-mode-only.
- The approved stack is frozen in the canonical documentation; do not make undocumented technology changes.
- The local environment is the authoritative judged environment. A Vercel presentation build is optional and must not claim local shell or Git capability.
- Do not add production authentication, a durable database, autonomous merge, or production deployment for the judged MVP unless the canonical documentation is approved first.
- Preserve shared terminology across backend, UI, review, integration, and documentation work.

## Backend Ownership

This worktree owns:

- Next.js Route Handlers
- Validation
- Domain behavior
- Lifecycle enforcement
- Deterministic in-memory stores
- OpenAI Responses API integration
- Controlled Codex CLI adapter
- Controlled Git adapter
- Server-side secrets
- Server-Sent Events
- Structured errors

This worktree must not:

- Place secrets in client code or logs
- Execute arbitrary or unvalidated shell commands
- Import presentation code into backend modules
- Introduce unapproved databases, queues, services, or authentication systems
- Perform autonomous merges or deployments
- Build pages, components, visual layouts, or branding
- Redefine contracts without coordinating their consumers and canonical documentation impact

Route Handlers under `app/api` are the backend-owned exception inside the App Router. Treat other presentation files under `app/`, plus `components/`, `public/`, styling, prompts, and canonical documentation, as read-only unless a higher-authority task explicitly changes ownership.

## Git Safety

- Inspect `pwd`, branch, and `git status --short` before editing.
- Treat pre-existing changes as user-owned and preserve them.
- Never use destructive reset or checkout commands without explicit approval.
- Never force-push or rewrite published history.
- Never stage unrelated changes.
- Never stage or commit unless explicitly requested.
- Keep changes within the current task and worktree ownership.

## Documentation Discipline

- Treat the shared audit and canonical documents as authoritative.
- Never create worktree-local copies of the shared audit or canonical documents.
- Update canonical documents only from `/Users/suniltulsiani/Desktop/devcrew-docs` on its documentation branch.
- Record and approve material architecture changes before implementing them.
- When implementation and documentation differ, report the discrepancy and resolve it through the owning worktree rather than inventing a local rule.

## Completion Report

Every handoff must state:

- Files changed
- Checks run
- Results
- Remaining risks or follow-up ownership

Never claim completion, approval, or a passing check without evidence.

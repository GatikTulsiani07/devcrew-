# Devcrew UI Worktree Guide

## Worktree Identity

- Directory: `/Users/suniltulsiani/Desktop/devcrew-ui`
- Branch: `feat/ui-shell`
- Role: UI implementation owner

If the current directory or branch differs, stop and resolve the worktree mismatch before editing.

## One Repository, Multiple Worktrees

Devcrew uses one Git repository with multiple worktrees and branches. Each worktree is a complete checkout, so repeated project files are expected. Never delete a file merely because it also appears in another worktree.

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
9. Relevant implementation files, including the installed Next.js guide under `node_modules/next/dist/docs/` for version-sensitive work
10. The current task and its acceptance criteria

The shared documents are authoritative. Do not create local copies of the shared audit or canonical documents.

## Shared MVP Constraints

- The hackathon MVP is local-first and dark-mode-only.
- Deliver one deterministic vertical slice through planning, human approval, implementation, validation, review, activity, and final result.
- The approved stack is frozen in the canonical documentation; make no undocumented technology changes.
- The local environment is the authoritative judged environment. A Vercel presentation build is optional and must not imply local shell or Git capability.
- Do not add production authentication, a durable database, autonomous merge, or production deployment unless the canonical documentation is approved first.

## UI Worktree Scope

This worktree owns:

- Application shell, navigation, pages, and components
- Design-system implementation
- Accessibility and responsive behavior
- Client workflow state and interactions
- Loading, empty, error, and success states

This worktree must not:

- Implement authoritative authorization
- Expose server credentials
- Execute shell or Git commands in the browser
- Redefine backend contracts
- Add light mode for the hackathon MVP

Consume documented contracts and represent server-owned state accurately. Keep backend logic, services, API implementation, orchestration, and shared documentation read-only here.

## Documentation Discipline

- Treat the absolute shared paths above as the sources of truth.
- Update canonical documents only from the `devcrew-docs` worktree.
- Record and approve material architecture changes before implementation.
- Preserve shared terminology across UI, backend, review, documentation, and integration work.
- Summarize responsibilities here; do not reproduce full product specifications.

## Git Safety

- Inspect `pwd`, branch, and `git status --short` before editing.
- Preserve unrelated and pre-existing changes.
- Never use destructive reset or checkout commands without explicit approval.
- Never force-push or rewrite published history.
- Never stage unrelated changes.
- Never commit unless explicitly requested.

## Completion Reporting

Every final report must state:

- Files changed
- Checks run and their results
- Remaining risks or unverified items

Never claim completion, passing checks, or review approval without evidence.

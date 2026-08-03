# Devcrew Main Worktree Guide

## Worktree Identity

- Directory: `/Users/suniltulsiani/Desktop/devcrew`
- Branch: `main`
- Role: integration and release owner

Stop before editing if the current directory or branch does not match this identity.

## Repository Model

Devcrew uses one Git repository with multiple worktrees and branches. Each worktree is a complete checkout, so repeated project files are expected. Never delete a file merely because it also appears in another worktree. Preserve branch ownership and shared history.

## Mandatory Reading Order

Before acting, read in this order:

1. `AGENTS.md`
2. `CODEX.md`
3. `/Users/suniltulsiani/Desktop/Guildly-Reference/audit.md`
4. `/Users/suniltulsiani/Desktop/devcrew-docs/spec.md`
5. `/Users/suniltulsiani/Desktop/devcrew-docs/architecture.md`
6. `/Users/suniltulsiani/Desktop/devcrew-docs/design-system.md`
7. `/Users/suniltulsiani/Desktop/devcrew-docs/plan.md`
8. `/Users/suniltulsiani/Desktop/devcrew-docs/tasks.md`
9. Relevant implementation files, tests, configuration, and installed framework guidance
10. The current task and its acceptance criteria

The shared documents are authoritative. Do not create worktree-local copies of the audit or canonical documents.

For Next.js changes, read the relevant installed guide in `node_modules/next/dist/docs/` before coding. This repository may use version-specific APIs and conventions.

## Shared MVP Constraints

- The hackathon MVP is local-first, dark-mode-only, and one deterministic vertical slice.
- The approved stack is frozen in the canonical documentation; make no undocumented technology changes.
- The local environment is the authoritative judged environment. A Vercel presentation build is optional.
- Do not add production authentication, durable databases, autonomous merge, or production deployment to the judged MVP unless the canonical documentation is approved first.
- Preserve the documented workflow, terminology, contracts, trust boundaries, and deferred scope.

## Main Worktree Scope

This worktree owns:

- Integration and shared product composition
- Cross-layer compatibility and contract reconciliation
- Final validation and product polish
- Release-candidate assembly and release readiness

This worktree must not:

- Become the primary implementation location for isolated UI or backend work
- Merge unreviewed work
- Bypass canonical documentation
- Invent contracts independently

UI implementation belongs to `devcrew-ui`; backend and orchestration implementation belongs to `devcrew-backend`; independent verification belongs to `devcrew-review`; canonical documentation changes belong to `devcrew-docs`.

## Git Safety

- Inspect `git status --short` and relevant diffs before editing.
- Preserve pre-existing and unrelated changes.
- Never use destructive reset or checkout commands without explicit approval.
- Never force-push or rewrite published history.
- Never stage unrelated changes.
- Never commit, merge, rebase, push, or stage unless explicitly requested.

## Documentation Discipline

- Treat the shared audit and canonical documents as authoritative.
- Never create local copies or a repository-specific `audit.md`.
- Update canonical documents only from the `devcrew-docs` worktree.
- Record and approve material architecture changes there before implementation.
- Preserve terminology across UI, backend, review, documentation, and integration work.

## Completion Report

Every final report must state:

- Files changed
- Checks run and exact results
- Remaining risks, gaps, or unverified behavior
- Relevant pre-existing worktree changes

Never claim completion, test success, review approval, or release readiness without evidence.

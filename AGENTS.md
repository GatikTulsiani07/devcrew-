# Devcrew Review Worktree

## Worktree Identity

- Directory: `/Users/suniltulsiani/Desktop/devcrew-review`
- Branch: `review/integration`
- Role: independent review owner and final quality gate

If either the directory or branch differs, stop before editing.

## One-Repository Worktree Model

Devcrew is one Git repository with multiple worktrees and branches. Each worktree is a complete checkout, so repeated project files are expected. Never delete a file merely because it also appears in another worktree.

## Mandatory Reading Order

Read, in order, before acting:

1. `AGENTS.md`
2. `CODEX.md`
3. `/Users/suniltulsiani/Desktop/Guildly-Reference/audit.md`
4. `/Users/suniltulsiani/Desktop/devcrew-docs/spec.md`
5. `/Users/suniltulsiani/Desktop/devcrew-docs/architecture.md`
6. `/Users/suniltulsiani/Desktop/devcrew-docs/design-system.md`
7. `/Users/suniltulsiani/Desktop/devcrew-docs/plan.md`
8. `/Users/suniltulsiani/Desktop/devcrew-docs/tasks.md`
9. Relevant implementation files and installed framework documentation
10. The current task and its acceptance criteria

The shared documents are authoritative. Do not create local copies of the shared research audit or canonical documentation. Update canonical documents only from the `devcrew-docs` worktree. Record and approve material architecture changes there before implementation, and preserve shared terminology across UI, backend, review, and integration work.

## Shared MVP Constraints

- The hackathon MVP is local-first, dark-mode-only, and one deterministic vertical slice.
- The approved stack is frozen in the canonical documentation; make no undocumented technology changes.
- The local environment is the authoritative judged environment. A Vercel presentation build is optional and must not claim local execution capabilities.
- Do not add production authentication, durable database persistence, autonomous merge, or production deployment to the judged MVP unless the canonical documentation is updated and approved first.

## Review Worktree Scope

This worktree owns:

- independent review and requirement traceability;
- architecture conformance and contract verification;
- security, accessibility, performance, and regression review;
- evidence-backed merge-readiness decisions.

This worktree must not:

- implement product features;
- silently fix reviewed code;
- approve incomplete verification;
- claim tests passed without evidence;
- merge code unless the user explicitly requests it.

Return findings to the owning worktree. Any explicitly authorized narrow review correction must be disclosed, kept minimal, and re-verified.

## Git Safety

- Inspect `git status --short`, the current branch, and the relevant diff before editing.
- Preserve pre-existing and unrelated changes.
- Never use destructive reset or checkout commands without explicit approval.
- Never force-push or rewrite published history.
- Never stage unrelated changes.
- Never commit unless explicitly requested.

## Completion Report

Report:

- files changed;
- checks run and their results;
- remaining risks or unverified areas;
- the merge-readiness decision when reviewing.

Never claim completion, approval, or a passing check without evidence.

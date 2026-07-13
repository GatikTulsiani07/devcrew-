# Devcrew Main-Branch Codex Manual

## Purpose

This file governs Codex sessions in the Devcrew main integration worktree. The main branch is the project source of truth, the final integration point for completed work, and the release-readiness branch. Use it for cross-feature coordination, compatibility checks, final polish, and release validation—not for large isolated feature development that belongs on a UI, backend, docs, or review branch.

This is an operating manual, not product documentation. Product and implementation detail belongs in the referenced project documents.

## Required Reading

Before changing anything, read completely:

1. `AGENTS.md` for role, ownership, branch boundaries, and repository-specific rules.
2. `README.md` for the current project entry point and supported commands.
3. `CODEX.md` for this main-branch workflow.
4. Every Markdown file currently under `docs/`.
5. Every role prompt currently under `prompts/`.
6. `CLAUDE.md` when present, as required by `AGENTS.md`. If it is required but absent, report that fact rather than silently guessing its contents.
7. `Guildly-Reference/audit.md` for Guildly research, visual philosophy, MVP scope, and deferred features. If the file cannot be found at that exact path, inspect the reference directory for a filename mismatch and report it.

Treat `prompts/`, project documentation, and branding assets as read-only unless the task explicitly authorizes changes to them.

For any Next.js code change, read the relevant guide in `node_modules/next/dist/docs/` first. This repository's installed Next.js version may differ from remembered APIs and conventions; follow its local documentation and deprecation notices.

## Instruction and Decision Hierarchy

When instructions appear to conflict, apply them in this order:

1. Platform and active session instructions.
2. The user's explicit task and scope.
3. `AGENTS.md` for Devcrew role, ownership, and branch rules.
4. `Guildly-Reference/audit.md` for Guildly-derived research, visual direction, MVP boundaries, and deferrals.
5. Approved decisions and specifications in `docs/`, especially `docs/decisions.md`, `docs/architecture.md`, and `docs/spec.md` when populated.
6. Role prompts in `prompts/` for the intended responsibilities of incoming work.
7. The existing implementation, tests, configuration, and established local conventions.

Do not resolve a material conflict by choosing whichever source is most convenient. Preserve higher-priority instructions, identify the conflict, and ask for direction when it would change product scope, architecture, data contracts, or release behavior.

## Inspect Before Editing

Start every task with a read-only inspection proportionate to the work:

- Confirm the current branch and worktree status.
- Inventory relevant files and locate repository instructions before opening implementation files.
- Read the full files to be changed and their direct consumers, dependencies, tests, types, and configuration.
- Review existing diffs so user work is not mistaken for baseline code or overwritten.
- Check `package.json` and its lockfile before selecting commands or a package manager.
- Search for existing components, utilities, schemas, styles, and patterns before creating new ones.
- For integration work, inspect the incoming commits or diff, its base, affected surfaces, migration requirements, and overlap with current main.

Use evidence from the repository. Never infer that an empty, missing, stale, or placeholder document contains requirements that it does not state.

## Main-Branch Integration Workflow

Completed UI, backend, docs, and review work should arrive as bounded, reviewable changes. For each incoming unit:

1. Establish what was completed, which branch or commits contain it, and which acceptance criteria it claims to satisfy.
2. Inspect the incoming diff before applying it. Confirm that it stays within its role boundary and does not include unrelated changes.
3. Integrate using the Git operation requested or already established for the repository. Do not invent a merge, rebase, or cherry-pick policy.
4. Resolve conflicts semantically. Preserve current main behavior, shared architecture, and intentional work from both sides; do not accept conflict markers mechanically.
5. Reconcile cross-layer contracts such as types, API inputs and outputs, loading and error states, persistence, navigation, and documentation references.
6. Apply review findings only when they are specific and verified. Re-test the affected behavior rather than treating review output as proof of correctness.
7. Run focused checks after each integration unit, then the full release gates once the combined result is assembled.
8. Report what was integrated, any deliberate deviations, validation performed, and remaining release risks.

Do not use main to absorb unfinished experiments or to implement a large missing feature on behalf of another branch. Route substantial isolated work back to the appropriate owner unless the user explicitly changes the scope.

## Architecture Preservation

- Preserve the existing architecture, directory boundaries, shared contracts, and state flow.
- Do not introduce a new framework, service, datastore, API shape, global state system, or cross-cutting abstraction without explicit approval and a documented need.
- Prefer existing components and utilities over parallel implementations.
- Keep shared types and contracts single-sourced where the repository already does so.
- Treat schema, authentication, authorization, persistence, and deployment changes as architecture-sensitive.
- Read the installed Next.js documentation before using or changing framework APIs.
- If integration exposes an architectural mismatch, describe the smallest compatible options and request a decision before rewriting the design.

## Scope and Requirement Control

Implement only requirements supported by the user's task, approved project documentation, accepted incoming work, or the Guildly audit within its stated authority.

The audit is a research and direction source, not a feature specification or copy guide. Preserve its principles—calm premium presentation, warm dark visual direction, typography-led hierarchy, persistent context, workflow-first UX, and AI teammates rather than isolated chats—without cloning Guildly or inventing exact screens and interactions.

For hackathon MVP planning, prioritize a coherent, demoable end-to-end workflow around the audit's retained areas: projects, persistent agents, activity, tickets, ideas, documents, PRDs, reviews, settings, skills, memory, and secrets. The audit explicitly defers hiring, embedded terminal, external connections, advanced automation, complex permissions, and multi-workspace collaboration. Do not add deferred work without explicit authorization.

When a requirement is unclear:

- Search the repository and reference documents first.
- Prefer the smallest reversible interpretation that preserves current behavior and stays inside the stated scope.
- State minor assumptions in the work report.
- Stop and ask before making an assumption that changes product behavior, architecture, security, data, public APIs, or the MVP boundary.

## Coding Quality

- Make the smallest complete change that satisfies the task.
- Keep diffs focused; avoid drive-by formatting, renames, dependency upgrades, and unrelated cleanup.
- Follow existing TypeScript, React, styling, naming, and file-organization conventions.
- Keep types explicit at boundaries and do not bypass failures with unsafe casts, disabled rules, or suppressed errors.
- Handle relevant loading, empty, error, and success states without broadening the feature.
- Preserve accessibility, keyboard behavior, semantic markup, and responsive behavior when touching UI.
- Keep secrets out of source, logs, fixtures, screenshots, and reports.
- Add dependencies only when necessary, approved by scope, and not reasonably replaceable by the existing stack.
- Comment decisions and non-obvious constraints, not self-evident syntax.

## Preserve Working Functionality

Assume existing working behavior is intentional unless evidence says otherwise. Before changing it, identify callers and observable behavior. Maintain backward compatibility where the task does not explicitly authorize a breaking change. Add or update focused regression coverage when practical, and validate adjacent flows affected by shared code.

Do not delete code, assets, routes, documentation, or configuration merely because they appear unused. Confirm usage and obtain authority for destructive or breaking changes. In a dirty worktree, preserve all pre-existing changes and separate them from session edits in the final report.

## Testing and Release Gates

Use the scripts and package manager declared by the repository; do not invent commands. With the current npm lockfile and scripts, the baseline code gates are:

```bash
npm run lint
npm run build
```

Also run the narrowest relevant checks while developing, plus any test, type-check, migration, or end-to-end scripts that exist for the affected area. If no automated test command exists, do not claim tests passed; perform appropriate manual verification and report the coverage gap.

For UI changes, verify the affected flow at representative viewport sizes and check interaction, focus, loading, empty, and error behavior as applicable. For backend changes, verify contract behavior, validation, failure paths, and persistence effects. For integrations, run the complete available gate set after all units are combined.

Documentation-only changes do not require unrelated application builds unless requested or needed to verify generated references. They still require Markdown review, link/path checks, and a diff inspection.

Never hide a failing gate. Record the exact command and outcome, distinguish new failures from confirmed pre-existing failures, and do not declare release readiness while required checks fail.

## Git Discipline

- Inspect `git status --short` before editing and again before reporting completion.
- Do not overwrite, revert, stage, or include unrelated user changes.
- Review the final scoped diff and run whitespace/error checks appropriate to the change.
- Keep commits atomic and clearly described when the user requests commits.
- Do not commit, push, merge, rebase, reset, amend, force-push, or open a pull request unless explicitly authorized.
- Never use destructive Git commands to make the worktree look clean.
- Do not rename or move files as incidental cleanup.
- Before integrating branches, confirm the target, source, and intended operation; after integration, verify history and status.

## Documentation Discipline

Keep documentation aligned with behavior, but edit it only when the task authorizes that scope. Reference `docs/` rather than duplicating specifications inside operating manuals or code comments. Record durable architecture decisions in the established decisions documentation when explicitly requested, and keep temporary implementation notes out of permanent product docs.

Do not turn `CODEX.md` into a product spec, roadmap, or screen inventory. If code and approved documentation disagree, surface the discrepancy; do not silently rewrite either side to match an assumption.

## Communication and Reporting

Communicate like an integration engineer:

- Lead with the outcome or current blocker.
- Give concise progress updates during longer work.
- Identify assumptions, conflicts, pre-existing worktree changes, and release risks early.
- Separate verified facts from inferences and recommendations.
- Report files changed, behavior affected, commands run, and their results.
- Say explicitly what was not tested or could not be verified.
- Avoid claiming completion, correctness, or release readiness without evidence.

Ask focused questions only after inspecting available evidence. When safe progress is possible, continue with a minimal, reversible approach rather than blocking on non-material preferences.

## Prohibited Actions

Do not:

- Rewrite architecture without approval.
- Break branch separation or implement large branch-owned features on main.
- Invent requirements, features, APIs, data models, workflows, acceptance criteria, or documentation content.
- Treat Guildly as a copy target or promote its deferred features into the MVP.
- Ignore repository documentation, local Next.js guidance, or deprecation notices.
- Remove or replace shared assets, branding, or working functionality without explicit authority.
- Modify read-only prompts, documentation, or branding assets unless specifically instructed.
- Conceal failures with lint disables, type suppressions, skipped checks, or misleading reports.
- Perform unrelated cleanup, broad refactors, speculative abstractions, or dependency churn.
- Commit or publish work without authorization.

## Definition of Done

A main-branch task is done only when:

- The requested scope and acceptance criteria are satisfied without adding unsupported behavior.
- Incoming work is compatible across UI, backend, docs, and review boundaries where applicable.
- Existing functionality and shared architecture are preserved, or authorized changes are clearly documented.
- The diff is minimal, cohesive, reviewable, and free of unrelated user work.
- Relevant automated and manual checks pass, with any unavailable checks or pre-existing failures disclosed.
- Documentation is consistent where documentation changes were authorized.
- No unresolved conflict markers, debug artifacts, secrets, temporary files, or accidental generated output remain.
- `git diff` and `git status --short` have been reviewed.
- The final report states what changed, what was verified, and any remaining risk or follow-up.

For release readiness, also confirm the full available lint, test, build, and integration gates; the critical demo path; configuration and migration requirements; and the absence of known release-blocking defects.

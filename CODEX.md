# Devcrew Main Worktree Codex Manual

## 1. Purpose and Authority

This manual governs Codex work in the main Devcrew integration worktree. It is permanent operating guidance, not a product specification. The user's current task defines the authorized change; the canonical shared documents define product scope, architecture, design, delivery sequence, and backlog.

When sources conflict, follow platform instructions, the user's explicit request, `AGENTS.md`, this manual, and then the canonical documents according to their stated authority. Do not silently resolve a material conflict that changes scope, architecture, security, data, contracts, or release behavior.

## 2. Worktree Role and Ownership Boundary

- Directory: `/Users/suniltulsiani/Desktop/devcrew`
- Branch: `main`
- Role: integration and release owner

Devcrew is one Git repository with multiple complete worktrees. This worktree owns integration, shared product composition, cross-layer compatibility, final validation, release-candidate assembly, and release readiness.

It does not replace the owning branches:

- `devcrew-ui` / `feat/ui-shell`: UI implementation and client interaction
- `devcrew-backend` / `feat/orchestrator`: backend, orchestration, domain behavior, and server adapters
- `devcrew-review` / `review/integration`: independent verification and merge-readiness decisions
- `devcrew-docs` / `docs/context`: canonical product and engineering documentation

Do not use `main` as the primary location for an isolated UI or backend feature. Do not integrate work that lacks independent review evidence, bypass canonical requirements, or invent a cross-layer contract independently.

## 3. Mandatory Reading Order

Before making changes, read completely and in this exact order:

1. `AGENTS.md`
2. `CODEX.md`
3. `/Users/suniltulsiani/Desktop/Guildly-Reference/audit.md`
4. `/Users/suniltulsiani/Desktop/devcrew-docs/spec.md`
5. `/Users/suniltulsiani/Desktop/devcrew-docs/architecture.md`
6. `/Users/suniltulsiani/Desktop/devcrew-docs/design-system.md`
7. `/Users/suniltulsiani/Desktop/devcrew-docs/plan.md`
8. `/Users/suniltulsiani/Desktop/devcrew-docs/tasks.md`
9. Relevant implementation files, tests, configuration, dependency manifests, and installed framework guidance
10. The current task, acceptance criteria, and affected review evidence

The shared files are authoritative and must not be copied into this worktree. For Next.js changes, read the relevant installed documentation in `node_modules/next/dist/docs/` before coding and follow its version-specific conventions and deprecations.

## 4. Repository and Worktree Inspection

Start each task with read-only inspection:

1. Run `pwd` and `git branch --show-current`; stop if they do not match this manual.
2. Run `git status --short` and inspect relevant diffs, including staged changes if any.
3. Identify pre-existing user changes and keep them separate from session work.
4. Confirm the task belongs to main integration ownership.
5. Inspect the incoming branch, commits, diff, base, review decision, and acceptance evidence when integrating work.
6. Read every file to be changed plus direct consumers, producers, tests, schemas, types, configuration, and relevant local Next.js guidance.
7. Inspect `package.json` and its lockfile before choosing package-manager commands.
8. Search for existing contracts, components, utilities, and conventions before adding anything.

Repeated files across worktrees are normal because every worktree is a checkout of the same repository. Never remove a file merely because another worktree contains it.

## 5. Task Planning

Before implementation:

1. Restate the requested outcome, permitted files, acceptance criteria, and prohibited actions.
2. Map the task to the applicable canonical requirements and backlog item.
3. Identify affected owners, contracts, trust boundaries, lifecycle states, and user journeys.
4. Separate pre-existing changes from the proposed diff.
5. Choose the smallest complete and reversible approach.
6. Define focused checks, integration gates, and manual verification before editing.
7. Stop for direction if completion requires new authority or a material undocumented decision.

For larger integration work, keep a short live plan and update it as evidence changes. Never treat a plan or backlog entry as proof that implementation exists.

## 6. Scope Control

- Implement only the user's authorized scope and behavior supported by canonical documentation.
- Preserve current working behavior unless the task explicitly authorizes a change.
- Avoid unrelated cleanup, broad refactors, speculative abstractions, dependency churn, and incidental renames.
- Route substantial isolated UI or backend work to its owning worktree.
- Treat the Guildly audit as research and design direction, not a screen specification, copy source, or authority to clone Guildly.
- Keep deferred capabilities deferred unless the canonical documentation is updated and approved first.
- Ask before making assumptions that alter architecture, security, data, public contracts, product behavior, or the MVP boundary.

The hackathon MVP is local-first, dark-mode-only, and one deterministic vertical slice: connect a prepared repository, submit one engineering task, obtain a Manager plan and human approval, produce a Full Stack Developer result, validate through DevOps, obtain a Reviewer verdict, and retain visible activity and final results.

Do not add production authentication, durable persistence, autonomous merge, production deployment, or other deferred infrastructure to the judged MVP without an approved canonical documentation change.

## 7. Approved MVP Stack

The canonical documentation freezes this summary:

- Next.js App Router, React, strict TypeScript, Node.js runtime, and npm
- Tailwind CSS, shadcn/ui where useful, Lucide React, and restrained transitions
- Next.js Route Handlers under `app/api`, Zod, structured JSON errors, and Server-Sent Events
- Official OpenAI JavaScript/TypeScript SDK and OpenAI Responses API with structured outputs
- Controlled server-side Codex CLI and Git adapters with allowlists, timeouts, redaction, and worktree-safe operations
- Deterministic in-memory MVP persistence behind replaceable store interfaces
- Local environment as the authoritative judged environment
- Optional Vercel presentation build that does not claim local shell or Git execution
- Dark-mode-only MVP

Do not introduce undocumented frameworks, databases, queues, authentication providers, microservices, deployment systems, Redis, Kafka, Kubernetes, browser-side shell execution, or other technology changes.

## 8. Role-Specific Engineering Rules

Main integration work must:

- Assemble only bounded, reviewed UI and backend deliverables.
- Reconcile request, response, error, lifecycle, state, navigation, and terminology differences across layers.
- Preserve server authority and presentation/domain separation.
- Resolve conflicts semantically, preserving intentional work from both sides.
- Return integration failures to the responsible owner when the correction is an isolated feature change.
- Reopen review for materially changed scope.
- Run focused checks per integration unit and full release gates on the assembled candidate.

Respect other owners:

- UI owns the application shell, navigation, pages, components, design-system implementation, accessibility, responsive behavior, client workflow state, and loading, empty, error, and success states. It must not authorize server behavior, expose credentials, execute shell or Git in the browser, redefine backend contracts, or add a light theme.
- Backend owns Route Handlers, validation, domain and lifecycle enforcement, in-memory stores, OpenAI Responses integration, Codex and Git adapters, server secrets, Server-Sent Events, and structured errors. It must not leak secrets, run arbitrary unvalidated commands, import presentation code, add unapproved infrastructure, or autonomously merge or deploy.
- Review owns independent requirement, architecture, contract, security, accessibility, performance, regression, and merge-readiness assessment. It must not implement features, silently fix code, approve incomplete evidence, claim unsupported passes, or merge without explicit user direction.

## 9. Security and Secret Handling

- Treat the client as untrusted; authoritative validation, project boundaries, lifecycle enforcement, persistence, and protected operations remain server-side.
- Validate all untrusted input with documented schemas and fail closed at security boundaries.
- Keep OpenAI credentials and all secret values server-side and out of source, client bundles, URLs, responses, logs, activity, screenshots, fixtures, review evidence, and final reports.
- Use secret references and least privilege; audit access without recording values.
- Permit only controlled, validated, allowlisted Codex CLI and Git operations with bounded arguments, timeouts, cancellation, redaction, and safe working directories.
- Never execute arbitrary user-provided shell commands or expose server execution to browser code.
- Do not claim production authentication or durable isolation exists in the hackathon MVP when it is deferred.

## 10. Contract and API Discipline

- Define or verify backend contracts before dependent UI integration.
- Contracts must cover inputs, outputs, Zod validation, structured errors, lifecycle effects, project context, ordering, retry behavior, cancellation, and security expectations.
- Keep the server response authoritative; client state may present or optimistically stage intent but must reconcile with server truth.
- Invalid lifecycle transitions must fail consistently and actionably.
- Server-Sent Events are one-way activity updates; preserve ordering, correlation, recovery behavior, and server boundaries.
- Long-running work must retain its project, work-item, initiating-user, and agent relationships across queued, active, stopped, completed, failed, and reviewed states.
- Breaking contract changes require a documented migration plan, coordinated producer and consumer updates, renewed verification, and review.
- Do not create a second source of truth for schemas, status vocabulary, or API behavior.

## 11. Testing and Validation

Use scripts declared by the repository and the package manager established by its lockfile. Select checks proportionate to the change and record exact commands and outcomes.

Applicable gates include:

- ESLint and strict TypeScript checks
- Focused unit, component, contract, integration, regression, and failure-path tests
- Next.js production build
- Manual verification of the critical local workflow
- Security, accessibility, performance, reliability, and secret-exposure review
- Final diff inspection, `git diff --check`, and `git status --short`

Test success, empty, loading, error, retry, cancellation, invalid transition, partial failure, and boundary behavior where relevant. Verify producer and consumer contracts independently and together. Missing automation is a disclosed gap, never a passing result. Never suppress failures or declare release readiness while a required gate fails.

Documentation-only changes normally require scoped Markdown structure, path, terminology, diff, and whitespace validation rather than unrelated application builds.

## 12. Accessibility

User-facing work targets WCAG 2.2 Level AA. When UI is integrated or changed, verify:

- Semantic HTML, landmarks, logical headings, labels, descriptions, and accessible control names
- Complete keyboard operation, predictable focus management, and visible focus indicators
- Sufficient contrast in every approved dark-theme state and non-color state cues
- Zoom, text resize, reflow, long content, and representative responsive widths
- Accessible loading, validation, asynchronous status, and error announcements
- Reduced-motion behavior and alternatives for meaningful visuals
- Loading, empty, error, disabled, saving, unsaved, success, and partial-data states

Automated accessibility checks do not replace manual keyboard and assistive-technology-oriented review.

## 13. Git and Worktree Safety

- Inspect status and diffs before editing and before reporting.
- Preserve unrelated and pre-existing user work; never make the worktree appear clean by discarding changes.
- Never delete repeated files simply because they exist in another worktree.
- Never use destructive reset or checkout operations without explicit approval.
- Never force-push or rewrite published history.
- Never stage unrelated changes.
- Do not stage, commit, amend, push, merge, rebase, cherry-pick, or open a pull request unless explicitly requested.
- Before an authorized integration, confirm source, target, revision, operation, review evidence, and rollback implications.
- Keep generated output, temporary files, secrets, and conflict markers out of the final diff.

## 14. Review and Integration Procedure

For each proposed integration unit:

1. Identify its source branch or commits, base, task, acceptance criteria, changed scope, and review outcome.
2. Inspect the complete incoming diff and verify worktree ownership and documentation conformance.
3. Confirm backend producer evidence and UI consumer expectations agree.
4. Reject unresolved blocking findings or incomplete evidence; review approval does not replace integration testing.
5. Apply only the explicitly authorized Git operation.
6. Resolve conflicts by intent and contract semantics, not mechanically.
7. Verify navigation, state reconciliation, lifecycle behavior, errors, security, accessibility, and terminology across layers.
8. Run focused tests, then the complete applicable integration and release gates.
9. Return isolated defects to the owning worktree; materially changed fixes require renewed review.
10. Assemble a release candidate only when no release-blocking findings or required-gate failures remain.

Never merge unreviewed work or infer approval from silence.

## 15. Documentation Rules

- Treat the audit and five canonical documents listed by exact absolute path in the mandatory reading order as the shared authority for research, product, and engineering decisions.
- Never create a local audit, local canonical-document copies, or competing specifications in an implementation worktree.
- Update canonical documents only from the `devcrew-docs` worktree and only within authorized scope.
- Record and approve material product, architecture, contract, design, stack, deployment, or persistence changes before implementation.
- Keep AGENTS and Codex manuals operational; summarize constraints and link to authority instead of duplicating full specifications.
- Preserve shared terminology and lifecycle labels across UI, backend, review, documentation, and integration.
- If implementation and canonical documentation disagree, surface the discrepancy and correct the appropriate source through its owning workflow.

## 16. Prohibited Actions

Do not:

- Rewrite architecture or change the frozen stack without prior documentation approval.
- Implement large branch-owned features on `main` or bypass independent review.
- Invent requirements, contracts, data models, lifecycle states, workflows, or release claims.
- Add production authentication, durable databases, autonomous merge, or production deployment to the judged MVP without approval.
- Add a light theme or theme switcher to the hackathon MVP.
- Run arbitrary shell commands from user input or browser code.
- Expose secrets or sensitive configuration in any artifact.
- Import presentation code into backend modules or make client state authoritative.
- Remove shared assets, repeated worktree files, or working functionality without explicit authority.
- Modify canonical documentation from this worktree or create repository-specific copies.
- Hide failures with skipped checks, unsafe casts, disabled rules, or misleading reports.
- Perform unrelated cleanup, speculative refactors, destructive Git operations, or unauthorized publication.

## 17. Definition of Done

A main-worktree task is done only when:

- The authorized outcome and acceptance criteria are satisfied without unsupported scope.
- Worktree ownership, canonical requirements, architecture, and frozen MVP constraints are preserved.
- Incoming work has adequate independent review and all material post-review changes were re-reviewed.
- UI/backend contracts and complete affected journeys are compatible.
- Relevant automated and manual checks pass, with exact evidence recorded.
- Security, secret handling, accessibility, error, and lifecycle behavior are verified where applicable.
- The diff is minimal, cohesive, reviewable, and contains no unrelated user work, conflict markers, secrets, debug artifacts, or accidental generated files.
- Documentation remains consistent and any required canonical change went through `devcrew-docs` before implementation.
- `git diff` and `git status --short` have been reviewed.
- No blocking finding, required-gate failure, or undisclosed verification gap remains.

Release readiness additionally requires validation of the exact assembled candidate, the deterministic critical workflow in the authoritative local environment, applicable full gates, configuration, operational constraints, and residual risk.

## 18. Required Final Report

Use this structure:

### Outcome

State what was completed or the precise blocker. Do not overstate readiness.

### Files Changed

List every changed file and summarize its effect. Separate pre-existing worktree changes.

### Checks Run

List each exact command or manual check with `passed`, `failed`, or `not run`, plus relevant evidence.

### Remaining Risks

List unresolved risks, gaps, assumptions, deferred verification, or `None` when evidence supports that conclusion.

Never claim that tests passed, review approved, integration completed, or a release is ready without direct evidence.

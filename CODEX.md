# Codex Operating Manual: Devcrew UI

## 1. Purpose and Authority

This manual defines how Codex operates in the Devcrew UI worktree. It governs local execution discipline and ownership boundaries; it does not replace product requirements, architecture, design rules, delivery sequencing, or the backlog.

Authority flows from the canonical shared documents. When local guidance conflicts with them, stop, identify the conflict, and seek correction in the owning worktree before implementing affected behavior.

## 2. Worktree Role and Ownership Boundary

The expected identity is:

- Directory: `/Users/suniltulsiani/Desktop/devcrew-ui`
- Branch: `feat/ui-shell`
- Role: UI implementation owner

Devcrew is one Git repository with multiple complete worktrees. Repeated files are normal and must not be treated as redundant copies to remove.

This worktree owns the application shell, navigation, pages, components, design-system implementation, accessibility, responsive behavior, client workflow state, interactions, and all loading, empty, error, disabled, partial-data, and success presentation states.

It does not own authoritative authorization, domain lifecycle enforcement, persistence, backend contracts, server secrets, Codex or Git execution, server orchestration, canonical documentation, independent approval, or release integration.

## 3. Mandatory Reading Order

Read completely, in order, before changing files:

1. `AGENTS.md`
2. `CODEX.md`
3. `/Users/suniltulsiani/Desktop/Guildly-Reference/audit.md`
4. `/Users/suniltulsiani/Desktop/devcrew-docs/spec.md`
5. `/Users/suniltulsiani/Desktop/devcrew-docs/architecture.md`
6. `/Users/suniltulsiani/Desktop/devcrew-docs/design-system.md`
7. `/Users/suniltulsiani/Desktop/devcrew-docs/plan.md`
8. `/Users/suniltulsiani/Desktop/devcrew-docs/tasks.md`
9. Relevant implementation, configuration, test, and package files
10. The current task, acceptance criteria, and supplied evidence

For Next.js work, also read the relevant installed guide in `node_modules/next/dist/docs/` before coding. Treat installed documentation and deprecation notices as authoritative for the repository's framework version.

The audit is research input, not a screen specification or copy source. Guildly informs the calm, connected, typography-led design philosophy; Devcrew must remain its own product.

## 4. Repository and Worktree Inspection

Before planning:

1. Run `pwd`.
2. Run `git branch --show-current`.
3. Run `git status --short`.
4. Confirm the directory and branch match Section 2.
5. Inspect relevant files, package scripts, tests, and local instructions.
6. Identify pre-existing modifications and preserve them.
7. Compare the request with the canonical backlog, contracts, and worktree boundary.

If identity does not match, stop without editing. Do not assume that a clean status is available, and do not overwrite unrelated user work.

## 5. Task-Planning Procedure

For each task:

1. Restate the requested outcome and acceptance criteria.
2. Locate the governing requirements and design rules in the shared documents.
3. Confirm the task belongs to UI ownership.
4. Inspect the current implementation and version-specific framework guidance.
5. Identify contract dependencies, user states, accessibility requirements, tests, and integration risks.
6. Create the smallest coherent implementation plan.
7. Implement only the approved scope.
8. Validate proportionally to risk and record exact evidence.

Do not infer that a documented capability already exists. Inspect the code. Missing implementation is not evidence of permission to invent a contract or architecture.

## 6. Scope Control

- Keep presentation, interaction, and client-only workflow state in UI-owned modules.
- Treat backend responses as authoritative for server-owned state.
- Use mocked or deterministic data only where the approved MVP explicitly permits it, and never present simulated work as real execution.
- Do not change backend architecture, API implementation, orchestration, server adapters, or lifecycle truth from this worktree.
- Do not expand the hackathon slice into deferred platform features.
- Stop and coordinate when a request requires a contract, architecture, product-scope, or canonical documentation change.

Material cross-layer work must identify the affected contract, producer, consumer, migration impact, and required review before implementation proceeds.

## 7. Approved MVP Stack

The frozen stack is:

- Next.js App Router, React, strict TypeScript, Node.js runtime, and npm
- Tailwind CSS, shadcn/ui where useful, Lucide React, and restrained CSS transitions
- Zustand only when shared client state is genuinely required
- Next.js Route Handlers under `app/api`
- Zod validation and structured JSON errors
- Server-Sent Events for one-way activity updates
- Deterministic in-memory MVP stores behind replaceable interfaces
- Official OpenAI JavaScript/TypeScript SDK and OpenAI Responses API with structured outputs
- Controlled server-side Codex CLI and Git adapters with allowlists, timeouts, and redaction
- Local execution as the authoritative judged environment
- Optional Vercel presentation build that makes no false execution claims
- Dark-mode-only MVP presentation

Do not introduce undocumented frameworks, databases, queues, authentication providers, services, microservices, Redis, Kafka, Kubernetes, deployment systems, or other technology changes.

## 8. UI Engineering Rules

### Application and State

- Build with the App Router conventions installed in this repository.
- Keep Server and Client Component boundaries deliberate; add client execution only for real interaction needs.
- Preserve visible project, section, record, and lifecycle context across navigation.
- Use documented lifecycle labels and contract values consistently.
- Model loading, empty, error, retry, disabled, saving, unsaved, partial-data, stopped, completed, and success states where applicable.
- Preserve user input when recovery is safe and provide an actionable next step on failure.
- Avoid duplicate requests, fabricated progress, optimistic states that contradict server truth, and unbounded rendering.

### Design System

- Implement semantic tokens for color, typography, spacing, sizing, radius, elevation, motion, layout, focus, and status.
- Prefer shared primitives and composition over screenshot-specific markup or oversized variant-heavy components.
- Use warm charcoal and brown-influenced surfaces, softened white text, restrained orange emphasis, subtle borders, and minimal elevation.
- Use serif display typography sparingly, legible sans-serif for interface content, and monospace for technical values.
- Keep the interface calm, information-led, and consistent; do not clone Guildly layouts, components, or copy.
- Use Lucide icons to reinforce meaning, never as the sole carrier of essential information.
- Honor reduced motion and avoid decorative animation that delays content.
- Do not add a theme switcher or light mode during the hackathon MVP.

### Responsive Behavior

- Prioritize task completion and primary actions at every supported size.
- Adapt navigation and supporting detail without removing essential capability.
- Avoid horizontal scrolling except where the content structure genuinely requires it.
- Verify long content, zoom, text resizing, reflow, and narrow viewports.

## 9. Security and Secret Handling

- Never place secrets, API keys, tokens, credentials, or privileged configuration in client code, browser storage, URLs, rendered content, screenshots, fixtures, or logs.
- Never expose stored secret values after submission; client interfaces may use safe metadata only when the contract permits it.
- Never call OpenAI, Codex CLI, `child_process`, shell commands, or Git directly from browser code.
- Do not treat hidden controls, disabled buttons, or client checks as authorization.
- Render server errors safely and avoid leaking stack traces, internal paths, commands, prompts, or sensitive payloads.
- Redact sensitive material from test evidence and completion reports.
- Report suspected exposure immediately and do not propagate the value while diagnosing it.

Production authentication is deferred for the judged MVP. This does not weaken server ownership of validation, project boundaries, secret access, or lifecycle enforcement.

## 10. Contract and API Discipline

- Consume documented backend inputs, outputs, errors, pagination, authorization expectations, and lifecycle effects.
- Do not redefine contract fields, status meanings, identifiers, errors, or transition rules in UI code.
- Centralize consumer types and adapters according to the established codebase pattern.
- Validate assumptions against producer evidence; strict TypeScript types alone do not prove runtime compatibility.
- Handle documented success and failure responses, cancellation, retry, delayed updates, and partial data.
- Treat Server-Sent Events as ordered one-way updates and follow the documented reconnect and recovery behavior.
- Coordinate breaking changes before either producer or consumer depends on them.
- Preserve terminology across UI copy, backend contracts, activity, review evidence, and documentation.

## 11. Testing and Validation

Run the checks supported by the repository and relevant to the change. The expected release evidence includes:

- ESLint
- Strict TypeScript checking
- Focused unit, component, and contract-consumer tests
- Next.js production build
- Manual critical-flow verification in the local environment
- Manual responsive and state verification
- Accessibility verification

Test successful, loading, empty, error, retry, disabled, partial-data, long-content, and boundary behavior where applicable. For contract-dependent work, verify both the UI consumer assumption and the available backend producer evidence.

Never suppress a failing gate to obtain a pass. Report missing scripts or unavailable environments as unverified gaps. A prior pass, another worktree's pass, or a clean build does not prove unaffected checks passed.

## 12. Accessibility Requirements

Target WCAG 2.2 Level AA for every user-facing workflow.

- Use semantic HTML, landmarks, logical headings, native controls, and established interaction patterns.
- Provide meaningful labels, names, descriptions, and alternatives for non-text content.
- Support complete keyboard operation with logical order and visible focus.
- Manage focus for navigation, dialogs, menus, validation, and dynamically inserted content.
- Communicate status, errors, validation, and asynchronous changes to assistive technology at an appropriate urgency.
- Meet applicable contrast requirements for text, controls, icons, focus, and every interaction state.
- Never rely on color, motion, placement, or iconography alone to convey state.
- Support zoom, reflow, long content, target sizes, and reduced-motion preferences without lost function.

Automated accessibility checks supplement, but do not replace, manual keyboard and assistive-technology-oriented review.

## 13. Git and Worktree Safety

- Remember that all Devcrew worktrees share one repository and history.
- Inspect status before and after work; preserve unrelated modifications.
- Never delete a file because another worktree contains the same path.
- Never use destructive reset, restore, clean, or checkout operations without explicit approval.
- Never force-push or rewrite published history.
- Never stage unrelated changes.
- Never stage or commit unless the user explicitly requests it.
- Do not merge, rebase, cherry-pick, move work between worktrees, or alter worktree configuration unless explicitly authorized.
- Verify the exact diff before reporting completion.

## 14. Review and Integration Procedure

1. Implement bounded UI work on `feat/ui-shell` against approved requirements and contracts.
2. Run applicable static, automated, manual, responsive, and accessibility checks.
3. Report changed scope, evidence, known gaps, and contract dependencies.
4. Submit the change for independent review in `devcrew-review`.
5. Address findings in the owning worktree and re-run affected checks.
6. Reopen review after any material correction.
7. Advance only independently approved work to `devcrew` for integration.
8. Let the integration owner reconcile combined behavior and run end-to-end release gates.

Review approval is evidence, not a substitute for integration testing. Do not self-approve, silently fix work in the review worktree, or claim merge readiness without the required record.

## 15. Documentation Rules

- Treat all six absolute shared paths in Section 3 as authoritative.
- Never create local copies of the shared audit, specification, architecture, design system, plan, or backlog.
- Update canonical documents only from the `devcrew-docs` worktree.
- Record material architecture changes before implementing dependent code.
- Route product scope, contract, architecture, design-language, milestone, and backlog changes to their canonical owner.
- Keep local guidance concise and link to shared authority instead of duplicating full specifications.
- Keep terminology and lifecycle language consistent across every worktree.
- If implementation and documentation disagree, verify the discrepancy and correct the appropriate source through review; do not silently choose one.

## 16. Prohibited Actions

Codex must not:

- Implement authoritative authorization or server business rules in the UI
- Expose server credentials or sensitive values
- Execute shell or Git commands in browser code
- Redefine backend contracts or lifecycle truth
- Modify backend architecture, services, API implementation, or orchestration from this worktree
- Add light mode to the hackathon MVP
- Add unapproved production authentication, durable persistence, autonomous merge, or production deployment
- Introduce undocumented technology or infrastructure
- Fabricate activity, progress, execution, review, test, or success evidence
- Clone Guildly or treat its audit as a feature specification
- Create competing canonical documentation
- Modify files outside the requested scope
- Stage, commit, merge, or publish without explicit authorization

## 17. Definition of Done

UI work is done only when:

- The request and canonical acceptance criteria are satisfied within UI ownership.
- Implementation follows the approved stack, design system, contracts, and terminology.
- Required interaction states and responsive behavior are complete.
- Applicable WCAG 2.2 AA requirements are verified.
- Relevant lint, type, focused test, production build, and manual checks pass with recorded evidence.
- No secrets, contract violations, unrelated changes, or release-blocking findings remain.
- Canonical documentation impact has been assessed and routed to `devcrew-docs` when needed.
- Independent review and integration requirements are clearly stated; they are not presumed complete.

If any condition is missing, report the work as partial or unverified rather than complete.

## 18. Required Final Report

Use this structure:

### Outcome

A concise statement of what was completed or why work stopped.

### Files Changed

List each changed file and its purpose. State explicitly when no files changed.

### Checks Run

For each command or manual check, report the exact scope and result. Distinguish passed, failed, and not run.

### Remaining Risks

List unverified behavior, missing evidence, contract dependencies, documentation follow-up, review needs, and integration risks. State `None identified` only when supported by evidence.

### Git State

Report the worktree path, branch, concise status, and whether anything was staged or committed. Never claim approval, merge readiness, or completion beyond the evidence shown.

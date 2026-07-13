# DevCrew Review Manual

## Repository Purpose

This worktree is DevCrew's final quality gate. It exists only to review, verify, and report on proposed changes before merge. Its outputs are findings, verification evidence, merge-readiness decisions, and explicitly authorized, narrowly scoped review fixes.

This is not a feature-development repository. Review depth takes priority over speed or approval pressure.

Every DevCrew repository shares one canonical audit: `Guildly-Reference/audit.md`. Read and update that file only when the task explicitly requires an audit update. Never create a repository-specific audit file.

## Review Philosophy

- Verify behavior; do not infer correctness from a plausible diff.
- Review the change in its repository and product context, not as isolated lines.
- Treat missing evidence as unverified, not as passing.
- Prefer reproducible findings with file, line, impact, and verification details.
- Separate blocking defects from non-blocking improvements.
- Preserve implementation ownership: never silently change code.
- Approval means all applicable gates passed and residual risk is stated.

## Required Reading Order

Before reviewing, read in this order:

1. `AGENTS.md` and repository-level instructions.
2. `CLAUDE.md`.
3. `Guildly-Reference/audit.md`, the canonical audit shared by every repository.
4. Every file under `docs/`.
5. Every file under `prompts/`.
6. The task, acceptance criteria, linked decisions, and proposed diff.
7. For Next.js changes, the relevant guide in `node_modules/next/dist/docs/`, including deprecation and breaking-change notices.

If required material is absent, inaccessible, contradictory, or stale, record that limitation before continuing. Do not invent missing requirements or create a local audit substitute.

## Review Workflow

1. Establish scope from the task, acceptance criteria, base branch, and changed files.
2. Read required context and identify affected user journeys, interfaces, and risks.
3. Inspect repository state and distinguish pre-existing changes from review-scope changes.
4. Trace each changed path through callers, consumers, data flow, failure paths, and documentation.
5. Apply every relevant checklist below.
6. Run the repository's prescribed static checks, tests, and build without weakening them.
7. Manually verify affected behavior in a production-representative environment.
8. Test relevant negative paths, boundaries, responsive states, and regressions.
9. Report findings by severity with evidence and reproduction steps.
10. Re-run affected gates after any explicitly authorized review fix.
11. Issue a merge-readiness decision: approved, changes required, or blocked by missing evidence.

## Repository Inspection Process

- Start with `git status --short`, then inspect branch, base, and complete diff.
- Inventory relevant source, tests, configuration, migrations, assets, docs, and generated files.
- Check package scripts and lockfiles before selecting commands.
- Use `rg` to trace symbols, routes, schemas, environment variables, and duplicated behavior.
- Inspect surrounding code and repository conventions, not only changed hunks.
- Confirm dependency and configuration changes are intentional and minimal.
- Identify untracked, generated, unrelated, or pre-existing changes; do not overwrite them.
- For framework-sensitive work, verify behavior against the installed version's local documentation.
- Record commands run, results, manual test conditions, and any unverified areas.

## Code Review Checklist

- Acceptance criteria map to observable behavior and tests.
- Logic is correct for normal, empty, boundary, error, retry, and concurrent paths.
- Types, validation, null handling, and error handling are explicit.
- APIs and shared contracts remain compatible or have an approved migration path.
- Tests exercise behavior and failure modes rather than implementation details alone.
- No dead code, accidental duplication, debug output, hidden fallback, or unrelated churn exists.
- Naming, structure, and comments communicate intent without unnecessary complexity.
- Framework APIs match the installed version and contain no ignored deprecations.

## Architecture Review Checklist

- The change respects documented boundaries, ownership, and dependency direction.
- New coupling, global state, or cross-layer leakage is justified.
- Data flow, lifecycle, caching, rendering, and failure ownership are clear.
- Public interfaces remain stable or versioned deliberately.
- The solution fits existing patterns without rewriting architecture.
- Operational behavior, rollback, migrations, and backward compatibility are addressed.
- Scope is the smallest coherent change that satisfies approved requirements.

## UI Review Checklist

- Manually verify each affected journey at relevant viewport sizes.
- Compare loading, empty, success, error, disabled, and partial-data states.
- Confirm layout, hierarchy, typography, spacing, color, and interaction consistency.
- Verify keyboard, pointer, touch, focus, navigation, refresh, and back-button behavior.
- Check long content, localization pressure, zoom, dark mode, and slow-network behavior where applicable.
- Ensure feedback is timely, actionable, and does not expose internal errors.
- Confirm there is no unintended redesign or new functionality.

## Backend Review Checklist

- Authentication, authorization, tenancy, and ownership checks occur server-side.
- Inputs are validated at trust boundaries; outputs and errors follow documented contracts.
- Database operations preserve integrity, idempotency, ordering, and transaction safety.
- Timeouts, retries, rate limits, pagination, and partial failures are handled deliberately.
- Logs and metrics are useful without leaking secrets or personal data.
- Migrations are compatible, reversible where required, and safe for existing data.
- External calls are bounded, authenticated, observable, and testable.

## Documentation Review Checklist

- User-visible behavior, setup, interfaces, and operational changes are documented.
- Commands, paths, examples, and version claims are accurate and reproducible.
- Documentation matches implemented behavior and current repository terminology.
- Decisions and limitations are explicit; stale guidance is removed within scope.
- The canonical audit remains `Guildly-Reference/audit.md`; no repository-specific audit is introduced.

## Accessibility Review Checklist

- Semantic structure, landmarks, headings, labels, and control names are correct.
- All functionality is keyboard accessible with visible, logical focus.
- Dialogs, menus, errors, live updates, and route changes communicate state correctly.
- Color contrast, non-color cues, zoom, reflow, motion preferences, and target sizes are acceptable.
- Images have appropriate alternatives; decorative media is ignored by assistive technology.
- Automated checks supplement, but never replace, manual keyboard and screen-reader-oriented inspection.

## Security Review Checklist

- Trust boundaries, threat surface, and abuse cases introduced by the change are identified.
- Authorization cannot be bypassed through direct requests or client-controlled state.
- Injection, XSS, CSRF, SSRF, path traversal, unsafe redirects, and insecure deserialization are considered where applicable.
- Secrets, tokens, personal data, and internal details do not enter source, logs, URLs, or client bundles.
- Cookies, headers, CORS, caching, uploads, and dependency changes use least privilege and safe defaults.
- Security failures deny safely and have tests or reproducible verification evidence.

## Performance Review Checklist

- Measure affected paths when performance could change; do not rely on intuition.
- Check render frequency, bundle and asset size, network waterfalls, caching, and hydration cost.
- Check query count, indexes, payload size, pagination, memory, CPU, and external-call latency.
- Avoid unbounded work, duplicate requests, blocking operations, and cache correctness regressions.
- Record the environment, baseline, result, and acceptable threshold for material claims.

## Regression Prevention

- Map every defect or risk to an automated test when practical.
- Preserve existing coverage and add focused tests for corrected failure paths.
- Run targeted checks first, then the full applicable lint, type, test, and build gates.
- Manually re-test the changed journey and adjacent high-risk journeys.
- Reinspect the final diff after verification for accidental files or scope growth.
- Never suppress, delete, skip, or weaken a failing gate to obtain approval.

## Git Discipline

- Inspect status before and after work; preserve user and pre-existing changes.
- Keep review fixes minimal, explicit, attributable, and within the approved scope.
- Never stage, commit, push, merge, rebase, force-update, or discard changes unless the user explicitly requests that exact action.
- Do not edit generated or lock files accidentally; explain intentional changes.
- Do not mix findings, cleanup, feature work, or unrelated formatting.
- Report only files changed during the current session and clearly distinguish them from pre-existing worktree changes.

## Communication Rules

- Lead with findings, ordered by severity and merge impact.
- For each finding, include location, observed behavior, expected behavior, impact, and reproduction or evidence.
- State commands run, results, manual verification performed, and environment used.
- State assumptions, residual risks, missing evidence, and unverified areas plainly.
- Never claim a check passed if it was not run successfully.
- Never hide code changes; identify every review fix and why it was necessary.
- If there are no findings, say so and still report verification coverage and remaining risk.

## Prohibited Actions

This repository must never:

- implement features;
- rewrite architecture;
- silently change code;
- introduce new functionality;
- approve unverified code;
- skip manual verification;
- bypass, disable, weaken, or misrepresent review gates;
- redesign pages or expand scope;
- create repository-specific audit files;
- fabricate evidence, results, requirements, or approval.

Small fixes, lint corrections, and missing tests are allowed only when explicitly authorized, necessary for approval, and not feature work. Disclose and fully re-verify every such change.

## Definition of Done

A review is done only when:

- required reading and repository inspection are complete;
- acceptance criteria and all applicable checklists have been evaluated;
- static checks, tests, and build gates pass without bypasses;
- affected behavior and relevant failure paths have been manually verified;
- security, accessibility, performance, architecture, documentation, and regression risks have evidence-backed dispositions;
- every finding is resolved, accepted by an authorized owner, or marked as merge-blocking;
- any review fix has been disclosed and re-verified;
- the final diff and worktree status contain no unexplained review-session changes;
- the report includes evidence, limitations, residual risk, and a clear merge-readiness decision.

If any required gate or manual verification is incomplete, the code is not approved.

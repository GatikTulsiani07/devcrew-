# Devcrew Backend Codex Operating Manual

## 1. Purpose and Authority

This is the permanent operating manual for Codex in the Devcrew backend worktree. It governs investigation, planning, implementation, validation, and handoff for backend and orchestration work.

Instruction precedence is:

1. System and platform safety requirements
2. The user's current explicit request
3. The nearest applicable `AGENTS.md`
4. The canonical shared audit and Devcrew documentation
5. This manual
6. Existing repository conventions that do not conflict with higher authority

The canonical documents define product scope, architecture, design language, delivery sequence, and backlog. This manual applies them to this worktree; it does not replace or redefine them. When requirements conflict or a material decision lacks authority, stop before the affected edit and report the exact conflict.

## 2. Current Worktree Role and Ownership Boundary

The required identity is:

- Directory: `/Users/suniltulsiani/Desktop/devcrew-backend`
- Branch: `feat/orchestrator`
- Role: backend and orchestration owner

Devcrew is one Git repository with multiple worktrees and branches. Repeated project files across worktrees are normal and must not be treated as duplicates to remove.

This worktree owns:

- Next.js Route Handlers under `app/api`
- Boundary validation and structured errors
- Application and domain behavior
- Agent, work, activity, and review lifecycle enforcement
- Deterministic in-memory persistence behind replaceable store interfaces
- Official OpenAI SDK and Responses API integration
- Controlled server-side Codex CLI and Git adapters
- Server-Sent Events for activity updates
- Server-side configuration, secrets, redaction, and operational evidence
- Backend contracts and focused backend verification

It does not own pages, components, navigation, layout, visual styling, branding, client-only interaction, or canonical platform documentation. Route Handler files are the narrow backend-owned exception inside the App Router. Do not import presentation code into backend modules or make presentation files a shortcut for backend demonstrations.

## 3. Mandatory Reading Order

Before planning or modifying files, read completely in this exact order:

1. `AGENTS.md`
2. `CODEX.md`
3. `/Users/suniltulsiani/Desktop/Guildly-Reference/audit.md`
4. `/Users/suniltulsiani/Desktop/devcrew-docs/spec.md`
5. `/Users/suniltulsiani/Desktop/devcrew-docs/architecture.md`
6. `/Users/suniltulsiani/Desktop/devcrew-docs/design-system.md`
7. `/Users/suniltulsiani/Desktop/devcrew-docs/plan.md`
8. `/Users/suniltulsiani/Desktop/devcrew-docs/tasks.md`
9. Relevant implementation files, tests, configuration, package scripts, and installed framework guidance
10. The current task again

Do not substitute memory, summaries, or worktree-local copies. The audit is research input; the five files in `/Users/suniltulsiani/Desktop/devcrew-docs` are the canonical platform documents. If a required source is unavailable, establish whether the task can proceed conservatively; stop when the missing source contains authority needed for the change.

## 4. Repository and Worktree Inspection Procedure

Before editing:

1. Run `pwd` and confirm the exact backend directory.
2. Run `git branch --show-current` and confirm `feat/orchestrator`.
3. Run `git status --short` and record all pre-existing changes.
4. Use `rg --files` and `rg` to locate relevant instructions, routes, services, stores, adapters, schemas, tests, configuration, and consumers.
5. Inspect the target files and their current diff before changing them.
6. Search every call site before changing a shared type, schema, lifecycle, error, or contract.
7. Inspect package scripts, lockfiles, compiler settings, and installed versions rather than assuming tool behavior.
8. For version-sensitive Next.js work, read the relevant guide under `node_modules/next/dist/docs/` and heed deprecations before implementation.

If the path or branch does not match, stop without editing. A dirty worktree is user-owned state: preserve unrelated modifications and distinguish pre-existing failures from results introduced by the task.

## 5. Task-Planning Procedure

For each task:

1. Restate the requested outcome and acceptance criteria.
2. Map the request to the canonical specification, architecture, plan, and backlog item when applicable.
3. Identify affected contracts, lifecycle states, trust boundaries, consumers, and worktree owners.
4. Separate required work from optional cleanup and deferred post-MVP work.
5. Choose the smallest coherent implementation that completes the approved scope.
6. Define validation before editing: focused tests, type checking, lint, build, manual flow, security review, or contract checks as appropriate.
7. Surface any required documentation or cross-worktree coordination before dependent implementation.

Do not introduce speculative abstractions, dependencies, infrastructure, or refactors. Material architecture decisions must be documented and approved in the documentation worktree before implementation.

## 6. Scope-Control Rules

- Work only within backend and orchestration ownership.
- Keep transport, domain behavior, persistence, AI, execution, and Git concerns separated by explicit boundaries.
- Implement only approved hackathon scope or a clearly authorized post-MVP task.
- Preserve the single deterministic vertical slice: connect prepared repository, submit task, Manager plan, human approval, Full Stack Developer result, DevOps validation, Reviewer verdict, visible activity and result.
- Do not make the backend authoritative for presentation decisions or make the browser authoritative for server behavior.
- Do not redefine shared terminology, statuses, or contracts independently.
- Report UI, review, integration, or documentation dependencies to their owner instead of editing across boundaries.
- Never delete files because matching paths exist in another worktree.

## 7. Approved MVP Stack Summary

The frozen stack is:

- Next.js App Router, React, strict TypeScript, Node.js runtime, and npm
- Tailwind CSS, shadcn/ui where useful, and Lucide React for UI-owned implementation
- Next.js Route Handlers under `app/api`
- Zod validation
- Server-Sent Events for one-way activity updates
- Structured JSON errors
- Official OpenAI JavaScript/TypeScript SDK
- OpenAI Responses API with structured outputs
- Fixed Manager, Full Stack Developer, DevOps Engineer, and Reviewer roles
- Controlled server-side Codex CLI and Git adapters using allowlists, timeouts, and redaction
- Deterministic in-memory persistence behind replaceable store interfaces
- Local environment as the authoritative judged environment
- Optional Vercel presentation build that does not claim local execution capability
- Dark-mode-only hackathon MVP

Do not add frameworks, databases, durable stores, queues, microservices, authentication providers, Redis, Kafka, Kubernetes, deployment systems, or other technology without a prior approved canonical documentation change.

## 8. Backend Engineering Rules

Use this dependency direction unless the canonical architecture establishes a more specific one:

`Route Handler -> application service -> domain/store port -> controlled adapter`

- Keep Route Handlers thin: parse input, validate, call a service, and map stable results or errors.
- Keep reusable business and lifecycle rules out of transport code.
- Keep domain and application logic independent of React and HTTP request objects.
- Use strict TypeScript; accept untrusted values as `unknown` and narrow them with Zod at boundaries.
- Model lifecycle states explicitly and reject invalid transitions deterministically.
- Keep state changes and attributable activity events consistent.
- Make retry, stop, cancellation, and partial-failure behavior explicit and safe from silent duplicate effects.
- Keep stores deterministic, project-scoped, bounded, and replaceable. Do not imply durability across process restarts.
- Keep vendor SDK shapes and subprocess details behind narrow adapters.
- Use Server-Sent Events only for the approved one-way update flow; define ordering, disconnect, cleanup, and recovery behavior.
- Use server-only Node `child_process` only inside controlled adapters. Never provide general shell execution.
- Allowlist commands, arguments, repository roots, and Git operations; impose timeouts and bounded output; redact before logging or returning data.
- Restrict Git behavior to worktree-safe operations required by the approved flow. No autonomous merge, commit, push, deployment, or destructive history operation.
- Keep module initialization free from unexpected I/O and unbounded mutable state.

## 9. Security and Secret-Handling Rules

- Treat every request, path, repository URL, model output, subprocess result, environment value, and external response as untrusted.
- Validate at the server boundary and fail closed for project, execution, repository, and secret access.
- Keep OpenAI credentials and all other secrets in server-side environment configuration.
- Never expose secrets in browser bundles, `NEXT_PUBLIC_` values, responses, URLs, activity, review evidence, screenshots, errors, or logs.
- Never log authorization headers, cookies, tokens, raw environment objects, private keys, or full sensitive payloads.
- Redact command input and output before persistence, logging, streaming, or response mapping.
- Prevent command injection by using fixed executables, argument arrays, allowlists, and validated paths; do not interpolate untrusted text into a shell command.
- Prevent path traversal and repository escape by resolving and verifying allowed roots.
- Bound input sizes, output sizes, execution time, concurrency, retries, and in-memory collection growth.
- Return safe, stable error information without stack traces, filesystem paths, SDK payloads, or secret-bearing context.
- Production authentication is deferred for the judged MVP. Do not invent it; still enforce the documented local identity and project boundaries server-side.

## 10. Contract and API Discipline

Treat every backend contract as shared behavior consumed by UI and verified by review and integration.

- Define request inputs, response outputs, status codes, structured error codes, lifecycle effects, ordering, and recovery behavior.
- Use one authoritative schema or type definition where practical; do not create competing shapes.
- Validate path parameters, query parameters, headers, and bodies with Zod.
- Return only documented fields. Never serialize raw errors, SDK responses, store records, or subprocess results directly.
- Keep errors stable, machine-readable, actionable, and non-sensitive.
- Use accurate HTTP status codes and never return a success status for an error outcome.
- Preserve project, work item, agent, execution, and correlation identifiers through lifecycle and activity flows.
- Define deterministic ordering and bounded collection behavior.
- Search producer and consumer usage before changing a contract.
- Coordinate breaking changes across backend, UI, review, integration, and canonical documentation before implementation; provide an explicit migration path.
- Do not claim a capability is implemented merely because it is described in the canonical documents.

## 11. Testing and Validation Requirements

Validation must be proportional to risk and based on actual commands run.

For behavior changes, cover as applicable:

- Successful behavior and expected failure
- Boundary and malformed inputs
- Valid and invalid lifecycle transitions
- Project isolation and local identity boundaries
- Retry, stop, cancellation, ordering, and duplicate prevention
- In-memory store determinism and bounded behavior
- Structured error mapping and secret redaction
- OpenAI, Codex CLI, Git, and SSE adapter boundaries without production mutations
- Contract compatibility with consumers

Before handoff, run the strongest relevant available checks:

1. Focused automated tests
2. Broader affected regression tests
3. ESLint
4. TypeScript checking
5. Next.js production build for framework, route, runtime, or bundling changes
6. Manual verification of the affected critical-flow segment
7. Security and secret-exposure review
8. `git diff --check`

Use repository scripts. Keep tests deterministic by controlling time, identifiers, model responses, subprocesses, filesystem effects, and external I/O. Never call production services merely to prove a test. Do not weaken tests, types, lint, or security controls to obtain a pass. Report skipped, unavailable, or failing checks precisely.

Documentation-only changes require content, Markdown, link/path, scope, final-diff, and whitespace validation; application builds are unnecessary unless executable configuration changes.

## 12. Accessibility Requirements

The UI worktree owns interface accessibility, but backend contracts must enable WCAG 2.2 Level AA user experiences:

- Provide clear status labels and structured state; never require color or animation to infer meaning.
- Return field-level validation and recovery information when safe and useful.
- Make asynchronous lifecycle and SSE events understandable, ordered, and suitable for accessible announcements without flooding consumers.
- Preserve stable identifiers and semantics for focus recovery and error association.
- Do not simulate progress or success; expose authoritative loading, empty, stopped, failed, retrying, completed, and review states.

When a backend change affects accessible behavior, identify the UI contract impact and include it in review evidence. Do not implement presentation fixes in this worktree.

## 13. Git and Worktree Safety

- Inspect `git status --short` before and after work.
- Modify only files required by the current task.
- Preserve all pre-existing and unrelated user changes.
- Never use `git reset --hard`, forced checkout, or another destructive recovery command without explicit approval.
- Never force-push or rewrite published history.
- Never stage unrelated changes.
- Do not stage, commit, amend, merge, push, or deploy unless the user explicitly requests the specific action.
- Do not perform autonomous merges or deployments.
- Do not bypass hooks or checks without explicit approval and a recorded reason.
- Use non-interactive, worktree-safe Git operations and inspect the final diff.
- Treat repeated files in sibling worktrees as expected checkouts of the same repository, not cleanup candidates.

## 14. Review and Integration Procedure

1. Backend work begins from approved requirements, contracts, and acceptance criteria.
2. Implement and validate the bounded change in `devcrew-backend`.
3. Record affected contracts, verification evidence, known risks, and dependent UI behavior.
4. Submit the change to the independent review owner in `devcrew-review`.
5. Address findings in the owning backend worktree; the reviewer must not silently fix product code.
6. Re-run affected verification after every material correction.
7. Only evidence-backed approved work advances to the `devcrew` main integration worktree.
8. Integration reconciles cross-layer behavior and runs combined validation. Failures return to the responsible owner and reopen affected review scope.

Review approval does not replace integration testing. Main integration does not override unresolved findings or canonical documentation.

## 15. Documentation Update Rules

- Treat `/Users/suniltulsiani/Desktop/Guildly-Reference/audit.md` as the canonical shared research audit.
- Treat `/Users/suniltulsiani/Desktop/devcrew-docs/spec.md`, `/Users/suniltulsiani/Desktop/devcrew-docs/architecture.md`, `/Users/suniltulsiani/Desktop/devcrew-docs/design-system.md`, `/Users/suniltulsiani/Desktop/devcrew-docs/plan.md`, and `/Users/suniltulsiani/Desktop/devcrew-docs/tasks.md` as authoritative platform documentation.
- Never create copies of these sources in an implementation worktree.
- Propose and update canonical platform documents only from `/Users/suniltulsiani/Desktop/devcrew-docs` on its documentation branch.
- Record material product, architecture, contract, lifecycle, stack, security, or deployment changes before implementing dependent code.
- Preserve terminology and state meanings across backend, UI, review, integration, and documentation work.
- Worktree manuals may document local commands and ownership but must not duplicate full specifications.
- When code and canonical documentation disagree, verify the discrepancy, report it, and correct the proper source through its owning worktree.

## 16. Prohibited Actions

Codex must not:

- Skip worktree identity checks or mandatory reading
- Build UI features, visual layouts, branding, or theme variants in this worktree
- Add production authentication, durable databases, queues, services, or deployment infrastructure without approved documentation
- Add autonomous merge, commit, push, pull-request, or deployment behavior
- Execute browser-side shell or Git commands
- Execute arbitrary, unvalidated, unbounded, or secret-bearing shell commands
- Put secrets in source, client code, logs, activity, errors, reviews, or documentation
- Trust client validation, authorization, lifecycle state, repository paths, or AI output
- Put reusable business logic in Route Handlers
- Import presentation code into backend modules
- Expose internal store, SDK, subprocess, filesystem, or error details through contracts
- Introduce undocumented technologies or competing architectural patterns
- Modify canonical platform documents outside their documentation worktree
- Create local copies of canonical documents or the shared audit
- Delete repeated worktree files as presumed duplicates
- Weaken checks or claim unperformed validation
- Stage or commit without explicit instruction
- Modify unrelated files or overwrite user-owned changes

## 17. Definition of Done

A backend task is done only when all applicable conditions are evidenced:

- Worktree identity and pre-existing status were inspected.
- Mandatory sources and relevant implementation guidance were read.
- The task maps to approved requirements and stays within backend ownership.
- Contracts and lifecycle effects are explicit, stable, validated, and coordinated.
- Domain behavior is separated from transport and controlled adapters.
- State, activity, retry, stop, and failure behavior are deterministic and safe.
- Secrets, paths, commands, model output, and errors respect server trust boundaries.
- Focused tests and applicable lint, type, build, manual-flow, security, and diff checks pass.
- Independent review and integration needs are identified; approval is not assumed.
- No unrelated file was changed, staged, deleted, or overwritten.
- Required canonical documentation impact was resolved through the documentation worktree.
- Remaining risks and unrun checks are reported truthfully.

If any applicable condition is missing, report the precise gap instead of declaring completion.

## 18. Required Final Report Format

Lead with the outcome, then report:

### Files changed

- Each changed file and its purpose

### Checks run

- Exact command or manual check
- Pass, fail, or not run
- Relevant result and cause of any failure

### Contract and architecture impact

- Affected API, lifecycle, security, persistence, execution, or consumer behavior
- Canonical documentation impact and coordination required

### Remaining risks and follow-up

- Known limitations, unverified behavior, pre-existing failures, and the owning worktree

Never state that work is complete, reviewed, merged, deployed, or passing without direct evidence.

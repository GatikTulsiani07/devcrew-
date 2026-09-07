# Devcrew

Devcrew contains the current Next.js UI from `main` and a standalone Hono
backend under `src/`. The UI consumes HTTP JSON contracts; the backend owns
server behavior, validation, database access, and stable API errors.

## Activity Persistence Invariants

Activity evidence is generated and owned by the backend. The Activity store
validates every event before mutating project state or notifying subscribers.

- Event IDs are valid, server-generated, and unique within project-local
  Activity state.
- Sequence values are contiguous and server-authoritative within each project.
- `createdAt` timestamps use the canonical server representation; malformed or
  non-canonical values are rejected.
- Summaries are nonblank and bounded.
- Event types come from the authoritative runtime Activity taxonomy.

Rejected Activity events do not consume sequence values, append or evict
history, or notify subscribers.

## Local Setup

Install dependencies:

```bash
npm install
```

Copy `.env.example` to `.env.local` for backend runtime values when using the
Hono service. `DATABASE_URL` is used at runtime, `DIRECT_URL` is used by Drizzle
inspection/generation, and `PORT` defaults to `3001`.

## Commands

- `npm run dev:ui` starts the Next.js UI.
- `npm run dev:backend` starts the Hono backend.
- `npm run test` runs backend and UI tests.
- `npm run lint` runs ESLint.
- `npm run typecheck` runs TypeScript checks.
- `npm run build` builds the backend and UI.
- `npm run db:check` checks Drizzle configuration.

`npm run db:generate` generates migration artifacts for approved schema changes;
it does not apply migrations.

# Devcrew

Devcrew contains the current Next.js UI from `main` and a standalone Hono
backend under `src/`. The UI consumes HTTP JSON contracts; the backend owns
server behavior, validation, database access, and stable API errors.

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

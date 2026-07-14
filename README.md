# Devcrew Backend

Devcrew's backend is a standalone Hono service using TypeScript, Zod, Drizzle
ORM, and Postgres.js. It exposes HTTP contracts for the separate browser UI and
is the only application permitted to access Supabase PostgreSQL.

## Local configuration

Copy `.env.example` to `.env.local` and provide the required local values.
Runtime database access uses `DATABASE_URL`; Drizzle inspection and generation
use `DIRECT_URL`. `PORT` is optional and defaults to `3001`.

## Commands

```bash
npm install
npm run dev
npm test
npm run typecheck
npm run lint
npm run build
npm start
npm run db:check
```

`npm run db:generate` generates migration artifacts for approved schema changes.
It does not apply migrations. Sprint 1 intentionally has no product tables.

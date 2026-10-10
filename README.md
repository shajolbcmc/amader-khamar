# আমাদের খামার — Dynamic Farm Software v1.3 (Vercel + Neon)

এই v1.3 হলো **v1.2 original Bengali UI preserved**, database-only migration to **PostgreSQL / Neon**, Node.js serverless-ready API and one-time SQLite migration toolkit. User interface sources (`src/components/*.jsx`, `src/components/Reference*.mjs`, `src/app/globals.css`) are not modified from the v1.2 ZIP.

**সম্পূর্ণ বাংলায় Vercel/Neon নির্দেশনা: [VERCEL-DEPLOY-BANGLA.md](./VERCEL-DEPLOY-BANGLA.md)**

## Features

- Users/passwords (scrypt), persistent database sessions, admin/staff access
- Configurable Beds, Slots, manure Lots, lot maturity/approval, staggered Batches, Care Logs, Harvests
- Products, packaging, stock movements, public orders & admin order statuses
- Expenses, reports, tasks, blog, knowledge, contact inquiries, farm settings and audit log
- ACID PostgreSQL transactions, advisory-lock serialization for competing writes to order/batch/stock inventory
- One-time v1.2 SQLite migrator with dry-run, schema-first provisioning, row-count validation and fail-on-nonempty safeguards

## Quick start for a **brand new** farm

```powershell
Copy-Item .env.example .env.local
# Set Neon pooled DATABASE_URL and a real ADMIN_EMAIL & ADMIN_PASSWORD in .env.local
npm install
npm run db:init
npm run db:check
npm test
npm run build
npm run dev
```

Existing users / SQLite? **Do not run db:init first.** Read the deployment guide and run:

```powershell
npm run db:migrate:sqlite -- --source "C:\path\to\old\farm.sqlite"
npm run db:migrate:sqlite -- --source "C:\path\to\old\farm.sqlite" --apply
```

## Important files

| File | Purpose |
|------|---------|
| `sql/schema.sql` | PostgreSQL tables, constraints, partial unique active batch index |
| `src/lib/database.mjs` | pg pool, prepared parameters, async DB operations, interactive transactions |
| `src/lib/service.mjs` | Validation, bed/slot/lot/batch/stock/order rules |
| `src/lib/auth.mjs` | Salted scrypt and PostgreSQL-backed sessions |
| `scripts/init.mjs` | Schema + default template + initial admin |
| `scripts/migrate-sqlite.mjs` | Safe SQLite to Neon migration |
| `tests/farm-domain.test.mjs` | Local domain regression suite |
| `tests/sqlite-export.test.mjs` | Offline read-only migration dry run |
| `tests/postgres-integration.test.mjs` | Optional LIVE disposable test branch integration |
| `design/reference-original.html` | Supplied visual reference preserved |

### Configuration

`DATABASE_URL` (secret, server-side only): Neon pooled URL with `sslmode=require`.
`ADMIN_EMAIL` & `ADMIN_PASSWORD`: only needed locally when running `npm run db:init` (no password env var required by live application).
`FARM_NAME`: optional first-run site name.

### Deployment reality check

Do not use the SQLite file on Vercel; serverless storage is ephemeral. Existing SQLite history stays on your PC unless migrated. This ZIP does NOT include your real `farm.sqlite` or your Neon credentials. A live Neon connection is required to finish setup, run database integration tests, and verify deployment. Do not expose DB URLs via `NEXT_PUBLIC_*` variables.

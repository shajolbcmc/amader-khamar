# Vercel + Neon v1.3 Acceptance Checklist

- [x] Public reference JSX/template and Admin styling files are unchanged from v1.2 (SHA-256 comparison).
- [x] `node --check` parsing for database, auth, service, API, scripts.
- [x] Async service domain behavior tested offline with v1.2 SQLite fixture adapter.
- [x] SQLite migration dry-run tested against populated SQLite fixture without changing original bytes.
- [x] Transaction logic has per-transaction client binding and `pg_advisory_xact_lock`.
- [x] PostgreSQL schema covers all 18 migration tables plus sessions.
- [ ] Live Neon/PostgreSQL integration test on disposable test branch (**not run in offline environment**).
- [ ] `npm install` and `npm run build` with network access (npm unavailable in this environment).
- [ ] Vercel deployed site in browser, mobile responsive and exact pixel compare.
- [ ] Test owner's actual v1.2 `farm.sqlite` migration and count matching.

## After publishing

- [ ] Correct Vercel Production `DATABASE_URL` variable (Neon pooled URL, SSL required).
- [ ] `GET /api/health` -> ok; existing bed count present.
- [ ] Login with existing (migrated) admin credentials, or new `db:init` admin.
- [ ] Create Bed > reload; Create Slot > reload; approve mature Lot; Start Batch.
- [ ] Care and Harvest; product pack; customer order; stock reservation; cancel release; Paid report.
- [ ] Review serverless rate limits, Neon backups, and secrets exposure.

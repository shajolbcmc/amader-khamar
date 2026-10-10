# v1.3 Serverless Architecture (UI unchanged)

Browser: v1.2 Bengali PublicSite / ReferenceHome / AdminPanel / LoginPage (same source)

-> Next.js 15 App Router (`/api/[...parts]`, Node runtime, no-store, Origin validation, role protection)

-> pg Pool (Neon pooled `DATABASE_URL`, max 3 warm-instance connections)

-> PostgreSQL database (Neon, persistent): users, hashed sessions, beds, slots, slot_lots, batches, batch_feed, care_logs, harvests, products, stock_movements, orders, order_items, expenses, tasks, posts, inquiries, settings and audit.

## Concurrency

A transaction acquires `pg_advisory_xact_lock(74181,98524)` before each inventory-sensitive mutation (lot receive/approve, batch start/harvest, packaging, adjustments, order placement/change, facility and post edits). All transaction SQL runs on the same `pg` client via `AsyncLocalStorage`. A singleton warm pool is scoped per serverless instance, not global across instances. PostgreSQL advisory locks operate across all instances connected to the same database, keeping these writes serialized.

The stock ledger `stock_movements` is the source of truth for available sellable quantities. `orders` reserve product stock, cancellation releases exactly once. A partial unique constraint prevents two active batches in one bed. Bed/slot archive and capacity checks protect current activity.

## Migration

One-time SQLite reader opens old source read-only. Dry-run prints counts. `--apply` creates the PG schema, requires an EMPTY Neon target, imports in FK-safe order using explicit IDs and batched INSERT, resets sequences, validates counts, and marks migrated date. Any SQL error rolls the data transaction back. The original SQLite file is not altered. Session cookies do not migrate. After import, missing defaults are seeded without overwriting existing records.

## Security notes

Passwords use salted scrypt hashes and are verified on the server. Session cookies are HttpOnly, SameSite=Lax and Secure over HTTPS. Credential rotation and expiry live in PostgreSQL. Client code uses public endpoints only; connection string is not bundled in UI. Rate-limiter map in the current source is per-instance, not a global serverless quota; add centralized protection for high traffic. Forms do not process online payments.

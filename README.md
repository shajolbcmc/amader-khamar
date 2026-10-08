# আমাদের খামার — v1.2 Original UI Design Restore

**এই সংস্করণে আপনার দেওয়া HTML/UI রেফারেন্সের মূল ডিজাইন ফিরিয়ে আনা হয়েছে।** ডাইনামিক অপারেশন, বেড/স্লট যোগ-বিয়োগ ও আগের সকল API সুরক্ষিত আছে। বিস্তারিত: [DESIGN-RESTORATION-BANGLA.md](DESIGN-RESTORATION-BANGLA.md)।

# আমাদের খামার — Dynamic Farm Management & Organic Fertilizer Shop

**Bangla-first, database-driven software**, based on the provided farm sitemap and a dynamically configurable staggered-production model (initially 8 beds and 5 slots).

This is an **editable Next.js + React + Tailwind project**, not an exported screenshot or static HTML demo. Operational records use a persistent local SQLite database. The UI follows the supplied earthy-green, Hind Siliguri, responsive design language.

## v1.1 — আগের ইন্সটলেশন আপডেট (ডেটা না হারিয়ে)

**নতুন ZIP পুরোনো অ্যাপের ওপর প্রয়োগ করলে ডেটাবেস পুনরায় তৈরি করার দরকার নেই।**

1. চলমান `npm run dev` অথবা `npm run start` **বন্ধ করুন** (`Ctrl+C`)। SQLite-এর WAL ফাইল থাকলে বন্ধ থাকা অবস্থায় পুরো `data` ফোল্ডার কপি করুন।
2. আগের প্রজেক্টের **`data` ফোল্ডার** (বিশেষ করে `farm.sqlite` এবং থাকলে `-wal`/`-shm`) ও **`.env.local`** আলাদা জায়গায় ব্যাকআপ রাখুন। আপনার `DATABASE_PATH` কাস্টম হলে সেই আসল ডেটাবেসটির ব্যাকআপ নিন।
3. নতুন ZIP আলাদা ফোল্ডারে Extract করুন। পুরোনো `data` ফোল্ডার ও `.env.local` নতুন `amader-khamar` ফোল্ডারে কপি করুন। **নতুন ZIP-এর ফাঁকা `data` ফোল্ডার দিয়ে পুরোনো ডেটাবেস মুছবেন না।**
4. নতুন ফোল্ডারে PowerShell-এ চালান: `npm install`, `npm test`, `npm run dev`। পুরোনো লগইন আগের মতোই থাকবে। **আগে Admin account থাকলে `npm run init` আবার চালাতে হবে না** (চালালে `.env.local`-এর পাসওয়ার্ড দিয়ে Admin password রিসেট হতে পারে)।
5. `/admin?view=beds` থেকে `নতুন বেড যোগ` এবং `/admin?view=slots` থেকে `নতুন স্লট যোগ` ব্যবহার করুন। পুরোনো ৮/৫ সংখ্যা আর স্থায়ী সীমা নয়।

**নিষ্ক্রিয় বনাম মোছা:** পুরোনো উৎপাদনের ইতিহাসযুক্ত বেড বা গোবর মজুতের ইতিহাসযুক্ত স্লট স্থায়ীভাবে মোছা যাবে না—নিষ্ক্রিয় করে পরে আবার চালু করা যায়। সক্রিয় ব্যাচযুক্ত বেড বা অবশিষ্ট গোবর আছে এমন স্লট নিষ্ক্রিয় করা যাবে না। যার কোনো ইতিহাস নেই, সেটি `মুছে ফেলুন` দিয়ে সত্যিই ডিলিট করা যায়।

**প্রস্তুত গোবর dropdown ফাঁকা থাকলে:** `স্লট`-এ গিয়ে আগে গোবর মজুতের তারিখ ও পরিমাণ যোগ করুন। সেটিংসে নির্ধারিত প্রি-কম্পোস্ট সময় শেষ হলে সরাসরি গোবর পরীক্ষা করে `অনুমোদন` দিন। এরপর `বেড` → `নতুন ব্যাচ`-এ ব্যাচ শুরু করার তারিখের আগে/সেদিন অনুমোদিত এমন অবশিষ্ট গোবরের লটই তালিকায় দেখাবে। অনুমোদন ব্যর্থ হলে সময়সীমা ও কারণ দেখাবে। যেকোনো পরীক্ষাহীন/অপরিপক্ব গোবর ব্যবহারের বাধা ইচ্ছাকৃতভাবে রাখা হয়েছে।

## দ্রুত চালু করুন — Windows PowerShell

**প্রয়োজন:** Node.js **22.13+**, npm, এবং প্রথমবার npm package ইনস্টল করার জন্য ইন্টারনেট।

1. ZIP ফাইলটি Extract করুন। `amader-khamar` ফোল্ডারে PowerShell খুলুন।
2. Environment ফাইল কপি করুন:

   ```powershell
   Copy-Item .env.example .env.local
   ```

3. `.env.local` ফাইলে `ADMIN_EMAIL` এবং `ADMIN_PASSWORD` পরিবর্তন করুন। পাসওয়ার্ড **কমপক্ষে ১২ অক্ষর**।
4. প্রথমবার প্যাকেজ ইনস্টল ও ডেটাবেস চালু করুন:

   ```powershell
   npm install
   npm run init
   npm run dev
   ```

5. ব্রাউজার খুলুন:
   - Public website: **http://localhost:3000**
   - Admin login: **http://localhost:3000/login**
   - Farm admin dashboard: **http://localhost:3000/admin**
   - API health check: **http://localhost:3000/api/health**

পরবর্তীবার শুধু `npm run dev` চালালেই হবে। Node 22-এর built-in `node:sqlite` এখনো experimental warning দেখাতে পারে—এই প্রকল্পে সেটি ইচ্ছাকৃতভাবে ব্যবহার করা হয়েছে যাতে আলাদা native SQLite npm package প্রয়োজন না হয়।

### প্রথম ব্যবহার: সঠিক ডেটা দেওয়ার ক্রম

1. **Settings** থেকে খামারের নাম, ঠিকানা, ফোন, ডেলিভারি চার্জ এবং চক্রের দিন সেট করুন।
2. **গোবর মজুত স্লট** এ গোবর জমার তারিখ, কেজি ও সংগ্রহ-খরচ লিখুন। ১৫ দিনের (ডিফল্ট) পূর্বপ্রস্তুতি ও বাস্তব যাচাই শেষে লট **Approve** করুন। এই সময়সীমা Settings-এ পরিবর্তনযোগ্য।
3. **বেড ম্যানেজমেন্ট** এ একটি খালি বেড ও অনুমোদিত স্লট লট বাছাই করে নতুন ব্যাচ শুরু করুন। একই বেডে একসাথে দুটি সক্রিয় ব্যাচ শুরু করা যাবে না।
4. **পরিচর্যা লগ**-এ পানি, আর্দ্রতা, তাপমাত্রা বা অন্যান্য কাজ রেকর্ড করুন।
5. কমপক্ষে ৪৫ দিনের চক্র শেষে বাস্তবে সার প্রস্তুত হলে **Harvest**-এ প্রকৃত কেজি লিখুন। বেড আবার খালি হবে এবং খোলা সার স্টকে যোগ হবে।
6. **Inventory** থেকে খোলা সার প্যাকেট বানান। প্যাকিংয়ের সময় খোলা সার কমে এবং প্যাকেট স্টক বাড়ে।
7. **Products** থেকে পণ্যের প্রকৃত মূল্য দিন এবং **Published** করুন। এরপর ক্রেতা পাবলিক ওয়েবসাইট থেকে অর্ডার দিতে পারবেন।
8. অর্ডার গ্রহণ, প্যাকিং, ডেলিভারি এবং পেমেন্টের অবস্থা **Orders**-এ আপডেট করুন। প্রকৃত টাকা আদায় হলে Paid করুন।
9. অন্যান্য ব্যয় **Expenses**-এ লিখুন। **Reports**-এ মাসিক আয়, ব্যয়, নিট হিসাব ও CSV পাওয়া যাবে।

> প্রথম চালুতে ৮টি বেড, ৫টি স্লট (পরে Admin থেকে সংখ্যা পরিবর্তনযোগ্য) এবং কিছু **unpublished product draft** থাকবে। কোনো কাল্পনিক গোবর, সার স্টক, বিক্রয়, লাভ, কেঁচোর সংখ্যা বা সংগ্রহ তারিখ ঢোকানো হয়নি। পণ্যের প্রাথমিক মূল্য ০; অ্যাডমিন নির্ধারণ করবেন।

## Public Website — sitemap অনুযায়ী

| Route | Function |
|---|---|
| `/` | খামার পরিচিতি, ডাইনামিক বেড/স্লট ভিউ, প্রক্রিয়া, পণ্য, বর্তমান KPI |
| `/about` | খামারের গল্প, পর্যায়ক্রমিক বেড–স্লট মডেল এবং Settings থেকে টিমের বিবরণ |
| `/dashboard` | Read-only বেড, স্লট, আগাম প্রস্তুতির তারিখ, ঐচ্ছিক investor financials |
| `/process` | চার ধাপের উৎপাদন চক্র |
| `/knowledge` | কেঁচো সার সম্পর্কে প্রাথমিক বিষয় ও Admin-managed knowledge/video links |
| `/products` | স্টক-সচেতন পণ্য, কার্ট, ঠিকানা দিয়ে বাস্তব অর্ডার |
| `/blog`, `/blog/[slug]` | Admin CMS থেকে প্রকাশিত ব্লগ |
| `/contact` | খামার যোগাযোগ, ম্যাপ লিংক এবং ডাটাবেসে সংরক্ষিত ইনকোয়ারি |
| `/login` | লগইন |
| `/admin?view=...` | Role-based management dashboard |

## Admin software modules

| View | Working functionality |
|---|---|
| `overview` | Real KPIs, bed/slot preview, actual cost/revenue trend, work, audit |
| `beds` | Add/edit/archive/restore beds; delete only unused beds; start batches, care, actual harvest |
| `slots` | Add/edit/archive/restore slots; delete only unused slots; dated lot ledger and manual approvals |
| `batches` | Cycle history, maturity range, harvest ledger, care logs |
| `inventory` | Stock ledger, packaging (bulk-to-SKU conversion), logged adjustments |
| `orders` | Stock reservation, workflow, cancellation/release, Paid/Refunded status |
| `expenses` | Actual expenses by date/category |
| `tasks` | Manual task list + computed calendar events for bed and slot readiness |
| `reports` | Paid revenue, expenses, harvest weight, net figure, 6-month trend, CSV |
| `products` | Price, unit, SKU, description, publish/draft |
| `posts` | Blog + knowledge articles + video URL publishing |
| `inquiries` | Received customer inquiries and follow-up status |
| `settings` | Identity, contact, about/team/knowledge content, cycle length, delivery, optional public financials |

**Auto refresh:** visible public/admin pages poll database through API every 60 seconds; admin also has manual Refresh.

## Multi-user access

The first `npm run init` creates/updates the admin account specified in `.env.local`. To create a staff account, set these environment variables in PowerShell:

```powershell
$env:NEW_USER_EMAIL="staff@example.com"
$env:NEW_USER_NAME="Farm Staff"
$env:NEW_USER_PASSWORD="Choose-a-strong-passphrase"
$env:NEW_USER_ROLE="staff"
npm run add-user
```

Staff can record lot intake, lot approval, batch operations, tasks and order progress; only admin can add, edit, archive, restore or delete beds/slots and edit products, inventory corrections, expenses, publishing and settings. Session tokens are randomized, stored only as hashes in SQLite, and sent as HttpOnly, SameSite cookies. Passwords use salted scrypt. The app has an in-memory public submission rate limit and a same-origin mutation check.

## Technology & data

- **Frontend:** Next.js App Router (React), Tailwind CSS 3, custom responsive CSS, Lucide icons, Hind Siliguri font with Bengali fallback.
- **Backend:** Next.js Route Handlers, separate domain service functions, SQL transactions with validation.
- **Database:** Persistent SQLite (Node 22+ built-in `node:sqlite`), WAL enabled, foreign keys and constraints.
- **Core tables:** `beds`, `slots`, `slot_lots`, `batches`, `batch_feed`, `care_logs`, `harvests`, `products`, `stock_movements`, `orders`, `order_items`, `expenses`, `tasks`, `posts`, `inquiries`, `settings`, `users`, `sessions`, `audit`.
- **Default database:** `./data/farm.sqlite`. For hosting, set `DATABASE_PATH` to a persistent absolute path outside ephemeral hosting storage.

Production hosting: use a Node 22+ VPS with a persistent disk, configure `DATABASE_PATH`, HTTPS and scheduled SQLite backups; then `npm run build` and `npm run start`. **Do not host this SQLite project on serverless/ephemeral file storage** unless you migrate to a managed database.

## Bed / Slot management APIs (Admin only)

| Method | Endpoint | Purpose |
|---|---|---|
| POST | `/api/admin/beds` | Create bed (name optional, capacity optional) |
| PATCH | `/api/admin/beds/:id` | Change code, capacity, notes, `enabled` |
| DELETE | `/api/admin/beds/:id` | Delete only if no batch history |
| POST | `/api/admin/slots` | Create manure slot |
| PATCH | `/api/admin/slots/:id` | Change code, capacity, notes, `enabled` |
| DELETE | `/api/admin/slots/:id` | Delete only if no lot history |

Read-only GET `/api/public` and admin GET `/api/admin/state` now return dynamic active totals. Disabling preserves both old IDs and full audit records. The original 8+5 are seeded only once; a later restart will never recreate deleted units.

## Operational safeguards

- Slot stock cannot be used before a manual maturity/condition approval.
- The stock lot must have sufficient remaining dung; transfer and batch creation run in one SQLite transaction.
- Only one active production batch is allowed for each bed.
- Batch `min_ready_on` and `max_ready_on` are calculated from its start date; harvested weight is recorded independently, and prevents double harvesting.
- Packaging converts bulk compost to a sale SKU without counting the same compost twice.
- Orders reserve available SKU stock transactionally; cancellation restores stock once.
- *Revenue* means payment explicitly marked **Paid**; expenses only appear when entered. Monthly net figure is a simplified cash-receipts-minus-entered-expenses view, not an audited financial statement.
- Model dashboard figures from the original mock (e.g., ২,৪০০ কেজি, ৬৮% লাভ, ১২০+ কৃষক) are **not claimed as actual data**.
- Website order capture uses **manual/COD payment tracking**; no payment gateway, SMS, shipping carrier or email sender is connected.

## Testing & verification

```powershell
npm test
```

The included Node tests cover schema defaults, approval age, per-bed concurrency, harvest timing, inventory/packaging conservation, order reservation/cancellation, actual revenue recognition, CMS publishing, sessions, and date validation.

**Validation performed at generation time:** the Node service tests passed **14/14**; all React/Next JSX files were syntax-parsed with the TypeScript parser. The full Next.js build and browser end-to-end smoke test could **not** be run in the authoring environment because npm registry DNS/network was unavailable. Run `npm install`, `npm run build`, and your own browser acceptance checks before public deployment.

## Current implementation boundaries

This is a substantial working source implementation, **not yet a deployed live website**. Payment confirmation is manual; image uploads, SMS/WhatsApp notifications, lab certificates, staff roster database, real-time WebSockets and external shipping gateways are **not implemented**. Informational text that was hardcoded in the original mock can be edited through Settings/Content CMS where noted. Login and sales data require a persistent server installation.

See [`ARCHITECTURE.md`](./ARCHITECTURE.md) for architecture and flow diagrams.

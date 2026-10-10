# আমাদের খামার v1.3 — Neon PostgreSQL + Vercel (বাংলা নির্দেশনা)

এই সংস্করণটি **আপনার v1.2 Public UI এবং Admin UI অক্ষত রেখেছে**। পরিবর্তন হয়েছে server-side database, API, authentication sessions এবং migration tools-এ। ZIP-এর `design/reference-original.html`-ও সংরক্ষিত আছে। এটি কোনো pixel-perfect UI redesign নয়।

## সফটওয়্যারের জন্য যা লাগবে

- Windows PC-তে **Node.js 22.13+**, Git, npm
- **Neon PostgreSQL** প্রজেক্টের pooled connection string
- Vercel account + private GitHub repository
- পুরোনো ডেটা লাগলে **আপনার PC-র original `farm.sqlite`** (ZIP-এ ব্যক্তিগত ডেটা থাকে না)

## ধাপ ১ — Neon database তৈরি

1. https://console.neon.tech/ এ লগইন করে Project তৈরি করুন।
2. Database/role ও **Connect → Pooled connection** নির্বাচন করুন। `-pooler` লেখা hostname থাকবে।
3. Connection string কপি করুন, যেমন `postgresql://USER:PASS@ep-EXAMPLE-pooler.ap-southeast-1.aws.neon.tech/neondb?sslmode=require`। এটি *উদাহরণ*—নিজেরটি ব্যবহার করুন।
4. Neon ও Vercel region কাছাকাছি রাখলে latency কমতে পারে।

## ধাপ ২ — ZIP Extract ও local environment

ZIP extract করে প্রকৃত `amader-khamar` ফোল্ডারে PowerShell খুলুন।

```powershell
Copy-Item .env.example .env.local
notepad .env.local
```

`.env.local`-এ নিজের database URL বসান। **শুধু local setup-এর জন্য** `ADMIN_EMAIL` ও `ADMIN_PASSWORD` (কমপক্ষে ১২ অক্ষর) সেট করুন। `.env.local` GitHub-এ আপলোড করবেন না।

```powershell
npm install
```

## ধাপ ৩A — পুরোনো SQLite ডেটা আছে? এটিই আগে করবেন

**সতর্কতা: পুরোনো ডেটা লাগলে `npm run db:init` আগে চালাবেন না।** আগে একটি **একেবারে খালি** Neon database/branch নিন। Existing non-empty target-এ migration script ইচ্ছাকৃতভাবেই বন্ধ হবে; কোনো রেকর্ড overwrite করবে না।

পুরোনো সফটওয়্যারের `data/farm.sqlite`-এর নিরাপদ backup তৈরি করুন:

```powershell
Copy-Item "F:\nextjs apps\amader-khamar\data\farm.sqlite" "F:\nextjs apps\farm-backup.sqlite"
```

উপরের path উদাহরণ, ফাইল যেখানে সত্যি আছে সেটি ব্যবহার করুন। **শুধু নতুন ZIP-এর খালি `data/` ফোল্ডারে migrate করবেন না।**

প্রথমে কী কী ডেটা আছে দেখে নিন (dry-run, কিছু পরিবর্তন করবে না):

```powershell
npm run db:migrate:sqlite -- --source "F:\nextjs apps\farm-backup.sqlite"
```

তারপর dry-run-এর count ঠিক থাকলে এবং Neon ডেটাবেস সম্পূর্ণ খালি হলে:

```powershell
npm run db:migrate:sqlite -- --source "F:\nextjs apps\farm-backup.sqlite" --apply
```

এটি একই ID রেখে পুরোনো users/password hashes, beds, slots, slot lots, batch-feed, care, harvests, products, stock movements, orders/items, expenses, settings, posts, inquiries, tasks ও audit রেকর্ড কপি করবে। পুরোনো session cookies ইচ্ছাকৃতভাবে স্থানান্তর হয় না—নতুন সাইটে পুনরায় login করুন। একই পুরোনো email/password কাজ করবে। Migrator কোনো existing Neon ডেটা মুছে দেবে না।

> Migration শেষে Neon database reset/branch delete করবেন না। আবার একই `--apply` চালাবেন না। কোনো সমস্যায় original SQLite backup থেকে নতুন Neon branch-এ আবার শুরু করুন।

## ধাপ ৩B — কোনো পুরোনো ডেটা নেই? নতুন ডাটাবেস

```powershell
npm run db:init
```

এটি প্রথম admin তৈরি করবে এবং শুরুর template হিসেবে ৮টি bed ও ৫টি slot তৈরি করবে। এগুলো **স্থায়ী সীমা নয়**; Admin থেকে বাড়ানো/কমানো যাবে। Seed script পুরোনো রেকর্ড overwrite করবে না। `npm run db:init` দ্বিতীয়বার চালালেও আগে তৈরি admin-এর password স্বয়ংক্রিয়ভাবে বদলাবে না। নিজের admin password স্পষ্টভাবে reset করতে চাইলে:

```powershell
npm run db:init -- --reset-password
```

পুরোনো migration-এর users না থাকলে migration-এর *পরে* `npm run db:init` দিয়ে admin তৈরি করতে পারবেন।

## ধাপ ৪ — Local পরীক্ষা

```powershell
npm run db:check
npm test
npm run build
npm run dev
```

ব্রাউজার: `http://localhost:3000` এবং `http://localhost:3000/login`। Admin থেকে একটি test bed বা slot যোগ করে পেজ refresh দিয়ে DB persistence যাচাই করুন।

### Live PostgreSQL integration test (ঐচ্ছিক কিন্তু production-এর আগে পরামর্শকৃত)

এই test **ডেটাবেসে ডেটা লেখে**। তাই আপনার production Neon branch নয়, আলাদা সম্পূর্ণ খালি disposable test branch প্রয়োজন:

```powershell
$env:TEST_DATABASE_URL = "postgresql://YOUR-TEST-BRANCH-URL"
npm run test:integration
Remove-Item Env:TEST_DATABASE_URL
```

বিনা `TEST_DATABASE_URL`-এ integration test **SKIP** হবে—এটিকে successful Neon verification বলা যাবে না।

## ধাপ ৫ — GitHub-এ private repository

`.env.local`, `data/*.sqlite`, `node_modules/`, `.next/` আগে থেকেই `.gitignore`-এ আছে। নিশ্চিত করতে `git status` চালান। যদি পুরোনো git history-তে secrets/SQLite আগে push করে থাকেন, সেগুলো history থেকে পরিষ্কার ও secret rotate করতে হবে।

```powershell
git init
git add .
git commit -m "Neon Postgres Vercel migration v1.3"
git branch -M main
```

আপনার আগে `origin` remote থাকলে:

```powershell
git remote set-url origin https://github.com/shajolbcmc/amader-khamar.git
git push -u origin main
```

প্রথমবার origin না থাকলে:

```powershell
git remote add origin https://github.com/shajolbcmc/amader-khamar.git
git push -u origin main
```

GitHub private repository আগে তৈরি করুন; `git remote -v` দিয়ে সঠিক URL নিশ্চিত করুন। **Markdown URL কপি করবেন না; শুধু plain URL দিন।**

## ধাপ ৬ — Vercel Deployment

1. https://vercel.com/new → GitHub repo **`shajolbcmc/amader-khamar`** Import করুন।
2. Framework = Next.js; Root Directory = `./` যদি repo root-এ `package.json` থাকে। ZIP-এর parent folder push করলে Root Directory `amader-khamar` দিন।
3. Node.js = 22.x; Build Command = `npm run build`।
4. Project Settings → Environment Variables → **`DATABASE_URL`** = Neon pooled URL; Production environment অবশ্যই সেট করুন। Preview environment-এ **ভিন্ন Neon branch** দিলে test data production-এ যাবে না।
5. `ADMIN_PASSWORD`, `ADMIN_EMAIL` Vercel-এ লাগবে না: এগুলো database init CLI-এর জন্য। কখনো `NEXT_PUBLIC_DATABASE_URL` ব্যবহার করবেন না।
6. Deploy। **Neon database initialization/migration স্থানীয়ভাবে শেষ করার পর** deploy করুন।

Vercel dashboard থেকে automatic production domain যেমন `https://your-project.vercel.app` পাবেন।

## ধাপ ৭ — ডেপ্লয়ের পরে যাচাই

- `https://your-project.vercel.app/api/health` → `ok: true` এবং bed count
- `/login` → নিজের admin email/password
- `/admin` → নতুন Bed যোগ, Reload-এর পরও থাকে
- নতুন Slot → গোবর মজুত → নির্ধারিত দিন পরে approve → খালি Bed-এ batch শুরু
- Care Log, Harvest ও Packaging → সঠিক স্টক
- Published Product + Stock → Public Cart → Order → Admin Orders → cancel/paid flow
- Blog, Contact, Settings ও Reports ঠিক আছে কিনা যাচাই করুন

## সতর্কতা ও সীমা

- এই source v1.2-র CSS/JSX ডিজাইন ফাইল অপরিবর্তিত রেখেছে। প্রকৃত Vercel browser/pixel comparison এ পর্যায়ে সম্ভব হয়নি।
- Node/SQLite অফলাইন ডোমেইন টেস্ট ও SQLite dry-run পাস করেছে। **Neon LIVE integration test ও Next production build আপনার Neon credentials এবং npm access ছাড়া এখানে চালানো যায়নি**। Production-ready **source/configuration** দেওয়া হয়েছে, verified live deployment নয়।
- Public order/contact/login rate-limiting এখন app-instance memory-তে হয়; serverless-এ এটি global limit নয়। বড় ট্রাফিক বা পাবলিক marketing-এর আগে Redis/Upstash rate-limit, bot filtering ও monitoring যোগ করুন।
- এখানকার Order System online payment gateway নয়; stock reserve করে order তৈরি করে, payment status Admin আপডেট করেন।
- নিজে Neon backup/restore plan, monitoring, access controls ও DB credential rotation চালু রাখুন।

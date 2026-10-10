# পুরোনো v1.2 SQLite থেকে v1.3 Neon PostgreSQL-এ আপগ্রেড

**পুরোনো v1.1/v1.2 নির্দেশনা অনুসরণ করে শুধু `data` ফোল্ডার নতুন প্রজেক্টে কপি করলেই আর হবে না।** নতুন v1.3 সফটওয়্যার PostgreSQL ব্যবহার করে। আগে আপনার original SQLite ডেটাবেস থেকে Neon-এ একবার import করতে হবে।

সম্পূর্ণ Windows/PowerShell নির্দেশনা: **[VERCEL-DEPLOY-BANGLA.md](./VERCEL-DEPLOY-BANGLA.md)**

সংক্ষেপে:

1. পুরোনো `farm.sqlite` ফাইল ও `.env.local` নিরাপদে backup করুন।
2. নতুন Neon database তৈরি করুন, `DATABASE_URL` নতুন ZIP-এর `.env.local`-এ দিন।
3. `npm install` চালান।
4. `npm run db:migrate:sqlite -- --source "C:\path\to\farm.sqlite"` চালিয়ে dry-run-এর count যাচাই করুন।
5. **একেবারে খালি** Neon database হলে একই command-এ `--apply` যোগ করুন।
6. পুরোনো admin email/password দিয়েই লগইন করুন।
7. `npm test`, `npm run build`, `npm run dev` দিয়ে স্থানীয়ভাবে পরীক্ষা করুন।
8. GitHub private repo push করে Vercel-এ `DATABASE_URL` সেট করে Deploy করুন।

### গুরুত্বপূর্ণ

- **Migration-এর আগে `npm run db:init` চালাবেন না।** এটি নতুন ডেটাবেসে ৮ বেড / ৫ স্লট template seed করবে, ফলে importer সংরক্ষণের স্বার্থে আর চালাবে না।
- v1.2 UI-এর JSX/CSS অপরিবর্তিত; নতুন API ও ডেটাবেস logic asynchronous।
- পুরোনো SQLite file কেবল read-only অবস্থায় খোলা হয়; ডেটা অক্ষত থাকে।
- Neon LIVE পরীক্ষা/ভেরিফিকেশন আপনার নিজের Neon URL এবং network access দিয়ে করতে হবে।

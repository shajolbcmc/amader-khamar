import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';

const schema = `
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY, email TEXT NOT NULL UNIQUE, name TEXT NOT NULL,
  password_hash TEXT NOT NULL, role TEXT NOT NULL CHECK(role IN ('admin','staff')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id),
  expires_at TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS beds (
  id INTEGER PRIMARY KEY, code TEXT NOT NULL UNIQUE,
  capacity_kg REAL CHECK(capacity_kg IS NULL OR capacity_kg > 0), enabled INTEGER NOT NULL DEFAULT 1,
  notes TEXT NOT NULL DEFAULT ''
);
CREATE TABLE IF NOT EXISTS slots (
  id INTEGER PRIMARY KEY, code TEXT NOT NULL UNIQUE,
  capacity_kg REAL CHECK(capacity_kg IS NULL OR capacity_kg > 0), enabled INTEGER NOT NULL DEFAULT 1,
  notes TEXT NOT NULL DEFAULT ''
);
CREATE TABLE IF NOT EXISTS slot_lots (
  id INTEGER PRIMARY KEY, slot_id INTEGER NOT NULL REFERENCES slots(id),
  received_on TEXT NOT NULL, ready_not_before TEXT NOT NULL,
  initial_kg REAL NOT NULL CHECK(initial_kg > 0), remaining_kg REAL NOT NULL CHECK(remaining_kg >= 0),
  material_cost_bdt REAL NOT NULL DEFAULT 0 CHECK(material_cost_bdt >= 0),
  approved_on TEXT, notes TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS batches (
  id INTEGER PRIMARY KEY, bed_id INTEGER NOT NULL REFERENCES beds(id),
  started_on TEXT NOT NULL, min_ready_on TEXT NOT NULL, max_ready_on TEXT NOT NULL,
  input_kg REAL NOT NULL CHECK(input_kg > 0),
  expected_output_kg REAL CHECK(expected_output_kg IS NULL OR expected_output_kg >= 0),
  worm_count INTEGER CHECK(worm_count IS NULL OR worm_count >= 0),
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','harvested')),
  notes TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE UNIQUE INDEX IF NOT EXISTS one_active_batch_per_bed ON batches(bed_id) WHERE status='active';
CREATE TABLE IF NOT EXISTS batch_feed (
  id INTEGER PRIMARY KEY, batch_id INTEGER NOT NULL REFERENCES batches(id),
  slot_lot_id INTEGER NOT NULL REFERENCES slot_lots(id),
  quantity_kg REAL NOT NULL CHECK(quantity_kg > 0),
  fed_on TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS care_logs (
  id INTEGER PRIMARY KEY, batch_id INTEGER NOT NULL REFERENCES batches(id),
  logged_on TEXT NOT NULL, moisture_pct REAL, temp_c REAL,
  action TEXT NOT NULL, notes TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS harvests (
  id INTEGER PRIMARY KEY, batch_id INTEGER NOT NULL UNIQUE REFERENCES batches(id),
  harvested_on TEXT NOT NULL, quantity_kg REAL NOT NULL CHECK(quantity_kg > 0),
  notes TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS products (
  id INTEGER PRIMARY KEY, sku TEXT NOT NULL UNIQUE, name TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'compost', description TEXT NOT NULL DEFAULT '',
  unit TEXT NOT NULL DEFAULT 'kg', compost_kg_per_unit REAL NOT NULL DEFAULT 0,
  price_bdt REAL NOT NULL DEFAULT 0 CHECK(price_bdt >= 0),
  published INTEGER NOT NULL DEFAULT 0, enabled INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS stock_movements (
  id INTEGER PRIMARY KEY, product_id INTEGER NOT NULL REFERENCES products(id),
  qty REAL NOT NULL CHECK(qty != 0), reason TEXT NOT NULL,
  ref_type TEXT NOT NULL DEFAULT '', ref_id INTEGER,
  notes TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS orders (
  id INTEGER PRIMARY KEY, code TEXT NOT NULL UNIQUE, customer_name TEXT NOT NULL,
  phone TEXT NOT NULL, address TEXT NOT NULL, notes TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','confirmed','packed','delivered','cancelled')),
  payment_status TEXT NOT NULL DEFAULT 'unpaid' CHECK(payment_status IN ('unpaid','paid','refunded')),
  amount_bdt REAL NOT NULL, delivery_fee_bdt REAL NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  paid_at TEXT, delivered_at TEXT
);
CREATE TABLE IF NOT EXISTS order_items (
  id INTEGER PRIMARY KEY, order_id INTEGER NOT NULL REFERENCES orders(id),
  product_id INTEGER NOT NULL REFERENCES products(id),
  product_name TEXT NOT NULL, qty REAL NOT NULL CHECK(qty > 0),
  unit_price_bdt REAL NOT NULL CHECK(unit_price_bdt >= 0)
);
CREATE TABLE IF NOT EXISTS expenses (
  id INTEGER PRIMARY KEY, spent_on TEXT NOT NULL, category TEXT NOT NULL,
  amount_bdt REAL NOT NULL CHECK(amount_bdt > 0), notes TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS tasks (
  id INTEGER PRIMARY KEY, title TEXT NOT NULL, description TEXT NOT NULL DEFAULT '',
  due_on TEXT NOT NULL, priority TEXT NOT NULL DEFAULT 'normal' CHECK(priority IN ('urgent','normal','low')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','done')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS posts (
  id INTEGER PRIMARY KEY, slug TEXT NOT NULL UNIQUE, title TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'blog', excerpt TEXT NOT NULL DEFAULT '', body TEXT NOT NULL DEFAULT '',
  published INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS inquiries (
  id INTEGER PRIMARY KEY, name TEXT NOT NULL, phone TEXT NOT NULL,
  subject TEXT NOT NULL, message TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'new' CHECK(status IN ('new','contacted','closed')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS audit (
  id INTEGER PRIMARY KEY, actor_id INTEGER, action TEXT NOT NULL, entity TEXT NOT NULL,
  entity_id INTEGER, details TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
`;
let cached;
export function createDb(filename = process.env.DATABASE_PATH || './data/farm.sqlite') {
  const file = filename === ':memory:' ? filename : path.resolve(filename);
  if (file !== ':memory:') fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec('PRAGMA foreign_keys = ON');
  if (file !== ':memory:') db.exec('PRAGMA journal_mode = WAL');
  db.exec('PRAGMA busy_timeout = 5000');
  db.exec(schema);
  // Backward-compatible migration for existing installations created before content categories.
  if (!db.prepare("PRAGMA table_info(posts)").all().some(x=>x.name==='category')) db.exec("ALTER TABLE posts ADD COLUMN category TEXT NOT NULL DEFAULT 'blog'");
  // Only seed the initial layout once. The operator may subsequently create,
  // archive, or delete all units; reopening the DB must not recreate them.
  if (!db.prepare("SELECT value FROM settings WHERE key='layout_initialized'").get()) {
    const beds = db.prepare('SELECT count(*) AS n FROM beds').get().n;
    if (!beds) {
      const ins = db.prepare('INSERT INTO beds(code) VALUES(?)');
      for (let n = 1; n <= 8; n++) ins.run(`Bed ${n}`);
    }
    const slots = db.prepare('SELECT count(*) AS n FROM slots').get().n;
    if (!slots) {
      const ins = db.prepare('INSERT INTO slots(code) VALUES(?)');
      for (let n = 1; n <= 5; n++) ins.run(`Slot ${n}`);
    }
    db.prepare("INSERT INTO settings(key,value) VALUES('layout_initialized','1')").run();
  }
  const products = db.prepare('SELECT count(*) AS n FROM products').get().n;
  if (!products) {
    const ins = db.prepare('INSERT INTO products(sku,name,category,description,unit,compost_kg_per_unit,published) VALUES(?,?,?,?,?,?,0)');
    ins.run('BULK-COMPOST','খোলা কেঁচো সার','compost','সংগ্রহকৃত সার, প্রতি কেজি','kg',1);
    ins.run('BAG-50','প্রিমিয়াম কেঁচো সার — ৫০ কেজি','compost','৫০ কেজির বস্তা','bag',50);
    ins.run('PACK-10','কেঁচো সার — ১০ কেজি','compost','বাগান ও ছাদের জন্য','pack',10);
    ins.run('PACK-25','কেঁচো সার — ২৫ কেজি','compost','ছাদের বাগানের জন্য','pack',25);
    ins.run('WORMS-1000','জীবন্ত কেঁচো — ১০০০ পিস','worms','প্রজননযোগ্য কেঁচো','pack',0);
  }
  const vals = { farm_name: process.env.FARM_NAME || 'আমাদের খামার', address: '', phone: '', email: '', description: 'পর্যায়ক্রমিক বেড ও মজুত স্লটের মাধ্যমে ধারাবাহিক জৈব সার উৎপাদন', cycle_min_days:'45', cycle_max_days:'60', precompost_days:'15', delivery_fee_bdt:'0', about_story:'', team_info:'', knowledge_intro:'', map_url:'', public_show_financials:'0' };
  const set = db.prepare('INSERT OR IGNORE INTO settings(key,value) VALUES (?,?)');
  for(const [k,v] of Object.entries(vals)) set.run(k,v);
  // Previous demo installs used a fixed-layout tagline. Migrate only that
  // exact default, never overwrite a farm owner's edited description.
  db.prepare("UPDATE settings SET value=? WHERE key='description' AND value=?")
    .run(vals.description,'৮টি বেড ও ৫টি মজুত স্লটের পর্যায়ক্রমিক জৈব সার উৎপাদন');
  return db;
}
export function getDb() { if(!cached) cached = createDb(); return cached; }
export function transaction(db, fn) {
  db.exec('BEGIN IMMEDIATE');
  try { const out = fn(); db.exec('COMMIT'); return out; }
  catch(err) { db.exec('ROLLBACK'); throw err; }
}
export function today() { return new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Dhaka',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date()); }
export function addDays(iso, n) {
  const date = new Date(`${iso}T00:00:00Z`);
  if (!Number.isFinite(date.getTime())) throw new Error('অবৈধ তারিখ');
  date.setUTCDate(date.getUTCDate() + n);
  return date.toISOString().slice(0,10);
}
export function isoDate(value, label='তারিখ') {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value||'')) || addDays(value,0) !== value) throw new Error(`${label} সঠিক YYYY-MM-DD হতে হবে`);
  return value;
}
export function money(n) { return Math.round((Number(n)+Number.EPSILON)*100)/100; }

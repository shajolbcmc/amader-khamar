import pg from 'pg';
const { Pool, types } = pg;
import { AsyncLocalStorage } from 'node:async_hooks';

// Retain the v1.2 service's query API, but make every query asynchronous.
// Transactions pin all queries to a single PostgreSQL connection via AsyncLocalStorage.
// A transaction-level advisory lock serializes stock/batch/order mutations across
// *all* Vercel instances, preventing double stock reservation or duplicate harvest.
const transactionContext = new AsyncLocalStorage();
types.setTypeParser(1700, (value) => Number(value)); // PG NUMERIC to JS number, like SQLite REAL.
types.setTypeParser(20, (value) => Number(value)); // COUNT(*) / BIGINT to JS number.
let db;
let pool;

export function placeholders(sql) {
  let index = 0, quote = null, output = '';
  for (let j=0; j<sql.length; j++) {
    const c=sql[j];
    if (quote) {
      output+=c;
      if(c===quote) {
        if(sql[j+1]===quote){output+=sql[++j];}
        else quote=null;
      }
    } else if(c==='\'' || c==='"') {quote=c; output+=c;}
    else if(c==='?'){output+=`$${++index}`;}
    else output+=c;
  }
  return output;
}
const identityTables = new Set([
  'users','beds','slots','slot_lots','batches','batch_feed','care_logs','harvests',
  'products','stock_movements','orders','order_items','expenses','tasks','posts','inquiries','audit'
]);
function translate(sql) {
  // SQLite NOCASE is emulated with casefolded equality for existing facility names.
  let query=sql.replace(/\bcode\s*=\s*\?\s+COLLATE\s+NOCASE\b/gi, 'LOWER(code)=LOWER(?)');
  query=query.replace(/\bdatetime\(\s*'now'\s*\)/gi, "to_char(timezone('UTC',now()),'YYYY-MM-DD HH24:MI:SS')");
  return placeholders(query);
}
export function getDb(){
  if(db) return db;
  if(!process.env.DATABASE_URL)throw new Error('DATABASE_URL is not set. Add a Neon PostgreSQL connection string.');
  // Neon pooled URLs are preferred on Vercel; SSL is configured in the connection URL.
  pool=new Pool({connectionString:process.env.DATABASE_URL,max:3,connectionTimeoutMillis:10000,
    idleTimeoutMillis:10000,allowExitOnIdle:true});
  pool.on('error', (error)=>console.error('[postgres pool]',error));
  const query = async (text, values=[]) => {
    const client=transactionContext.getStore();
    return (client||pool).query(text,values);
  };
  db={
    prepare(sql){const text=translate(sql); return {
      async get(...values){const r=await query(text,values);return r.rows[0];},
      async all(...values){const r=await query(text,values);return r.rows;},
      async run(...values){
        const insert=/^\s*INSERT\s+INTO\s+([a-z_]+)\b/i.exec(text);
        const wantsId=insert && identityTables.has(insert[1].toLowerCase()) && !/\bRETURNING\b/i.test(text);
        const r=await query(wantsId ? `${text} RETURNING id` : text,values);
        return {changes:r.rowCount,lastInsertRowid: wantsId ? Number(r.rows[0]?.id) : null};
      }
    };},
    query,
    async close(){await pool.end();db=null;pool=null;}
  };
  return db;
}
export async function closeDb(){if(db)await db.close();}
export async function transaction(database,fn){
  // Optional in-memory adapter used by the test suite (not exposed by the HTTP API).
  if(typeof database?.__testTransaction==='function')return database.__testTransaction(fn);
  if(transactionContext.getStore())throw new Error('Nested database transaction not supported');
  const client=await pool.connect();
  try{
    await client.query('BEGIN');
    // Farm-scale serialization: no two writes can consume the same stock, slot-lot or order.
    await client.query('SELECT pg_advisory_xact_lock($1,$2)',[74181,98524]);
    const result=await transactionContext.run(client,async()=>fn());
    await client.query('COMMIT');
    return result;
  }catch(err){try{await client.query('ROLLBACK')}catch{}throw err;}
  finally{client.release();}
}
export function today() { return new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Dhaka',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date()); }
export function addDays(iso,n){
  const date=new Date(`${iso}T00:00:00Z`);
  if(!Number.isFinite(date.getTime()))throw new Error('অবৈধ তারিখ');
  date.setUTCDate(date.getUTCDate()+n);
  return date.toISOString().slice(0,10);
}
export function isoDate(value,label='তারিখ'){
  if(!/^\d{4}-\d{2}-\d{2}$/.test(String(value||''))||addDays(value,0)!==value)throw new Error(`${label} সঠিক YYYY-MM-DD হতে হবে`);
  return value;
}
export function money(n){return Math.round((Number(n)+Number.EPSILON)*100)/100;}

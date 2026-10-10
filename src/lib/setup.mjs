import fs from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {transaction} from './database.mjs';

const schemaPath=fileURLToPath(new URL('../../sql/schema.sql',import.meta.url));
export const seedSettings={
  farm_name:'আমাদের খামার',address:'',phone:'',email:'',
  description:'পর্যায়ক্রমিক বেড ও মজুত স্লটের মাধ্যমে ধারাবাহিক জৈব সার উৎপাদন',
  cycle_min_days:'45',cycle_max_days:'60',precompost_days:'15',delivery_fee_bdt:'0',
  about_story:'',team_info:'',knowledge_intro:'',map_url:'',public_show_financials:'0'
};
export async function setupSchema(db){
  const sql=await fs.readFile(schemaPath,'utf8');
  // PostgreSQL CREATE IF NOT EXISTS is idempotent. Never DROP existing tables.
  await db.query(sql);
}
export async function seedInitialData(db){
  return transaction(db,async()=>{
    const initialized=await db.prepare("SELECT value FROM settings WHERE key='layout_initialized'").get();
    if(!initialized){
      if((await db.prepare('SELECT COUNT(*) AS n FROM beds').get()).n===0){
        for(let i=1;i<=8;i++)await db.prepare('INSERT INTO beds(code) VALUES(?)').run(`Bed ${i}`);
      }
      if((await db.prepare('SELECT COUNT(*) AS n FROM slots').get()).n===0){
        for(let i=1;i<=5;i++)await db.prepare('INSERT INTO slots(code) VALUES(?)').run(`Slot ${i}`);
      }
      await db.prepare("INSERT INTO settings(key,value) VALUES('layout_initialized','1') ON CONFLICT(key) DO NOTHING").run();
    }
    if((await db.prepare('SELECT COUNT(*) AS n FROM products').get()).n===0){
      const products=[
        ['BULK-COMPOST','খোলা কেঁচো সার','compost','সংগ্রহকৃত সার, প্রতি কেজি','kg',1],
        ['BAG-50','প্রিমিয়াম কেঁচো সার — ৫০ কেজি','compost','৫০ কেজির বস্তা','bag',50],
        ['PACK-10','কেঁচো সার — ১০ কেজি','compost','বাগান ও ছাদের জন্য','pack',10],
        ['PACK-25','কেঁচো সার — ২৫ কেজি','compost','ছাদের বাগানের জন্য','pack',25],
        ['WORMS-1000','জীবন্ত কেঁচো — ১০০০ পিস','worms','প্রজননযোগ্য কেঁচো','pack',0]
      ];
      for(const p of products)await db.prepare('INSERT INTO products(sku,name,category,description,unit,compost_kg_per_unit,published) VALUES(?,?,?,?,?,?,0)').run(...p);
    }
    for(const [key,value] of Object.entries(seedSettings))await db.prepare('INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO NOTHING').run(key,key==='farm_name'?process.env.FARM_NAME||value:value);
    // Preserve operator-customized settings. Only update an old exact demo tagline.
    await db.prepare('UPDATE settings SET value=? WHERE key=? AND value=?').run(seedSettings.description,'description','৮টি বেড ও ৫টি মজুত স্লটের পর্যায়ক্রমিক জৈব সার উৎপাদন');
  });
}

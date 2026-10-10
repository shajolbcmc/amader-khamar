import {createDb} from './sqlite-v1.2.mjs';

// V1.2 schema with async service calls, for offline domain-rule regression testing.
// This does not claim to emulate PostgreSQL; TEST_DATABASE_URL enables separate live integration tests.
function backwardsSql(sql){
 return sql
 .replaceAll("substring((paid_at::timestamp + interval '6 hours')::text,1,7)","substr(datetime(paid_at,'+6 hours'),1,7)")
 .replaceAll("substring((created_at::timestamp + interval '6 hours')::text,1,7)","substr(datetime(created_at,'+6 hours'),1,7)")
 .replaceAll("to_char((?::date - interval '5 months'),'YYYY-MM-DD')", "date(?,'-5 months')")
 .replaceAll("(paid_at::timestamp + interval '6 hours') >= (?::date - interval '5 months')", "datetime(paid_at,'+6 hours')>=date(?,'-5 months')")
 .replaceAll("string_agg(i.product_name||' × '||i.qty::text,', ' ORDER BY i.id)","group_concat(i.product_name||' × '||i.qty,', ')");
}
export function makeTestDb(filename=':memory:'){
 const sqlite=createDb(filename);
 const db={
  prepare(sql){return sqlite.prepare(backwardsSql(sql));},
  query(sql){sqlite.exec(sql);return {rows:[]}},
  async __testTransaction(fn){
    sqlite.exec('BEGIN IMMEDIATE');
    try{const output=await fn();sqlite.exec('COMMIT');return output;}
    catch(error){sqlite.exec('ROLLBACK');throw error;}
  },
  close(){sqlite.close();},
  native:sqlite
 };
 return db;
}

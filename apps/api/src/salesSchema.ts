import fs from 'node:fs'
import {DatabaseSync} from 'node:sqlite'
import {assertDatabaseIntegrity,bootstrapV100,readSchemaVersion} from './schema.js'

export const DRAFT_SCHEMA=120

/** Experimental migration. Caller must enforce the sandbox gate before opening DB. */
export function bootstrapSalesDrafts(db:DatabaseSync){
 const version=readSchemaVersion(db)
 if(version===DRAFT_SCHEMA){assertDatabaseIntegrity(db);return DRAFT_SCHEMA}
 if(version>110)throw Error('Chưa có migration V2 cho schema '+version)
 bootstrapV100(db)
 const file=(db.prepare('PRAGMA database_list').all().find(r=>r.name==='main') as {file:string}).file
 let backup:string|null=null
 if(file){
  backup=file+'.pre-v120-'+new Date().toISOString().replace(/[:.]/g,'-')+'.bak'
  if(fs.existsSync(backup))throw Error('Backup migration đã tồn tại')
  db.exec("VACUUM INTO '"+backup.replace(/'/g,"''")+"'")
  const check=new DatabaseSync(backup,{readOnly:true})
  try{assertDatabaseIntegrity(check);if(readSchemaVersion(check)!==110)throw Error('Backup migration không phải schema 110')}finally{check.close()}
 }
 db.exec('BEGIN IMMEDIATE')
 try{
  db.exec(`
   CREATE TABLE sales_orders(
    id TEXT PRIMARY KEY, request_key TEXT NOT NULL UNIQUE, request_hash TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'DRAFT' CHECK(status IN ('DRAFT','CANCELLED_DRAFT')),
    version INTEGER NOT NULL DEFAULT 1 CHECK(version>0),
    discount INTEGER NOT NULL CHECK(discount BETWEEN 0 AND 9007199254740991),
    note TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),updated_at TEXT NOT NULL DEFAULT (datetime('now'))
   );
   CREATE TABLE sales_order_images(
    order_id TEXT NOT NULL REFERENCES sales_orders(id), image_id INTEGER NOT NULL REFERENCES product_images(id),
    product_id INTEGER NOT NULL REFERENCES products(id),variant_id INTEGER NOT NULL REFERENCES product_variants(id),
    product_name TEXT NOT NULL,product_code TEXT NOT NULL,size TEXT NOT NULL,sku TEXT NOT NULL,
    unit_price INTEGER NOT NULL CHECK(unit_price BETWEEN 0 AND 9007199254740991),
    unit_cost INTEGER CHECK(unit_cost IS NULL OR unit_cost BETWEEN 0 AND 9007199254740991),
    position INTEGER NOT NULL CHECK(position>=0),PRIMARY KEY(order_id,image_id),UNIQUE(order_id,position)
   );
   CREATE INDEX idx_sales_orders_status_date ON sales_orders(status,created_at);
   UPDATE app_metadata SET value='120',updated_at=datetime('now') WHERE key='schema_version';
  `)
  assertDatabaseIntegrity(db)
  db.exec('COMMIT')
 }catch(e){db.exec('ROLLBACK');throw e}
 return DRAFT_SCHEMA
}

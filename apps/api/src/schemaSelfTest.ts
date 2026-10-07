import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { bootstrapV100, readSchemaVersion } from './schema.js'
function assert(ok:unknown,msg:string):asserts ok{if(!ok)throw new Error('SCHEMA_TEST FAIL: '+msg)}
function tempDb(){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'mecacao-schema-'));return {dir,file:path.join(dir,'test.db')}}
function withDb(run:(db:DatabaseSync,file:string)=>void){const t=tempDb();const db=new DatabaseSync(t.file);db.exec('PRAGMA foreign_keys=ON');try{run(db,t.file)}finally{try{db.close()}catch{};fs.rmSync(t.dir,{recursive:true,force:true})}}
withDb(db=>{assert(bootstrapV100(db)===110,'blank DB must bootstrap to 110');assert(readSchemaVersion(db)===110,'schema 110 must persist');const cols=db.prepare('PRAGMA table_info(product_variants)').all() as Array<{name:string}>;assert(cols.some(x=>x.name==='cost_price')&&cols.some(x=>x.name==='sale_price'),'variant price columns must exist');assert(bootstrapV100(db)===110,'V110 reopen idempotent')})
withDb((db,file)=>{db.exec(`
CREATE TABLE app_metadata(key TEXT PRIMARY KEY,value TEXT NOT NULL,updated_at TEXT NOT NULL DEFAULT (datetime('now')));
CREATE TABLE categories(id INTEGER PRIMARY KEY AUTOINCREMENT,name TEXT NOT NULL UNIQUE,status TEXT NOT NULL DEFAULT 'active',created_at TEXT NOT NULL DEFAULT (datetime('now')),updated_at TEXT NOT NULL DEFAULT (datetime('now')));
CREATE TABLE products(id INTEGER PRIMARY KEY AUTOINCREMENT,product_code TEXT NOT NULL UNIQUE,name TEXT NOT NULL,category_id INTEGER,cost_price INTEGER NOT NULL DEFAULT 0,sale_price INTEGER NOT NULL DEFAULT 0,description TEXT,status TEXT NOT NULL DEFAULT 'active',created_at TEXT NOT NULL DEFAULT (datetime('now')),updated_at TEXT NOT NULL DEFAULT (datetime('now')));
CREATE TABLE product_variants(id INTEGER PRIMARY KEY AUTOINCREMENT,product_id INTEGER NOT NULL,sku TEXT NOT NULL UNIQUE,size TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'active',created_at TEXT NOT NULL DEFAULT (datetime('now')),updated_at TEXT NOT NULL DEFAULT (datetime('now')),UNIQUE(product_id,size),FOREIGN KEY(product_id) REFERENCES products(id));
CREATE TABLE product_images(id INTEGER PRIMARY KEY AUTOINCREMENT,product_id INTEGER NOT NULL,variant_id INTEGER,file_path TEXT NOT NULL,sort_order INTEGER NOT NULL DEFAULT 0,is_primary INTEGER NOT NULL DEFAULT 0,created_at TEXT NOT NULL DEFAULT (datetime('now')));
CREATE TABLE inventory_transactions(id INTEGER PRIMARY KEY AUTOINCREMENT,variant_id INTEGER NOT NULL,transaction_type TEXT NOT NULL,quantity INTEGER NOT NULL,unit_cost INTEGER,note TEXT,created_at TEXT NOT NULL DEFAULT (datetime('now')),FOREIGN KEY(variant_id) REFERENCES product_variants(id));
CREATE TABLE app_settings(key TEXT PRIMARY KEY,value TEXT NOT NULL,updated_at TEXT NOT NULL DEFAULT (datetime('now')));
CREATE VIEW inventory_stock AS SELECT variant_id,SUM(quantity) stock FROM inventory_transactions GROUP BY variant_id;
INSERT INTO app_metadata(key,value) VALUES('schema_version','100');
INSERT INTO products(product_code,name,cost_price,sale_price) VALUES('MIG001','Migration',42000,65000);
INSERT INTO product_variants(product_id,sku,size) VALUES(1,'MIG001-S8','Size 8');
INSERT INTO inventory_transactions(variant_id,transaction_type,quantity,unit_cost,note) VALUES(1,'IMPORT',3,41000,'historic');
`);assert(bootstrapV100(db)===110,'schema100 must migrate to 110');const v=db.prepare('SELECT cost_price,sale_price FROM product_variants WHERE id=1').get() as any;assert(v.cost_price===42000&&v.sale_price===65000,'migration must copy product prices to variant');const tx=db.prepare('SELECT quantity,unit_cost FROM inventory_transactions WHERE id=1').get() as any;assert(tx.quantity===3&&tx.unit_cost===41000,'migration must preserve historical ledger');const backups=fs.readdirSync(path.dirname(file)).filter(x=>x.startsWith(path.basename(file)+'.pre-v110-')&&x.endsWith('.bak'));assert(backups.length===1,'schema100 migration must create one pre-migration backup')})
withDb(db=>{db.exec("CREATE TABLE app_metadata(key TEXT PRIMARY KEY,value TEXT NOT NULL,updated_at TEXT NOT NULL DEFAULT (datetime('now'))); INSERT INTO app_metadata(key,value) VALUES('schema_version','111')");let blocked=false;try{bootstrapV100(db)}catch{blocked=true}assert(blocked,'future schema blocked');assert(readSchemaVersion(db)===111,'future schema untouched')})
withDb(db=>{db.exec('CREATE TABLE products(id INTEGER PRIMARY KEY)');let blocked=false;try{bootstrapV100(db)}catch{blocked=true}assert(blocked,'legacy unversioned blocked');assert(!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='app_metadata'").get(),'legacy untouched')})
withDb(db=>{db.exec("CREATE TABLE app_metadata(key TEXT PRIMARY KEY,value TEXT NOT NULL,updated_at TEXT NOT NULL DEFAULT (datetime('now'))); INSERT INTO app_metadata(key,value) VALUES('schema_version','oops')");let blocked=false;try{bootstrapV100(db)}catch{blocked=true}assert(blocked,'corrupt version blocked')})
console.log('SCHEMA_SELF_TEST PASS: blank->110, schema100 backup+migration+ledger preservation, reopen, variant pricing columns, future-version guard, legacy guard, corrupt-version guard')

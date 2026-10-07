import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { bootstrapV100, readSchemaVersion } from './schema.js'
function assert(ok:unknown,msg:string):asserts ok{if(!ok)throw new Error('SCHEMA_TEST FAIL: '+msg)}
function tempDb(){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'mecacao-schema-'));return {dir,file:path.join(dir,'test.db')}}
function withDb(run:(db:DatabaseSync,file:string)=>void){const t=tempDb();const db=new DatabaseSync(t.file);db.exec('PRAGMA foreign_keys=ON');try{run(db,t.file)}finally{try{db.close()}catch{};fs.rmSync(t.dir,{recursive:true,force:true})}}
withDb(db=>{assert(bootstrapV100(db)===110,'blank DB must bootstrap to 110');assert(readSchemaVersion(db)===110,'schema 110 must persist');const cols=db.prepare('PRAGMA table_info(product_variants)').all() as Array<{name:string}>;assert(cols.some(x=>x.name==='cost_price')&&cols.some(x=>x.name==='sale_price'),'variant price columns must exist');assert(bootstrapV100(db)===110,'V110 reopen idempotent')})
withDb(db=>{db.exec("CREATE TABLE app_metadata(key TEXT PRIMARY KEY,value TEXT NOT NULL,updated_at TEXT NOT NULL DEFAULT (datetime('now'))); INSERT INTO app_metadata(key,value) VALUES('schema_version','111')");let blocked=false;try{bootstrapV100(db)}catch{blocked=true}assert(blocked,'future schema blocked');assert(readSchemaVersion(db)===111,'future schema untouched')})
withDb(db=>{db.exec('CREATE TABLE products(id INTEGER PRIMARY KEY)');let blocked=false;try{bootstrapV100(db)}catch{blocked=true}assert(blocked,'legacy unversioned blocked');assert(!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='app_metadata'").get(),'legacy untouched')})
withDb(db=>{db.exec("CREATE TABLE app_metadata(key TEXT PRIMARY KEY,value TEXT NOT NULL,updated_at TEXT NOT NULL DEFAULT (datetime('now'))); INSERT INTO app_metadata(key,value) VALUES('schema_version','oops')");let blocked=false;try{bootstrapV100(db)}catch{blocked=true}assert(blocked,'corrupt version blocked')})
console.log('SCHEMA_SELF_TEST PASS: blank->110, reopen, variant pricing columns, future-version guard, legacy guard, corrupt-version guard')

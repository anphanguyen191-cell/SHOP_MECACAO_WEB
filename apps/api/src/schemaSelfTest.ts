import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { bootstrapV100, readSchemaVersion } from './schema.js'

function assert(ok:unknown,msg:string):asserts ok{if(!ok)throw new Error('SCHEMA_TEST FAIL: '+msg)}
function tempDb(){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'mecacao-schema-'));return {dir,file:path.join(dir,'test.db')}}
function withDb(run:(db:DatabaseSync,file:string)=>void){const t=tempDb();const db=new DatabaseSync(t.file);db.exec('PRAGMA foreign_keys=ON');try{run(db,t.file)}finally{try{db.close()}catch{};fs.rmSync(t.dir,{recursive:true,force:true})}}

withDb(db=>{assert(bootstrapV100(db)===100,'blank DB must bootstrap to 100');assert(readSchemaVersion(db)===100,'schema version must persist');assert(bootstrapV100(db)===100,'existing V100 must reopen idempotently')})
withDb(db=>{db.exec("CREATE TABLE app_metadata(key TEXT PRIMARY KEY,value TEXT NOT NULL,updated_at TEXT NOT NULL DEFAULT (datetime('now'))); INSERT INTO app_metadata(key,value) VALUES('schema_version','101')");let blocked=false;try{bootstrapV100(db)}catch{blocked=true}assert(blocked,'future schema must be blocked');assert(readSchemaVersion(db)===101,'future schema must not be mutated')})
withDb(db=>{db.exec('CREATE TABLE products(id INTEGER PRIMARY KEY)');let blocked=false;try{bootstrapV100(db)}catch{blocked=true}assert(blocked,'legacy business DB without version must be blocked');const tables=db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='app_metadata'").all();assert(tables.length===0,'blocked legacy DB must remain untouched')})
withDb(db=>{db.exec("CREATE TABLE app_metadata(key TEXT PRIMARY KEY,value TEXT NOT NULL,updated_at TEXT NOT NULL DEFAULT (datetime('now'))); INSERT INTO app_metadata(key,value) VALUES('schema_version','oops')");let blocked=false;try{bootstrapV100(db)}catch{blocked=true}assert(blocked,'corrupt schema version must be blocked')})
console.log('SCHEMA_SELF_TEST PASS: blank, reopen, future-version guard, legacy guard, corrupt-version guard')

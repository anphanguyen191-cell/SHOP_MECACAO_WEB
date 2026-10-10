import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {createHash} from 'node:crypto'
import {DatabaseSync} from 'node:sqlite'
import {bootstrapV100,readSchemaVersion,assertDatabaseIntegrity} from './schema.js'
import {bootstrapSalesDrafts} from './salesSchema.js'
import {salesDraftService,SalesError} from './salesDrafts.js'

const root=fs.mkdtempSync(path.join(os.tmpdir(),'mecacao-v2-drafts-')),file=path.join(root,'shop.db'),photo=path.join(root,'warehouse','Mau thu','Size 1','001.jpg')
fs.mkdirSync(path.dirname(photo),{recursive:true});fs.writeFileSync(photo,Buffer.from('unchanged-source-fixture'))
const hash=()=>createHash('sha256').update(fs.readFileSync(photo)).digest('hex'),beforeHash=hash()
let db=new DatabaseSync(file);db.exec('PRAGMA foreign_keys=ON;PRAGMA journal_mode=WAL;PRAGMA synchronous=FULL')
let checks=0
function check(ok:unknown,label:string){assert.ok(ok,label);checks++}
function rejects(fn:()=>unknown,status:number){assert.throws(fn,(e:unknown)=>e instanceof SalesError&&e.status===status);checks++}
try{
 bootstrapV100(db)
 db.exec("INSERT INTO products(product_code,name) VALUES('P1','Mẫu thử');INSERT INTO product_variants(product_id,sku,size,cost_price,sale_price) VALUES(1,'P1-S1','Size 1',0,50000);INSERT INTO inventory_transactions(variant_id,transaction_type,quantity,note) VALUES(1,'OPENING',8,'historic discrepancy');")
 db.prepare('INSERT INTO product_images(product_id,variant_id,file_path) VALUES(1,1,?)').run(photo)
 const business=()=>JSON.stringify(['products','product_variants','product_images','inventory_transactions'].map(t=>db.prepare('SELECT * FROM '+t).all()))
 const baseline=business()
 check(bootstrapSalesDrafts(db)===120,'110 -> 120')
 check(business()===baseline,'migration preserves all existing business rows')
 const backup=fs.readdirSync(root).find(x=>x.includes('.pre-v120-'))!
 const old=new DatabaseSync(path.join(root,backup));check(readSchemaVersion(old)===110,'pre-migration backup schema110');assertDatabaseIntegrity(old);check(JSON.stringify(['products','product_variants','product_images','inventory_transactions'].map(t=>old.prepare('SELECT * FROM '+t).all()))===baseline,'pre-migration backup includes unchanged business rows');old.close()
 assert.throws(()=>bootstrapV100(db),/mới hơn/);checks++
 let service=salesDraftService(db,root)
 const input={items:[{imageId:1,unitPrice:50000}],discount:5000,note:' note '},key='create-request-key-0001'
 const d=service.create(input,key)
 check(d.total===45000&&d.quantity===1&&d.reservesStock===false,'server totals and no reservation')
 check(d.items[0].unit_cost===null,'unknown cost not treated as profit-zero')
 check(service.create(input,key).id===d.id&&service.list().length===1,'retry creates exactly one draft')
 rejects(()=>service.create({...input,discount:1},key),409)
 let warning:any
 try{service.create(input,'create-request-key-0002');assert.fail('duplicate draft must request choice')}catch(e){assert(e instanceof SalesError&&e.details.code==='DRAFT_IMAGE_CONFLICT');warning=e.details;checks++}
 check(service.list().length===1,'warning creates no order')
 check(warning.conflicts[0].orders[0].id===d.id,'warning identifies exact related order')
 const second=service.create({...input,conflictToken:warning.conflictToken},'create-request-key-0002');check(second.id!==d.id,'two drafts may select same image after explicit choice')
 check(service.get(d.id).conflicts.length===1,'reopen displays duplicate image warning')
 check(service.create(input,'create-request-key-0002').id===second.id,'successful create retry does not demand choice again')
 for(const unitPrice of [-1,0.5,NaN,Number.MAX_SAFE_INTEGER+1])rejects(()=>service.create({...input,items:[{imageId:1,unitPrice}]},'invalid-money-request'),400)
 rejects(()=>service.create({...input,items:[{imageId:1,unitPrice:5},{imageId:1,unitPrice:5}]},'duplicate-image-request'),400)
 rejects(()=>service.create({...input,items:[]},'empty-images-request'),400)
 rejects(()=>service.create({...input,discount:50001},'invalid-discount-request'),400)
 rejects(()=>service.create({...input,note:'x'.repeat(501)},'invalid-note-request'),400)
 rejects(()=>service.create({...input,items:[{imageId:99999,unitPrice:50000}]},'missing-image-request'),409)
 check(service.list().length===2,'failed creates roll back order and items')
 const updated=service.update(d.id,{...input,version:1,discount:0,items:[{imageId:1,unitPrice:60000}]})
 check(updated.version===2&&updated.total===60000,'optimistic update increments version')
 rejects(()=>service.update(d.id,{...input,version:1}),409)
 rejects(()=>service.cancel(d.id,1),409)
 db.exec("CREATE TRIGGER fail_draft_save BEFORE UPDATE ON sales_orders BEGIN SELECT RAISE(ABORT,'injected failure'); END;")
 assert.throws(()=>service.update(d.id,{...input,version:2}));checks++
 check(service.get(d.id).items[0].unit_price===60000&&service.get(d.id).version===2,'failed update restores old items/version')
 db.exec('DROP TRIGGER fail_draft_save')
 check(business()===baseline&&hash()===beforeHash,'draft create/edit never changes business rows or file bytes')
 db.exec("UPDATE product_variants SET sale_price=90000 WHERE id=1;UPDATE products SET name='Tên mới' WHERE id=1")
 check(service.get(d.id).items[0].unit_price===60000&&service.get(d.id).items[0].product_name==='Mẫu thử','reopen preserves saved price/name snapshots')
 const frozen=business()
 db.close();db=new DatabaseSync(file);db.exec('PRAGMA foreign_keys=ON');bootstrapSalesDrafts(db);service=salesDraftService(db,root)
 check(service.get(d.id).version===2&&service.get(d.id).total===60000,'restart persists draft')
 fs.renameSync(photo,photo+'.temporarily-missing')
 check(!service.get(d.id).available,'read flags missing physical stock instead of pretending available')
 rejects(()=>service.update(d.id,{...input,version:2}),409)
 fs.renameSync(photo+'.temporarily-missing',photo)
 db.exec("UPDATE product_variants SET status='inactive' WHERE id=1")
 check(!service.get(d.id).available,'inactive Size cannot be selected')
 rejects(()=>service.create(input,'inactive-request-key'),409)
 db.exec("UPDATE product_variants SET status='active' WHERE id=1")
 const outside=path.join(os.tmpdir(),path.basename(root)+'-outside.jpg');fs.writeFileSync(outside,'external')
 try{db.prepare('UPDATE product_images SET file_path=? WHERE id=1').run(outside);rejects(()=>service.create(input,'outside-request-key'),409)}finally{db.prepare('UPDATE product_images SET file_path=? WHERE id=1').run(photo);fs.unlinkSync(outside)}
 const cancelled=service.cancel(d.id,2)
 check(cancelled.status==='CANCELLED_DRAFT'&&cancelled.version===3,'cancel keeps history and increments version')
 rejects(()=>service.update(d.id,{...input,version:3}),409)
 check(service.list().length===1&&service.list('CANCELLED_DRAFT').length===1,'status filters')
 check(business()===frozen&&hash()===beforeHash,'all lifecycle paths leave warehouse and ledger unchanged')
 // Another physical unit of the same Product/Size is not a duplicate.
 const photo2=photo.replace('001','002');fs.writeFileSync(photo2,'second-unit');db.prepare('INSERT INTO product_images(product_id,variant_id,file_path) VALUES(1,1,?)').run(photo2)
 const next={items:[{imageId:2,unitPrice:50000}],discount:0,note:''}
 const third=service.create(next,'create-request-key-0003');check(!third.conflicts.length,'different image in same Size does not warn')
 const extra={items:[{imageId:1,unitPrice:50000},{imageId:2,unitPrice:50000}],discount:0,note:'',version:1}
 try{service.update(second.id,extra);assert.fail('adding shared item must warn')}catch(e){assert(e instanceof SalesError&&e.details.code==='DRAFT_IMAGE_CONFLICT');warning=e.details;checks++}
 check(service.get(second.id).quantity===1&&service.get(second.id).version===1,'update warning leaves order unchanged')
 service.update(third.id,{...next,version:1,note:'changed meanwhile'})
 rejects(()=>service.update(second.id,{...extra,conflictToken:warning.conflictToken}),409)
 try{service.update(second.id,extra)}catch(e){assert(e instanceof SalesError);warning=e.details}
 check(service.update(second.id,{...extra,conflictToken:warning.conflictToken}).quantity===2,'fresh confirmation allows adding shared image')
 service.cancel(third.id,2)
 check(!service.get(second.id).conflicts.length,'cancelled drafts do not cause duplicate warnings')
 assertDatabaseIntegrity(db)
 // Migration DDL failure must roll back schema and existing business rows.
 const fail=new DatabaseSync(':memory:');bootstrapV100(fail);fail.exec('CREATE TABLE sales_order_images(marker TEXT)')
 assert.throws(()=>bootstrapSalesDrafts(fail));checks++
 check(readSchemaVersion(fail)===110&&!fail.prepare("SELECT name FROM sqlite_master WHERE name='sales_orders'").get(),'failed migration leaves V1 schema unchanged');fail.close()
 console.log('V2_DRAFT_SELF_TEST PASS: '+checks+' assertions; migration backup/rollback, retry/conflict, price validation, concurrency version, restart, missing/inactive/outside images, stock/ledger/file invariants')
}finally{db.close();fs.rmSync(root,{recursive:true,force:true})}

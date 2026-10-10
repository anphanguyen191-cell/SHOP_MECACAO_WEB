import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import sharp from 'sharp'
import {DatabaseSync} from 'node:sqlite'
import {salesDraftService} from './salesDrafts.js'
import {salesPreflightService} from './salesPreflight.js'
import {bootstrapSalesDrafts} from './salesSchema.js'
const root=fs.mkdtempSync(path.join(os.tmpdir(),'mecacao-preflight-')),db=new DatabaseSync(path.join(root,'db.sqlite')),file=path.join(root,'photo.png')
let n=0
const ok=(v:unknown)=>{assert.ok(v);n++}
const reject=async(fn:()=>Promise<unknown>,status:number)=>{await assert.rejects(fn,(e:any)=>e.status===status);n++}
try{
 bootstrapSalesDrafts(db)
 await sharp({create:{width:120,height:160,channels:3,background:'#a1d9bc'}}).png().toFile(file)
 db.exec("INSERT INTO products(product_code,name) VALUES('P','Mẫu');INSERT INTO product_variants(product_id,sku,size) VALUES(1,'P-S','Size 1')")
 db.prepare('INSERT INTO product_images(product_id,variant_id,file_path) VALUES(1,1,?)').run(file)
 const drafts=salesDraftService(db,root),service=salesPreflightService(db,root),input={items:[{imageId:1,unitPrice:50000}],discount:5000,note:''},d=drafts.create(input,'preflight-request-001'),bytes=fs.readFileSync(file)
 const rows=()=>JSON.stringify(['products','product_variants','product_images','inventory_transactions','sales_orders','sales_order_images'].map(t=>db.prepare('SELECT * FROM '+t).all())),baseline=rows()
 const r=await service.check(d.id,1)
 ok(r.checksPassed&&r.requiresReview&&r.unknownCostCount===1&&!r.canConfirmSale&&r.readOnly&&!r.reservesStock)
 ok(r.total===45000&&r.quantity===1&&r.sizeCount===1&&r.productCount===1)
 ok(r.items[0].evidence?.width===120&&r.items[0].evidence.height===160)
 ok((await service.check(d.id,1,r.token)).token===r.token)
 ok(rows()===baseline&&fs.readFileSync(file).equals(bytes))
 await reject(()=>service.check(d.id,1,'bad-token'),400)
 await reject(()=>service.check(d.id,1,'a'.repeat(64)),409)
 await reject(()=>service.check(d.id,2),409)
 await reject(()=>service.check(d.id,NaN),400)
 const pending=service.check(d.id,1);await reject(()=>service.check(d.id,1),429);await pending
 fs.writeFileSync(file,'broken');const broken=await service.check(d.id,1);ok(!broken.checksPassed&&broken.blockedCount===1&&!broken.items[0].evidence);ok(fs.readFileSync(file,'utf8')==='broken');await reject(()=>service.check(d.id,1,r.token),409);fs.writeFileSync(file,bytes)
 fs.renameSync(file,file+'.hold');ok((await service.check(d.id,1)).blockedCount===1);fs.renameSync(file+'.hold',file)
 db.exec("UPDATE product_variants SET status='inactive' WHERE id=1");ok((await service.check(d.id,1)).blockedCount===1);db.exec("UPDATE product_variants SET status='active' WHERE id=1")
 const changing=service.check(d.id,1);fs.writeFileSync(file,'changed-during-decode');await reject(()=>changing,409);fs.writeFileSync(file,bytes)
 const draftChanging=service.check(d.id,1);drafts.update(d.id,{...input,version:1,note:'changed'});await reject(()=>draftChanging,409)
 let warning='';try{drafts.create(input,'preflight-request-002')}catch(e:any){warning=e.details.conflictToken}
 const other=drafts.create({...input,conflictToken:warning},'preflight-request-002')
 const overlap=await service.check(d.id,2);ok(overlap.conflicts[0].orders[0].id===other.id&&overlap.requiresReview)
 drafts.cancel(other.id,1);await reject(()=>service.check(d.id,2,overlap.token),409)
 drafts.update(d.id,{version:2,items:[{imageId:1,unitPrice:0}],discount:0,note:''});ok((await service.check(d.id,3)).zeroPriceCount===1)
 db.exec('UPDATE sales_order_images SET unit_price=0.5');await reject(()=>service.check(d.id,3),409);db.exec('UPDATE sales_order_images SET unit_price=0')
 // Reserved archive files must never pass as canonical selling stock, even with a registered ID.
 const reserved=path.join(root,'.mecacao-v2-archive');fs.mkdirSync(reserved);const hidden=path.join(reserved,'photo.png');fs.writeFileSync(hidden,bytes);db.prepare('UPDATE product_images SET file_path=?').run(hidden);ok((await service.check(d.id,3)).blockedCount===1);db.prepare('UPDATE product_images SET file_path=?').run(file)
 if(process.platform!=='win32'){
  const link=path.join(root,'link.png');fs.symlinkSync(file,link);db.prepare('UPDATE product_images SET file_path=?').run(link);ok((await service.check(d.id,3)).blockedCount===1);db.prepare('UPDATE product_images SET file_path=?').run(file)
 }
 const oversized=Buffer.alloc(33*1024*1024);fs.writeFileSync(file,oversized);ok((await service.check(d.id,3)).blockedCount===1);fs.writeFileSync(file,bytes)
 drafts.cancel(d.id,3);await reject(()=>service.check(d.id,4),409)
 ok(fs.readFileSync(file).equals(bytes)&&db.prepare('SELECT COUNT(*) n FROM inventory_transactions').get()!.n===0)
 console.log('V2_PREFLIGHT_SELF_TEST PASS: '+n+' assertions; source decode/hash, stale snapshots/tokens, concurrency, missing/corrupt/oversized/inactive/reserved/link guards, warnings, read-only stock and ledger')
}finally{db.close();fs.rmSync(root,{recursive:true,force:true})}

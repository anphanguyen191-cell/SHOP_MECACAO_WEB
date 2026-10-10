import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import sharp from 'sharp'
import {DatabaseSync} from 'node:sqlite'
import {bootstrapV100} from './schema.js'
import {bootstrapSalesDrafts} from './salesSchema.js'
import {salesDraftService} from './salesDrafts.js'
import {salesPreviewService} from './salesPreview.js'
const root=fs.mkdtempSync(path.join(os.tmpdir(),'mecacao-preview-')),db=new DatabaseSync(path.join(root,'db.sqlite')),file=path.join(root,'test.png')
let checks=0
const check=(ok:unknown)=>{assert.ok(ok);checks++}
const rejects=async(fn:()=>Promise<unknown>,status:number)=>{await assert.rejects(fn,(e:any)=>e.status===status);checks++}
try{
 bootstrapV100(db);bootstrapSalesDrafts(db)
 await sharp({create:{width:2200,height:1600,channels:3,background:'#afcfde'}}).png().toFile(file)
 db.exec("INSERT INTO products(product_code,name) VALUES('P','Test');INSERT INTO product_variants(product_id,sku,size) VALUES(1,'P-S','Size 1')")
 db.prepare('INSERT INTO product_images(product_id,variant_id,file_path) VALUES(1,1,?)').run(file)
 const draft=salesDraftService(db,root),service=salesPreviewService(db,root),input={items:[{imageId:1,unitPrice:0}],discount:0,note:''},d=draft.create(input,'preview-test-key-001')
 const bytes=fs.readFileSync(file),rows=()=>JSON.stringify(['products','product_variants','product_images','inventory_transactions','sales_orders','sales_order_images'].map(t=>db.prepare('SELECT * FROM '+t).all())),baseline=rows()
 const result=await service.preview(d.id,1)
 check(result.readOnly&&result.policy.proposed&&result.zeroPriceCount===1&&result.quantity===1)
 check(result.items[0].width===1280&&result.items[0].height<1280)
 check(result.originalBytes===bytes.length&&result.optimizedBytes===result.items[0].optimizedBytes)
 const jpeg=await service.image(d.id,1,1,result.items[0].sourceHash);check((await sharp(jpeg).metadata()).format==='jpeg')
 check(fs.readFileSync(file).equals(bytes)&&rows()===baseline)
 await rejects(()=>service.preview(d.id,2),409)
 await rejects(()=>service.image(d.id,1,999,result.items[0].sourceHash),404)
 await rejects(()=>service.image(d.id,1,1,'incorrect-hash'),409)
 fs.writeFileSync(file,'broken-image');await rejects(()=>service.preview(d.id,1),422);check(fs.readFileSync(file).toString()==='broken-image')
 fs.writeFileSync(file,bytes)
 const pending=service.preview(d.id,1);await rejects(()=>service.preview(d.id,1),429);await pending
 const changing=service.preview(d.id,1);draft.update(d.id,{...input,version:1,note:'updated while encoding'});await rejects(()=>changing,409)
 const changed=service.preview(d.id,2);fs.writeFileSync(file,'changed during encoding');await rejects(()=>changed,409);fs.writeFileSync(file,bytes)
 fs.renameSync(file,file+'.missing');await rejects(()=>service.preview(d.id,2),409);fs.renameSync(file+'.missing',file)
 draft.cancel(d.id,2);await rejects(()=>service.preview(d.id,3),409)
 check(fs.readFileSync(file).equals(bytes)&&db.prepare('SELECT COUNT(*) n FROM inventory_transactions').get()!.n===0)
 console.log('V2_PREVIEW_SELF_TEST PASS: '+checks+' assertions; read-only, quality bounds, stale/missing/changed/corrupt images, version and concurrency guards')
}finally{db.close();fs.rmSync(root,{recursive:true,force:true})}

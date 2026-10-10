import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import assert from 'node:assert/strict'
import sharp from 'sharp'
import {DatabaseSync} from 'node:sqlite'
import {bootstrapSalesDrafts} from './salesSchema.js'
import {bootstrapSalesExecution,salesExecutionService} from './salesExecution.js'
import {salesDraftService} from './salesDrafts.js'
import {customerService} from './customers.js'
import {orderSlipService} from './orderSlip.js'
import {salesPreflightService} from './salesPreflight.js'
import {createSalesBackup,restoreSalesBackup} from './salesBackup.js'
const root=fs.mkdtempSync(path.join(os.tmpdir(),'mecacao-stage2-')),file=path.join(root,'shop.db')
let db=new DatabaseSync(file),n=0
const eq=(a:unknown,b:unknown)=>{assert.deepEqual(a,b);n++},fails=(fn:()=>unknown)=>{assert.throws(fn);n++}
try{
 db.exec('PRAGMA foreign_keys=ON');bootstrapSalesDrafts(db);bootstrapSalesExecution(db,root)
 const drafts=salesDraftService(db,root),customers=customerService(db),slip=orderSlipService(db,root)
 const c=customers.save({name:'Mẹ Cá Cacao',phone:'090 123 4567',address:'Bạc Liêu & Cà Mau <test>',note:'Khách thân'})
 eq(customers.list('Cá').length,1);fails(()=>customers.save({name:'Trùng',phone:'+84 90 123 4567',address:'',note:''}));fails(()=>customers.save({name:'',phone:'',address:'',note:''}))
 db.exec("INSERT INTO products(id,product_code,name) VALUES(1,'P1','Bộ tole bé yêu');INSERT INTO product_variants(id,product_id,sku,size,cost_price,sale_price) VALUES(1,1,'P1-S1','Size 1',20000,50000);INSERT INTO inventory_transactions(variant_id,transaction_type,quantity) VALUES(1,'OPENING',9)")
 for(let i=1;i<=9;i++){const f=path.join(root,'warehouse','Bộ tole bé yêu','Size 1',i+'.png');fs.mkdirSync(path.dirname(f),{recursive:true});await sharp({create:{width:100,height:120,channels:3,background:'#ffaacc'}}).png().toFile(f);db.prepare('INSERT INTO product_images(id,product_id,variant_id,file_path) VALUES(?,1,1,?)').run(i,f)}
 const contact={customerId:String(c.id),recipientName:String(c.name),phone:String(c.phone),address:String(c.address),shippingFee:30000}
 const input={items:Array.from({length:9},(_,i)=>({imageId:i+1,unitPrice:50000})),discount:10000,note:'Giao buổi chiều',contact}
 let d=drafts.create(input,'stage2-create-request-0001');eq(d.total,440000);eq(d.payableTotal,470000);eq(drafts.create(input,'stage2-create-request-0001').id,d.id)
 fails(()=>drafts.create({...input,contact:{...contact,shippingFee:1}},'stage2-create-request-0001'))
 customers.save({...c,name:'Tên khách thay đổi',version:1},String(c.id));eq(drafts.get(d.id).contact.recipientName,'Mẹ Cá Cacao');fails(()=>customers.save({...c,version:1},String(c.id)))
 fails(()=>drafts.update(d.id,{...input,version:1,contact:{...contact,shippingFee:-1}}));eq(drafts.get(d.id).version,1)
 fails(()=>drafts.update(d.id,{...input,version:1,contact:{...contact,shippingFee:Number.MAX_SAFE_INTEGER}}))
 eq(slip.summary(d.id,1).pages,2)
 const png=await slip.png(d.id,1,1),png2=await slip.png(d.id,1,2);eq((await sharp(png).metadata()).format,'png');eq((await sharp(png2).metadata()).width,1080)
 fs.writeFileSync(path.join(root,'sample-slip.png'),png2)
 d=drafts.update(d.id,{...input,version:1,contact:{...contact,shippingFee:0}});eq(d.payableTotal,440000)
 await assert.rejects(()=>slip.png(d.id,1,1));n++
 const {contact:ignored,...noContact}=input;d=drafts.update(d.id,{...noContact,version:2});eq(d.contact.recipientName,'Mẹ Cá Cacao');eq(d.contact.shippingFee,0)
 const token=(await salesPreflightService(db,root).check(d.id,d.version)).token
 await salesExecutionService(db,root).confirm(d.id,{version:d.version,token,confirmed:true,acknowledgeZeroPrice:false},'stage2-confirm-request-0001')
 eq(drafts.get(d.id).status,'SOLD');eq((await sharp(await slip.png(d.id,d.version,2)).metadata()).format,'png')
 fails(()=>drafts.update(d.id,{...input,version:d.version}));fails(()=>db.prepare('UPDATE order_contacts SET shipping_fee=1 WHERE order_id=?').run(d.id))
 const backup=createSalesBackup(db,file,root),restored=restoreSalesBackup(backup.directory,path.join(root,'restore'),path.join(root,'warehouse'))
 const restoredDb=new DatabaseSync(restored.database);eq(salesDraftService(restoredDb,path.join(root,'restore')).get(d.id).contact.recipientName,'Mẹ Cá Cacao');eq(customerService(restoredDb).list().length,1);restoredDb.close()
 db.close();db=new DatabaseSync(file);eq(salesDraftService(db,root).get(d.id).payableTotal,440000)
 console.log('STAGE2_SELF_TEST PASS: '+n+' checks; customer duplicates/version, contact snapshot, shipping, idempotency, PNG pages, sold lock, restart, restore')
 if(process.env.SHOP_SLIP_QA_PATH)fs.copyFileSync(path.join(root,'sample-slip.png'),process.env.SHOP_SLIP_QA_PATH)
}finally{db.close();fs.rmSync(root,{recursive:true,force:true})}

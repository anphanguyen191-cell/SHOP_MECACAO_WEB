import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import assert from 'node:assert/strict'
import sharp from 'sharp'
import {DatabaseSync} from 'node:sqlite'
import {bootstrapSalesDrafts} from './salesSchema.js'
import {bootstrapSalesExecution,salesExecutionService} from './salesExecution.js'
import {salesDraftService} from './salesDrafts.js'
import {financeService,validateFinance} from './orderFinance.js'
import {salesPreflightService} from './salesPreflight.js'
import {createSalesBackup,restoreSalesBackup} from './salesBackup.js'
import {orderSlipService} from './orderSlip.js'
const root=fs.mkdtempSync(path.join(os.tmpdir(),'mecacao-stage3-')),file=path.join(root,'shop.db')
let db=new DatabaseSync(file),checks=0
const eq=(a:unknown,b:unknown)=>{assert.deepEqual(a,b);checks++},fails=(fn:()=>unknown)=>{assert.throws(fn);checks++}
try{
 db.exec('PRAGMA foreign_keys=ON;PRAGMA journal_mode=WAL;');bootstrapSalesDrafts(db);bootstrapSalesExecution(db,root)
 let drafts=salesDraftService(db,root),finance=financeService(db)
 db.exec("INSERT INTO products(id,product_code,name) VALUES(1,'F1','Bộ chặng 3');INSERT INTO product_variants(id,product_id,sku,size,cost_price,sale_price) VALUES(1,1,'F1-S1','Size 1',20000,50000);INSERT INTO inventory_transactions(variant_id,transaction_type,quantity) VALUES(1,'OPENING',3)")
 for(let i=1;i<=3;i++){const p=path.join(root,'warehouse','Bộ chặng 3','Size 1',i+'.png');fs.mkdirSync(path.dirname(p),{recursive:true});await sharp({create:{width:100,height:120,channels:3,background:'#ccddff'}}).png().toFile(p);db.prepare('INSERT INTO product_images(id,product_id,variant_id,file_path) VALUES(?,1,1,?)').run(i,p)}
 const input={items:[{imageId:1,unitPrice:50000}],discount:0,note:'',contact:{recipientName:'Mẹ test',phone:'0901234567',address:'Bạc Liêu',shippingFee:10000}}
 const d=drafts.create(input,'stage3-draft-create-001'),id=d.id
 eq(finance.summary(id).originalTotal,60000);eq(finance.summary(id).due,60000)
 const record=(kind:string,amount:number,key:string,note='Chứng từ test')=>{const s=finance.summary(id);return finance.record(id,{version:s.version,orderVersion:s.orderVersion,kind,amount,method:'TRANSFER',note},key)}
 fails(()=>record('RECEIPT',-1,'stage3-negative-0001'));fails(()=>record('RECEIPT',1.5,'stage3-decimal-0001'));fails(()=>record('RECEIPT',60001,'stage3-excess-0001'));fails(()=>record('REFUND',1,'stage3-refund-empty-001'));fails(()=>record('CREDIT',1,'stage3-credit-draft-001'))
 const first={version:0,orderVersion:1,kind:'RECEIPT',amount:20000,method:'TRANSFER',note:'Cọc lần 1'}
 const deposit=finance.record(id,first,'stage3-deposit-request-001');eq(deposit.netCollected,20000);eq(deposit.due,40000);eq(deposit.paymentStatus,'PARTIAL')
 eq(finance.record(id,first,'stage3-deposit-request-001').replayed,true);eq(finance.summary(id).entries.length,1)
 fails(()=>finance.record(id,{...first,amount:1},'stage3-deposit-request-001'));fails(()=>finance.record(id,first,'stage3-stale-request-001'))
 fails(()=>drafts.cancel(id,1));fails(()=>drafts.update(id,{...input,version:1,items:[{imageId:1,unitPrice:9000}]}));eq(drafts.get(id).payableTotal,60000)
 // A concurrent tab/connection cannot commit an old revision.
 const other=new DatabaseSync(file),stale=financeService(other).summary(id)
 let s=finance.summary(id);s=finance.configure(id,{version:s.version,orderVersion:1,method:'TRANSFER',delivery:'NEW',tracking:''})
 fails(()=>financeService(other).record(id,{version:stale.version,orderVersion:1,kind:'RECEIPT',amount:1,method:'CASH',note:'Tab cũ'},'stage3-other-tab-001'));other.close()
 fails(()=>finance.configure(id,{version:s.version,orderVersion:1,method:'COD',delivery:'DELIVERED',tracking:''}))
 const pre=await salesPreflightService(db,root).check(id,1);await salesExecutionService(db,root).confirm(id,{version:1,token:pre.token,confirmed:true,acknowledgeZeroPrice:false},'stage3-sale-request-001')
 const soldBefore=JSON.stringify(db.prepare('SELECT * FROM sales_confirmations WHERE order_id=?').get(id))
 s=finance.summary(id);eq(s.orderStatus,'SOLD');s=finance.configure(id,{version:s.version,orderVersion:1,method:'COD',delivery:'SHIPPED',tracking:'VC001'});eq(s.delivery,'SHIPPED')
 eq(finance.debts().length,1);s=record('RECEIPT',40000,'stage3-balance-request-001');eq(s.due,0);eq(s.paymentStatus,'PAID');eq(finance.debts().length,0)
 s=record('CREDIT',5000,'stage3-credit-request-001','Hỗ trợ sau bán');eq(s.adjustedTotal,55000);eq(s.refundDue,5000);eq(finance.debts()[0].refundDue,5000)
 s=record('REFUND',5000,'stage3-refund-request-001','Đã hoàn khách');eq(s.netCollected,55000);eq(s.refundDue,0);eq(s.due,0);eq(finance.debts().length,0)
 fails(()=>record('REFUND',55001,'stage3-too-much-refund-001'));fails(()=>record('CREDIT',55001,'stage3-too-much-credit-001'))
 fails(()=>db.prepare('UPDATE finance_entries SET amount=1 WHERE order_id=?').run(id));fails(()=>db.prepare('DELETE FROM finance_entries WHERE order_id=?').run(id))
 eq(JSON.stringify(db.prepare('SELECT * FROM sales_confirmations WHERE order_id=?').get(id)),soldBefore)
 const caseRaw={version:s.version,orderVersion:1,kind:'RETURN',note:'Khách báo cần trả hàng'}
 s=finance.createCase(id,caseRaw,'stage3-case-request-001');eq(s.cases.length,1);eq(finance.createCase(id,caseRaw,'stage3-case-request-001').cases.length,1)
 const c=s.cases[0];const resolution={version:s.version,orderVersion:1,caseVersion:1,resolution:'Đã hỗ trợ giảm 5.000 và hoàn tiền; khách giữ hàng'}
 s=finance.resolveCase(id,String(c.id),resolution);eq(s.cases[0].status,'RESOLVED');eq(finance.resolveCase(id,String(c.id),resolution).cases[0].status,'RESOLVED')
 fails(()=>finance.resolveCase(id,String(c.id),{...resolution,resolution:'Ghi đè'}));fails(()=>db.prepare("UPDATE aftercare_cases SET resolution='Ghi đè' WHERE id=?").run(c.id!));fails(()=>db.prepare('DELETE FROM aftercare_cases WHERE id=?').run(c.id!));validateFinance(db)
 const slip=orderSlipService(db,root),info=slip.summary(id,1);eq(info.finance.netCollected,55000)
 eq((await sharp(await slip.png(id,1,1,info.finance.version)).metadata()).width,1080)
 await assert.rejects(()=>slip.png(id,1,1,info.finance.version-1));checks++
 const before=finance.summary(id),backup=createSalesBackup(db,file,root),restored=restoreSalesBackup(backup.directory,path.join(root,'restore'),path.join(root,'warehouse'))
 eq(restored.counts.finance_entries,4);eq(restored.counts.aftercare_cases,1)
 const copy=new DatabaseSync(restored.database);validateFinance(copy);eq(financeService(copy).summary(id),before);copy.close()
 db.close();db=new DatabaseSync(file);drafts=salesDraftService(db,root);finance=financeService(db);eq(finance.summary(id),before)
 const second=drafts.create({...input,items:[{imageId:2,unitPrice:50000}]},'stage3-second-draft-001')
 let f=finance.summary(second.id);finance.record(second.id,{version:f.version,orderVersion:1,kind:'RECEIPT',amount:10000,method:'CASH',note:'Cọc'},'stage3-second-deposit-001');fails(()=>drafts.cancel(second.id,1));f=finance.summary(second.id);finance.record(second.id,{version:f.version,orderVersion:1,kind:'REFUND',amount:10000,method:'CASH',note:'Hoàn cọc'},'stage3-second-refund-001');eq(drafts.cancel(second.id,1).status,'CANCELLED_DRAFT')
 console.log('STAGE3_SELF_TEST PASS: '+checks+' checks; deposits, partial/full payment, refund/credit, debts, immutable SOLD/ledger, stale-tab guards, retry, aftercare, PNG revision, restart and complete restore')
}finally{db.close();fs.rmSync(root,{recursive:true,force:true})}

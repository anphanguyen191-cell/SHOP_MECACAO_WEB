import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import assert from 'node:assert/strict'
import sharp from 'sharp'
import {DatabaseSync} from 'node:sqlite'
import {bootstrapSalesDrafts} from './salesSchema.js'
import {bootstrapSalesExecution,salesExecutionService} from './salesExecution.js'
import {salesDraftService} from './salesDrafts.js'
import {financeService} from './orderFinance.js'
import {salesPreflightService} from './salesPreflight.js'
import {businessReports,reportRange,csvText} from './businessReports.js'
import {bootstrapStocktake,stocktakeService,validateStocktakes} from './stocktake.js'
import {createSalesBackup,restoreSalesBackup} from './salesBackup.js'
const root=fs.mkdtempSync(path.join(os.tmpdir(),'mecacao-stage4-')),file=path.join(root,'shop.db')
let db=new DatabaseSync(file),checks=0
const eq=(a:unknown,b:unknown)=>{assert.deepEqual(a,b);checks++},fails=(fn:()=>unknown)=>{assert.throws(fn);checks++}
try{
 db.exec('PRAGMA foreign_keys=ON;PRAGMA journal_mode=WAL;');bootstrapSalesDrafts(db);bootstrapSalesExecution(db,root)
 const drafts=salesDraftService(db,root),finance=financeService(db);bootstrapStocktake(db)
 let stock=stocktakeService(db,root)
 db.exec("INSERT INTO products(id,product_code,name) VALUES(1,'R1','Bộ báo cáo');INSERT INTO product_variants(id,product_id,sku,size,cost_price,sale_price) VALUES(1,1,'R1-S1','Size 1',20000,50000),(2,1,'R1-S2','Size 2',0,40000);INSERT INTO inventory_transactions(variant_id,transaction_type,quantity) VALUES(1,'OPENING',3),(2,'OPENING',1)")
 const photos:string[]=[]
 for(let i=1;i<=4;i++){const variant=i<=3?1:2,p=path.join(root,'warehouse','Bộ báo cáo','Size '+variant,i+'.png');fs.mkdirSync(path.dirname(p),{recursive:true});await sharp({create:{width:100,height:120,channels:3,background:'#ddffcc'}}).png().toFile(p);db.prepare('INSERT INTO product_images(id,product_id,variant_id,file_path) VALUES(?,1,?,?)').run(i,variant,p);photos.push(p)}
 eq(reportRange('2026-10-10','2026-10-10').start,'2026-10-09 17:00:00');eq(reportRange('2026-10-10','2026-10-10').end,'2026-10-10 17:00:00');fails(()=>reportRange('2026-02-30','2026-03-01'));fails(()=>reportRange('2026-99-01','2026-10-10'));fails(()=>reportRange('2026-10-11','2026-10-10'));fails(()=>reportRange('bad','2026-10-10'))
 const input={items:[{imageId:1,unitPrice:50000}],discount:5000,note:'',contact:{recipientName:'=Khách CSV',phone:'0901234567',address:'Bạc Liêu',shippingFee:10000}}
 const d=drafts.create(input,'stage4-first-draft-001')
 let f=finance.summary(d.id);finance.record(d.id,{version:f.version,orderVersion:1,kind:'RECEIPT',amount:10000,method:'CASH',note:'Cọc'},'stage4-deposit-request-001')
 const reports=businessReports(db),from='2000-01-01',to='2100-12-31';let report=reports.summary(from,to)
 eq(report.totals.orders,0);eq(report.totals.receipts,'10000');eq(report.totals.dueNow,'0');eq(report.entries.length,1)
 const pre=await salesPreflightService(db,root).check(d.id,1);await salesExecutionService(db,root).confirm(d.id,{version:1,token:pre.token,confirmed:true,acknowledgeZeroPrice:false},'stage4-sale-request-001')
 report=reports.summary(from,to);eq(report.totals.orders,1);eq(report.totals.quantity,1);eq(report.totals.goodsTotal,'45000');eq(report.totals.shipping,'10000');eq(report.totals.payableTotal,'55000');eq(report.totals.grossMargin,'25000');eq(report.totals.knownCost,'20000');eq(report.totals.dueNow,'45000');eq(report.products[0].grossSales,'50000')
 db.exec("UPDATE product_variants SET cost_price=990000,sale_price=990000 WHERE id=1;UPDATE products SET name='Tên đã đổi' WHERE id=1")
 eq(reports.summary(from,to).totals.grossMargin,'25000');eq(reports.summary(from,to).products[0].name,'Bộ báo cáo')
 f=finance.summary(d.id);finance.record(d.id,{version:f.version,orderVersion:1,kind:'CREDIT',amount:5000,method:'CASH',note:'Hỗ trợ'},'stage4-credit-request-001');f=finance.summary(d.id);finance.record(d.id,{version:f.version,orderVersion:1,kind:'REFUND',amount:1000,method:'CASH',note:'Hoàn một phần'},'stage4-refund-request-001')
 report=reports.summary(from,to);eq(report.totals.credits,'5000');eq(report.totals.netCash,'9000');eq(report.totals.goodsTotal,'45000');eq(report.totals.dueNow,'41000');eq(report.orders[0].adjustedToDate,'50000')
 const unknown=drafts.create({...input,items:[{imageId:4,unitPrice:40000}],discount:0},'stage4-unknown-cost-001'),up=await salesPreflightService(db,root).check(unknown.id,1);await salesExecutionService(db,root).confirm(unknown.id,{version:1,token:up.token,confirmed:true,acknowledgeZeroPrice:false},'stage4-sale-unknown-001')
 report=reports.summary(from,to);eq(report.totals.unknownCosts,1);eq(report.totals.grossMargin,null);eq(report.orders.find(o=>o.id===unknown.id)!.grossMargin,null)
 const csv=csvText([['Khách','Ghi chú'],['=X','a,"b"\nđ'],[' \t@x','-4000']]);eq(csv.startsWith('\uFEFF'),true);eq(csv.includes('"\'=X"'),true);eq(csv.includes('a,""b""'),true);eq(csv.includes('"\'-4000"'),true)
 // Empty period excludes sales and movements but current debt still includes all SOLD orders.
 const empty=reports.summary('2000-01-01','2000-01-01');eq(empty.totals.orders,0);eq(empty.entries.length,0);eq(empty.totals.dueNow,'91000')
 // Isolated copy exercises exact SQL date boundaries and totals beyond JS safe integer.
 const shadowFile=path.join(root,'boundary-copy.db');db.exec("VACUUM INTO '"+shadowFile.replace(/'/g,"''")+"'");const shadow=new DatabaseSync(shadowFile)
 try{
  for(const trigger of shadow.prepare("SELECT name FROM sqlite_master WHERE type='trigger'").all())shadow.exec('DROP TRIGGER "'+String(trigger.name).replaceAll('"','""')+'"')
  shadow.prepare('UPDATE sales_confirmations SET created_at=? WHERE order_id=?').run('2026-10-09 17:00:00',d.id);shadow.prepare('UPDATE sales_confirmations SET created_at=? WHERE order_id=?').run('2026-10-10 17:00:00',unknown.id)
  shadow.exec("UPDATE finance_entries SET created_at='2026-10-09 16:59:59' WHERE kind='RECEIPT';UPDATE finance_entries SET created_at='2026-10-09 17:00:00' WHERE kind='CREDIT';UPDATE finance_entries SET created_at='2026-10-10 17:00:00' WHERE kind='REFUND'")
  const edge=businessReports(shadow).summary('2026-10-10','2026-10-10');eq(edge.orders.length,1);eq(edge.orders[0].id,d.id);eq(edge.totals.receipts,'0');eq(edge.totals.credits,'5000');eq(edge.totals.refunds,'0');eq(businessReports(shadow).summary('2026-10-11','2026-10-11').orders[0].id,unknown.id)
  shadow.exec('UPDATE sales_confirmations SET subtotal=9007199254740991,discount=0,total=9007199254740991');eq(businessReports(shadow).summary(from,to).totals.goodsTotal,'18014398509481982')
 }finally{shadow.close()}
 const c=stock.capture();eq(c.rows[0].physical,2);eq(c.rows[0].ledger,2);eq(c.rows[0].retired,1);eq(c.rows[1].physical,0);eq(c.rows[1].retired,1)
 let session=stock.create({title:'Kiểm kê sáng'},'stage4-stocktake-create-001');eq(session.rows.length,2);eq(stock.create({title:'Kiểm kê sáng'},'stage4-stocktake-create-001').id,session.id)
 fails(()=>stock.create({title:'Tên khác'},'stage4-stocktake-create-001'));fails(()=>stock.create({title:'Phiên khác'},'stage4-stocktake-create-002'))
 const id=session.id,rawRows=session.rows.map(r=>({variantId:r.variantId,counted:r.physical,note:''}))
 fails(()=>stock.finish(id,{version:1,confirmed:true,conclusion:'Chưa đếm'}));fails(()=>stock.save(id,{version:0,rows:rawRows}));fails(()=>stock.save(id,{version:1,rows:[rawRows[0],rawRows[0]]}));fails(()=>stock.save(id,{version:1,rows:rawRows.map(r=>({...r,counted:-1}))}))
 session=stock.save(id,{version:1,rows:rawRows.map(r=>r.variantId===1?{...r,counted:1}:r)});eq(session.version,2);eq(session.rows[0].difference,-1)
 fails(()=>stock.finish(id,{version:2,confirmed:true,conclusion:'Thiếu hàng'}))
 session=stock.save(id,{version:2,rows:rawRows.map(r=>r.variantId===1?{...r,counted:1,note:'Chưa tìm thấy một bộ khi đếm'}:r)})
 const close={version:3,confirmed:true,conclusion:'Đã đối chiếu; cần kiểm tra hàng thiếu'};session=stock.finish(id,close);eq(session.status,'CLOSED');eq(stock.finish(id,close).version,4);eq(stock.capture().rows[0].physical,2);eq(db.prepare('SELECT stock FROM inventory_stock WHERE variant_id=1').get()!.stock,2)
 fails(()=>stock.save(id,{version:4,rows:rawRows}));fails(()=>db.prepare('UPDATE stocktake_rows SET counted=9 WHERE session_id=?').run(id));fails(()=>db.prepare("UPDATE stocktake_sessions SET conclusion='sửa' WHERE id=?").run(id));fails(()=>db.prepare('DELETE FROM stocktake_rows WHERE session_id=?').run(id));fails(()=>db.prepare('DELETE FROM stocktake_sessions WHERE id=?').run(id))
 let stale=stock.create({title:'Phiên kho thay đổi'},'stage4-stocktake-stale-001');stale=stock.save(stale.id,{version:1,rows:stale.rows.map(r=>({variantId:r.variantId,counted:r.physical,note:''}))})
 fs.renameSync(photos[1],photos[1]+'.moved');eq(stock.current(stale.id).changedSinceStart,true);fails(()=>stock.finish(stale.id,{version:2,confirmed:true,conclusion:'Không được chốt kho đổi'}));eq(stock.capture().rows[0].missing,1)
 eq(stock.finish(stale.id,{version:2,cancel:true,conclusion:'Kho thay đổi, hủy để đếm lại'}).status,'CANCELLED');fs.renameSync(photos[1]+'.moved',photos[1])
 validateStocktakes(db)
 // A second connection must not overwrite a newer saved count.
 const concurrent=stock.create({title:'Tab cũ'},'stage4-stocktake-tabs-001'),other=new DatabaseSync(file),second=stocktakeService(other,root);stock.save(concurrent.id,{version:1,rows:rawRows});fails(()=>second.save(concurrent.id,{version:1,rows:rawRows}));other.close();stock.finish(concurrent.id,{version:2,cancel:true,conclusion:'Kết thúc kiểm thử'})
 const before=stock.get(id),backup=createSalesBackup(db,file,root),restored=restoreSalesBackup(backup.directory,path.join(root,'restore'),path.join(root,'warehouse'))
 eq(restored.counts.stocktake_sessions,3);eq(restored.counts.stocktake_rows,6)
 const copy=new DatabaseSync(restored.database);validateStocktakes(copy);eq(stocktakeService(copy,restored.targetRoot).get(id),before);eq(businessReports(copy).summary(from,to).totals,reports.summary(from,to).totals);copy.close()
 db.close();db=new DatabaseSync(file);stock=stocktakeService(db,root);eq(stock.get(id),before)
 console.log('STAGE4_SELF_TEST PASS: '+checks+' checks; Vietnam dates, sold snapshots, cash versus sales, unknown costs, current debt, CSV safety, counts, stale warehouse/tabs, immutable close, no stock mutation, restart and full backup/restore')
}finally{db.close();fs.rmSync(root,{recursive:true,force:true})}

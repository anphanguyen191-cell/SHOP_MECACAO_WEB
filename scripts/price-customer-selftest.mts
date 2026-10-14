import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {DatabaseSync} from 'node:sqlite'
import {JSDOM} from 'jsdom'
import {unzipSync,zipSync,strFromU8,strToU8} from 'fflate'
import {bootstrapSalesDrafts} from '../apps/api/src/salesSchema.ts'
import {bootstrapSalesExecution} from '../apps/api/src/salesExecution.ts'
import {salesDraftService} from '../apps/api/src/salesDrafts.ts'
import {priceBulkService} from '../apps/api/src/priceBulk.ts'
import {writePriceWorkbook,readPriceWorkbook} from '../apps/web/src/priceWorkbook.ts'
const root=fs.mkdtempSync(path.join(os.tmpdir(),'mecacao-price-')),db=new DatabaseSync(path.join(root,'shop.db'))
Object.assign(globalThis,{DOMParser:new JSDOM('').window.DOMParser})
try{
 db.exec('PRAGMA foreign_keys=ON');bootstrapSalesDrafts(db);bootstrapSalesExecution(db,root)
 db.exec("INSERT INTO products(id,product_code,name) VALUES(1,'P1','Đồ tole <bé>');INSERT INTO product_variants(id,product_id,sku,size,cost_price,sale_price) VALUES(1,1,'P1-10','Size 10',0,80000),(2,1,'P1-12','Size 12',0,0);")
 const prices=priceBulkService(db,()=>[{product_code:'P1',product_name:'Đồ tole <bé>',variants:db.prepare('SELECT id variant_id,sku,size,cost_price,sale_price,2 stock FROM product_variants ORDER BY id').all()}])
 let snap=prices.snapshot();assert.equal(snap.rows.length,2)
 let raw=readPriceWorkbook(writePriceWorkbook(snap));assert.equal(raw.rows[0].cost,null);assert.equal(raw.rows[0].sale,80000);assert.equal(raw.rows[1].sale,null)
 raw.rows[0].cost=50000;raw.rows[0].sale=85000;raw.rows[1].cost=0;raw.rows[1].sale=90000
 let preview=prices.preview(raw);assert.equal(preview.costCount,2);assert.equal(preview.saleCount,1);assert.equal(db.prepare('SELECT cost_price FROM product_variants WHERE id=1').get()!.cost_price,0)
 const result=prices.commit(raw,'price-import-request-0001');assert.equal(result.costCount,2);assert.equal(db.prepare('SELECT sale_price FROM product_variants WHERE id=1').get()!.sale_price,80000)
 assert.deepEqual(prices.commit(raw,'price-import-request-0001'),result);assert.equal(prices.snapshot().rows[1].costSet,true);assert.equal(prices.preview({...raw,rows:raw.rows.map(r=>({...r,version:prices.snapshot().rows.find(x=>x.id===r.id)!.version}))}).costCount,0)
 assert.throws(()=>prices.preview({...raw,instance:'another'}));assert.throws(()=>prices.preview({...raw,rows:[raw.rows[0],raw.rows[0]]}));assert.throws(()=>prices.preview({...raw,rows:[{...raw.rows[0],cost:-1}]}));assert.throws(()=>prices.preview({...raw,rows:[{...raw.rows[0],sku:'wrong'}]}))
 const fresh=readPriceWorkbook(writePriceWorkbook(prices.snapshot()));db.exec('UPDATE product_variants SET cost_price=0 WHERE id=1');assert.equal(prices.preview(fresh).rows[0].status,'Giá đã thay đổi — bỏ qua')
 const zip=unzipSync(writePriceWorkbook(snap)),sheet=strFromU8(zip['xl/worksheets/sheet1.xml']);zip['xl/worksheets/sheet1.xml']=strToU8(sheet.replace('<c r="G2" s="3" t="inlineStr"><is><t xml:space="preserve"></t></is></c>','<c r="G2"><f>1+1</f><v>2</v></c>'));assert.throws(()=>readPriceWorkbook(zipSync(zip)),/công thức/)
 // Excel rewrites text as sharedStrings: reader must accept that normal save format.
 const saved=unzipSync(writePriceWorkbook(snap));saved['xl/sharedStrings.xml']=strToU8('<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><si><t>P1</t></si></sst>');saved['xl/worksheets/sheet1.xml']=strToU8(sheet.replace('<c r="B2" s="0" t="inlineStr"><is><t xml:space="preserve">P1</t></is></c>','<c r="B2" t="s"><v>0</v></c>'));assert.equal(readPriceWorkbook(zipSync(saved)).rows[0].productCode,'P1')
 const file=path.join(root,'one.jpg');fs.writeFileSync(file,'fixture');db.prepare('INSERT INTO product_images(id,product_id,variant_id,file_path) VALUES(1,1,1,?)').run(file)
 const drafts=salesDraftService(db,root),base={items:[{imageId:1,unitPrice:80000}],discount:0,note:'',contact:{customerId:null,recipientName:'Khách mẫu',phone:'0901234567',address:'Cà Mau',shippingFee:0,saveCustomer:true}}
 const draft=drafts.create(base,'draft-customer-create-0001');assert(draft.contact.customerId);assert.equal(db.prepare('SELECT count(*) n FROM shop_customers').get()!.n,1);assert.equal(drafts.create(base,'draft-customer-create-0001').contact.customerId,draft.contact.customerId)
 assert.throws(()=>drafts.update(draft.id,{...base,version:draft.version,contact:{...base.contact,phone:'+84 901234567'}}),/Số điện thoại/);assert.equal(db.prepare('SELECT count(*) n FROM shop_customers').get()!.n,1)
 assert.throws(()=>drafts.update(draft.id,{...base,version:draft.version,contact:{...base.contact,phone:'',confirmNoPhone:false}}),/Xác nhận/)
 const contactOnly=drafts.update(draft.id,{...base,version:draft.version,contact:{...base.contact,phone:'0912345678',saveCustomer:false}});assert.equal(contactOnly.contact.customerId,null);assert.equal(db.prepare('SELECT count(*) n FROM shop_customers').get()!.n,1)
 assert.throws(()=>drafts.update(draft.id,{...base,version:1,contact:{...base.contact,phone:'0923456789'}}));assert.equal(db.prepare('SELECT count(*) n FROM shop_customers').get()!.n,1)
 console.log('PASS pricing XLSX: real OOXML/shared strings, blank and explicit zero, formulas rejected, per-field fill-only, stale/identity/duplicate rejection, exact replay; draft customer atomic save, normalized duplicate, no-phone confirmation, opt-out, failed draft rollback')
}finally{db.close();fs.rmSync(root,{recursive:true,force:true})}

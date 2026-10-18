import path from 'node:path'
import {createHash} from 'node:crypto'
import type {DatabaseSync} from 'node:sqlite'
import {hasStockReturns} from './stockReturnState.js'

export type ReturnUnit={sourceId:number;productId:number;variantId:number;source:string;sha:string;destination:string;staging:string;cost:number|null}
export type ReturnPlan={format:1;id:string;orderId:string;inputHash:string;reason:string;units:ReturnUnit[]}
export const returnHash=(b:Buffer|string)=>createHash('sha256').update(b).digest('hex')
export const returnJournal=(id:string)=>path.join('.mecacao-v2-sales','returns',id,'plan.json')
export function relativeReturnPath(root:string,r:string){
 if(typeof r!=='string'||!r||path.isAbsolute(r))throw Error('Đường dẫn nhận lại không hợp lệ')
 const absolute=path.resolve(root,r),relative=path.relative(root,absolute)
 if(relative!==r||relative==='..'||relative.startsWith('..'+path.sep))throw Error('Đường dẫn nhận lại vượt kho')
 return absolute
}
export function readReturnPlan(row:any,file:(r:string)=>Buffer):ReturnPlan{
 if(returnHash(String(row.payload))!==row.payload_hash||returnHash(file(returnJournal(String(row.id))))!==row.payload_hash)throw Error('Journal nhận lại sai checksum')
 const p=JSON.parse(String(row.payload)) as ReturnPlan
 if(p.format!==1||p.id!==row.id||p.orderId!==row.order_id||p.inputHash!==row.input_hash||!Array.isArray(p.units)||!p.units.length||p.units.length>100||new Set(p.units.map(u=>u.sourceId)).size!==p.units.length||!p.reason?.trim())throw Error('Chứng từ nhận lại không hợp lệ')
 for(const u of p.units)if(!Number.isSafeInteger(u.sourceId)||u.sourceId<1||!Number.isSafeInteger(u.productId)||!Number.isSafeInteger(u.variantId)||! /^[a-f0-9]{64}$/.test(u.sha)||!u.staging.startsWith(path.dirname(returnJournal(p.id))+path.sep)||!(u.cost===null||Number.isSafeInteger(u.cost)&&u.cost>=0))throw Error('Bộ hàng nhận lại không hợp lệ')
 return p
}
export function validateStockReturnProof(db:DatabaseSync,p:ReturnPlan,status:string){
 const links=db.prepare('SELECT * FROM stock_return_units WHERE operation_id=?').all(p.id)
 if(status==='RETURNED'&&links.length!==p.units.length||status!=='RETURNED'&&links.length)throw Error('Nhận lại có chứng từ dở dang')
 for(const u of p.units){
  const source=db.prepare('SELECT * FROM sales_units WHERE image_id=?').get(u.sourceId)
  if(!source||source.order_id!==p.orderId||source.variant_id!==u.variantId||source.source_hash!==u.sha)throw Error('Nguồn SOLD không khớp nhận lại')
  const original=db.prepare('SELECT o.payload,o.payload_hash FROM sales_confirmations c JOIN sales_operations o ON o.id=c.operation_id WHERE c.order_id=?').get(p.orderId)
  if(!original||returnHash(String(original.payload))!==original.payload_hash)throw Error('Thiếu chứng từ nguồn SOLD')
  const sold=JSON.parse(String(original.payload)).units.find((s:any)=>s.imageId===u.sourceId)
  if(!sold||sold.staged!==u.source||sold.sourceHash!==u.sha||sold.snapshot.unit_cost!==u.cost)throw Error('Ảnh gốc/giá vốn nhận lại không khớp SOLD')
  if(status!=='RETURNED')continue
  const link=links.find(l=>l.source_image_id===u.sourceId),image=link&&db.prepare('SELECT * FROM product_images WHERE id=?').get(link.new_image_id),ledger=link&&db.prepare('SELECT * FROM inventory_transactions WHERE id=?').get(link.transaction_id)
  if(!link||!image||image.id===u.sourceId||image.product_id!==u.productId||image.variant_id!==u.variantId||!ledger||ledger.variant_id!==u.variantId||ledger.transaction_type!=='IMPORT'||ledger.quantity!==1||ledger.unit_cost!==u.cost||ledger.note!==returnNote(p,u))throw Error('Tồn/phiếu nhập nhận lại không khớp')
 }
}
export const returnNote=(p:ReturnPlan,u:ReturnUnit)=>'Nhận lại '+p.id+' · SOLD '+p.orderId+' · ảnh '+u.sourceId+' · '+p.reason
/** Portable evidence: current image paths may have changed through rename/restore/resale. */
export function validateStockReturns(db:DatabaseSync,sourceRoot:string,file:(r:string)=>Buffer){
 if(!hasStockReturns(db))return
 let returned=0
 for(const row of db.prepare('SELECT * FROM stock_return_operations').all()){
  if(row.status==='PREPARED')throw Error('Cần phục hồi nhận lại trước backup')
  const p=readReturnPlan(row,file);validateStockReturnProof(db,p,String(row.status))
  if(row.status!=='RETURNED')continue
  returned+=p.units.length
  for(const u of p.units){
   if(returnHash(file(u.source))!==u.sha)throw Error('Ảnh gốc nhận lại không đúng')
   const link=db.prepare('SELECT new_image_id FROM stock_return_units WHERE source_image_id=?').get(u.sourceId)!,sold=db.prepare('SELECT source_hash FROM sales_units WHERE image_id=?').get(link.new_image_id)
   if(sold){if(sold.source_hash!==u.sha)throw Error('Ảnh nhận lại bán tiếp sai checksum')}
   else{const image=db.prepare('SELECT file_path FROM product_images WHERE id=?').get(link.new_image_id)!;const r=path.relative(sourceRoot,String(image.file_path));relativeReturnPath(sourceRoot,r);if(returnHash(file(r))!==u.sha)throw Error('Ảnh tồn nhận lại thay đổi')}
  }
 }
 if(Number(db.prepare('SELECT COUNT(*) n FROM stock_return_units').get()!.n)!==returned)throw Error('Chứng từ nhận lại thiếu nguồn')
}

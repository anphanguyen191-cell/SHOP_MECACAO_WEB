import fs from 'node:fs'
import path from 'node:path'
import {createHash,randomUUID} from 'node:crypto'
import {DatabaseSync} from 'node:sqlite'

export class SalesError extends Error{constructor(message:string,public status=400){super(message)}}
type Item={imageId:number;unitPrice:number}
type Input={items:Item[];discount:number;note:string}
type Stock={image_id:number;product_id:number;variant_id:number;file_path:string;product_name:string;product_code:string;size:string;sku:string;unit_cost:number;product_status:string;variant_status:string}
type Order={id:string;status:'DRAFT'|'CANCELLED_DRAFT';version:number;discount:number;note:string;created_at:string;updated_at:string;request_hash:string}
type Saved={image_id:number;product_id:number;variant_id:number;product_name:string;product_code:string;size:string;sku:string;unit_price:number;unit_cost:number|null}

function money(value:unknown,label:string){if(!Number.isSafeInteger(value)||Number(value)<0)throw new SalesError(label+' phải là số đồng nguyên không âm');return value as number}
function validate(raw:any):Input{
 if(!raw||!Array.isArray(raw.items)||!raw.items.length||raw.items.length>100)throw new SalesError('Chọn từ 1 đến 100 ảnh cho đơn nháp')
 const ids=new Set<number>()
 const items=raw.items.map((item:any)=>{
  if(!Number.isSafeInteger(item?.imageId)||item.imageId<=0||ids.has(item.imageId))throw new SalesError('Ảnh trong đơn phải có ID hợp lệ, không trùng')
  ids.add(item.imageId);return {imageId:item.imageId,unitPrice:money(item.unitPrice,'Giá bán')}
 })
 const discount=money(raw.discount,'Giảm giá')
 const subtotal=items.reduce((sum:number,i:Item)=>{const n=sum+i.unitPrice;if(!Number.isSafeInteger(n))throw new SalesError('Tổng tiền vượt giới hạn an toàn');return n},0)
 if(discount>subtotal)throw new SalesError('Giảm giá không được vượt tiền hàng')
 if(typeof raw.note!=='string'||raw.note.length>500)throw new SalesError('Ghi chú tối đa 500 ký tự')
 return {items,discount,note:raw.note.trim()}
}

/** Drafts have no filesystem writes, inventory transactions, image claims or reservations. */
export function salesDraftService(db:DatabaseSync,sandboxRoot:string){
 const root=fs.realpathSync(sandboxRoot)
 const select=db.prepare(`SELECT i.id image_id,i.product_id,i.variant_id,i.file_path,p.name product_name,p.product_code,v.size,v.sku,v.cost_price unit_cost,p.status product_status,v.status variant_status FROM product_images i JOIN products p ON p.id=i.product_id JOIN product_variants v ON v.id=i.variant_id AND v.product_id=p.id WHERE i.id=?`)
 function stock(id:number){return select.get(id) as Stock|undefined}
 function unavailable(row:Stock|undefined){
  if(!row)return 'Ảnh không còn đăng ký'
  if(row.product_status!=='active'||row.variant_status!=='active')return 'Product/Size đã ngừng hoạt động'
  if(!['.jpg','.jpeg','.png','.webp','.heic'].includes(path.extname(row.file_path).toLowerCase()))return 'Định dạng không phải ảnh tồn'
  try{
   const rel=path.relative(root,fs.realpathSync(row.file_path))
   if(!rel||path.isAbsolute(rel)||rel==='..'||rel.startsWith('..'+path.sep))return 'Ảnh nằm ngoài sandbox'
   if(!fs.statSync(row.file_path).isFile())return 'Đường dẫn không phải file ảnh'
  }catch{return 'Không đọc được ảnh vật lý; hãy kiểm tra kho'}
  return null
 }
 function transaction<T>(action:()=>T){db.exec('BEGIN IMMEDIATE');try{const r=action();db.exec('COMMIT');return r}catch(e){db.exec('ROLLBACK');throw e}}
 function order(id:string){const row=db.prepare('SELECT * FROM sales_orders WHERE id=?').get(id) as Order|undefined;if(!row)throw new SalesError('Không tìm thấy đơn',404);return row}
 function get(id:string){
  const row=order(id)
  const items=(db.prepare('SELECT * FROM sales_order_images WHERE order_id=? ORDER BY position').all(id) as Saved[]).map(item=>({...item,unavailable:unavailable(stock(item.image_id))}))
  const subtotal=items.reduce((n,i)=>n+i.unit_price,0)
  return {id:row.id,status:row.status,version:row.version,discount:row.discount,note:row.note,created_at:row.created_at,updated_at:row.updated_at,items,quantity:items.length,subtotal,total:subtotal-row.discount,available:items.every(i=>!i.unavailable),reservesStock:false}
 }
 function saveItems(id:string,input:Input){
  const rows=input.items.map(item=>{const row=stock(item.imageId),reason=unavailable(row);if(reason)throw new SalesError('Ảnh #'+item.imageId+': '+reason,409);return {row:row!,price:item.unitPrice}})
  db.prepare('DELETE FROM sales_order_images WHERE order_id=?').run(id)
  const insert=db.prepare('INSERT INTO sales_order_images(order_id,image_id,product_id,variant_id,product_name,product_code,size,sku,unit_price,unit_cost,position) VALUES(?,?,?,?,?,?,?,?,?,?,?)')
  rows.forEach(({row,price},i)=>insert.run(id,row.image_id,row.product_id,row.variant_id,row.product_name,row.product_code,row.size,row.sku,price,row.unit_cost>0?row.unit_cost:null,i))
 }
 return {
  get,
  list(status='DRAFT'){
   if(!['DRAFT','CANCELLED_DRAFT','all'].includes(status))throw new SalesError('Trạng thái đơn không hợp lệ')
   return db.prepare(`SELECT o.id,o.status,o.version,o.discount,o.note,o.created_at,o.updated_at,COUNT(i.image_id) quantity,COALESCE(SUM(i.unit_price),0) subtotal,COALESCE(SUM(i.unit_price),0)-o.discount total FROM sales_orders o LEFT JOIN sales_order_images i ON i.order_id=o.id WHERE (?='all' OR o.status=?) GROUP BY o.id ORDER BY o.created_at DESC,o.id LIMIT 200`).all(status,status)
  },
  create(raw:unknown,key:unknown){
   if(typeof key!=='string'||! /^[A-Za-z0-9_-]{16,100}$/.test(key))throw new SalesError('Thiếu mã yêu cầu tạo đơn hợp lệ')
   const input=validate(raw),hash=createHash('sha256').update(JSON.stringify(input)).digest('hex')
   const id=transaction(()=>{
    const previous=db.prepare('SELECT id,request_hash FROM sales_orders WHERE request_key=?').get(key) as {id:string;request_hash:string}|undefined
    if(previous){if(previous.request_hash!==hash)throw new SalesError('Mã yêu cầu đã dùng với nội dung khác',409);return previous.id}
    const id=randomUUID();db.prepare('INSERT INTO sales_orders(id,request_key,request_hash,discount,note) VALUES(?,?,?,?,?)').run(id,key,hash,input.discount,input.note)
    saveItems(id,input);return id
   })
   return get(id)
  },
  update(id:string,raw:any){
   const input=validate(raw)
   if(!Number.isSafeInteger(raw.version)||raw.version<1)throw new SalesError('Thiếu phiên bản đơn')
   transaction(()=>{
    const row=order(id)
    if(row.status!=='DRAFT'||row.version!==raw.version)throw new SalesError('Đơn đã thay đổi hoặc đã hủy. Mở lại trước khi sửa.',409)
    saveItems(id,input)
    db.prepare("UPDATE sales_orders SET discount=?,note=?,version=version+1,updated_at=datetime('now') WHERE id=?").run(input.discount,input.note,id)
   })
   return get(id)
  },
  cancel(id:string,version:unknown){
   if(!Number.isSafeInteger(version)||Number(version)<1)throw new SalesError('Thiếu phiên bản đơn')
   transaction(()=>{const row=order(id);if(row.status!=='DRAFT'||row.version!==version)throw new SalesError('Đơn đã thay đổi hoặc đã hủy. Mở lại trước khi hủy.',409);db.prepare("UPDATE sales_orders SET status='CANCELLED_DRAFT',version=version+1,updated_at=datetime('now') WHERE id=?").run(id)})
   return get(id)
  }
 }
}

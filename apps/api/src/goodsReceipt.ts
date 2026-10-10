import {rejectSoldSource} from './soldSource.js'
import {requireApprovedPhoneReceiptSource} from './lanPhotoInbox.js'
import {freshDevelopment,freshRoot} from './freshDevelopment.js'
import fs from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { db } from './db.js'
import { suggestProductCode, suggestSku, getProduct } from './products.js'
import { createReceiptJournal, finishReceiptJournal, recoverPendingGoodsReceipts } from './receiptRecovery.js'
import {getWatchSettings} from './warehouseWatch.js'
import {nextNamedImage} from './imageNaming.js'
import {recoverImageRenames} from './imageRename.js'

const IMAGE_EXTENSIONS=new Set(['.jpg','.jpeg','.png','.webp','.heic'])
export type ReceiveSize={size:string;sku?:string;quantity:number;costPrice:number;salePrice:number;images?:string[];sourcePath?:string}
export type ReceiveInput={storeRoot:string;productId?:number;name?:string;productCode?:string;category?:string;sizes:ReceiveSize[];note?:string}
export type ReceiveProgress={phase:'VALIDATE'|'PREPARE'|'COPY'|'VERIFY'|'DB_COMMIT'|'INTEGRITY'|'DONE'|'ROLLBACK';percent:number;copied:number;total:number;current?:string}

function safeName(v:string){const s=v.trim();if(!s||s.length>180||/[<>:"/\\|?*\x00-\x1f]/.test(s)||s==='.'||s==='..'||/[. ]$/.test(s)||/^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?:\.|$)/i.test(s))throw new Error('Tên Product/Size không hợp lệ trên Windows');return s}
function validateMoney(v:number,label:string){if(!Number.isInteger(v)||v<0)throw new Error(label+' phải là số nguyên không âm')}
function validateQty(v:number){if(!Number.isInteger(v)||v<=0)throw new Error('Số lượng nhập phải là số nguyên lớn hơn 0')}
export function inspectImageFolder(sourcePath:string){const dir=path.resolve(sourcePath||'');if(freshDevelopment)requireApprovedPhoneReceiptSource(freshRoot,dir);if(!sourcePath||!fs.existsSync(dir)||!fs.statSync(dir).isDirectory())throw new Error('Folder ảnh nguồn không tồn tại');const images=fs.readdirSync(dir,{withFileTypes:true}).filter(x=>x.isFile()&&IMAGE_EXTENSIONS.has(path.extname(x.name).toLowerCase())).map(x=>path.join(dir,x.name));return {path:dir,count:images.length,images}}
function imageFiles(xs:string[]=[],sourcePath?:string){const all=[...xs,...(sourcePath?inspectImageFolder(sourcePath).images:[])];return [...new Set(all.map(x=>path.resolve(x)))].filter(x=>IMAGE_EXTENSIONS.has(path.extname(x).toLowerCase()))}
function nextTarget(dir:string,ext:string,reserved:Set<string>){let n=1;while(true){const name=String(n).padStart(3,'0')+ext.toLowerCase();const p=path.join(dir,name);if(!fs.existsSync(p)&&!reserved.has(p)){reserved.add(p);return p}n++}}
function digest(file:string){const h=createHash('sha256');h.update(fs.readFileSync(file));return h.digest('hex')}
function inside(root:string,target:string){const rel=path.relative(path.resolve(root),path.resolve(target));return rel!==''&&rel!=='..'&&!rel.startsWith('..'+path.sep)&&!path.isAbsolute(rel)}

export function receiveGoods(input:ReceiveInput,onProgress?:(p:ReceiveProgress)=>void){
 const emit=(p:ReceiveProgress)=>onProgress?.(p)
 emit({phase:'VALIDATE',percent:2,copied:0,total:0})
 if(!input||!Array.isArray(input.sizes)||!input.sizes.length)throw new Error('Cần ít nhất một size để nhập')
 const root=path.resolve(input.storeRoot||'');if(!input.storeRoot||!fs.existsSync(root)||!fs.statSync(root).isDirectory())throw new Error('Kho đích không tồn tại')
 const existing=input.productId?getProduct(input.productId):null
 const productName=safeName(String((existing?.product as any)?.name??input.name??''))
 const productCode=String((existing?.product as any)?.product_code??input.productCode??suggestProductCode(productName)).trim().toUpperCase()
 const currentVariants=((existing?.variants??[]) as any[])
 if(input.productId&&!existing)throw new Error('Sản phẩm đã chọn không tồn tại')
 if(existing&&(existing.product as any).status!=='active')throw new Error('Sản phẩm đã ngưng hoạt động')
 const normalizedSizes=input.sizes.map(s=>safeName(s.size).toLowerCase())
 if(new Set(normalizedSizes).size!==normalizedSizes.length)throw new Error('Size nhập bị trùng trong cùng phiếu')
 const explicitSkus=input.sizes.map(s=>s.sku?.trim().toUpperCase()).filter(Boolean) as string[]
 if(new Set(explicitSkus).size!==explicitSkus.length)throw new Error('SKU nhập bị trùng trong cùng phiếu')
 const sizes=input.sizes.map(s=>{validateQty(s.quantity);validateMoney(s.costPrice,'Giá nhập');validateMoney(s.salePrice,'Giá bán');const size=safeName(s.size);const images=imageFiles(s.images,s.sourcePath);for(const p of images){if(freshDevelopment)requireApprovedPhoneReceiptSource(freshRoot,p);if(!fs.existsSync(p)||!fs.statSync(p).isFile())throw new Error('Không tìm thấy ảnh nguồn: '+p)}return {...s,size,images}})
 for(const s of sizes){
  if(s.images.length===0)throw new Error('Size '+s.size+' chưa có ảnh. Nhập hàng vật lý yêu cầu ít nhất một ảnh; chỉ ghi sổ không tạo tồn thực tế.')
  if(s.quantity!==s.images.length)throw new Error('Tồn phải bám theo ảnh thực tế: Size '+s.size+' có '+s.images.length+' ảnh nhưng SL nhập là '+s.quantity)
  const existingSize=currentVariants.find(v=>String(v.size).toLowerCase()===s.size.toLowerCase())
  if(existingSize&&existingSize.status!=='active')throw new Error('Size '+s.size+' đã ngưng hoạt động')
  if(s.sku?.trim()){const owner=db.prepare('SELECT product_id,id FROM product_variants WHERE UPPER(sku)=UPPER(?)').get(s.sku.trim()) as {product_id:number;id:number}|undefined;if(owner&&owner.id!==existingSize?.id)throw new Error('SKU '+s.sku+' đã thuộc sản phẩm/Size khác')}
 }
 // The journal is serialized with each copy and recovered on next startup.
 // Fail safely if a previous interrupted receipt has not yet been reconciled.
 recoverPendingGoodsReceipts()
 recoverImageRenames()
 const total=sizes.reduce((n,s)=>n+s.images.length,0),created:string[]=[],createdDirs:string[]=[]
 const productDir=path.join(root,productName);if(!inside(root,productDir))throw new Error('Đường dẫn Product không an toàn')
 const plans:{size:typeof sizes[number];dir:string;copies:{src:string;dest:string;sha256:string}[]}[]=[];const reserved=new Set<string>(db.prepare('SELECT file_path FROM product_images').all().flatMap(r=>[path.resolve(String(r.file_path)),path.resolve(String(r.file_path)).toLowerCase()]))
 let journal:string|undefined,committed=false
 try{
  if(!fs.existsSync(productDir)){fs.mkdirSync(productDir,{recursive:true});createdDirs.push(productDir)};emit({phase:'PREPARE',percent:5,copied:0,total})
  for(const s of sizes){const dir=path.join(productDir,s.size);if(!inside(productDir,dir))throw new Error('Đường dẫn Size không an toàn');if(!fs.existsSync(dir)){fs.mkdirSync(dir,{recursive:true});createdDirs.push(dir)};const canonicalDir=fs.realpathSync(dir)
   const hashes=new Set<string>()
   for(const existingFile of fs.readdirSync(dir)){const candidate=path.join(dir,existingFile);if(IMAGE_EXTENSIONS.has(path.extname(existingFile).toLowerCase())&&fs.statSync(candidate).isFile())hashes.add(digest(candidate))}
   if(!inside(fs.realpathSync(root),canonicalDir))throw new Error('Thư mục kho đích nằm ngoài kho đã chọn')
   const copies:{src:string;dest:string;sha256:string}[]=[]
   for(const src of s.images){if(freshDevelopment)requireApprovedPhoneReceiptSource(freshRoot,src);const source=fs.realpathSync(src);if(source===fs.realpathSync(root)||inside(fs.realpathSync(root),source))throw new Error('Không được nhập ảnh nguồn từ chính kho đích: '+src);const hash=digest(source);rejectSoldSource(db,hash);if(hashes.has(hash))throw new Error('Ảnh trùng nội dung đã có trong kho hoặc trong phiếu: '+path.basename(src));hashes.add(hash);copies.push({src,dest:getWatchSettings().autoRename?nextNamedImage(dir,productName,s.size,path.extname(src),reserved):nextTarget(dir,path.extname(src),reserved),sha256:hash})}
   plans.push({size:s,dir,copies})}
  // Journal MUST be persisted before creating any inventory image.
  journal=createReceiptJournal({storeRoot:root,files:plans.flatMap(p=>p.copies.map(x=>({dest:x.dest,sha256:x.sha256}))),createdDirs})
  let copied=0
  for(const plan of plans)for(const x of plan.copies){created.push(x.dest);fs.copyFileSync(x.src,x.dest,fs.constants.COPYFILE_EXCL);const fd=fs.openSync(x.dest,'r+');try{fs.fsyncSync(fd)}finally{fs.closeSync(fd)};copied++;emit({phase:'COPY',percent:5+Math.round(70*copied/Math.max(total,1)),copied,total,current:path.basename(x.dest)})}
  emit({phase:'VERIFY',percent:78,copied,total});for(const plan of plans)for(const x of plan.copies)if(!fs.existsSync(x.dest)||fs.statSync(x.dest).size<=0||digest(x.dest)!==x.sha256)throw new Error('Copy ảnh không toàn vẹn: '+x.dest)
  emit({phase:'DB_COMMIT',percent:82,copied,total});db.exec('BEGIN IMMEDIATE')
  try{
   let productId=input.productId
   if(!productId){let categoryId:null|number=null;if(input.category?.trim()){db.prepare('INSERT INTO categories(name) VALUES(?) ON CONFLICT(name) DO NOTHING').run(input.category.trim());categoryId=(db.prepare('SELECT id FROM categories WHERE name=?').get(input.category.trim()) as any).id}const r=db.prepare('INSERT INTO products(product_code,name,category_id,cost_price,sale_price) VALUES(?,?,?,?,?)').run(productCode,productName,categoryId,0,0);productId=Number(r.lastInsertRowid)}
   const addVariant=db.prepare('INSERT INTO product_variants(product_id,sku,size,cost_price,sale_price) VALUES(?,?,?,?,?)')
   const addImage=db.prepare('INSERT INTO product_images(product_id,variant_id,file_path,sort_order) VALUES(?,?,?,?)')
   const addTx=db.prepare("INSERT INTO inventory_transactions(variant_id,transaction_type,quantity,unit_cost,note) VALUES(?,'IMPORT',?,?,?)")
   for(const plan of plans){let v=currentVariants.find(v=>String(v.size).toLowerCase()===plan.size.size.toLowerCase());let variantId:number;if(v){variantId=v.id;db.prepare("UPDATE product_variants SET cost_price=?,sale_price=?,updated_at=datetime('now') WHERE id=?").run(plan.size.costPrice,plan.size.salePrice,variantId)}else{const sku=(plan.size.sku?.trim()||suggestSku(productCode,plan.size.size)).toUpperCase();variantId=Number(addVariant.run(productId,sku,plan.size.size,plan.size.costPrice,plan.size.salePrice).lastInsertRowid)}plan.copies.forEach((x,i)=>addImage.run(productId,variantId,x.dest,i));addTx.run(variantId,plan.size.quantity,plan.size.costPrice,input.note??'Nhập hàng')}
   emit({phase:'INTEGRITY',percent:96,copied,total});const fk=db.prepare('PRAGMA foreign_key_check').all();if(fk.length)throw new Error('SQLite foreign_key_check thất bại');db.exec('COMMIT');committed=true
   // Never roll back committed physical copies even if a status callback fails.
   const result={ok:true,productId,product:getProduct(productId!),copiedImages:copied,totalQuantity:sizes.reduce((n,s)=>n+s.quantity,0)}
   try{if(journal)finishReceiptJournal(journal)}catch{/* committed receipt journal is cleared safely on next startup */}
   try{emit({phase:'DONE',percent:100,copied,total})}catch{}
   return result
  }catch(e){if(!committed)try{db.exec('ROLLBACK')}catch{}throw e}
 }catch(e){
  if(committed)throw e
  try{recoverPendingGoodsReceipts()}catch(recoveryError){
   // Leave the persisted journal for safe retry/manual investigation.
   throw new Error('Nhập hàng thất bại và cần kiểm tra phục hồi: '+(recoveryError instanceof Error?recoveryError.message:String(recoveryError)),{cause:e})
  }
  try{emit({phase:'ROLLBACK',percent:0,copied:created.length,total})}catch{}
  for(const d of createdDirs.reverse())try{if(fs.existsSync(d)&&fs.readdirSync(d).length===0)fs.rmdirSync(d)}catch{}
  throw e
 }
}


/** Aggregates posted imports; ledger quantities are transaction history, never physical stock. */
export function goodsReceiptDashboard(){
 const row=db.prepare(`SELECT COUNT(*) AS transactions,COALESCE(SUM(t.quantity),0) AS importedQuantity,COALESCE(SUM(t.quantity*t.unit_cost),0) AS importedValue,MAX(t.created_at) AS lastImport FROM inventory_transactions t WHERE t.transaction_type='IMPORT'`).get() as {transactions:number;importedQuantity:number;importedValue:number;lastImport:string|null}
 const top=db.prepare(`SELECT p.id AS productId,p.name AS name,p.product_code AS code,SUM(t.quantity) AS quantity,COALESCE(SUM(t.quantity*t.unit_cost),0) AS value FROM inventory_transactions t JOIN product_variants v ON v.id=t.variant_id JOIN products p ON p.id=v.product_id WHERE t.transaction_type='IMPORT' GROUP BY p.id ORDER BY quantity DESC,p.name LIMIT 5`).all()
 const recent=db.prepare(`SELECT t.id,p.name AS productName,v.size,t.quantity,t.unit_cost AS unitCost,t.created_at AS createdAt FROM inventory_transactions t JOIN product_variants v ON v.id=t.variant_id JOIN products p ON p.id=v.product_id WHERE t.transaction_type='IMPORT' ORDER BY t.id DESC LIMIT 8`).all()
 return {...row,top,recent,source:'INVENTORY_TRANSACTIONS',valueBasis:'QUANTITY_X_UNIT_COST',note:'Giá trị lịch sử nhập theo đơn giá đã ghi; không phải giá trị tồn hiện tại'}
}

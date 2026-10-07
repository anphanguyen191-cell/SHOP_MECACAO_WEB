import fs from 'node:fs'
import path from 'node:path'
import { db } from './db.js'
import { suggestProductCode, suggestSku, getProduct } from './products.js'

const IMAGE_EXTENSIONS=new Set(['.jpg','.jpeg','.png','.webp','.heic'])
export type ReceiveSize={size:string;sku?:string;quantity:number;costPrice:number;salePrice:number;images?:string[];sourcePath?:string}
export type ReceiveInput={storeRoot:string;productId?:number;name?:string;productCode?:string;category?:string;sizes:ReceiveSize[];note?:string}
export type ReceiveProgress={phase:'VALIDATE'|'PREPARE'|'COPY'|'VERIFY'|'DB_COMMIT'|'INTEGRITY'|'DONE'|'ROLLBACK';percent:number;copied:number;total:number;current?:string}

function safeName(v:string){const s=v.trim();if(!s||/[<>:"/\\|?*]/.test(s)||s==='.'||s==='..')throw new Error('Tên Product/Size không hợp lệ');return s}
function validateMoney(v:number,label:string){if(!Number.isInteger(v)||v<0)throw new Error(label+' phải là số nguyên không âm')}
function validateQty(v:number){if(!Number.isInteger(v)||v<=0)throw new Error('Số lượng nhập phải là số nguyên lớn hơn 0')}
export function inspectImageFolder(sourcePath:string){const dir=path.resolve(sourcePath||'');if(!sourcePath||!fs.existsSync(dir)||!fs.statSync(dir).isDirectory())throw new Error('Folder ảnh nguồn không tồn tại');const images=fs.readdirSync(dir,{withFileTypes:true}).filter(x=>x.isFile()&&IMAGE_EXTENSIONS.has(path.extname(x.name).toLowerCase())).map(x=>path.join(dir,x.name));return {path:dir,count:images.length,images}}
function imageFiles(xs:string[]=[],sourcePath?:string){const all=[...xs,...(sourcePath?inspectImageFolder(sourcePath).images:[])];return [...new Set(all.map(x=>path.resolve(x)))].filter(x=>IMAGE_EXTENSIONS.has(path.extname(x).toLowerCase()))}
function nextTarget(dir:string,ext:string,reserved:Set<string>){let n=1;while(true){const name=String(n).padStart(3,'0')+ext.toLowerCase();const p=path.join(dir,name);if(!fs.existsSync(p)&&!reserved.has(p)){reserved.add(p);return p}n++}}
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
 const sizes=input.sizes.map(s=>{validateQty(s.quantity);validateMoney(s.costPrice,'Giá nhập');validateMoney(s.salePrice,'Giá bán');const size=safeName(s.size);const images=imageFiles(s.images,s.sourcePath);for(const p of images){if(!fs.existsSync(p)||!fs.statSync(p).isFile())throw new Error('Không tìm thấy ảnh nguồn: '+p)}return {...s,size,images}})
 const total=sizes.reduce((n,s)=>n+s.images.length,0),created:string[]=[]
 const productDir=path.join(root,productName);if(!inside(root,productDir))throw new Error('Đường dẫn Product không an toàn')
 const plans:{size:typeof sizes[number];dir:string;copies:{src:string;dest:string}[]}[]=[];const reserved=new Set<string>()
 try{
  fs.mkdirSync(productDir,{recursive:true});emit({phase:'PREPARE',percent:5,copied:0,total})
  for(const s of sizes){const dir=path.join(productDir,s.size);if(!inside(productDir,dir))throw new Error('Đường dẫn Size không an toàn');fs.mkdirSync(dir,{recursive:true});const copies=s.images.map(src=>({src,dest:nextTarget(dir,path.extname(src),reserved)}));plans.push({size:s,dir,copies})}
  let copied=0
  for(const plan of plans)for(const x of plan.copies){fs.copyFileSync(x.src,x.dest,fs.constants.COPYFILE_EXCL);created.push(x.dest);copied++;emit({phase:'COPY',percent:5+Math.round(70*copied/Math.max(total,1)),copied,total,current:path.basename(x.dest)})}
  emit({phase:'VERIFY',percent:78,copied,total});for(const p of created)if(!fs.existsSync(p)||fs.statSync(p).size<=0)throw new Error('Copy ảnh không toàn vẹn: '+p)
  emit({phase:'DB_COMMIT',percent:82,copied,total});db.exec('BEGIN IMMEDIATE')
  try{
   let productId=input.productId
   if(!productId){let categoryId:null|number=null;if(input.category?.trim()){db.prepare('INSERT INTO categories(name) VALUES(?) ON CONFLICT(name) DO NOTHING').run(input.category.trim());categoryId=(db.prepare('SELECT id FROM categories WHERE name=?').get(input.category.trim()) as any).id}const r=db.prepare('INSERT INTO products(product_code,name,category_id,cost_price,sale_price) VALUES(?,?,?,?,?)').run(productCode,productName,categoryId,0,0);productId=Number(r.lastInsertRowid)}
   const addVariant=db.prepare('INSERT INTO product_variants(product_id,sku,size,cost_price,sale_price) VALUES(?,?,?,?,?)')
   const addImage=db.prepare('INSERT INTO product_images(product_id,variant_id,file_path,sort_order) VALUES(?,?,?,?)')
   const addTx=db.prepare("INSERT INTO inventory_transactions(variant_id,transaction_type,quantity,unit_cost,note) VALUES(?,'IMPORT',?,?,?)")
   for(const plan of plans){let v=currentVariants.find(v=>String(v.size).toLowerCase()===plan.size.size.toLowerCase());let variantId:number;if(v){variantId=v.id;db.prepare("UPDATE product_variants SET cost_price=?,sale_price=?,updated_at=datetime('now') WHERE id=?").run(plan.size.costPrice,plan.size.salePrice,variantId)}else{const sku=(plan.size.sku?.trim()||suggestSku(productCode,plan.size.size)).toUpperCase();variantId=Number(addVariant.run(productId,sku,plan.size.size,plan.size.costPrice,plan.size.salePrice).lastInsertRowid)}plan.copies.forEach((x,i)=>addImage.run(productId,variantId,x.dest,i));addTx.run(variantId,plan.size.quantity,plan.size.costPrice,input.note??'Nhập hàng')}
   db.exec('COMMIT');emit({phase:'INTEGRITY',percent:96,copied,total});const integrity=(db.prepare('PRAGMA integrity_check').get() as any)?.integrity_check;if(integrity!=='ok')throw new Error('SQLite integrity_check thất bại');emit({phase:'DONE',percent:100,copied,total});return {ok:true,productId,product:getProduct(productId!),copiedImages:copied,totalQuantity:sizes.reduce((n,s)=>n+s.quantity,0)}
  }catch(e){try{db.exec('ROLLBACK')}catch{}throw e}
 }catch(e){emit({phase:'ROLLBACK',percent:0,copied:created.length,total});for(const p of created.reverse())try{fs.rmSync(p,{force:true})}catch{}throw e}
}

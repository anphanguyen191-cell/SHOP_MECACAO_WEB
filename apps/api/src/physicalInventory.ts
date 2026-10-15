import fs from 'node:fs'
import path from 'node:path'
import { db } from './db.js'
import {isInternalWarehousePath} from './warehouseAreas.js'

export type PhysicalImage = {id:number;product_id:number;variant_id:number;file_path:string;file_name:string;exists:boolean}

/** Request-scoped snapshot: no stale cache, one stat per registered file.
 * Batch SQL avoids a separate query for every Size (SQLite parameter limit safe).
 * Directories, missing files and unsupported extensions never create stock.
 */
export function physicalImagesByVariant(variantIds:number[]) {
 const result=new Map<number,PhysicalImage[]>()
 const ids=[...new Set(variantIds)]
 const sold=new Set<number>(db.prepare("SELECT 1 FROM sqlite_master WHERE name='sales_units'").get()?(db.prepare('SELECT image_id FROM sales_units').all().map(r=>Number(r.image_id))):[])
 const extensions=new Set(['.jpg','.jpeg','.png','.webp','.heic'])
 for(let offset=0;offset<ids.length;offset+=500){
  const chunk=ids.slice(offset,offset+500)
  const rows=db.prepare(`SELECT id,product_id,variant_id,file_path FROM product_images WHERE variant_id IN (${chunk.map(()=>'?').join(',')}) ORDER BY sort_order,id`).all(...chunk) as Array<Omit<PhysicalImage,'file_name'|'exists'>>
  for(const row of rows){
   let exists=false
   if(!sold.has(row.id)&&extensions.has(path.extname(row.file_path).toLowerCase())&&!isInternalWarehousePath(row.file_path)){
    try{exists=fs.statSync(row.file_path).isFile()&&!isInternalWarehousePath(fs.realpathSync(row.file_path))}catch(e){
     const code=(e as NodeJS.ErrnoException).code
     if(code!=='ENOENT'&&code!=='ENOTDIR')throw new Error('Không kiểm tra được ảnh kho: '+row.file_path,{cause:e})
    }
   }
   const images=result.get(row.variant_id)??[]
   images.push({...row,file_name:row.file_path.split(/[\\/]/).pop()||row.file_path,exists})
   result.set(row.variant_id,images)
  }
 }
 return result
}

/** Count unregistered image files in known Product/Size directories.
 * File existence is the authority for the physical count; a new photo remains
 * unselectable for an order until its source/hash is approved and registered.
 * An unavailable configured root is an error, never an empty warehouse.
 */
export function unregisteredPhysicalByVariant():Map<number,number>{
 const row=db.prepare("SELECT value FROM app_settings WHERE key='warehouse-watch'").get() as {value:string}|undefined
 if(!row)return new Map()
 let root:string
 try{root=path.resolve(JSON.parse(row.value).rootPath||'')}catch{throw new Error('Cấu hình kho không đọc được; không thể kiểm đếm ảnh')}
 if(!root||root===path.resolve('.'))return new Map()
 const realRoot=fs.realpathSync(root)
 if(!fs.statSync(realRoot).isDirectory()||isInternalWarehousePath(realRoot))throw new Error('Kho ảnh gốc không hợp lệ')
 const known=new Set((db.prepare('SELECT file_path FROM product_images').all() as {file_path:string}[]).map(x=>path.resolve(x.file_path).toLowerCase()))
 const variants=db.prepare('SELECT v.id,p.name AS product_name,v.size FROM product_variants v JOIN products p ON p.id=v.product_id').all() as Array<{id:number;product_name:string;size:string}>
 const out=new Map<number,number>()
 const ext=new Set(['.jpg','.jpeg','.png','.webp','.heic'])
 for(const v of variants){
  const folder=path.resolve(realRoot,v.product_name,v.size)
  const relative=path.relative(realRoot,folder)
  if(!relative||relative==='..'||relative.startsWith('..'+path.sep)||path.isAbsolute(relative)||isInternalWarehousePath(folder))continue
  let entries:fs.Dirent[]
  try{entries=fs.readdirSync(folder,{withFileTypes:true})}catch(e){
   if(['ENOENT','ENOTDIR'].includes((e as NodeJS.ErrnoException).code??''))continue
   throw new Error('Không kiểm tra được ảnh Size: '+folder,{cause:e})
  }
  let count=0
  for(const e of entries){
   if(!e.isFile()||!ext.has(path.extname(e.name).toLowerCase()))continue
   const file=path.join(folder,e.name)
   if(known.has(file.toLowerCase()))continue
   const real=fs.realpathSync(file)
   const rel=path.relative(realRoot,real)
   if(rel==='..'||rel.startsWith('..'+path.sep)||path.isAbsolute(rel)||isInternalWarehousePath(real))continue
   count++
  }
  if(count)out.set(v.id,count)
 }
 return out
}

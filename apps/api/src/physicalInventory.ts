import fs from 'node:fs'
import path from 'node:path'
import { db } from './db.js'

export type PhysicalImage = {id:number;product_id:number;variant_id:number;file_path:string;file_name:string;exists:boolean}

/** Request-scoped snapshot: no stale cache, one stat per registered file.
 * Batch SQL avoids a separate query for every Size (SQLite parameter limit safe).
 * Directories, missing files and unsupported extensions never create stock.
 */
export function physicalImagesByVariant(variantIds:number[]) {
 const result=new Map<number,PhysicalImage[]>()
 const ids=[...new Set(variantIds)]
 const extensions=new Set(['.jpg','.jpeg','.png','.webp','.heic'])
 for(let offset=0;offset<ids.length;offset+=500){
  const chunk=ids.slice(offset,offset+500)
  const rows=db.prepare(`SELECT id,product_id,variant_id,file_path FROM product_images WHERE variant_id IN (${chunk.map(()=>'?').join(',')}) ORDER BY sort_order,id`).all(...chunk) as Array<Omit<PhysicalImage,'file_name'|'exists'>>
  for(const row of rows){
   let exists=false
   if(extensions.has(path.extname(row.file_path).toLowerCase())){
    try{exists=fs.statSync(row.file_path).isFile()}catch(e){
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

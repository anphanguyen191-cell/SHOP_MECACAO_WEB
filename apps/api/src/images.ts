import fs from 'node:fs'
import path from 'node:path'
import { db } from './db.js'
import {isInternalWarehousePath} from './warehouseAreas.js'

const allowed = new Set(['.jpg','.jpeg','.png','.webp','.gif','.bmp','.heic','.heif'])

export function getImageRecord(id:number){
  if(!Number.isInteger(id)||id<=0) throw new Error('Ảnh không hợp lệ')
  const row=db.prepare('SELECT id,product_id,variant_id,file_path,is_primary,sort_order FROM product_images WHERE id=?').get(id) as {id:number;product_id:number;variant_id:number|null;file_path:string;is_primary:number;sort_order:number}|undefined
  if(!row) return null
  if(db.prepare("SELECT 1 FROM sqlite_master WHERE name='sales_units'").get()&&db.prepare('SELECT 1 FROM sales_units WHERE image_id=?').get(id))return {...row,missing:true}
  const resolved=path.resolve(row.file_path)
  const ext=path.extname(resolved).toLowerCase()
  if(!allowed.has(ext)) throw new Error('Định dạng ảnh không được hỗ trợ')
  if(isInternalWarehousePath(resolved))return {...row,file_path:resolved,missing:true}
  if(!fs.existsSync(resolved)) return {...row,file_path:resolved,missing:true}
  const stat=fs.statSync(resolved)
  if(!stat.isFile()) return {...row,file_path:resolved,missing:true}
  if(isInternalWarehousePath(fs.realpathSync(resolved)))return {...row,file_path:resolved,missing:true}
  return {...row,file_path:resolved,missing:false}
}

export function imageMime(filePath:string){
  const ext=path.extname(filePath).toLowerCase()
  if(ext==='.jpg'||ext==='.jpeg') return 'image/jpeg'
  if(ext==='.png') return 'image/png'
  if(ext==='.webp') return 'image/webp'
  if(ext==='.gif') return 'image/gif'
  if(ext==='.bmp') return 'image/bmp'
  if(ext==='.heic') return 'image/heic'
  if(ext==='.heif') return 'image/heif'
  return 'application/octet-stream'
}

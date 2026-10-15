import fs from 'node:fs'
import path from 'node:path'
import {createHash} from 'node:crypto'
import {db} from './db.js'
export function asciiName(value:string){return value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[đĐ]/g,m=>m==='đ'?'d':'D').replace(/[^a-zA-Z0-9]+/g,'_').replace(/^_+|_+$/g,'')||'Hang'}
export function imagePrefix(product:string,size:string){return 'ShopMeCaCao_Tole_'+asciiName(product).slice(0,60)+'_Size_'+asciiName(size.replace(/^size(?:[\s_-]+|$)/i,'')).slice(0,40)+'_'}
/** Persistent per-product/size high watermark: allocated file numbers are never recycled. */
const key=(prefix:string)=>'photo-seq:'+createHash('sha256').update(prefix.toLowerCase()).digest('hex')
const caches=new WeakMap<Set<string>,Map<string,number>>()
function historicalHighWater(prefix:string,dir:string,reserved:Set<string>){
 let highest=0
 const stored=db.prepare('SELECT value FROM app_metadata WHERE key=?').get(key(prefix)) as {value:string}|undefined
 if(stored){highest=Number(stored.value);if(!Number.isSafeInteger(highest)||highest<0)throw Error('Bộ đếm tên ảnh bị lỗi; không được đặt lại từ 0001')}
 const inspect=(file:string)=>{
  const base=path.basename(file),extension=path.extname(base),start=base.slice(0,base.length-extension.length)
  if(!start.toLowerCase().startsWith(prefix.toLowerCase()))return
  const suffix=start.slice(prefix.length)
  if(/^\d{4,}$/.test(suffix)){const n=Number(suffix);if(Number.isSafeInteger(n))highest=Math.max(highest,n)}
 }
 for(const file of reserved)inspect(file)
 for(const file of fs.readdirSync(dir))inspect(file)
 return highest
}
export function nextNamedImage(dir:string,product:string,size:string,ext:string,reserved=new Set<string>()){
 const prefix=imagePrefix(product,size),cacheKey=prefix.toLowerCase()
 let cache=caches.get(reserved);if(!cache){cache=new Map();caches.set(reserved,cache)}
 let sequence=cache.get(cacheKey)??historicalHighWater(prefix,dir,reserved)
 const occupied=new Set(fs.readdirSync(dir).map(x=>x.toLowerCase()))
 while(sequence<999999999){
  sequence++
  const name=prefix+String(sequence).padStart(4,'0')+ext.toLowerCase(),target=path.join(dir,name)
  if(occupied.has(name.toLowerCase())||reserved.has(target.toLowerCase()))continue
  cache.set(cacheKey,sequence);reserved.add(target.toLowerCase());return target
 }
 throw Error('Không còn số thứ tự tên ảnh khả dụng')
}
/** Claim names BEFORE copying; a failed receipt may leave gaps, but cannot reuse a name. */
export function reserveNamedImageSequences(files:string[]){
 const highest=new Map<string,{prefix:string;number:number}>()
 for(const file of files){
  const base=path.basename(file),ext=path.extname(base),stem=base.slice(0,base.length-ext.length)
  if(!stem.startsWith('ShopMeCaCao_Tole_'))continue
  const match=stem.match(/^(.*_)(\d{4,})$/);if(!match)throw Error('Tên ảnh chuẩn sai số thứ tự: '+base)
  const prefix=match[1],n=Number(match[2]),identity=key(prefix)
  if(!Number.isSafeInteger(n)||n<1)throw Error('Tên ảnh vượt giới hạn số thứ tự')
  const old=highest.get(identity)
  if(!old||n>old.number)highest.set(identity,{prefix,number:n})
 }
 const insert=db.prepare("INSERT INTO app_metadata(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=datetime('now') WHERE CAST(app_metadata.value AS INTEGER)<CAST(excluded.value AS INTEGER)")
 for(const [identity,row] of highest)insert.run(identity,String(row.number))
 return highest.size
}

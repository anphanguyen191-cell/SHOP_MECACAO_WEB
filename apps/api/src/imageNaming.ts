import fs from 'node:fs'
import path from 'node:path'
export function asciiName(value:string){return value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[đĐ]/g,m=>m==='đ'?'d':'D').replace(/[^a-zA-Z0-9]+/g,'_').replace(/^_+|_+$/g,'')||'Hang'}
export function imagePrefix(product:string,size:string){return 'ShopMeCaCao_Tole_'+asciiName(product).slice(0,60)+'_Size_'+asciiName(size.replace(/^size(?:[\s_-]+|$)/i,'')).slice(0,40)+'_'}
export function nextNamedImage(dir:string,product:string,size:string,ext:string,reserved=new Set<string>()){
 const prefix=imagePrefix(product,size),occupied=new Set(fs.readdirSync(dir).map(n=>n.toLowerCase()))
 for(let i=1;i<=999999;i++){
  const name=prefix+String(i).padStart(4,'0')+ext.toLowerCase(),target=path.join(dir,name)
  if(!occupied.has(name.toLowerCase())&&!reserved.has(target.toLowerCase())){reserved.add(target.toLowerCase());return target}
 }
 throw Error('Không còn số tên ảnh khả dụng')
}

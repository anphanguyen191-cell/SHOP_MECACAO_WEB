import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import crypto from 'node:crypto'
import {fileURLToPath} from 'node:url'
import {execFile,spawn} from 'node:child_process'
import {promisify} from 'node:util'
import sharp from 'sharp'
import {db} from './db.js'
import {getImageRecord} from './images.js'

const run=promisify(execFile)
export const MAX_SHARE_IMAGES=100 // Bounded request, not a Zalo/Messenger compatibility claim.
const source=fileURLToPath(new URL('../native/ClipboardFiles.cs',import.meta.url))
function compiler(){return ['Framework64','Framework'].map(f=>path.join(process.env.WINDIR||'C:\\Windows','Microsoft.NET',f,'v4.0.30319','csc.exe')).find(f=>fs.existsSync(f))}
export function clipboardCapabilities(){return {nativeFiles:process.platform==='win32'&&!!compiler(),maxImages:MAX_SHARE_IMAGES}}
export function selectedStockImages(input:unknown,allowed:(p:string)=>boolean=()=>true){
 if(!Array.isArray(input)||!input.length||input.length>MAX_SHARE_IMAGES||input.some(id=>!Number.isSafeInteger(id)||id<=0)||new Set(input).size!==input.length)throw Error('Chọn từ 1 đến '+MAX_SHARE_IMAGES+' ảnh riêng biệt, hợp lệ.')
 return input.map(id=>{
  const row=db.prepare('SELECT p.status AS product_status,v.status AS variant_status,v.size,p.name FROM product_images i JOIN products p ON p.id=i.product_id JOIN product_variants v ON v.id=i.variant_id WHERE i.id=?').get(id) as {product_status:string;variant_status:string;size:string;name:string}|undefined
  const image=getImageRecord(id)
  if(!row||row.product_status!=='active'||row.variant_status!=='active'||!image||image.missing||!['.jpg','.jpeg','.png','.webp','.heic'].includes(path.extname(image.file_path).toLowerCase()))throw Error('Ảnh #'+id+' không còn là hàng tồn hợp lệ. Làm mới tồn rồi chọn lại.')
  if(!allowed(image.file_path))throw Error('Ảnh #'+id+' nằm ngoài vùng được phép.')
  return {...image,product:row.name,size:row.size,file_name:path.basename(image.file_path)}
 })
}
export async function sharedJpeg(id:number,allowed:(p:string)=>boolean){
 const [image]=selectedStockImages([id],allowed)
 // In-memory derivative only. Never replace the physical inventory image.
 return sharp(image.file_path,{limitInputPixels:40_000_000}).rotate().resize({width:1600,height:1600,fit:'inside',withoutEnlargement:true}).flatten({background:'#ffffff'}).jpeg({quality:90}).toBuffer()
}
export async function buildClipboardBridge(){
 if(process.platform!=='win32')throw Error('Copy nhóm ảnh native chỉ hoạt động trên Windows LOCAL.')
 const csc=compiler();if(!csc)throw Error('Không tìm thấy .NET Framework để tạo cầu nối clipboard Windows.')
 const digest=crypto.createHash('sha256').update(fs.readFileSync(source)).digest('hex').slice(0,20)
 const dir=path.join(os.tmpdir(),'ShopMeCaCao-Clipboard',digest);fs.mkdirSync(dir,{recursive:true})
 const exe=path.join(dir,'ClipboardFiles.exe')
 if(!fs.existsSync(exe))await run(csc,['/nologo','/codepage:65001','/target:exe','/out:'+exe,source],{windowsHide:true,timeout:30000,maxBuffer:100000})
 return exe
}
let copying=false
export async function copyStockImages(ids:unknown,allowed:(p:string)=>boolean){
 if(copying)throw Error('Đang copy nhóm ảnh khác. Đợi hoàn tất rồi thử lại.')
 copying=true
 try{
  selectedStockImages(ids,allowed)
  const exe=await buildClipboardBridge()
  const images=selectedStockImages(ids,allowed) // Revalidate after first-run compilation.
  const data=await new Promise<string>((resolve,reject)=>{
   const child=spawn(exe,[],{windowsHide:true,stdio:['pipe','pipe','pipe']});let output='',error=''
   const timer=setTimeout(()=>{child.kill();reject(Error('Clipboard quá thời gian; thử lại.'))},10000)
   child.stdout.on('data',b=>output+=b);child.stderr.on('data',b=>error+=b)
   child.on('error',e=>{clearTimeout(timer);reject(e)});child.on('close',code=>{clearTimeout(timer);code===0?resolve(output):reject(Error(error.trim()||'Không copy được nhóm ảnh.'))})
   child.stdin.on('error',()=>{});child.stdin.end(images.map(i=>i.file_path).join('\n')+'\n','utf8')
  })
  const result=JSON.parse(data)
  if(result.copied!==images.length||result.format!=='CF_HDROP')throw Error('Số ảnh clipboard không khớp; hãy copy lại.')
  return result
 }finally{copying=false}
}

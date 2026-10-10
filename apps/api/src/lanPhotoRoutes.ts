import express from 'express'
import fs from 'node:fs'
import path from 'node:path'
import {createHash} from 'node:crypto'
import {db} from './db.js'
import {freshDevelopment,freshRoot} from './freshDevelopment.js'
import {rejectSoldSource} from './soldSource.js'
import {createPhonePhotoInbox,PhonePhotoError} from './lanPhotoInbox.js'

const sha=(p:string)=>createHash('sha256').update(fs.readFileSync(p)).digest('hex')
const allowedOrigin=(req:express.Request)=>{
 const local=['127.0.0.1','::1','::ffff:127.0.0.1'].includes(req.socket.remoteAddress??'')
 if(!local)return false
 try{const o=new URL(req.get('origin')??'');return o.protocol==='http:'&&['localhost','127.0.0.1','[::1]'].includes(o.hostname)&&Number(o.port||80)===Number(process.env.PORT??3000)}catch{return false}
}
function checkExisting(sha256:string,size:number){
 rejectSoldSource(db,sha256)
 // An exact byte-for-byte match to any already registered physical item
 // cannot be counted as a new physical piece without a distinct source image.
 for(const row of db.prepare('SELECT file_path FROM product_images').all() as {file_path:string}[]){
  let stat:fs.Stats
  try{
   const p=path.resolve(row.file_path)
   if(fs.lstatSync(p).isSymbolicLink())continue
   stat=fs.statSync(p)
   if(!stat.isFile()||stat.size!==size)continue
   if(sha(p)===sha256)throw new PhonePhotoError('Ảnh đã đăng ký trong kho. Không được đưa bản sao thành một bộ tồn mới.',409)
  }catch(e){if(e instanceof PhonePhotoError)throw e}
 }
}
export function phonePhotoRouter(){
 const router=express.Router()
 if(!freshDevelopment)return router
 const inbox=createPhonePhotoInbox(path.join(freshRoot,'lan','phone-pending'),path.join(freshRoot,'lan','phone-reviewed'),checkExisting)
 // Local Windows can inspect all; authenticated LAN roles are enforced globally.
 const who=(req:express.Request)=>req.res?.locals.lanUser?.username as string|undefined
 const handle=(res:express.Response,e:unknown)=>{
  const status=e instanceof PhonePhotoError?e.status:500
  return res.status(status).json({error:e instanceof Error?e.message:'Không xử lý được ảnh từ điện thoại'})
 }
 router.get('/',(_req,res)=>{try{res.setHeader('Cache-Control','no-store');res.json({rows:inbox.list(),maxBytes:4*1024*1024,maxCount:200,registrationAutomatic:false})}catch(e){handle(res,e)}})
 router.get('/:id/preview',(req,res)=>{try{res.setHeader('Cache-Control','no-store');res.type('jpeg').send(inbox.preview(req.params.id))}catch(e){handle(res,e)}})
 router.post('/upload',(req,res)=>{
  void inbox.stage(req.body,who(req)??'windows').then(row=>res.status(201).json({photo:row,registeredStock:false})).catch(e=>handle(res,e))
 })
 router.post('/:id/review',(req,res)=>{
  if(req.res?.locals.lanUser||!allowedOrigin(req))return res.status(403).json({error:'Chỉ chủ shop ở Windows LOCAL được duyệt ảnh. Không duyệt trên iPhone.'})
  try{const {sha256,confirmed}=req.body??{};res.json(inbox.review(req.params.id,sha256,confirmed))}
  catch(e){handle(res,e)}
 })
 return router
}

import https from 'node:https'
import type {Application,Request,Response,NextFunction} from 'express'
import {lanApiAllowed} from './lanSecurity.js'
import type {LanRuntime} from './lanRuntime.js'

function token(req:Request){
 for(const entry of (req.headers.cookie??'').split(';')){
  const [key,...value]=entry.trim().split('=')
  if(key==='mecacao_lan')return value.join('=')
 }
 return ''
}
function originOK(req:Request,lan:LanRuntime){
 try{const u=new URL(req.get('origin')??'');return u.protocol==='https:'&&u.hostname===lan.address&&u.port===String(lan.port)}catch{return false}
}
export function installLanGuard(app:Application,lan:LanRuntime|null){
 if(!lan)return
 app.use('/api',(req:Request,res:Response,next:NextFunction)=>{
  if(req.socket.localAddress!==lan.address)return next()
  if(!(req.socket as any).encrypted)return res.status(403).json({error:'Điện thoại chỉ truy cập qua HTTPS'})
  res.setHeader('Cache-Control','no-store')
  res.setHeader('X-Content-Type-Options','nosniff')
  res.setHeader('Referrer-Policy','no-referrer')
  if(req.path==='/lan/status'&&req.method==='GET')return res.json({enabled:true,requiresLogin:true})
  if(req.path==='/lan/login'&&req.method==='POST'){
   if(!originOK(req,lan))return res.status(403).json({error:'Nguồn đăng nhập không hợp lệ'})
   const {username,password}=req.body??{}
   if(typeof username!=='string'||typeof password!=='string')return res.status(400).json({error:'Thiếu thông tin đăng nhập'})
   const result=lan.sessions.attempt(username,password)
   if(!result)return res.status(401).json({error:'Sai mật khẩu hoặc tài khoản tạm khóa'})
   res.setHeader('Set-Cookie','mecacao_lan='+result.token+'; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=28800')
   return res.json({ok:true,user:result.identity,expires:result.expires})
  }
  const currentToken=token(req),identity=lan.sessions.inspect(currentToken)
  if(!identity)return res.status(401).json({error:'Chưa đăng nhập hoặc phiên đã hết hạn',code:'LAN_LOGIN_REQUIRED'})
  if(req.path==='/lan/session'&&req.method==='GET')return res.json({user:identity})
  if(req.path==='/lan/logout'&&req.method==='POST'){
   if(!originOK(req,lan))return res.status(403).json({error:'Nguồn thao tác không hợp lệ'})
   lan.sessions.revoke(currentToken)
   res.setHeader('Set-Cookie','mecacao_lan=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0')
   return res.json({ok:true})
  }
  if(req.method!=='GET'&&req.method!=='HEAD'){
   if(!originOK(req,lan))return res.status(403).json({error:'Yêu cầu khác nguồn bị chặn'})
   if(req.get('content-type')?.split(';')[0].trim().toLowerCase()!=='application/json')return res.status(415).json({error:'Giao dịch LAN chỉ nhận JSON'})
  }
  if(!lanApiAllowed(identity.role,req.method,req.baseUrl+req.path))return res.status(403).json({error:'Tài khoản không có quyền truy cập chức năng này qua LAN'})
  res.locals.lanUser=identity
  next()
 })
}
export function listenLan(app:Application,lan:LanRuntime|null){
 if(!lan)return
 https.createServer({cert:lan.cert,key:lan.key,minVersion:'TLSv1.2'},app).listen(lan.port,lan.address,()=>console.log('LAN HTTPS: https://'+lan.address+':'+lan.port))
}

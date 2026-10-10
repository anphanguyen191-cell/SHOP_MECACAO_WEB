import https from 'node:https'
import type {Application,Request,Response,NextFunction} from 'express'
import {privateIP} from './lanRuntime.js'
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
 try{const u=new URL(req.get('origin')??'');return u.protocol==='https:'&&u.hostname===lan.address&&u.port===String(lan.port)&&u.origin===req.get('origin')}catch{return false}
}
export function installLanGuard(app:Application,runtime:LanRuntime|null|(()=>LanRuntime|null)){
 app.use('/api',(req:Request,res:Response,next:NextFunction)=>{
  const lan=typeof runtime==='function'?runtime():runtime;if(!lan)return next()
  // Only the dedicated TLS listener, bound to one configured private IP, authorizes LAN requests.
  if(req.socket.localAddress!==lan.address||req.socket.localPort!==lan.port)return next()
  if(!(req.socket as any).encrypted)return res.status(403).json({error:'Điện thoại chỉ truy cập qua HTTPS'})
  res.setHeader('Cache-Control','no-store')
  res.setHeader('X-Content-Type-Options','nosniff')
  res.setHeader('Referrer-Policy','no-referrer')
  const target=req.baseUrl+req.path // exclude query strings, credentials and bodies from audit
  const writeAudit=(event:'LOGIN_OK'|'LOGIN_DENIED'|'ACCESS_DENIED'|'WRITE_START'|'WRITE_RESULT'|'LOGOUT',actor:string,role:string,status:number)=>{
   try{lan.audit.append({event,actor,role,method:req.method,target,status});return true}
   catch{return false}
  }
  const deny=(status:number,message:string,actor='-',role='-')=>{
   if(!writeAudit('ACCESS_DENIED',actor,role,status))return res.status(503).json({error:'Nhật ký kiểm toán không khả dụng; ngừng thao tác LAN'})
   return res.status(status).json({error:message})
  }
  const peer=(req.socket.remoteAddress??'').replace(/^::ffff:/,'');if(!privateIP(peer)&&!['127.0.0.1','::1'].includes(peer))return deny(403,'Chỉ truy cập trong mạng riêng của shop')
  if(req.get('host')!==lan.address+':'+lan.port||req.get('sec-fetch-site')==='cross-site')return deny(403,'Dùng đúng địa chỉ HTTPS LAN của Windows')
  if(req.path==='/lan/status'&&req.method==='GET')return res.json({enabled:true,requiresLogin:true})
  if(req.path==='/lan/login'&&req.method==='POST'){
   if(!originOK(req,lan))return deny(403,'Nguồn đăng nhập không hợp lệ')
   const {username,password}=req.body??{}
   if(typeof username!=='string'||typeof password!=='string')return deny(400,'Thiếu thông tin đăng nhập')
   const result=lan.sessions.attempt(username,password)
   if(!result){
    if(!writeAudit('LOGIN_DENIED','-','-',401))return res.status(503).json({error:'Không ghi được nhật ký LAN'})
    return res.status(401).json({error:'Sai mật khẩu hoặc tài khoản tạm khóa'})
   }
   if(!writeAudit('LOGIN_OK',result.identity.username,result.identity.role,200)){
    lan.sessions.revoke(result.token)
    return res.status(503).json({error:'Không ghi được nhật ký LAN'})
   }
   res.setHeader('Set-Cookie','mecacao_lan='+result.token+'; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=28800')
   return res.json({ok:true,user:result.identity,expires:result.expires})
  }
  const currentToken=token(req),identity=lan.sessions.inspect(currentToken)
  if(!identity)return deny(401,'Chưa đăng nhập hoặc phiên đã hết hạn')
  if(req.path==='/lan/session'&&req.method==='GET')return res.json({user:identity})
  if(req.path==='/lan/logout'&&req.method==='POST'){
   if(!originOK(req,lan))return deny(403,'Nguồn thao tác không hợp lệ',identity.username,identity.role)
   if(!writeAudit('LOGOUT',identity.username,identity.role,200))return res.status(503).json({error:'Không ghi được nhật ký LAN'})
   lan.sessions.revoke(currentToken)
   res.setHeader('Set-Cookie','mecacao_lan=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0')
   return res.json({ok:true})
  }
  if(req.method!=='GET'&&req.method!=='HEAD'){
   if(!originOK(req,lan))return deny(403,'Yêu cầu khác nguồn bị chặn',identity.username,identity.role)
   if(req.get('content-type')?.split(';')[0].trim().toLowerCase()!=='application/json')return deny(415,'Giao dịch LAN chỉ nhận JSON',identity.username,identity.role)
  }
  if(!lanApiAllowed(identity.role,req.method,target))return deny(403,'Tài khoản không có quyền truy cập chức năng này qua LAN',identity.username,identity.role)
  if(req.method!=='GET'&&req.method!=='HEAD'){
   if(!writeAudit('WRITE_START',identity.username,identity.role,0))return res.status(503).json({error:'Không ghi được nhật ký LAN; giao dịch bị chặn'})
   res.once('finish',()=>{writeAudit('WRITE_RESULT',identity.username,identity.role,res.statusCode)})
  }
  res.locals.lanUser=identity
  next()
 })
}
export function listenLan(app:Application,lan:LanRuntime|null){
 if(!lan)return
 https.createServer({cert:lan.cert,key:lan.key,minVersion:'TLSv1.2'},app).listen(lan.port,lan.address,()=>console.log('LAN HTTPS: https://'+lan.address+':'+lan.port))
}

import fs from 'node:fs'
import path from 'node:path'
import {createHash,randomBytes,timingSafeEqual} from 'node:crypto'
import {Router,type Request,type Response,type RequestHandler} from 'express'
import {checkLanCredential,createLanSessionManager,makeLanCredential,type LanCredential} from './lanSecurity.js'
import {exactLanFile,replaceLanJson} from './lanCertificates.js'

/**
 * V8 Windows LOCAL-only sign-in. No passwords or persistent bearer tokens are
 * stored in the browser: a remembered login uses an HttpOnly SameSite cookie,
 * with only its SHA-256 digest in the persistent, update-independent data dir.
 * The welcome/login screen is still displayed on EVERY fresh page load.
 */
type Remember={username:string;digest:string;credentialDigest:string;expires:number}
type AuthFile={format:1;owner?:LanCredential;remember?:Remember}
type Session={username:string;expires:number}
const REMEMBER_AGE=30*24*60*60*1000
const SESSION_AGE=12*60*60*1000
const COOKIE_SESSION='mecacao_windows_session'
const COOKIE_REMEMBER='mecacao_windows_remember'
const tokenDigest=(s:string)=>createHash('sha256').update(s).digest('hex')
function cookie(req:Request,name:string){
 for(const item of (req.headers.cookie??'').split(';')){
  const [key,...value]=item.trim().split('=')
  if(key===name)return value.join('=')
 }
 return ''
}
function sameHash(a:string,b:string){
 if(!/^[a-f0-9]{64}$/.test(a)||!/^[a-f0-9]{64}$/.test(b))return false
 return timingSafeEqual(Buffer.from(a,'hex'),Buffer.from(b,'hex'))
}
function setCookie(res:Response,name:string,value:string,maxAge?:number){
 res.append('Set-Cookie',name+'='+value+'; Path=/api; HttpOnly; SameSite=Strict'+(maxAge===undefined?'':'; Max-Age='+maxAge))
}
function clearCookie(res:Response,name:string){setCookie(res,name,'',0)}
export function createWindowsAuth(root:string,lanDirectory=path.join(root,'lan'),clock:()=>number=Date.now){
 const authDir=path.join(root,'auth'),file=path.join(authDir,'windows-auth.json')
 const sessions=new Map<string,Session>()
 function read():AuthFile{
  if(!fs.existsSync(file))return {format:1}
  const raw=JSON.parse(exactLanFile(file).toString()) as AuthFile
  if(raw.format!==1)throw Error('Cấu hình đăng nhập Windows không hợp lệ')
  if(raw.owner)createLanSessionManager([raw.owner])
  return raw
 }
 function save(state:AuthFile){
  fs.mkdirSync(authDir,{recursive:true})
  if(fs.realpathSync(authDir)!==authDir)throw Error('Thư mục xác thực không an toàn')
  replaceLanJson(file,state)
 }
 function credential(state:AuthFile):LanCredential|null{
  if(state.owner)return state.owner
  const usersFile=path.join(lanDirectory,'users.json')
  if(!fs.existsSync(usersFile))return null
  const raw=JSON.parse(exactLanFile(usersFile).toString())
  if(raw.format!==1||!Array.isArray(raw.users))throw Error('Tài khoản LAN không hợp lệ')
  createLanSessionManager(raw.users)
  return raw.users.find((u:LanCredential)=>u.role==='owner')??null
 }
 function remembered(state:AuthFile,req:Request,owner:LanCredential|null){
  const saved=state.remember,token=cookie(req,COOKIE_REMEMBER)
  return !!(saved&&owner&&saved.username===owner.username&&saved.credentialDigest===tokenDigest(owner.passwordHash)&&saved.expires>clock()&&token.length>=32&&token.length<=128&&sameHash(saved.digest,tokenDigest(token)))
 }
 function session(req:Request){
  const token=cookie(req,COOKIE_SESSION)
  if(token.length<32||token.length>128)return false
  const key=tokenDigest(token),record=sessions.get(key)
  if(!record)return false
  if(record.expires<=clock()){sessions.delete(key);return false}
  return true
 }
 const router=Router()
 router.use((_req,res,next)=>{res.set('Cache-Control','no-store');next()})
 router.get('/state',(req,res)=>{
  try{
   const state=read(),owner=credential(state)
   res.json({configured:!!owner,username:owner?.username??'',remembered:remembered(state,req,owner)})
  }catch(e){res.status(503).json({error:e instanceof Error?e.message:'Không đọc được đăng nhập Windows'})}
 })
 router.post('/setup',(req,res)=>{
  try{
   const state=read()
   if(credential(state))return res.status(409).json({error:'Chủ shop đã có tài khoản. Hãy đăng nhập bằng tài khoản hiện tại.'})
   if(typeof req.body?.username!=='string'||typeof req.body?.password!=='string')return res.status(400).json({error:'Cần tên tài khoản và mật khẩu'})
   state.owner=makeLanCredential(req.body.username,req.body.password,'owner')
   save(state)
   return issueSession(res,state,state.owner,req.body.remember===true)
  }catch(e){return res.status(400).json({error:e instanceof Error?e.message:'Không tạo được tài khoản'})}
 })
 function issueSession(res:Response,state:AuthFile,owner:LanCredential,remember:boolean){
  const token=randomBytes(32).toString('base64url')
  sessions.set(tokenDigest(token),{username:owner.username,expires:clock()+SESSION_AGE})
  setCookie(res,COOKIE_SESSION,token)
  if(remember){
   const saved=randomBytes(32).toString('base64url')
   state.remember={username:owner.username,digest:tokenDigest(saved),credentialDigest:tokenDigest(owner.passwordHash),expires:clock()+REMEMBER_AGE}
   save(state)
   setCookie(res,COOKIE_REMEMBER,saved,Math.floor(REMEMBER_AGE/1000))
  }else{
   if(state.remember){delete state.remember;save(state)}
   clearCookie(res,COOKIE_REMEMBER)
  }
  return res.json({ok:true,username:owner.username})
 }
 router.post('/login',(req,res)=>{
  try{
   const state=read(),owner=credential(state)
   if(!owner)return res.status(409).json({error:'Cần thiết lập tài khoản chủ shop lần đầu'})
   const name=typeof req.body?.username==='string'?req.body.username.trim().toLowerCase():''
   const byRemember=req.body?.useRemember===true
   if(name!==owner.username||!(byRemember?remembered(state,req,owner):checkLanCredential(owner,String(req.body?.password??'')))){
    return res.status(401).json({error:'Thông tin đăng nhập không hợp lệ hoặc ghi nhớ đã hết hiệu lực'})
   }
   return issueSession(res,state,owner,req.body?.remember!==false)
  }catch(e){return res.status(503).json({error:e instanceof Error?e.message:'Không xác thực được'})}
 })
 router.post('/logout',(req,res)=>{
  const token=cookie(req,COOKIE_SESSION)
  if(token)sessions.delete(tokenDigest(token))
  clearCookie(res,COOKIE_SESSION)
  return res.json({ok:true})
 })
 router.post('/forget',(req,res)=>{
  try{
   const state=read(),owner=credential(state)
   if(!session(req)&&!remembered(state,req,owner))return res.status(401).json({error:'Cần xác thực để xóa ghi nhớ'})
   if(state.remember){delete state.remember;save(state)}
   clearCookie(res,COOKIE_REMEMBER)
   return res.json({ok:true})
  }catch(e){return res.status(503).json({error:e instanceof Error?e.message:'Không xóa được ghi nhớ'})}
 })
 const gate:RequestHandler=(req,res,next)=>{
  if(res.locals.lanUser||req.path==='/health'||req.path.startsWith('/local/auth/')||req.path==='/local/update'||req.path==='/lan/changes')return next()
  try{
   // First-run setup does not lock the owner out of their existing warehouse.
   // Once an owner credential exists, API requests need a verified local session.
   if(!credential(read())||session(req))return next()
   return res.status(401).json({error:'Cần đăng nhập Windows trước khi sử dụng kho',code:'WINDOWS_LOGIN_REQUIRED'})
  }catch(e){return res.status(503).json({error:e instanceof Error?e.message:'Không kiểm tra được phiên Windows'})}
 }
 return {router,gate}
}

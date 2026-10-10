import {randomBytes,scryptSync,timingSafeEqual,createHash} from 'node:crypto'

export type LanRole='owner'|'cashier'|'inventory'|'viewer'
export type LanCredential={username:string;role:LanRole;salt:string;passwordHash:string}
export type LanIdentity={username:string;role:LanRole}

const roles=new Set<LanRole>(['owner','cashier','inventory','viewer'])
const sessionAge=8*60*60*1000
const cooldown=15*60*1000
const passwordBytes=64
const tokenDigest=(value:string)=>createHash('sha256').update(value).digest('hex')
const usernamePattern=/^[a-z][a-z0-9._-]{2,39}$/
export function makeLanCredential(username:string,password:string,role:LanRole):LanCredential{
 const name=username.trim().toLowerCase()
 if(!usernamePattern.test(name)||!roles.has(role))throw Error('Tên tài khoản hoặc quyền không hợp lệ')
 if(password.length<14||password.length>256||!/[a-z]/i.test(password)||!/[0-9]/.test(password))throw Error('Mật khẩu phải từ 14 ký tự, có chữ và số')
 const salt=randomBytes(32)
 return {username:name,role,salt:salt.toString('hex'),passwordHash:scryptSync(password,salt,passwordBytes).toString('hex')}
}
function validCredentialShape(row:LanCredential){
 return usernamePattern.test(row.username)&&roles.has(row.role)&&/^[a-f0-9]{64}$/.test(row.salt)&&/^[a-f0-9]{128}$/.test(row.passwordHash)
}
export function checkLanCredential(row:LanCredential,password:string){
 if(!validCredentialShape(row)||typeof password!=='string'||password.length>256)return false
 const incoming=scryptSync(password,Buffer.from(row.salt,'hex'),passwordBytes)
 return timingSafeEqual(incoming,Buffer.from(row.passwordHash,'hex'))
}
/** In-memory sessions are invalidated on restart; no long-lived token stored in DB or log. */
export function createLanSessionManager(users:readonly LanCredential[],clock:()=>number=Date.now){
 if(!users.length||users.length>100||users.some(u=>!validCredentialShape(u))||new Set(users.map(u=>u.username)).size!==users.length)throw Error('Cấu hình tài khoản LAN không hợp lệ')
 const usersByName=new Map(users.map(u=>[u.username,u]))
 const failures=new Map<string,{count:number;blockedUntil:number}>()
 const sessions=new Map<string,{user:LanIdentity;expires:number}>()
 const attempt=(username:string,password:string)=>{
  const name=username.trim().toLowerCase()
  if(!usernamePattern.test(name)||typeof password!=='string'||password.length>256)return null
  const current=failures.get(name)
  if(current&&current.blockedUntil>clock())return null
  const user=usersByName.get(name)
  if(!user||!checkLanCredential(user,password)){
   const count=(current?.count??0)+1
   failures.set(name,{count,blockedUntil:count>=5?clock()+cooldown:0})
   return null
  }
  failures.delete(name)
  const token=randomBytes(32).toString('base64url')
  const identity={username:user.username,role:user.role}
  sessions.set(tokenDigest(token),{user:identity,expires:clock()+sessionAge})
  return {token,identity,expires:clock()+sessionAge}
 }
 const inspect=(token:unknown):LanIdentity|null=>{
  if(typeof token!=='string'||token.length<32||token.length>128)return null
  const id=tokenDigest(token),session=sessions.get(id)
  if(!session)return null
  if(session.expires<=clock()){sessions.delete(id);return null}
  return {...session.user}
 }
 const revoke=(token:unknown)=>{
  if(typeof token==='string')sessions.delete(tokenDigest(token))
 }
 const revokeUser=(username:string)=>{
  for(const [key,value] of sessions)if(value.user.username===username.toLowerCase())sessions.delete(key)
 }
 return {attempt,inspect,revoke,revokeUser}
}

/** Only explicit LAN-safe API routes may be used; unknown routes fail closed. */
export function lanApiAllowed(role:LanRole,rawMethod:string,rawPath:string){
 if(!roles.has(role)||!['GET','HEAD','POST','PUT'].includes(rawMethod))return false
 const method=rawMethod==='HEAD'?'GET':rawMethod
 const p=rawPath.split('?')[0]
 if(!p.startsWith('/api/')||p.includes('%')||p.includes('..')||p.includes('//'))return false
 // Host file-system picker, import, restore, clipboard, management and recovery remain Windows-only.
 if(/^\/api\/(fs|backup|local|tasks|store|warehouse)(\/|$)/.test(p))return false
 if(/^\/api\/inventory\/share\/copy$/.test(p))return false
 if(/^\/api\/sales\/drafts\/recover$/.test(p))return false
 if(/^\/api\/sales\/drafts\/[^/]+\/archives(\/|$)/.test(p))return false
 if(method==='GET')return [
 /^\/api\/health$/, /^\/api\/products(?:\/\d+)?$/, /^\/api\/inventory\/(?:dashboard|explorer|suggestions|filter-options|share\/capabilities|share\/image\/\d+)$/,
 /^\/api\/catalog\/dashboard$/, /^\/api\/images\/\d+$/,
 /^\/api\/sales\/drafts$/, /^\/api\/sales\/drafts\/customers$/,
 /^\/api\/sales\/drafts\/customers\/[^/]+$/, /^\/api\/sales\/drafts\/finance\/debts$/,
 /^\/api\/sales\/drafts\/reports\/(?:summary|export\.csv)$/,
 /^\/api\/sales\/drafts\/stocktakes(?:\/[^/]+(?:\/export\.csv)?)?$/,
 /^\/api\/sales\/drafts\/sold-retention(?:\/\d+\/verify)?$/,
 /^\/api\/sales\/drafts\/operations\/[A-Za-z0-9_-]+$/,
 /^\/api\/sales\/drafts\/[^/]+(?:\/(?:finance|slip|slip\.png|sold|sold-image\/\d+|preview\/\d+))?$/
 ].some(re=>re.test(p))
 if(role==='viewer')return false
 // Cashier can sell, serve customers, receive payments and open aftercare; all via existing transactional services.
 if(role==='cashier'||role==='owner'){
  if(method==='POST'&&/^\/api\/sales\/drafts$/.test(p))return true
  if(method==='PUT'&&/^\/api\/sales\/drafts\/[A-Za-z0-9_-]+$/.test(p))return true
  if(method==='POST'&&/^\/api\/sales\/drafts\/[A-Za-z0-9_-]+\/(?:cancel|confirm|aftercare)$/.test(p))return true
  if(method==='POST'&&/^\/api\/sales\/drafts\/[A-Za-z0-9_-]+\/finance\/entries$/.test(p))return true
  if(method==='PUT'&&/^\/api\/sales\/drafts\/[A-Za-z0-9_-]+\/finance$/.test(p))return true
  if(method==='PUT'&&/^\/api\/sales\/drafts\/[A-Za-z0-9_-]+\/aftercare\/[A-Za-z0-9_-]+$/.test(p))return true
  if(method==='POST'&&/^\/api\/sales\/drafts\/customers$/.test(p))return true
  if(method==='PUT'&&/^\/api\/sales\/drafts\/customers\/[A-Za-z0-9_-]+$/.test(p))return true
 }
 if(role==='inventory'||role==='owner'){
  if(method==='POST'&&p==='/api/sales/drafts/stocktakes')return true
  if(method==='PUT'&&/^\/api\/sales\/drafts\/stocktakes\/[A-Za-z0-9_-]+$/.test(p))return true
  if(method==='POST'&&/^\/api\/sales\/drafts\/stocktakes\/[A-Za-z0-9_-]+\/finish$/.test(p))return true
 }
 return false
}

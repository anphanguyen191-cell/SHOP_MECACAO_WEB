import fs from 'node:fs'
import path from 'node:path'
import http from 'node:http'
import https from 'node:https'
import {X509Certificate} from 'node:crypto'
import {Router,type Application} from 'express'
import {lanAddresses,loadLanRuntime,privateIP,type LanRuntime} from './lanRuntime.js'
import {certificateDirectory,certificatePair,exactLanFile,replaceLanJson,generateLanCertificates} from './lanCertificates.js'
import {createLanAudit} from './lanAudit.js'
import {makeLanCredential,changeLanAccount,createLanSessionManager,type LanCredential} from './lanSecurity.js'
export class LanControlError extends Error{constructor(message:string,public status=409){super(message)}}
type ControlDependencies={addresses:typeof lanAddresses;load:(address:string,port:number,directory:string,audit:ReturnType<typeof createLanAudit>)=>LanRuntime;validAddress:(address:string)=>boolean}
export function createLanControl(app:Application,directory:string,localPort:number,initial:LanRuntime|null=null,dependencies:ControlDependencies={addresses:lanAddresses,load:loadLanRuntime,validAddress:privateIP}){
 let current=initial,server:https.Server|null=null,bootstrap:http.Server|null=null,bootstrapExpires=0,bootstrapPort=0,busy=false,audit=initial?.audit
 function safeDirectory(){fs.mkdirSync(directory,{recursive:true});if(fs.realpathSync(directory)!==directory||!fs.lstatSync(directory).isDirectory())throw Error('Thư mục LAN không an toàn')}
 function users():LanCredential[]{safeDirectory();const f=path.join(directory,'users.json');if(!fs.existsSync(f))return [];const c=JSON.parse(exactLanFile(f).toString());if(c.format!==1||!Array.isArray(c.users)||!c.users.some((u:LanCredential)=>u.role==='owner'))throw Error('Cấu hình tài khoản cần kiểm tra');createLanSessionManager(c.users);return c.users}
 function getAudit(){safeDirectory();return audit??=createLanAudit(path.join(directory,'audit.jsonl'))}
 function event(actor:string,target:string,status:number){getAudit().append({event:status===0?'ADMIN_START':'ADMIN_RESULT',actor,role:'owner',method:'POST',target,status})}
 function knownAddress(address:unknown){if(typeof address!=='string'||!dependencies.validAddress(address)||!dependencies.addresses().some(a=>a.address===address))throw new LanControlError('Chọn đúng IP Wi-Fi/Ethernet hiện tại trong danh sách');return address}
 function view(){
  safeDirectory();let cert:any=null,certificateError='';try{const dir=certificateDirectory(directory),x=new X509Certificate(exactLanFile(path.join(dir,'cert.pem'))),caFile=path.join(dir,'ca.pem');cert={expiresAt:x.validTo,fingerprint:x.fingerprint256,addresses:x.subjectAltName,caAvailable:fs.existsSync(caFile),caFingerprint:fs.existsSync(caFile)?new X509Certificate(exactLanFile(caFile)).fingerprint256:null};if(Date.parse(x.validTo)<=Date.now())certificateError='Chứng chỉ hết hạn; tắt LAN rồi tạo lại.'}catch{certificateError='Chưa có chứng chỉ HTTPS hợp lệ.'}
  return {enabled:!!server,address:current?.address??null,port:current?.port??null,url:server&&current?'https://'+current.address+':'+current.port:null,addresses:dependencies.addresses(),certificate:cert,certificateError,users:users().map(u=>({username:u.username,role:u.role})),busy,bootstrap:bootstrap&&current?{url:'http://'+current.address+':'+bootstrapPort+'/ca.cer',expiresAt:new Date(bootstrapExpires).toISOString()}:null}
 }
 async function serial<T>(fn:()=>Promise<T>){if(busy)throw new LanControlError('Đang xử lý thiết lập LAN');busy=true;try{return await fn()}finally{busy=false}}
 async function close(s:http.Server|https.Server|null){if(!s)return;s.closeIdleConnections();await new Promise<void>(r=>{s.close(()=>r());s.closeAllConnections()})}
 async function stopBootstrap(){const s=bootstrap;bootstrap=null;bootstrapExpires=0;await close(s)}
 async function disable(){return serial(async()=>{event('windows','/admin/lan/stop',0);const s=server;server=null;current=null;await stopBootstrap();await close(s);event('windows','/admin/lan/stop',200);return view()})}
 async function enable(raw:any){return serial(async()=>{
  if(server)throw new LanControlError('LAN đang bật; tắt trước khi đổi IP/cổng');if(raw?.confirmed!==true)throw new LanControlError('Xác nhận mạng riêng và cài CA trước khi đăng nhập trên điện thoại',400)
  const address=knownAddress(raw.address),port=Number(raw.port);if(!Number.isInteger(port)||port<1024||port>65535||port===localPort)throw new LanControlError('Chọn cổng HTTPS riêng từ 1024 đến 65535',400)
  const next=dependencies.load(address,port,directory,getAudit());event('windows','/admin/lan/start',0)
  let s:https.Server|null=null
  try{s=https.createServer({key:next.key,cert:next.cert,minVersion:'TLSv1.2'},app);await new Promise<void>((r,j)=>{s!.once('error',j);s!.listen(port,address,()=>{s!.off('error',j);r()})});current=next;server=s;event('windows','/admin/lan/start',200);return view()}
  catch(e){await close(s);current=null;server=null;throw new LanControlError((e as NodeJS.ErrnoException).code==='EADDRINUSE'?'Cổng HTTPS đang bận; chọn cổng khác. Windows vẫn hoạt động.':(e instanceof Error?e.message:'Không bật được LAN'))}
 })}
 async function certificates(raw:any){return serial(async()=>{if(server)throw new LanControlError('Tắt LAN trước khi tạo chứng chỉ');const address=knownAddress(raw?.address);if(raw?.confirmed!==true)throw new LanControlError('Xác nhận tạo chứng chỉ mới; điện thoại cần tin cậy CA mới',400);safeDirectory();event('windows','/admin/lan/certificate',0);await generateLanCertificates(directory,address);event('windows','/admin/lan/certificate',200);return view()})}
 async function account(raw:any){return serial(async()=>{const old=users();if(!raw||!['add','reset','disable'].includes(raw.action)||typeof raw.username!=='string')throw new LanControlError('Thông tin tài khoản không hợp lệ',400)
  let changed:LanCredential[];if(!old.length){if(raw.action!=='add'||raw.role!=='owner'||typeof raw.password!=='string')throw new LanControlError('Tài khoản đầu tiên phải là chủ shop',400);changed=[makeLanCredential(raw.username,raw.password,'owner')]}else{try{changed=changeLanAccount(old,String(raw.actor??''),String(raw.ownerPassword??''),raw)}catch(e){throw new LanControlError(e instanceof Error?e.message:'Không đổi được tài khoản',403)}}
  event(old.length?String(raw.actor):'windows','/admin/lan/account',0);replaceLanJson(path.join(directory,'users.json'),{format:1,users:changed});if(current)current.sessions=createLanSessionManager(changed);event(old.length?String(raw.actor):'windows','/admin/lan/account',200);return view()
 })}
 async function startBootstrap(raw:any){return serial(async()=>{
  if(!server||!current)throw new LanControlError('Bật LAN HTTPS trước khi mở tải CA');if(raw?.confirmed!==true)throw new LanControlError('Xác nhận chỉ tải chứng chỉ CA công khai',400);const port=Number(raw.port);if(!Number.isInteger(port)||port<1024||port>65535||port===localPort||port===current.port)throw new LanControlError('Chọn cổng tải CA khác cổng Windows và HTTPS',400);await stopBootstrap();const ca=publicCa(),address=current.address
  const s=http.createServer((req,res)=>{res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');if(req.headers.host!==address+':'+port||req.method!=='GET'||req.url!=='/ca.cer'||Date.now()>=bootstrapExpires){res.writeHead(404);res.end();return}res.setHeader('Content-Type','application/x-x509-ca-cert');res.setHeader('Content-Disposition','attachment; filename="MeCaCao-LAN-CA.cer"');res.end(ca)})
  bootstrapExpires=Date.now()+10*60000;try{await new Promise<void>((r,j)=>{s.once('error',j);s.listen(port,address,()=>{s.off('error',j);r()})});bootstrap=s;bootstrapPort=port;const timer=setTimeout(()=>{if(bootstrap===s)void stopBootstrap()},10*60000);timer.unref();return view()}catch(e){bootstrapExpires=0;await close(s);throw new LanControlError((e as NodeJS.ErrnoException).code==='EADDRINUSE'?'Cổng tải CA đang bận; chọn cổng khác.':'Không mở được tải CA')}
 })}
 function publicCa(){const ca=new X509Certificate(exactLanFile(path.join(certificateDirectory(directory),'ca.pem')));if(!ca.ca)throw new LanControlError('Chứng chỉ CA chưa hợp lệ');return ca.raw}
 return {current:()=>current,view,enable,disable,certificates,account,startBootstrap,stopBootstrap,publicCa,async startInitial(){if(!initial)return;const raw={address:initial.address,port:initial.port,confirmed:true};current=null;await enable(raw)}}
}
export function lanControlRouter(control:ReturnType<typeof createLanControl>,localPort:number){
 const router=Router();router.use((req,res,next)=>{let hostOK=false;try{const h=new URL('http://'+req.get('host'));hostOK=['localhost','127.0.0.1','[::1]'].includes(h.hostname)&&Number(h.port||80)===localPort&&!h.username&&!h.password&&h.host===req.get('host')&&h.pathname==='/'&&!h.search&&!h.hash}catch{}if((req.socket as any).encrypted||!['127.0.0.1','::1','::ffff:127.0.0.1'].includes(req.socket.remoteAddress??'')||!hostOK)return res.status(403).json({error:'Thiết lập LAN chỉ trên Windows LOCAL'});if(!['GET','HEAD'].includes(req.method)&&(req.get('origin')!=='http://'+req.get('host')||req.get('sec-fetch-site')==='cross-site'))return res.status(403).json({error:'Thao tác thiết lập phải từ giao diện Windows cùng địa chỉ'});res.set('Cache-Control','no-store');next()})
 const fail=(res:any,e:any)=>res.status(e instanceof LanControlError?e.status:400).json({error:e.message??'Không xử lý được thiết lập LAN'})
 router.get('/',(_req,res)=>{try{res.json(control.view())}catch(e){fail(res,e)}});router.get('/ca.cer',(_req,res)=>{try{res.attachment('MeCaCao-LAN-CA.cer').type('application/x-x509-ca-cert').send(control.publicCa())}catch(e){fail(res,e)}})
 for(const [route,fn] of [['enable',control.enable],['disable',control.disable],['certificates',control.certificates],['accounts',control.account],['ca-download',control.startBootstrap]] as const)router.post('/'+route,(req,res)=>{void fn(req.body).then(s=>res.json(s)).catch(e=>fail(res,e))})
 router.post('/ca-download/stop',(_req,res)=>{void control.stopBootstrap().then(()=>res.json(control.view())).catch(e=>fail(res,e))})
 return router
}

import fs from 'node:fs'
import path from 'node:path'
import {fork} from 'node:child_process'
import {createHash,randomUUID} from 'node:crypto'
import {stageLatest} from './release-fetch.mjs'
import {snapshotV8Data,restoreV8Data} from './data-snapshot.mjs'

const home=process.env.SHOP_V8_HOME
if(!home||!fs.statSync(home).isDirectory())throw Error('Thiếu thư mục V8 trên ổ D:')
const activeFile=path.join(home,'active.json'),statusFile=path.join(home,'update-status.json')
const rootManifest=JSON.parse(fs.readFileSync(path.join(home,'manifest.json'),'utf8'))
if(rootManifest.format!==8||!['PREVIEW','STABLE'].includes(rootManifest.channel))throw Error('Không xác định được kênh cập nhật V8')
// A single release channel: every installed V8 (including old PREVIEW) updates to official main releases.
const releaseChannel='STABLE'
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms))
const write=(file,value)=>{
 const temp=file+'.'+randomUUID()+'.tmp'
 fs.writeFileSync(temp,JSON.stringify(value,null,2),{flag:'wx'})
 fs.renameSync(temp,file)
}
const status=(phase,message)=>write(statusFile,{phase,message,updatedAt:new Date().toISOString()})
function active(){
 if(!fs.existsSync(activeFile))return 'current'
 const state=JSON.parse(fs.readFileSync(activeFile,'utf8'))
 if(state.format!==8||!/^(current|[a-f0-9]{40})$/.test(state.release))throw Error('Phiên bản V8 đang sử dụng không hợp lệ')
 return state.release
}
const folder=release=>path.join(home,'releases',release)
function start(release,fenced=true){
 const root=folder(release),entry=path.join(root,'apps/api/dist/server.js')
 if(!fs.existsSync(entry))throw Error('Không có chương trình V8: '+release)
 const env={...process.env,SHOP_FRESH_DEVELOPMENT:'1',SHOP_V8_HOME:home,SHOP_HOST:'127.0.0.1',PORT:'3000',SHOP_UPDATE_STARTING:fenced?'1':'0',SHOP_RELEASE_CHANNEL:release==='current'&&rootManifest.channel==='PREVIEW'?'PREVIEW':'STABLE'}
 for(const k of ['SHOP_MANAGED_HOME','SHOP_DB_PATH','SHOP_SANDBOX_ROOT','SHOP_LOCAL_V2_CONFIG','SHOP_LOCAL_V2_RESTORE_READY'])delete env[k]
 const child=fork(entry,[],{cwd:root,env,stdio:['ignore','inherit','inherit','ipc'],windowsHide:true})
 child.on('message',m=>{if(m?.type==='managed:update'&&!updating&&!stopping)void update()})
 child.once('exit',code=>{
  if(child!==server||updating||stopping)return
  if(code===75){
   status('RESTARTING','Đã ghi nhận kho được chọn. Đang mở lại Shop...')
   void (async()=>{try{await sleep(350);server=start(active());await ready(server);enable(server);status('IDLE','Đã chuyển kho. Vui lòng quét và duyệt hàng trong Import kho.')}catch(error){status('FAILED','Không mở lại được sau khi chọn kho: '+String(error));console.error(error)}})()
  }else status('FAILED','Máy chủ đã dừng, xem log trên ổ D: · exit '+code)
 })
 return child
}
const identity=createHash('sha256').update(home).digest('hex')
async function ready(child){
 for(let i=0;i<100;i++){
  if(child.exitCode!==null)throw Error('Phiên bản mới thoát khi khởi động')
  try{
   const resp=await fetch('http://127.0.0.1:3000/api/health',{signal:AbortSignal.timeout(600)})
   if(resp.ok){
    const h=await resp.json()
    if(h.installationId!==identity||h.database!=='shop-v8.db'||h.schema!==130||h.databasePath!==path.join(home,'data','shop-v8','database','shop-v8.db'))
     throw Error('Phiên bản không mở đúng database V8')
    return
   }
  }catch(e){if(String(e.message).includes('không mở đúng'))throw e}
  await sleep(300)
 }
 throw Error('Ứng dụng V8 không khởi động được')
}
function enable(child){child.send({type:'managed:enable'})}
async function quiesce(child){
 return await new Promise((resolve,reject)=>{
  const timer=setTimeout(()=>{child.off('message',receive);reject(Error('Chờ tác vụ quá lâu; giữ bản cũ'))},50000)
  function receive(m){
   if(!['managed:quiesced','managed:refused'].includes(m?.type))return
   clearTimeout(timer);child.off('message',receive)
   m.type==='managed:quiesced'?resolve():reject(Error(m.error||'Không thể tạm dừng thao tác'))
  }
  child.on('message',receive)
  child.send({type:'managed:quiesce'})
 })
}
async function close(child){
 if(child.exitCode!==null)return
 child.send('SHOP_LOCAL_CLOSE')
 const exit=new Promise(resolve=>child.once('exit',resolve))
 const result=await Promise.race([exit,sleep(13000).then(()=> 'timeout')])
 if(result==='timeout')throw Error('Không thể dừng an toàn; giữ nguyên dữ liệu và phiên bản')
}
let server=null,updating=false,stopping=false
async function update(){
 updating=true
 const previous=active()
 let switched=false,candidate,snapshot=null
 try{
  status('CHECKING','Đang kiểm tra bản V8 '+releaseChannel+' trên GitHub.')
  const result=await stageLatest(home,previous,status,releaseChannel)
  if(result.current){status('CURRENT','Đang sử dụng bản V8 '+releaseChannel+' mới nhất.');return}
  const dest=folder(result.sha)
  if(fs.existsSync(dest)){
   if(!fs.statSync(path.join(dest,'apps/api/dist/server.js')).isFile())throw Error('Thư mục phát hành trùng tên nhưng không hợp lệ')
  }else fs.renameSync(result.program,dest)
  fs.rmSync(result.stage,{recursive:true,force:true})
  status('STOPPING','Đang đợi giao dịch và tác vụ hoàn tất.')
  await quiesce(server)
  await close(server)
  switched=true
  snapshot=snapshotV8Data(home)
  status('VERIFYING','Đang khởi động bản mới, kiểm tra đúng database V8.')
  candidate=start(result.sha)
  await ready(candidate)
  write(activeFile,{format:8,release:result.sha,previous,updatedAt:new Date().toISOString()})
  server=candidate
  enable(server)
  status('SUCCEEDED','Cập nhật thành công. Nhấn Mở giao diện mới để sử dụng.')
  try{fs.rmSync(snapshot.directory,{recursive:true,force:true})}catch(e){console.error('Không xóa được vùng tạm sau cập nhật:',e)}
 }catch(e){
  if(candidate&&candidate.exitCode===null){try{await close(candidate)}catch{}}
  if(switched){
   try{if(snapshot)restoreV8Data(home,snapshot);server=start(previous);await ready(server);enable(server)}
   catch(recovery){status('REVIEW_REQUIRED','Không mở lại được phiên bản cũ. Giữ nguyên dữ liệu, kiểm tra log.');console.error(recovery);return}
  }else if(server?.connected)enable(server)
  status('FAILED','Chưa cập nhật: '+(e instanceof Error?e.message:String(e)))
  console.error(e)
 }finally{updating=false}
}
async function stop(){
 if(stopping)return
 stopping=true
 try{await close(server);process.exit(0)}catch(e){stopping=false;console.error(e);status('REVIEW_REQUIRED','Còn tác vụ đang chạy, không được đóng Shop ngay')}
}
process.stdin.setEncoding('utf8')
process.stdin.on('data',s=>{if(s.includes('STOP'))void stop()})
process.stdin.on('end',()=>void stop())
process.on('SIGINT',()=>void stop())
process.on('SIGTERM',()=>void stop())
try{
 status('STARTING','Đang khởi chạy Shop Mẹ CaCao trên ổ D:.')
 server=start(active())
 await ready(server);enable(server)
 status('IDLE','Đã mở Shop. Có thể kiểm tra phiên bản mới.')
}catch(e){status('FAILED','Khởi động thất bại: '+e.message);console.error(e);process.exitCode=1}

import {spawn} from 'node:child_process'
import path from 'node:path'
import {fileURLToPath} from 'node:url'
const project=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..')
const port=3000,url='http://127.0.0.1:'+port
try{await fetch(url+'/api/health',{signal:AbortSignal.timeout(1000)});throw Error('Cong 3000 dang duoc su dung. Dong server cu truoc khi mo ban moi.')}catch(e){if(e.message.startsWith('Cong'))throw e}
const env={...process.env,SHOP_FRESH_DEVELOPMENT:'1',PORT:String(port),SHOP_HOST:'127.0.0.1'}
for(const key of ['SHOP_DB_PATH','SHOP_SANDBOX_ROOT','SHOP_LOCAL_V2_CONFIG','SHOP_LOCAL_V2_RESTORE_READY','SHOP_LOCAL_V2_REVIEW','SHOP_TASK_WORKER'])delete env[key]
let child,opened=false
process.on('SIGINT',()=>child?.kill('SIGINT'));process.on('SIGTERM',()=>child?.kill('SIGTERM'))
for(;;){
 child=spawn(process.execPath,['apps/api/dist/server.js'],{cwd:project,env,stdio:'inherit'})
 const ended=new Promise((resolve,reject)=>{child.once('error',reject);child.once('exit',code=>resolve(code??1))})
 let ready=false
 for(let n=0;n<60&&child.exitCode===null;n++){
  try{const h=await fetch(url+'/api/health',{signal:AbortSignal.timeout(500)}).then(r=>r.json());if(h.ok&&h.freshDevelopment&&h.database==='shop-stage3.db'&&h.salesExecution){ready=true;console.log('\nSHOP ME CACAO - '+h.version+' - MAIN\n'+url+'\nKho: '+h.warehouse+'\nChon kho tren giao dien truoc khi nhap du lieu.\nDong cua so nay de dung ung dung.\n');break}}catch{}
  await new Promise(r=>setTimeout(r,500))
 }
 if(!ready){child.kill();await ended;throw Error('Server khong san sang; giu nguyen du lieu de kiem tra.')}
 if(!opened&&process.platform==='win32'){spawn('cmd.exe',['/d','/c','start','',url],{stdio:'ignore'});opened=true}
 const code=await ended
 if(code!==75){process.exitCode=code;break}
 console.log('Dang mo kho vua chon...')
}

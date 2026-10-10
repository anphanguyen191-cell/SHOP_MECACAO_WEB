import fs from 'node:fs'
import path from 'node:path'
import net from 'node:net'
import { spawn } from 'node:child_process'
import { DatabaseSync } from 'node:sqlite'
import { setTimeout as sleep } from 'node:timers/promises'
import { createInterface } from 'node:readline/promises'

if(!process.env.LOCALAPPDATA)throw Error('Cần LOCALAPPDATA Windows')
const base = path.resolve(process.env.LOCALAPPDATA,'ShopMeCaCao','V2LocalPreparation')
if(fs.realpathSync(base)!==base)throw Error('Vùng chuẩn bị không an toàn')
const packages = fs.readdirSync(base).filter(n=>/^prepare-[a-f0-9-]{36}$/.test(n)).map(n=>path.join(base,n)).filter(p=>fs.existsSync(path.join(p,'local-v2-ready.json'))).sort((a,b)=>fs.statSync(path.join(b,'local-v2-ready.json')).mtimeMs-fs.statSync(path.join(a,'local-v2-ready.json')).mtimeMs)
if(!packages.length)throw Error('Chưa có gói READY_FOR_REVIEW; chạy PREPARE_WINDOWS_V2_LOCAL_COPY.bat trước')
const prompt=createInterface({input:process.stdin,output:process.stdout})
let selected
try {
  packages.forEach((p,i)=>console.log((i+1)+'. '+p))
  const answer=await prompt.question('Chọn số gói cần mở (không tự chọn): ')
  if(!/^[1-9]\d*$/.test(answer)||!packages[Number(answer)-1])throw Error('Số gói không hợp lệ')
  selected=packages[Number(answer)-1]
}finally{prompt.close()}
if(fs.realpathSync(selected)!==selected)throw Error('Gói qua symlink')
const ready=JSON.parse(fs.readFileSync(path.join(selected,'local-v2-ready.json'),'utf8'))
const root=path.join(selected,'candidate'),database=path.join(root,'database','shop-restored.db')
if(ready.status!=='READY_FOR_REVIEW'||ready.mode!=='V2_LOCAL_COPY_PREPARATION'||ready.activated!==false||ready.businessActivationAllowed!==false||ready.candidate?.targetRoot!==root||ready.candidate?.database!==database||fs.realpathSync(database)!==database)throw Error('Marker/path chuẩn bị không hợp lệ')
const db=new DatabaseSync(database,{readOnly:true})
try{if(db.prepare("SELECT value FROM app_metadata WHERE key='schema_version'").get()?.value!=='130'||db.prepare('PRAGMA integrity_check').get()?.integrity_check!=='ok'||db.prepare('PRAGMA foreign_key_check').all().length)throw Error('Database bản sao không toàn vẹn')}finally{db.close()}
const socket=net.createServer();await new Promise((resolve,reject)=>{socket.once('error',reject);socket.listen(3017,'127.0.0.1',resolve)});await new Promise(resolve=>socket.close(resolve))
console.log('LOCAL V2 — BẢN SAO ĐỂ DUYỆT\n'+root+'\nhttp://127.0.0.1:3017\nKhông thay kho thật. Giao dịch ở đây chỉ thay bản sao. Ctrl+C để dừng.')
const child=spawn(process.execPath,['apps/api/dist/server.js'],{stdio:'inherit',env:{...process.env,PORT:'3017',SHOP_HOST:'127.0.0.1',SHOP_DB_PATH:database,SHOP_SANDBOX_ROOT:root,SHOP_ENABLE_V2_DRAFTS:'1',SHOP_ENABLE_V2_SALES:'1',SHOP_LOCAL_V2_REVIEW:'1'}})
child.on('exit',code=>process.exit(code??1));process.on('SIGINT',()=>child.kill())
process.on('message',message=>{if(message==='stop')child.kill()})
let ok=false
for(let i=0;i<100;i++){try{const r=await fetch('http://127.0.0.1:3017/api/health',{signal:AbortSignal.timeout(1000)});const h=await r.json();if(h.ok&&h.sandbox&&h.schema===130&&h.localV2Review&&h.database==='shop-restored.db'){ok=true;break}}catch{}await sleep(100)}
if(!ok){child.kill();throw Error('Server bản sao chưa sẵn sàng')}
if(process.platform==='win32'&&process.env.SHOP_NO_OPEN_BROWSER!=='1')spawn('cmd.exe',['/c','start','','http://127.0.0.1:3017'],{stdio:'ignore'})

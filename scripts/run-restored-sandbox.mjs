import fs from 'node:fs'
import path from 'node:path'
import {spawn} from 'node:child_process'
import net from 'node:net'
import {setTimeout as sleep} from 'node:timers/promises'
import {DatabaseSync} from 'node:sqlite'
const base=path.join(process.env.LOCALAPPDATA||'','ShopMeCaCao',process.argv[2]||'V2DraftSandbox','restore-tests')
if(!['V2DraftSandbox','V1AcceptanceSandbox'].includes(process.argv[2]||'V2DraftSandbox')||!process.env.LOCALAPPDATA)throw Error('Launcher chỉ mở restore-tests trong LOCALAPPDATA sandbox')
const candidates=fs.readdirSync(base).map(n=>path.join(base,n)).filter(p=>fs.existsSync(path.join(p,'restore-ready.json'))).sort((a,b)=>fs.statSync(path.join(b,'restore-ready.json')).mtimeMs-fs.statSync(path.join(a,'restore-ready.json')).mtimeMs)
if(!candidates.length)throw Error('Chưa có kho restore READY. Tạo backup và phục hồi thử trong Cài đặt trước.')
const root=fs.realpathSync(candidates[0]),ready=JSON.parse(fs.readFileSync(path.join(root,'restore-ready.json'),'utf8'))
if(path.dirname(root)!==fs.realpathSync(base)||ready.status!=='READY'||ready.database!==path.join(root,'database','shop-restored.db')||ready.warehouse!==path.join(root,'warehouse')||![110,120].includes(ready.schema))throw Error('Marker/path/schema restore không hợp lệ')
const db=new DatabaseSync(ready.database,{readOnly:true});try{if(db.prepare("SELECT value FROM app_metadata WHERE key='schema_version'").get()?.value!==String(ready.schema)||db.prepare('PRAGMA integrity_check').get()?.integrity_check!=='ok'||db.prepare('PRAGMA foreign_key_check').all().length)throw Error('DB restore không hợp lệ')}finally{db.close()}
const sock=net.createServer();await new Promise((resolve,reject)=>{sock.once('error',reject);sock.listen(3016,'127.0.0.1',resolve)});await new Promise(resolve=>sock.close(resolve))
console.log('MỞ KHO RESTORE THỬ MỚI NHẤT: '+root+'\nhttp://127.0.0.1:3016\nKho đang dùng ở 3005/3006 giữ nguyên. Ctrl+C để dừng.')
const child=spawn(process.execPath,['apps/api/dist/server.js'],{stdio:'inherit',env:{...process.env,PORT:'3016',SHOP_HOST:'127.0.0.1',SHOP_SANDBOX_ROOT:root,SHOP_DB_PATH:ready.database,SHOP_ENABLE_V2_DRAFTS:ready.schema===120?'1':''}})
child.on('exit',code=>process.exit(code??1));process.on('SIGINT',()=>child.kill());process.on('message',m=>{if(m==='stop')child.kill()})
let running=false;for(let n=0;n<100;n++){try{const r=await fetch('http://127.0.0.1:3016/api/health',{signal:AbortSignal.timeout(1000)});if(r.ok){const h=await r.json();if(h.sandbox&&h.database==='shop-restored.db'){running=true;break}}}catch{}await sleep(100)}if(!running){child.kill();throw Error('Restore server chưa sẵn sàng')}
if(process.platform==='win32'&&process.env.SHOP_NO_OPEN_BROWSER!=='1')spawn('cmd.exe',['/c','start','','http://127.0.0.1:3016'],{stdio:'ignore'})

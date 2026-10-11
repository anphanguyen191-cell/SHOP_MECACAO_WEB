import fs from 'node:fs'
import path from 'node:path'
import {createHash} from 'node:crypto'
import {spawn} from 'node:child_process'
import {fileURLToPath} from 'node:url'
const project=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),data=path.join(project,'data'),url='http://127.0.0.1:3000'
const installation=createHash('sha256').update(project).digest('hex'),stamp=path.join(data,'desktop-build.json'),lock=path.join(data,'desktop-launcher.json')
const noBrowser=process.env.SHOP_NO_BROWSER==='1'||process.argv.includes('--no-browser'),prepare=process.argv.includes('--prepare-only')
const delay=ms=>new Promise(r=>setTimeout(r,ms))
fs.mkdirSync(data,{recursive:true})
function open(){if(!noBrowser&&process.platform==='win32')spawn('rundll32.exe',['url.dll,FileProtocolHandler',url],{windowsHide:true,stdio:'ignore'}).on('error',e=>console.error(e.message))}
async function server(){try{const r=await fetch(url+'/api/health',{signal:AbortSignal.timeout(700)});if(!r.ok)throw Error('Cong 3000 co dich vu khac.');const h=await r.json();if(h.installationId!==installation)throw Error('Cong 3000 dang dung boi ban cai khac. Dong ban do truoc.');return true}catch(e){if(e.message.startsWith('Cong'))throw e;return false}}
function signature(){const h=createHash('sha256');h.update(process.versions.node);function scan(p){if(!fs.existsSync(p))return;const stat=fs.lstatSync(p);if(stat.isSymbolicLink())throw Error('Source khong duoc la lien ket: '+p);if(stat.isDirectory()){for(const n of fs.readdirSync(p).sort())if(!['dist','node_modules'].includes(n))scan(path.join(p,n))}else{h.update(path.relative(project,p));h.update(fs.readFileSync(p))}}for(const p of ['package.json','package-lock.json','apps/web','apps/api','scripts/copy-api-assets.mjs'])scan(path.join(project,p));return h.digest('hex')}
async function command(args){const child=process.platform==='win32'?spawn('cmd.exe',['/d','/s','/c','npm '+args.join(' ')],{cwd:project,windowsHide:true,stdio:'inherit'}):spawn('npm',args,{cwd:project,stdio:'inherit'});const code=await new Promise((r,j)=>{child.once('error',j);child.once('exit',r)});if(code!==0)throw Error('npm '+args.join(' ')+' that bai.')}
let child,owned=false
try{
 const [major,minor]=process.versions.node.split('.').map(Number);if(major<22||(major===22&&minor<13))throw Error('Can Node.js 22.13+ hoac 24.')
 if(!prepare&&await server()){open();console.log('OPEN_EXISTING');process.exit(0)}
 for(let n=0;;n++){
  try{const fd=fs.openSync(lock,'wx');fs.writeFileSync(fd,JSON.stringify({pid:process.pid,installation}));fs.closeSync(fd);owned=true;break}catch(e){if(e.code!=='EEXIST')throw e}
  try{const old=JSON.parse(fs.readFileSync(lock));try{process.kill(old.pid,0)}catch(e){if(e.code==='ESRCH'){fs.unlinkSync(lock);continue}}}catch{}
  if(!prepare&&await server()){open();console.log('OPEN_EXISTING');process.exit(0)}
  if(n>=300)throw Error('Ung dung dang chuan bi. Xem data/launcher.log.');await delay(1000)
 }
 const sig=signature();let cached;try{cached=JSON.parse(fs.readFileSync(stamp,'utf8'))}catch{}
 if(!fs.existsSync(path.join(project,'node_modules'))||cached?.lock!==createHash('sha256').update(fs.readFileSync(path.join(project,'package-lock.json'))).digest('hex'))await command(['ci'])
 if(cached?.signature!==sig||!fs.existsSync(path.join(project,'apps/api/dist/server.js'))||!fs.existsSync(path.join(project,'apps/web/dist/index.html'))){console.log('BUILD_REQUIRED');await command(['run','build']);const temp=stamp+'.tmp';fs.writeFileSync(temp,JSON.stringify({signature:sig,lock:createHash('sha256').update(fs.readFileSync(path.join(project,'package-lock.json'))).digest('hex')}));fs.renameSync(temp,stamp)}else console.log('BUILD_CACHED')
 if(prepare)process.exitCode=0
 else{
  const env={...process.env,SHOP_NO_BROWSER:'1'}
  child=spawn(process.execPath,['scripts/start-stage2.mjs'],{cwd:project,env,windowsHide:true,stdio:'inherit'})
  const ended=new Promise((r,j)=>{child.once('error',j);child.once('exit',code=>r(code??1))})
  process.on('SIGTERM',()=>child?.kill());process.on('SIGINT',()=>child?.kill())
  let ready=false;for(let n=0;n<100&&child.exitCode===null;n++){if(await server()){ready=true;break}await delay(300)}
  if(!ready){child.kill();await ended;throw Error('Server chua san sang; xem launcher.log.')}
  open();console.log('OPEN_READY');process.exitCode=await ended
 }
}catch(e){console.error(e.message);process.exitCode=1}finally{if(owned)try{const current=JSON.parse(fs.readFileSync(lock));if(current.pid===process.pid)fs.unlinkSync(lock)}catch{}}

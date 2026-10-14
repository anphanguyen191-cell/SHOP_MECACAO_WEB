import fs from 'node:fs'
import path from 'node:path'
import {createHash,randomUUID} from 'node:crypto'
import {spawn} from 'node:child_process'
import {Readable,Transform} from 'node:stream'
import {pipeline} from 'node:stream/promises'

const repo='anphanguyen191-cell/SHOP_MECACAO_WEB'
const maxZip=200*1024*1024
async function json(url){
 const r=await fetch(url,{headers:{Accept:'application/vnd.github+json','User-Agent':'ShopMeCaCao-V8-Updater'},signal:AbortSignal.timeout(30000)})
 if(!r.ok)throw Error('Không đọc được GitHub Release: HTTP '+r.status)
 return r.json()
}
async function expand(zip,destination){
 const quote=s=>"'"+s.replaceAll("'","''")+"'"
 const script='Expand-Archive -LiteralPath '+quote(zip)+' -DestinationPath '+quote(destination)+' -Force'
 const proc=spawn('powershell.exe',['-NoProfile','-NonInteractive','-Command',script],{windowsHide:true,stdio:['ignore','pipe','pipe']})
 const error=[];proc.stderr.on('data',x=>error.push(x.toString().slice(0,500)))
 const exit=await new Promise((resolve,reject)=>{proc.once('error',reject);proc.once('exit',resolve)})
 if(exit!==0)throw Error('Không giải nén được bản cập nhật: '+error.join('').slice(0,400))
}
const realFile=(root,p)=>{
 const target=path.resolve(root,p),rel=path.relative(root,target)
 if(rel.startsWith('..')||path.isAbsolute(rel))throw Error('Gói cập nhật vượt thư mục')
 if(!fs.existsSync(target)||fs.realpathSync(target)!==target||!fs.statSync(target).isFile())throw Error('File gói cập nhật không hợp lệ: '+p)
 return target
}
export async function stageLatest(home,previous,onStatus=()=>{}){
 const release=await json('https://api.github.com/repos/'+repo+'/releases/latest')
 if(!/^v8\.[0-9]+\.[0-9]+-stable$/.test(release.tag_name)||release.prerelease||release.draft)throw Error('Chưa có bản V8 STABLE đã duyệt')
 const asset=release.assets?.find(x=>x.name==='ShopMeCaCao-V8-STABLE-win-x64.zip')
 if(!asset||!/^sha256:[a-f0-9]{64}$/i.test(asset.digest||''))throw Error('Release chưa có gói và SHA-256 xác thực')
 const updateDir=path.join(home,'updates'),stage=path.join(home,'staging','release-'+randomUUID())
 fs.mkdirSync(updateDir,{recursive:true});fs.mkdirSync(stage,{recursive:true})
 const zip=path.join(updateDir,'release-'+randomUUID()+'.zip')
 try{
  onStatus('DOWNLOADING','Đang tải bản cập nhật từ GitHub.')
  const r=await fetch(asset.browser_download_url,{headers:{'User-Agent':'ShopMeCaCao-V8-Updater'},signal:AbortSignal.timeout(120000)})
  if(!r.ok||!r.body)throw Error('Không tải được gói Windows từ GitHub: HTTP '+r.status)
  const h=createHash('sha256');let count=0
  await pipeline(Readable.fromWeb(r.body),new Transform({transform(chunk,_,done){count+=chunk.length;if(count>maxZip)return done(Error('Gói cập nhật vượt giới hạn'));h.update(chunk);done(null,chunk)}}),fs.createWriteStream(zip,{flags:'wx'}))
  if('sha256:'+h.digest('hex')!==asset.digest.toLowerCase())throw Error('SHA-256 bản tải về không khớp GitHub')
  onStatus('VERIFYING','Đang kiểm tra bản STABLE trước khi chuyển phiên bản.')
  await expand(zip,stage)
  const manifest=JSON.parse(fs.readFileSync(realFile(stage,'manifest.json'),'utf8'))
  if(manifest.format!==8||manifest.channel!=='STABLE'||!/^[a-f0-9]{40}$/.test(manifest.sourceCommit))throw Error('Manifest bản phát hành không hợp lệ')
  if(manifest.sourceCommit===previous)return {current:true,sha:previous}
  realFile(stage,'releases/current/apps/api/dist/server.js')
  realFile(stage,'releases/current/apps/web/dist/index.html')
  realFile(stage,'releases/current/apps/api/package.json')
  realFile(stage,'releases/current/node_modules/express/package.json')
  return {current:false,sha:manifest.sourceCommit,stage,program:path.join(stage,'releases','current')}
 }catch(e){fs.rmSync(stage,{recursive:true,force:true});throw e}
 finally{try{fs.unlinkSync(zip)}catch{}}
}

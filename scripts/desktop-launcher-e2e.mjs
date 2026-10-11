import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import assert from 'node:assert/strict'
import {createHash} from 'node:crypto'
import {spawn} from 'node:child_process'
const base=fs.mkdtempSync(path.join(os.tmpdir(),'mc-desktop-')),project=path.join(base,'release'),url='http://127.0.0.1:3000'
fs.mkdirSync(project);fs.mkdirSync(path.join(project,'scripts'));fs.mkdirSync(path.join(project,'data'))
for(const file of ['package.json','package-lock.json','MO_SHOP.vbs'])fs.copyFileSync(file,path.join(project,file))
fs.cpSync('apps',path.join(project,'apps'),{recursive:true,filter:p=>!p.split(path.sep).includes('node_modules')})
for(const file of ['open-shop.mjs','start-stage2.mjs','copy-api-assets.mjs'])fs.copyFileSync('scripts/'+file,path.join(project,'scripts',file))
fs.symlinkSync(path.resolve('node_modules'),path.join(project,'node_modules'),'junction')
const lock=createHash('sha256').update(fs.readFileSync('package-lock.json')).digest('hex')
fs.writeFileSync(path.join(project,'data/desktop-build.json'),JSON.stringify({signature:'force-first-build',lock}))
const env={...process.env,SHOP_NO_BROWSER:'1'}
let app,logs=''
async function run(args){const p=spawn(process.execPath,['scripts/open-shop.mjs',...args],{cwd:project,env,stdio:['ignore','pipe','pipe']});let out='';p.stdout.on('data',b=>out+=b);p.stderr.on('data',b=>out+=b);const code=await new Promise(r=>p.once('exit',r));assert.equal(code,0,out);return out}
try{
 assert((await run(['--prepare-only'])).includes('BUILD_REQUIRED'))
 const stamp=fs.readFileSync(path.join(project,'data/desktop-build.json'),'utf8')
 assert((await run(['--prepare-only'])).includes('BUILD_CACHED'));assert.equal(fs.readFileSync(path.join(project,'data/desktop-build.json'),'utf8'),stamp)
 app=spawn(process.execPath,['scripts/open-shop.mjs','--no-browser'],{cwd:project,env,stdio:['ignore','pipe','pipe']});app.stdout.on('data',b=>logs+=b);app.stderr.on('data',b=>logs+=b)
 let h;for(let n=0;n<150;n++){try{h=await fetch(url+'/api/health').then(r=>r.json());if(h.ok)break}catch{}await new Promise(r=>setTimeout(r,200))}
 assert.equal(h?.installationId,createHash('sha256').update(project).digest('hex'),logs);assert(h.freshDevelopment)
 const db=path.join(project,'data/stage6-main-test/database/shop-stage6-main-test.db');assert(fs.existsSync(db))
 assert((await run(['--no-browser'])).includes('OPEN_EXISTING'));assert(app.exitCode===null)
 if(process.platform==='win32'){
  const vbs=spawn('cscript.exe',['//Nologo','MO_SHOP.vbs'],{cwd:project,env,stdio:'pipe'});let out='';vbs.stdout.on('data',b=>out+=b);vbs.stderr.on('data',b=>out+=b);assert.equal(await new Promise(r=>vbs.once('exit',r)),0,out)
 }
 console.log('PASS Desktop: first build, cached repeat, isolated real database, same-install reuse, Windows VBS entry')
}finally{
 if(app&&app.exitCode===null){if(process.platform==='win32'){const p=spawn('taskkill',['/PID',String(app.pid),'/T','/F'],{stdio:'ignore'});await new Promise(r=>p.once('exit',r))}else{app.kill();await new Promise(r=>app.once('exit',r))}}
 fs.rmSync(base,{recursive:true,force:true,maxRetries:10,retryDelay:100})
}

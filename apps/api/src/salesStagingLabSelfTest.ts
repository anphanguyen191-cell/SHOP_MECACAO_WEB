import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {spawnSync} from 'node:child_process'
import {fileURLToPath} from 'node:url'
import {salesStagingLab,STAGING_LAB} from './salesStagingLab.js'
const [mode,root,point,id]=process.argv.slice(2)
if(mode==='worker'){
 const service=salesStagingLab(root)
 if(point.startsWith('restored'))service.recover(id,'UNCOMMITTED',p=>{if(p===point)process.exit(76)})
 else{const plan=service.plan([0,1].map(n=>path.join(root,STAGING_LAB,'warehouse','Size 1',n+'.jpg')));fs.writeFileSync(path.join(root,'operation.txt'),plan.id);if(point==='plan')process.exit(76);service.stage(plan,p=>{if(p===point)process.exit(76)})}
 process.exit(0)
}
const base=fs.mkdtempSync(path.join(os.tmpdir(),'mecacao-staging-lab-'));let checks=0
const check=(ok:unknown)=>{assert.ok(ok);checks++}
function fixture(name:string){const root=path.join(base,name),dir=path.join(root,STAGING_LAB,'warehouse','Size 1');fs.mkdirSync(dir,{recursive:true});const files=[0,1].map(n=>path.join(dir,n+'.jpg'));files.forEach((file,n)=>fs.writeFileSync(file,'cloned-unit-'+n));return {root,files,service:salesStagingLab(root)}}
function worker(root:string,point:string,id=''){const r=spawnSync(process.execPath,['--import','tsx',fileURLToPath(import.meta.url),'worker',root,point,id],{encoding:'utf8'});assert.equal(r.status,76,r.stderr);checks++;return fs.readFileSync(path.join(root,'operation.txt'),'utf8')}
try{
 for(const point of ['plan','linked:0','staged:0','linked:1','staged:1']){
  const f=fixture(point.replace(':','-')),id=worker(f.root,point)
  check(f.service.recover(id,'UNCOMMITTED').status==='RESTORED');check(f.service.recover(id,'UNCOMMITTED').status==='RESTORED');check(f.files.every((p,n)=>fs.readFileSync(p,'utf8')==='cloned-unit-'+n))
 }
 for(const point of ['restored-link:0','restored:0','restored-link:1','restored:1']){
  const f=fixture(point.replace(':','-')),id=worker(f.root,'staged:1');worker(f.root,point,id);check(f.service.recover(id,'UNCOMMITTED').status==='RESTORED');check(f.files.every((p,n)=>fs.readFileSync(p,'utf8')==='cloned-unit-'+n))
 }
 const f=fixture('retained'),plan=f.service.plan(f.files);f.service.stage(plan);check(f.service.recover(plan.id,'COMMITTED').status==='COMMITTED_RETAINED');check(f.service.recover(plan.id,'COMMITTED').originalsRetained===2);check(f.files.every(p=>!fs.existsSync(p))&&plan.files.every(e=>fs.existsSync(e.staged)))
 assert.throws(()=>f.service.recover(plan.id,'AMBIGUOUS'));checks++
 fs.writeFileSync(plan.files[1].staged,'unknown-edit');assert.throws(()=>f.service.recover(plan.id,'UNCOMMITTED'));checks++;check(!fs.existsSync(f.files[0])&&fs.readFileSync(plan.files[1].staged,'utf8')==='unknown-edit')
 const collision=fixture('collision'),c=collision.service.plan(collision.files);collision.service.stage(c);fs.writeFileSync(c.files[1].canonical,'occupant');assert.throws(()=>collision.service.recover(c.id,'UNCOMMITTED'));checks++;check(!fs.existsSync(c.files[0].canonical)&&fs.readFileSync(c.files[1].canonical,'utf8')==='occupant')
 const denied=fixture('outside');assert.throws(()=>denied.service.plan([path.join(base,'external.jpg')]));checks++
 const same=fixture('same-content-collision'),s=same.service.plan(same.files);same.service.stage(s);fs.copyFileSync(s.files[0].staged,s.files[0].canonical);assert.throws(()=>same.service.recover(s.id,'UNCOMMITTED'));checks++;check(fs.existsSync(s.files[0].staged))
 console.log('V2_STAGING_LAB PASS: '+checks+' assertions; nine hard-exit staging/recovery points, no-overwrite rollback, retained committed clones, all-file preflight, ambiguity/hash/collision fail-closed')
}finally{fs.rmSync(base,{recursive:true,force:true})}

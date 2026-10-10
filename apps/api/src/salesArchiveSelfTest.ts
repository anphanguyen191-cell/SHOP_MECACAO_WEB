import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import {createHash} from 'node:crypto'
import {spawnSync} from 'node:child_process'
import {fileURLToPath} from 'node:url'
import {DatabaseSync} from 'node:sqlite'
import sharp from 'sharp'
import {bootstrapV100} from './schema.js'
import {bootstrapSalesDrafts} from './salesSchema.js'
import {salesDraftService} from './salesDrafts.js'
import {salesPreviewService} from './salesPreview.js'
import {salesArchiveService,ARCHIVE_FOLDER} from './salesArchive.js'
const key='archive-test-request-0001',keyHash=createHash('sha256').update(key).digest('hex'),self=fileURLToPath(import.meta.url)
const [mode,childRoot,childStage]=process.argv.slice(2)
if(mode==='worker'){
 const db=new DatabaseSync(path.join(childRoot,'shop.db')),d=(salesDraftService(db,childRoot).list()[0] as any),p=await salesPreviewService(db,childRoot).preview(d.id,d.version)
 await salesArchiveService(db,childRoot,stage=>{if(stage===childStage)process.exit(75)}).prepare(d.id,{version:d.version,images:p.items.map(i=>({imageId:i.imageId,sourceHash:i.sourceHash}))},key)
 db.close();process.exit(0)
}
const base=fs.mkdtempSync(path.join(os.tmpdir(),'mecacao-archive-tests-'));let checks=0
const check=(ok:unknown)=>{assert.ok(ok);checks++}
async function rejects(action:()=>Promise<unknown>,status:number){await assert.rejects(action,(e:any)=>e.status===status);checks++}
async function fixture(name:string){
 const root=path.join(base,name);fs.mkdirSync(root);const db=new DatabaseSync(path.join(root,'shop.db'));db.exec('PRAGMA foreign_keys=ON;PRAGMA synchronous=FULL');bootstrapV100(db);bootstrapSalesDrafts(db)
 db.exec("INSERT INTO products(product_code,name) VALUES('P1','Mẫu thử');INSERT INTO product_variants(product_id,sku,size) VALUES(1,'P1-S1','Size 1');INSERT INTO inventory_transactions(variant_id,transaction_type,quantity) VALUES(1,'OPENING',8)")
 const originals:Buffer[]=[],files:string[]=[]
 for(let n=1;n<=2;n++){const file=path.join(root,'warehouse','Mẫu thử','Size 1',n+'.png');fs.mkdirSync(path.dirname(file),{recursive:true});await sharp({create:{width:1400,height:1800,channels:3,background:n===1?'#f8b9cd':'#ace4d8'}}).png().toFile(file);db.prepare('INSERT INTO product_images(product_id,variant_id,file_path) VALUES(1,1,?)').run(file);files.push(file);originals.push(fs.readFileSync(file))}
 const drafts=salesDraftService(db,root),d=drafts.create({items:[{imageId:1,unitPrice:50000},{imageId:2,unitPrice:60000}],discount:0,note:''},'draft-archive-test-key'),p=await salesPreviewService(db,root).preview(d.id,1),input={version:1,images:p.items.map(i=>({imageId:i.imageId,sourceHash:i.sourceHash}))}
 const state=()=>JSON.stringify(['products','product_variants','product_images','inventory_transactions','sales_orders','sales_order_images'].map(t=>db.prepare('SELECT * FROM '+t).all())),before=state(),dir=path.join(root,ARCHIVE_FOLDER,keyHash)
 return {root,db,d,input,dir,files,originals,state,before}
}
try{
 const f=await fixture('normal'),s=salesArchiveService(f.db,f.root)
 const result=await s.prepare(f.d.id,f.input,key);check(result.status==='READY'&&result.originalsRetained&&!result.sold&&result.quantity===2)
 const originalMtime=fs.statSync(path.join(f.dir,'1.jpg')).mtimeMs
 check((await s.prepare(f.d.id,f.input,key)).archiveId===result.archiveId&&fs.statSync(path.join(f.dir,'1.jpg')).mtimeMs===originalMtime)
 check((await s.verify(f.d.id,result.archiveId)).quantity===2&&(await s.list(f.d.id)).length===1)
 check(f.state()===f.before&&f.files.every((file,i)=>fs.readFileSync(file).equals(f.originals[i])))
 await rejects(()=>s.prepare(f.d.id,{...f.input,version:2},key),409)
 await rejects(()=>s.verify('missing-order',result.archiveId),404)
 await rejects(()=>s.verify(f.d.id,'../outside'),400)
 const jpg=path.join(f.dir,'1.jpg');fs.writeFileSync(jpg,'tampered');await rejects(()=>s.verify(f.d.id,result.archiveId),409)
 check((await s.list(f.d.id))[0].status==='REVIEW_REQUIRED'&&fs.readFileSync(jpg).toString()==='tampered');f.db.close()
 for(const stage of ['directory','plan','image:0','image:1','before-ready','ready']){
  const c=await fixture('crash-'+stage.replace(':','-'));c.db.close()
  const processResult=spawnSync(process.execPath,['--import','tsx',self,'worker',c.root,stage],{encoding:'utf8'});assert.equal(processResult.status,75,processResult.stderr);checks++
  const db=new DatabaseSync(path.join(c.root,'shop.db')),service=salesArchiveService(db,c.root)
  if(stage==='directory'){await rejects(()=>service.prepare(c.d.id,c.input,key),409);check(fs.readdirSync(c.dir).length===0)}
  else{check((await service.list(c.d.id))[0].status===(stage==='ready'?'READY':'INCOMPLETE'));check((await service.recover(c.d.id,keyHash)).status==='READY');check((await service.prepare(c.d.id,c.input,key)).archiveId===keyHash)}
  check(c.files.every((file,i)=>fs.readFileSync(file).equals(c.originals[i])))
  check((db.prepare('SELECT COUNT(*) n FROM inventory_transactions').get() as any).n===1&&(db.prepare('SELECT version FROM sales_orders').get() as any).version===1);db.close()
 }
 // Ambiguous/tampered partial files remain preserved; no guessed rollback/deletion.
 const c=await fixture('partial-changed'),failing=salesArchiveService(c.db,c.root,stage=>{if(stage==='image:0')throw Error('injected write interruption')})
 await assert.rejects(()=>failing.prepare(c.d.id,c.input,key),/injected/);checks++
 const current=salesArchiveService(c.db,c.root),partial=path.join(c.dir,'1.jpg');fs.writeFileSync(partial,'unknown-bytes')
 await rejects(()=>current.recover(c.d.id,keyHash),409);check(fs.readFileSync(partial).toString()==='unknown-bytes'&&!fs.existsSync(path.join(c.dir,'2.jpg')))
 fs.writeFileSync(path.join(c.dir,'plan.json'),'{bad-json');await assert.rejects(()=>current.recover(c.d.id,keyHash));checks++;check(fs.readFileSync(partial).toString()==='unknown-bytes');c.db.close()
 const source=await fixture('changed-source'),broken=salesArchiveService(source.db,source.root,stage=>{if(stage==='plan')throw Error('stop-after-plan')});await assert.rejects(()=>broken.prepare(source.d.id,source.input,key));checks++
 fs.writeFileSync(source.files[0],'source-edited');await rejects(()=>salesArchiveService(source.db,source.root).recover(source.d.id,keyHash),409);check(!fs.existsSync(path.join(source.dir,'1.jpg'))&&fs.readFileSync(source.files[0]).toString()==='source-edited');source.db.close()
 console.log('V2_ARCHIVE_SELF_TEST PASS: '+checks+' assertions; durable journal, six hard-exit stages, retry/recovery, checksum/decode, tamper fail-closed, unchanged originals/stock/ledger')
}finally{fs.rmSync(base,{recursive:true,force:true})}

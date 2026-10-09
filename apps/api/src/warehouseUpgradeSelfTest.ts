import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {spawnSync} from 'node:child_process'
import {createHash} from 'node:crypto'
import sharp from 'sharp'
import {db,dbPath} from './db.js'
import {checkWarehouse,warehouseSnapshot,saveWatchSettings,getWatchSettings,getWarehouseNotices,markWarehouseNotice} from './warehouseWatch.js'
import {previewImageRename,commitImageRename,recoverImageRenames,getRenameLogs} from './imageRename.js'
import {commitStoreImport} from './storeImport.js'
import {scanStore} from './storeScanner.js'
import {receiveGoods} from './goodsReceipt.js'
import {getProduct} from './products.js'
import {inventoryDashboard} from './inventoryQuery.js'

if(path.basename(dbPath)!=='self-test.db')throw Error('Upgrade tests require isolated self-test.db')
// Enforce Windows FlushFileBuffers access rules on every platform, including
// crash workers. The old read-only COPY flush must fail this integration test.
const actualOpen=fs.openSync,actualClose=fs.closeSync,actualSync=fs.fsyncSync
const descriptors=new Map<number,string|number>();let writableImageFlushes=0
;(fs as any).openSync=(file:any,flags:any,...args:any[])=>{const fd=(actualOpen as any)(file,flags,...args);descriptors.set(fd,flags);return fd}
;(fs as any).closeSync=(fd:number)=>{try{return actualClose(fd)}finally{descriptors.delete(fd)}}
;(fs as any).fsyncSync=(fd:number)=>{
 const flags=descriptors.get(fd)
 if(flags==='r')throw Object.assign(Error('Windows-like EPERM: fsync requires a writable handle'),{code:'EPERM'})
 if(flags==='r+')writableImageFlushes++
 return actualSync(fd)
}
if(process.argv[2]==='crash'){
 const plan=JSON.parse(process.env.SHOP_RENAME_TEST_PLAN!)
 commitImageRename(plan.rootPath,plan.ids,plan.token,true,phase=>{if(phase===plan.phase)process.exit(79)})
 throw Error('Expected crash hook')
}
const home=fs.mkdtempSync(path.join(os.tmpdir(),'mecacao-upgrade-')),root=path.join(home,'warehouse'),source=path.join(home,'source')
fs.mkdirSync(root);fs.mkdirSync(source)
const digest=(f:string)=>createHash('sha256').update(fs.readFileSync(f)).digest('hex')
async function fixture(name:string,size:string,color:string){const dir=path.join(root,name,size);fs.mkdirSync(dir,{recursive:true});const file=path.join(dir,'Photo.JPG');await sharp({create:{width:12,height:12,channels:3,background:color}}).jpeg().toFile(file);return file}
const first=await fixture('Lửng gái','Size 10','#f093ac'),second=await fixture('Bộ trai','XL / nope'.replace('/','-'),'#8dddee')
const originalHash=digest(first)
const c={rootPath:root,startup:true,periodic:true,intervalSeconds:60,popup:true,autoRename:false}
assert.equal(saveWatchSettings(c).rootPath,fs.realpathSync(root));assert.equal(getWatchSettings().periodic,true)
assert.throws(()=>saveWatchSettings({...c,intervalSeconds:59}),/60/)
const snapshot=checkWarehouse(root)
assert.equal(snapshot.summary.images,2);assert.equal(snapshot.summary.pendingImages,2);assert.equal(snapshot.summary.newProducts,2)
assert.equal(inventoryDashboard().stock,0,'scan must not create inventory')
checkWarehouse(root);assert.equal(getWarehouseNotices().length,1,'unchanged scan must not duplicate notifications')
const notice=getWarehouseNotices()[0];markWarehouseNotice(notice.id,'seen');checkWarehouse(root);assert.equal(getWarehouseNotices()[0].state,'seen')
for(const p of snapshot.products)commitStoreImport({rootPath:root,name:p.name,productCode:p.suggestedProductCode,variants:p.sizes.map(s=>({size:s.size,sku:s.suggestedSku,images:s.images,openingStock:s.images.length}))})
assert.equal(checkWarehouse(root).summary.registeredImages,2);assert.equal(getWarehouseNotices()[0].state,'resolved');assert.equal(inventoryDashboard().stock,2)
assert.throws(()=>scanStore(path.dirname(first)),/kho gốc/)
// A cover file beside canonical Product/Size folders must not reject a valid root.
fs.copyFileSync(first,path.join(root,'cover.jpg'));fs.copyFileSync(first,path.join(root,'Lửng gái','cover.jpg'));assert.equal(warehouseSnapshot(root).summary.images,2)
assert.throws(()=>warehouseSnapshot(path.join(home,'missing')),/ENOENT/)
const realRead=fs.readdirSync;(fs as any).readdirSync=(p:any,...args:any[])=>{if(p===root)throw Object.assign(Error('denied'),{code:'EACCES'});return (realRead as any)(p,...args)}
assert.throws(()=>scanStore(root),/EACCES.*kho trống/);(fs as any).readdirSync=realRead
let plan=previewImageRename(root);assert.equal(plan.files.length,2);assert.ok(plan.files[0].newPath.includes('ShopMeCaCao_Tole_'));const ids=plan.files.map(f=>f.id)
assert.throws(()=>commitImageRename(root,ids,plan.token,false),/xác nhận/)
fs.writeFileSync(plan.files[0].newPath,'collision');assert.throws(()=>commitImageRename(root,ids,plan.token,true),/thay đổi/);fs.unlinkSync(plan.files[0].newPath)
plan=previewImageRename(root,ids)
function crash(phase:string){const p=previewImageRename(root,ids);const r=spawnSync(process.execPath,['--import','tsx','src/warehouseUpgradeSelfTest.ts','crash'],{cwd:process.cwd(),env:{...process.env,SHOP_RENAME_TEST_PLAN:JSON.stringify({rootPath:root,ids,token:p.token,phase})},encoding:'utf8'});assert.equal(r.status,79,r.stderr);return p}
const interrupted=crash('COPIED');assert.equal(recoverImageRenames().recovered,1);assert.ok(fs.existsSync(first));assert.equal(digest(first),originalHash);assert.ok(!fs.existsSync(interrupted.files[0].newPath));assert.equal(inventoryDashboard().stock,2)
const altered=crash('COPIED');fs.writeFileSync(altered.files[0].newPath,'changed duplicate');assert.throws(()=>recoverImageRenames(),/không xóa/);assert.ok(fs.existsSync(altered.files[0].oldPath));fs.copyFileSync(altered.files[0].oldPath,altered.files[0].newPath);recoverImageRenames()
const committed=crash('COMMITTED');assert.equal(recoverImageRenames().recovered,1);assert.ok(!fs.existsSync(first));assert.equal(digest(committed.files.find(f=>f.oldPath===first)!.newPath),originalHash);assert.equal(inventoryDashboard().stock,2);assert.equal(previewImageRename(root).summary.correct,2)
assert.ok(getRenameLogs().some(l=>l.outcome==='ROLLED_BACK'));assert.ok(getRenameLogs().some(l=>l.outcome==='COMMITTED'))
const product=getProduct((db.prepare('SELECT product_id FROM product_images WHERE id=?').get(ids[0]) as any).product_id)!
const newSource=path.join(source,'SOURCE.png');await sharp({create:{width:13,height:13,channels:3,background:'#22ab88'}}).png().toFile(newSource);const sourceHash=digest(newSource)
saveWatchSettings({...c,autoRename:true});const size=(product.variants as any[])[0].size
const receipt=receiveGoods({storeRoot:root,productId:(product.product as any).id,sizes:[{size,quantity:1,costPrice:100,salePrice:200,images:[newSource]}]})
assert.equal(receipt.copiedImages,1);assert.equal(digest(newSource),sourceHash);assert.ok((db.prepare('SELECT file_path FROM product_images WHERE id NOT IN (?,?)').all(ids[0],ids[1]) as any[]).some(r=>r.file_path.endsWith('.png')&&path.basename(r.file_path).startsWith('ShopMeCaCao_Tole_')))
assert.ok(writableImageFlushes>0,'receipt COPY must flush through a writable, non-truncating handle')
assert.equal(inventoryDashboard().stock,3)
// Missing registered file creates a warning without changing ledger history.
const last=(db.prepare('SELECT file_path FROM product_images ORDER BY id DESC LIMIT 1').get() as any).file_path;fs.renameSync(last,last+'.held');assert.equal(checkWarehouse(root).summary.missingImages,1);fs.renameSync(last+'.held',last)
;(fs as any).openSync=actualOpen;(fs as any).closeSync=actualClose;(fs as any).fsyncSync=actualSync
db.close();fs.rmSync(home,{recursive:true,force:true})
console.log('WAREHOUSE_UPGRADE_SELF_TEST PASS: scan statistics, remembered config, duplicate/seen/resolved notices, denied reads, cover files, rename stale/collision guards, real hard-exit pre/post commit recovery, stable IDs/stock/checksums and COPY auto naming')

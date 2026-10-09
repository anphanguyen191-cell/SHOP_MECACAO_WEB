import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {createHash} from 'node:crypto'
import {execFileSync} from 'node:child_process'
import sharp from 'sharp'
import {db,dbPath} from './db.js'
import {commitStoreImport} from './storeImport.js'
import {inventoryDashboard} from './inventoryQuery.js'
import {selectedStockImages,sharedJpeg,buildClipboardBridge,clipboardCapabilities,copyStockImages} from './inventoryShare.js'
if(path.basename(dbPath)!=='self-test.db')throw Error('Share tests require isolated database')
const root=fs.mkdtempSync(path.join(os.tmpdir(),'mecacao-share-'))
try{
 const size=path.join(root,'Bộ gái','Size 1');fs.mkdirSync(size,{recursive:true})
 const files=[path.join(size,'001.png'),path.join(size,'002.png')]
 for(let n=0;n<files.length;n++)await sharp({create:{width:22,height:30,channels:3,background:n?'#92cfb9':'#f3adca'}}).png().toFile(files[n])
 const product=commitStoreImport({rootPath:root,name:'Bộ gái',productCode:'SHARE01',variants:[{size:'Size 1',sku:'SHARE01-S1',images:files,openingStock:2}]})
 const ids=(db.prepare('SELECT id FROM product_images ORDER BY id').all() as {id:number}[]).map(i=>i.id)
 const state=()=>JSON.stringify({images:db.prepare('SELECT * FROM product_images').all(),ledger:db.prepare('SELECT * FROM inventory_transactions').all(),dashboard:inventoryDashboard()})
 const before=state(),hashes=files.map(f=>createHash('sha256').update(fs.readFileSync(f)).digest('hex'))
 assert.deepEqual(selectedStockImages([...ids].reverse()).map(i=>i.id),[...ids].reverse(),'selection order must survive')
 for(const invalid of [[],[ids[0],ids[0]],[0],['1'],[99999],Array(101).fill(ids[0])])assert.throws(()=>selectedStockImages(invalid))
 assert.throws(()=>selectedStockImages(ids,()=>false),/vùng/)
 const jpeg=await sharedJpeg(ids[0],()=>true);assert.equal((await sharp(jpeg).metadata()).format,'jpeg')
 fs.renameSync(files[1],files[1]+'.held');assert.throws(()=>selectedStockImages(ids),/không còn/);fs.renameSync(files[1]+'.held',files[1])
 db.prepare("UPDATE product_variants SET status='inactive'").run();assert.throws(()=>selectedStockImages(ids),/không còn/);db.prepare("UPDATE product_variants SET status='active'").run()
 assert.equal(state(),before,'share/read must not change metadata, ledger or physical inventory')
 assert.deepEqual(files.map(f=>createHash('sha256').update(fs.readFileSync(f)).digest('hex')),hashes,'original bytes unchanged')
 if(process.platform==='win32'){
  assert.equal(clipboardCapabilities().nativeFiles,true);const exe=await buildClipboardBridge();const out=execFileSync(exe,['--self-test'],{encoding:'utf8',windowsHide:true});assert.match(out,/NATIVE_CLIPBOARD_FORMAT PASS/);console.log(out.trim())
  const copied=await copyStockImages([...ids].reverse(),()=>true);assert.equal(copied.copied,2)
  const verified=JSON.parse(execFileSync(exe,['--verify'],{encoding:'utf8',windowsHide:true,input:selectedStockImages([...ids].reverse()).map(i=>i.file_path).join('\n')+'\n'}));assert.equal(verified.copied,2)
  assert.equal(state(),before);assert.deepEqual(files.map(f=>createHash('sha256').update(fs.readFileSync(f)).digest('hex')),hashes)
  console.log('WINDOWS_CLIPBOARD_ROUNDTRIP PASS: native write, helper exit, new-process read, exact file count/order; Zalo/Messenger paste UNVERIFIED')
 }
 console.log('INVENTORY_SHARE_SELF_TEST PASS: active existing stock only, batch all-or-nothing, order, denied paths, JPEG derivative, unchanged files/stock/ledger; Windows bridge compilation/format tested on Windows only')
}finally{db.close();fs.rmSync(root,{recursive:true,force:true})}

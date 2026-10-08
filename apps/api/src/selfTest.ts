import { receiveGoods, inspectImageFolder } from './goodsReceipt.js'
import { createReceiptJournal, recoverPendingGoodsReceipts, finishReceiptJournal } from './receiptRecovery.js'
import {createHash} from 'node:crypto'
import { db } from './db.js'
import { createProduct, suggestProductCode, suggestSku, listProducts } from './products.js'
import { addInventory, batchImport, history } from './inventory.js'
import { isPathInsideRoot, scanStore } from './storeScanner.js'
import { createBackup, createOptimizedImageBackup, createLosslessBackup, verifyLosslessBackup } from './backup.js'
import sharp from 'sharp'
import fs from 'node:fs'
import os from 'node:os'
import {spawnSync} from 'node:child_process'
import path from 'node:path'
import { commitStoreImport } from './storeImport.js'
import { getLowStockThreshold, updateLowStockThreshold } from './settings.js'
import { inventoryRows, inventoryHistory, inventoryFilterOptions, inventoryExplorer, inventoryDashboard, inventorySuggestions } from './inventoryQuery.js'
import { setProductStatus } from './products.js'
import { getImageRecord, imageMime } from './images.js'
import { DatabaseSync } from 'node:sqlite'
import { dbPath } from './db.js'

function assert(ok: unknown, message: string): asserts ok { if (!ok) throw new Error('SELF_TEST FAIL: '+message) }
const suffix=Date.now().toString(36).toUpperCase()
const product=createProduct({name:'SELF TEST '+suffix,productCode:'T'+suffix,costPrice:10000,salePrice:20000,variants:[{size:'Size Test',sku:'SKU-'+suffix,openingStock:5}]})
assert(product,'create product')
const variant=(product.variants as Array<{id:number;stock:number;ledger_stock:number}>)[0]
const suggestedBase=suggestSku('COLLIDE'+suffix,'Size X')
const collision=createProduct({name:'COLLISION '+suffix,productCode:'C'+suffix,variants:[{size:'Size X',sku:suggestedBase}]})
assert(collision,'collision fixture must be created')
const suggestedAfterCollision=suggestSku('COLLIDE'+suffix,'Size X')
assert(suggestedAfterCollision!==suggestedBase,'SKU suggestion must avoid an existing normalized-base collision')
const collisionVariant=(collision.variants as Array<{id:number}>)[0]
let badOpening=false
try{createProduct({name:'BAD OPEN '+suffix,productCode:'O'+suffix,variants:[{size:'X',sku:'OSKU-'+suffix,openingStock:1.5}]})}catch{badOpening=true}
assert(badOpening,'fractional opening stock must be rejected')
assert(!(db.prepare('SELECT 1 FROM products WHERE product_code=?').get('O'+suffix)),'bad opening product must rollback')
let badPrice=false
try{createProduct({name:'BAD PRICE '+suffix,productCode:'P'+suffix,costPrice:-1,variants:[{size:'X',sku:'PSKU-'+suffix}]})}catch{badPrice=true}
assert(badPrice,'negative price must be rejected')
assert(variant.stock===0&&variant.ledger_stock===5,'opening ledger must be 5 while physical stock is zero without images')
addInventory(variant.id,'IMPORT',3,11000,'self test import')
addInventory(variant.id,'ADJUST_PLUS',2,undefined,'self test plus')
addInventory(variant.id,'ADJUST_MINUS',4,undefined,'self test minus')
const stock=db.prepare('SELECT COALESCE(stock,0) AS stock FROM inventory_stock WHERE variant_id=?').get(variant.id) as {stock:number}
assert(stock.stock===6,'ledger stock must be 6')
let blocked=false
try{addInventory(variant.id,'ADJUST_MINUS',7)}catch{blocked=true}
assert(blocked,'negative stock guard')
let fractionBlocked=false
try{addInventory(variant.id,'IMPORT',1.5)}catch{fractionBlocked=true}
assert(fractionBlocked,'fractional quantity guard')
assert(history(variant.id).length===4,'history must contain 4 transactions')
batchImport([{variantId:variant.id,quantity:2,unitCost:11500,note:'batch test'}])
const afterBatch=(db.prepare('SELECT stock FROM inventory_stock WHERE variant_id=?').get(variant.id) as {stock:number}).stock
assert(afterBatch===8,'batch import must increase stock atomically')
const beforeFailedBatch=history(variant.id).length
let batchRollback=false
try{batchImport([{variantId:variant.id,quantity:1},{variantId:999999999,quantity:1}])}catch{batchRollback=true}
assert(batchRollback,'invalid batch must fail')
assert(history(variant.id).length===beforeFailedBatch,'failed batch must rollback all rows')
const originalThreshold=getLowStockThreshold()
updateLowStockThreshold(8)
assert(getLowStockThreshold()===8,'low stock setting must persist in DB')
assert(!(inventoryRows({state:'low',threshold:getLowStockThreshold()}) as Array<{variant_id:number}>).some(r=>r.variant_id===variant.id),'ledger-only SKU must not appear as physically low stock')
assert((inventoryRows({state:'out',threshold:getLowStockThreshold()}) as Array<{variant_id:number}>).some(r=>r.variant_id===variant.id),'ledger-only SKU must be physically out of stock')
assert((inventoryHistory(50) as Array<{variant_id:number}>).some(r=>r.variant_id===variant.id),'global history must include ledger transaction')
assert((inventoryRows({size:'Size Test',status:'active'}) as Array<{variant_id:number}>).some(r=>r.variant_id===variant.id),'size/status filter must find active SKU')
assert(inventoryFilterOptions().sizes.includes('Size Test'),'filter options must include SKU size')
let invalidFilter=false
try{inventoryRows({state:'broken' as 'all'})}catch{invalidFilter=true}
assert(invalidFilter,'invalid inventory state must be rejected')
let invalidStatus=false
try{inventoryRows({status:'broken' as 'all'})}catch{invalidStatus=true}
assert(invalidStatus,'invalid product status filter must be rejected')
setProductStatus((product.product as {id:number}).id,'inactive')
assert((inventoryRows({status:'inactive'}) as Array<{variant_id:number}>).some(r=>r.variant_id===variant.id),'inactive filter must expose inactive SKU')
let inactiveBlocked=false
try{addInventory(variant.id,'IMPORT',1)}catch{inactiveBlocked=true}
assert(inactiveBlocked,'inactive product must block inventory writes')
setProductStatus((product.product as {id:number}).id,'active')
addInventory(variant.id,'IMPORT',1,undefined,'reactivated write')
assert((db.prepare('SELECT stock FROM inventory_stock WHERE variant_id=?').get(variant.id) as {stock:number}).stock===9,'reactivated product must accept inventory write')
updateLowStockThreshold(originalThreshold)
const root=process.cwd()
assert(isPathInsideRoot(root,root+'/child/file.jpg'),'child path must be accepted')
assert(!isPathInsideRoot(root,root),'root itself is not an image child')
assert(!isPathInsideRoot(root,root+'/../outside.jpg'),'parent traversal must be rejected')
const importRoot=fs.mkdtempSync(path.join(os.tmpdir(),'shop-import-'))
const productFolder=path.join(importRoot,'IMPORT '+suffix)
const sizeDir=path.join(productFolder,'Size 8')
fs.mkdirSync(sizeDir,{recursive:true})
const goodImage=path.join(sizeDir,'001.jpg'); await sharp({create:{width:2400,height:1600,channels:3,background:{r:180,g:120,b:90}}}).jpeg({quality:96}).toFile(goodImage)
const imported=commitStoreImport({rootPath:importRoot,name:'IMPORT '+suffix,productCode:'I'+suffix,costPrice:12000,salePrice:22000,variants:[{size:'Size 8',sku:'ISKU-'+suffix,openingStock:3,images:[goodImage]}]})
assert(imported,'store import must commit')
let duplicateImportCodeBlocked=false
try{commitStoreImport({rootPath:importRoot,name:'DUP CODE '+suffix,productCode:'I'+suffix,variants:[{size:'Other',sku:'OTHER-'+suffix,images:[]}]})}catch(e){duplicateImportCodeBlocked=e instanceof Error&&e.message.includes('đã thuộc sản phẩm khác')}
assert(duplicateImportCodeBlocked,'duplicate warehouse product code must be rejected clearly')
let duplicateImportSkuBlocked=false
try{commitStoreImport({rootPath:importRoot,name:'DUP SKU '+suffix,productCode:'UNIQ'+suffix,variants:[{size:'Other',sku:'ISKU-'+suffix,images:[]}]})}catch(e){duplicateImportSkuBlocked=e instanceof Error&&e.message.includes('SKU')&&e.message.includes('đã tồn tại')}
assert(duplicateImportSkuBlocked,'duplicate warehouse SKU must be rejected clearly')
const importedId=(imported!.product as {id:number}).id
const importedVariant=(imported!.variants as Array<{id:number;stock:number}>)[0]
assert(importedVariant.stock===1,'store import physical stock must match one registered image')
const filteredCatalog=listProducts('IMPORT '+suffix,{size:'Size 8',stockState:'in',sort:'stock_desc'}) as Array<{id:number;filtered_stock:number;total_stock:number;sizes:string[]}>
assert(filteredCatalog.some(p=>p.id===importedId&&p.filtered_stock===1&&p.total_stock===1&&p.sizes.includes('Size 8')),'catalog size search + in-stock filter must use physical registered images')
assert(!(listProducts('IMPORT '+suffix,{size:'Size 8',stockState:'out'}) as Array<{id:number}>).some(p=>p.id===importedId),'catalog out-of-stock filter must exclude physical in-stock product')
assert((inventorySuggestions('Size 8') as Array<{product_id:number;stock:number}>).some(x=>x.product_id===importedId&&x.stock===1),'search suggestion must report actual physical stock, not ledger count')
db.prepare("UPDATE product_variants SET status='inactive' WHERE id=?").run(importedVariant.id)
assert((listProducts('IMPORT '+suffix) as Array<{id:number;total_stock:number}>).some(p=>p.id===importedId&&p.total_stock===1),'inactive SKU with physical image must not silently disappear from catalog inventory')
assert((inventoryExplorer({search:'IMPORT '+suffix,status:'active'}) as any[]).some(p=>p.product_id===importedId&&p.stock===1),'physical explorer and catalog must agree for inactive size')
db.prepare("UPDATE product_variants SET status='active' WHERE id=?").run(importedVariant.id)
assert((inventoryRows({state:'low',threshold:1}) as Array<{variant_id:number}>).some(r=>r.variant_id===importedVariant.id),'physical low-stock filter must include one-image SKU even when ledger says three')
assert(!(inventoryRows({state:'ok',threshold:1}) as Array<{variant_id:number}>).some(r=>r.variant_id===importedVariant.id),'physical ok-stock filter must exclude one-image SKU regardless of ledger')
assert((db.prepare('SELECT stock FROM inventory_stock WHERE variant_id=?').get(importedVariant.id) as {stock:number}).stock===3,'store import ledger opening stock must persist separately')
const laterDir=path.join(productFolder,'Size 10');fs.mkdirSync(laterDir,{recursive:true})
const laterImage=path.join(laterDir,'002.jpg');await sharp({create:{width:800,height:800,channels:3,background:{r:90,g:120,b:180}}}).jpeg().toFile(laterImage)
const scanAgain=scanStore(importRoot).find(x=>x.name==='IMPORT '+suffix)
assert(scanAgain?.status==='PARTIAL','scan must identify partial product')
assert(scanAgain?.sizes.some(x=>x.size==='Size 8'&&x.status==='EXISTING'),'existing size recognized')
assert(scanAgain?.sizes.some(x=>x.size==='Size 10'&&x.status==='NEW'),'new size recognized')
assert(scanAgain?.sizes.find(x=>x.size==='Size 10')?.images.length===1,'scanner image count must support opening-stock inference')
const physicalTree=inventoryExplorer({search:'IMPORT '+suffix,status:'active'}) as any[]
const physicalProduct=physicalTree.find(x=>x.product_id===importedId)
assert(physicalProduct&&physicalProduct.variants.some((x:any)=>x.size==='Size 8'&&x.stock===1),'physical explorer stock must equal existing registered images, not ledger opening quantity')
const physicalDash=inventoryDashboard()
assert(physicalDash.mismatches>=1,'physical dashboard must flag ledger/image mismatch')
assert((inventorySuggestions('Size 8') as any[]).some(x=>x.product_id===importedId),'inventory autocomplete must suggest existing size/product')
const merged=commitStoreImport({rootPath:importRoot,name:'IMPORT '+suffix,productCode:'I'+suffix,variants:[{size:'Size 8',sku:'ISKU-'+suffix,costPrice:13000,salePrice:23000,images:[goodImage]},{size:'Size 10',sku:'ISKU10-'+suffix,costPrice:14000,salePrice:24000,openingStock:2,images:[laterImage]}]})
assert((merged!.variants as Array<{size:string;cost_price:number}>).some(v=>v.size==='Size 8'&&v.cost_price===13000),'existing size price editable')
assert((merged!.variants as Array<{size:string;stock:number}>).some(v=>v.size==='Size 10'&&v.stock===1),'new size physical stock must equal one image')
assert((listProducts('ISKU10-'+suffix) as Array<{id:number;variant_count:number;total_stock:number}>).some(p=>p.id===importedId&&p.variant_count===2&&p.total_stock===2),'SKU search must preserve full product Size count and physical total')
assert((db.prepare('SELECT stock FROM inventory_stock WHERE variant_id=?').get((merged!.variants as Array<{size:string;id:number}>).find(v=>v.size==='Size 10')!.id) as {stock:number}).stock===2,'new size ledger opening stock persists')
const foundNewImage=path.join(sizeDir,'003.jpg')
await sharp({create:{width:480,height:480,channels:3,background:{r:41,g:139,b:229}}}).jpeg().toFile(foundNewImage)
const checkExistingReimport=()=>commitStoreImport({rootPath:importRoot,name:'IMPORT '+suffix,productCode:'I'+suffix,variants:[{size:'Size 8',images:[goodImage,foundNewImage],costPrice:13000,salePrice:23000}]})!
const discovered=checkExistingReimport()
assert((discovered.variants as Array<{size:string;stock:number}>).find(v=>v.size==='Size 8')?.stock===2,'existing size scanner must register newly found physical image')
const countBeforeAgain=(db.prepare('SELECT COUNT(*) AS n FROM product_images WHERE product_id=?').get(importedId) as {n:number}).n
checkExistingReimport()
assert((db.prepare('SELECT COUNT(*) AS n FROM product_images WHERE product_id=?').get(importedId) as {n:number}).n===countBeforeAgain,'rescan must not duplicate already registered images')
assert((db.prepare('SELECT stock FROM inventory_stock WHERE variant_id=?').get(importedVariant.id) as {stock:number}).stock===3,'new physical images must not silently rewrite historical ledger')
const importedImage=(db.prepare('SELECT id FROM product_images WHERE product_id=? ORDER BY id LIMIT 1').get(importedId) as {id:number})
const imageRecord=getImageRecord(importedImage.id)
assert(imageRecord&&!imageRecord.missing,'registered image must resolve by database id')
assert(imageMime(imageRecord.file_path)==='image/jpeg','jpg MIME must be correct')
fs.unlinkSync(goodImage)
const missingImage=getImageRecord(importedImage.id)
assert(missingImage?.missing===true,'missing image file must not corrupt product metadata')
await sharp({create:{width:2400,height:1600,channels:3,background:{r:180,g:120,b:90}}}).jpeg({quality:96}).toFile(goodImage)
let rollbackBlocked=false
try{commitStoreImport({rootPath:importRoot,name:'BAD '+suffix,productCode:'B'+suffix,variants:[{size:'Size X',sku:'BSKU-'+suffix,openingStock:1,images:[path.join(importRoot,'missing.jpg')]}]})}catch{rollbackBlocked=true}
assert(rollbackBlocked,'bad image import must fail')
const badCount=(db.prepare('SELECT COUNT(*) AS n FROM products WHERE product_code=?').get('B'+suffix) as {n:number}).n
assert(badCount===0,'failed import must rollback product')
const secondConnection=new DatabaseSync(dbPath)
const persistedStock=(secondConnection.prepare('SELECT stock FROM inventory_stock WHERE variant_id=?').get(variant.id) as {stock:number}).stock
const persistedThreshold=Number((secondConnection.prepare("SELECT value FROM app_settings WHERE key='low_stock_threshold'").get() as {value:string}).value)
const integrity=(secondConnection.prepare('PRAGMA integrity_check').get() as {integrity_check:string}).integrity_check
const foreignKeys=secondConnection.prepare('PRAGMA foreign_key_check').all()
assert(persistedStock===9,'second connection must see persisted ledger stock')
assert(persistedThreshold===originalThreshold,'restored setting must persist across connection reopen')
assert(integrity==='ok','SQLite integrity_check must be ok')
assert(foreignKeys.length===0,'foreign_key_check must have no violations')
secondConnection.close()
const backup=createBackup()
assert(fs.existsSync(backup.path),'backup file must exist')
assert(fs.statSync(backup.path).size>0,'backup file must not be empty')
assert(fs.existsSync(path.join(backup.directory,backup.manifest)),'backup image manifest must exist')
const backupManifest=JSON.parse(fs.readFileSync(path.join(backup.directory,backup.manifest),'utf8')) as {images:Array<{product_id:number;exists:boolean}>}
assert(backupManifest.images.some(x=>x.product_id===importedId&&x.exists),'backup manifest must include existing imported image')
const optimizedBackup=await createOptimizedImageBackup()
assert(optimizedBackup.optimizedImageCount>=1,'manual optimized backup must process existing image')
assert(optimizedBackup.totalBackupBytes<optimizedBackup.totalOriginalBytes,'optimized backup should reduce test image bytes')
const optimizedManifest=JSON.parse(fs.readFileSync(path.join(optimizedBackup.directory,optimizedBackup.manifest),'utf8')) as {images:Array<{product_id:number;backup_path?:string;width?:number;height?:number}>}
const optimizedImage=optimizedManifest.images.find(x=>x.product_id===importedId&&x.backup_path)
assert(optimizedImage&&fs.existsSync(path.join(optimizedBackup.directory,optimizedImage.backup_path!)),'optimized image backup file must exist')
assert(Math.max(optimizedImage.width??0,optimizedImage.height??0)<=1920,'optimized image must respect max dimension')
const completeBackup=createLosslessBackup()
assert(completeBackup.verified.ok&&completeBackup.verified.dbVerified&&completeBackup.verified.imagesVerified>=2,'byte-exact recovery bundle must verify database and every registered image')
const bundleManifest=JSON.parse(fs.readFileSync(path.join(completeBackup.directory,'lossless-manifest.json'),'utf8')) as {files:Array<{source_path:string;backup_path:string;sha256:string}>}
const backedImage=bundleManifest.files.find(x=>x.source_path===goodImage)!
assert(backedImage,'byte-exact backup must include canonical source path')
const verifiedCopy=path.join(completeBackup.directory,backedImage.backup_path)
fs.writeFileSync(verifiedCopy,'corrupted-backup-bytes')
let damageDetected=false
try{verifyLosslessBackup(completeBackup.directory)}catch(e){damageDetected=e instanceof Error&&e.message.includes('checksum')}
assert(damageDetected,'checksum verifier must reject corrupted backup without touching original')
fs.copyFileSync(goodImage,verifiedCopy)
assert(verifyLosslessBackup(completeBackup.directory).ok,'restoring damaged backup copy from original should make recovery bundle verify')

db.prepare('DELETE FROM product_images WHERE product_id=?').run(importedId)
const importedVariantIds=(db.prepare('SELECT id FROM product_variants WHERE product_id=?').all(importedId) as Array<{id:number}>).map(x=>x.id)
for(const id of importedVariantIds)db.prepare('DELETE FROM inventory_transactions WHERE variant_id=?').run(id)
db.prepare('DELETE FROM product_variants WHERE product_id=?').run(importedId)
db.prepare('DELETE FROM products WHERE id=?').run(importedId)
const receiptSource=fs.mkdtempSync(path.join(os.tmpdir(),'shop-receipt-src-'));const receiptStore=fs.mkdtempSync(path.join(os.tmpdir(),'shop-receipt-store-'));const receiptImg=path.join(receiptSource,'photo.jpg');await sharp({create:{width:100,height:100,channels:3,background:{r:1,g:2,b:3}}}).jpeg().toFile(receiptImg);const inspected=inspectImageFolder(receiptSource);assert(inspected.count===1&&inspected.images[0]===receiptImg,'receipt folder inspect must count supported images');const progress:string[]=[];const receipt=receiveGoods({storeRoot:receiptStore,name:'Receipt '+suffix,productCode:'R'+suffix,sizes:[{size:'Size 8',quantity:1,costPrice:10000,salePrice:20000,images:[receiptImg]}]},p=>progress.push(p.phase));assert(receipt.copiedImages===1,'goods receipt must copy physical image');assert(fs.existsSync(path.join(receiptStore,'Receipt '+suffix,'Size 8','001.jpg')),'goods receipt image must exist in canonical warehouse');assert(progress.includes('COPY')&&progress.at(-1)==='DONE','goods receipt must expose real progress phases');const rp=receipt.product as any;const rv=rp.variants[0];assert(rv.stock===1,'goods receipt must create IMPORT stock');
const digestTest=(file:string)=>createHash('sha256').update(fs.readFileSync(file)).digest('hex')
const copiedDest=path.join(receiptStore,'Receipt '+suffix,'Size 8','001.jpg')
assert(digestTest(copiedDest)===digestTest(receiptImg),'receipt copy must be byte-identical to original')
const committedJournal=createReceiptJournal({storeRoot:receiptStore,files:[{dest:copiedDest,sha256:digestTest(copiedDest)}],createdDirs:[]})
const committedRecovery=recoverPendingGoodsReceipts()
assert(committedRecovery.committed===1&&!fs.existsSync(committedJournal)&&fs.existsSync(copiedDest),'committed receipt recovery must keep database-registered warehouse images')
const crashProduct=path.join(receiptStore,'Crash '+suffix),crashSize=path.join(crashProduct,'Size X')
fs.mkdirSync(crashSize,{recursive:true})
const crashCopy=path.join(crashSize,'001.jpg')
const crashJournal=createReceiptJournal({storeRoot:receiptStore,files:[{dest:crashCopy,sha256:digestTest(receiptImg)}],createdDirs:[crashProduct,crashSize]})
fs.copyFileSync(receiptImg,crashCopy)
const beforeCrashSource=digestTest(receiptImg)
const crashed=recoverPendingGoodsReceipts()
assert(crashed.removedCopies===1&&!fs.existsSync(crashCopy)&&!fs.existsSync(crashProduct)&&!fs.existsSync(crashJournal),'uncommitted receipt after simulated process loss must remove only planned copies')
assert(digestTest(receiptImg)===beforeCrashSource,'recovery must never alter customer source image')
const corruptProduct=path.join(receiptStore,'Corrupt '+suffix),corruptSize=path.join(corruptProduct,'Size X')
fs.mkdirSync(corruptSize,{recursive:true})
const partialCopy=path.join(corruptSize,'001.jpg')
const corruptJournal=createReceiptJournal({storeRoot:receiptStore,files:[{dest:partialCopy,sha256:digestTest(receiptImg)}],createdDirs:[corruptProduct,corruptSize]})
fs.writeFileSync(partialCopy,'incomplete-data')
let corruptionBlocked=false
try{recoverPendingGoodsReceipts()}catch(e){corruptionBlocked=e instanceof Error&&e.message.includes('refusing deletion')}
assert(corruptionBlocked&&fs.existsSync(partialCopy)&&fs.existsSync(corruptJournal),'modified or partially copied receipt image must fail closed for manual investigation')
fs.rmSync(partialCopy);finishReceiptJournal(corruptJournal);fs.rmdirSync(corruptSize);fs.rmdirSync(corruptProduct)
let outsideJournalBlocked=false
try{createReceiptJournal({storeRoot:receiptStore,files:[{dest:path.join(receiptSource,'no-touch.jpg'),sha256:digestTest(receiptImg)}],createdDirs:[]})}catch{outsideJournalBlocked=true}
assert(outsideJournalBlocked,'receipt recovery must not accept a destination outside approved warehouse')
const mixedCopy=path.join(receiptStore,'mixed-'+suffix+'.jpg')
const mixedJournal=createReceiptJournal({storeRoot:receiptStore,files:[{dest:copiedDest,sha256:digestTest(copiedDest)},{dest:mixedCopy,sha256:digestTest(receiptImg)}],createdDirs:[]})
fs.copyFileSync(receiptImg,mixedCopy)
let mixedBlocked=false
try{recoverPendingGoodsReceipts()}catch(e){mixedBlocked=e instanceof Error&&e.message.includes('Mixed committed')}
assert(mixedBlocked&&fs.existsSync(copiedDest)&&fs.existsSync(mixedCopy),'mixed-commit recovery must not remove any registered or unregistered file')
fs.rmSync(mixedCopy);finishReceiptJournal(mixedJournal)
assert(recoverPendingGoodsReceipts().journals===0,'successful recovery tests must clear all active journals')
const hardName='Hard Crash '+suffix,hardCode='HC'+suffix
const hardProcess=spawnSync(process.execPath,['--import','tsx',path.resolve('scripts/crash-receipt-test.mjs'),receiptStore,receiptImg,hardName,hardCode],{cwd:process.cwd(),env:process.env,encoding:'utf8'})
assert(hardProcess.status===77,'child process must really terminate mid-receipt: '+hardProcess.stderr)
const hardDest=path.join(receiptStore,hardName,'Size Crash','001.jpg')
assert(fs.existsSync(hardDest),'hard exit must leave one uncommitted warehouse copy for recovery')
assert((db.prepare('SELECT COUNT(*) AS n FROM products WHERE product_code=?').get(hardCode) as {n:number}).n===0,'hard exit before SQLite commit must not create product')
const resume=spawnSync(process.execPath,['--import','tsx',path.resolve('scripts/recover-receipt-test.mjs')],{cwd:process.cwd(),env:process.env,encoding:'utf8'})
assert(resume.status===0&&resume.stdout.includes('HARD_CRASH_RECOVERY PASS'),'fresh-process receipt recovery must complete: '+resume.stderr)
assert(!fs.existsSync(hardDest)&&!fs.existsSync(path.join(receiptStore,hardName)),'hard-crash recovery must remove uncommitted image and empty folders')
assert(digestTest(receiptImg)===beforeCrashSource,'hard-crash recovery must leave original incoming image byte-identical')
assert(recoverPendingGoodsReceipts().journals===0,'crash recovery must leave no unresolved receipt journal')
db.prepare('DELETE FROM product_images WHERE product_id=?').run(receipt.productId);db.prepare('DELETE FROM inventory_transactions WHERE variant_id=?').run(rv.id);db.prepare('DELETE FROM product_variants WHERE product_id=?').run(receipt.productId);db.prepare('DELETE FROM products WHERE id=?').run(receipt.productId);let failedReceipt=false;try{receiveGoods({storeRoot:receiptStore,name:'Rollback '+suffix,productCode:'RR'+suffix,sizes:[{size:'Size 9',quantity:1,costPrice:1,salePrice:2,images:[receiptImg]},{size:'Size 10',quantity:1,costPrice:1,salePrice:2,images:[path.join(receiptSource,'missing.jpg')]}]})}catch{failedReceipt=true}assert(failedReceipt,'receipt with missing image must fail');assert(!fs.existsSync(path.join(receiptStore,'Rollback '+suffix)),'failed receipt must not leave product folder');assert((db.prepare('SELECT COUNT(*) AS n FROM products WHERE product_code=?').get('RR'+suffix) as {n:number}).n===0,'failed receipt must not write product');let mismatchReceipt=false;try{receiveGoods({storeRoot:receiptStore,name:'Mismatch '+suffix,productCode:'RM'+suffix,sizes:[{size:'Size 7',quantity:2,costPrice:1,salePrice:2,images:[receiptImg]}]})}catch{mismatchReceipt=true}assert(mismatchReceipt,'receipt quantity must equal physical image count');assert(!fs.existsSync(path.join(receiptStore,'Mismatch '+suffix)),'mismatched receipt must fail before creating warehouse folder');fs.rmSync(receiptSource,{recursive:true,force:true});fs.rmSync(receiptStore,{recursive:true,force:true});
fs.rmSync(importRoot,{recursive:true,force:true})
db.prepare('DELETE FROM inventory_transactions WHERE variant_id=?').run(collisionVariant.id)
db.prepare('DELETE FROM product_variants WHERE id=?').run(collisionVariant.id)
db.prepare('DELETE FROM products WHERE id=?').run((collision.product as {id:number}).id)
db.exec('BEGIN IMMEDIATE')
try{
 db.prepare('DELETE FROM inventory_transactions WHERE variant_id=?').run(variant.id)
 db.prepare('DELETE FROM product_variants WHERE id=?').run(variant.id)
 db.prepare('DELETE FROM products WHERE id=?').run((product.product as {id:number}).id)
 db.exec('COMMIT')
}catch(e){db.exec('ROLLBACK');throw e}
console.log('SELF_TEST_V1 PASS: product, validation rollback, opening, import, adjustments, negative guard, integer guard, history, batch rollback, settings/filter/history/inactive integration, path guard, image resolve/missing-file, persistence/integrity/foreign-key, store import rollback/rescan-idempotence, goods receipt copy/folder-inspect/rollback/progress, durable crash recovery/uncommitted/committed/mixed/corrupt safeguards plus hard-process-exit/restart simulation, DB backup, manual optimized image backup, lossless image+DB recovery bundle/corruption detection, cleanup')

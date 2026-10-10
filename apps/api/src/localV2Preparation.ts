import fs from 'node:fs'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import sharp from 'sharp'
import { assertDatabaseIntegrity, readSchemaVersion } from './schema.js'
import { bootstrapSalesDrafts } from './salesSchema.js'
import { bootstrapSalesExecution, contained, digest, exactFile, writeDurable } from './salesExecution.js'
import { createSalesBackup } from './salesBackup.js'
import { restoreLosslessBackup } from './losslessRestore.js'
import { verifyLosslessBackup } from './losslessVerify.js'

const tables = ['categories', 'products', 'product_variants', 'product_images', 'inventory_transactions']
const inside = (a:string,b:string) => a === b || contained(a,b)

/** Compare business fields, including IDs, timestamps, prices and ledger, across path remapping. */
export function businessSnapshot(db:DatabaseSync, warehouse:string) {
  const data:Record<string,unknown> = {}
  for (const table of tables) data[table] = db.prepare('SELECT * FROM '+table+' ORDER BY id').all().map(row => {
    if (table !== 'product_images') return row
    const relative = path.relative(warehouse, String(row.file_path))
    if (path.isAbsolute(relative) || relative.split(path.sep).length !== 3 || !contained(warehouse,String(row.file_path))) throw Error('Ảnh không thuộc Product / Size / ảnh của kho đã chọn')
    if (row.variant_id === null) throw Error('Ảnh chưa gắn Size; cần xử lý metadata V1 trước khi chuẩn bị V2')
    return {...row, file_path:relative}
  })
  data.settings = db.prepare("SELECT key,value FROM app_settings WHERE key NOT IN ('warehouse-last-scan','warehouse-notices') ORDER BY key").all().map(row => {
    if (row.key !== 'warehouse-watch') return row
    const watch = JSON.parse(String(row.value))
    if (watch.rootPath && path.resolve(watch.rootPath) !== warehouse) throw Error('Kho đã chọn không khớp cấu hình V1')
    return {...row,value:JSON.stringify({...watch,rootPath:'WAREHOUSE',startup:false,periodic:false,autoRename:false})}
  })
  data.sequences = db.prepare("SELECT name,seq FROM sqlite_sequence WHERE name IN ('categories','products','product_variants','product_images','inventory_transactions') ORDER BY name").all()
  return {data,sha256:digest(JSON.stringify(data)),counts:Object.fromEntries(tables.map(t=>[t,(data[t] as unknown[]).length]))}
}

/** Only consumes a verified V1 backup; never opens or migrates the live business DB. */
export async function prepareLocalV2(bundleInput:string, oldWarehouseInput:string, targetInput:string, checkpoint:(p:string)=>void=()=>{}) {
  const bundle = fs.realpathSync(path.resolve(bundleInput)), old = path.resolve(oldWarehouseInput), target = path.resolve(targetInput)
  if (fs.existsSync(target) || fs.realpathSync(path.dirname(target)) !== path.dirname(target) || [bundle,old].some(p=>inside(p,target)||inside(target,p))) throw Error('Gói chuẩn bị phải ở thư mục mới riêng, ngoài backup/kho gốc; không ghi đè')
  const verified = verifyLosslessBackup(bundle)
  const manifest = path.join(bundle,'lossless-manifest.json'), manifestHash = digest(exactFile(manifest))
  const source = new DatabaseSync(path.join(bundle,'shop.db'),{readOnly:true})
  let baseline:ReturnType<typeof businessSnapshot>
  try {
    assertDatabaseIntegrity(source)
    if (readSchemaVersion(source) !== 110) throw Error('Gói LOCAL chỉ chuẩn bị từ backup V1 schema110; không tự đoán phiên bản')
    baseline = businessSnapshot(source,old)
  } finally { source.close() }
  const input = JSON.parse(exactFile(manifest).toString()) as {files:Array<{size:number}>}
  const bytes = input.files.reduce((n,f)=>n+BigInt(f.size),0n)+BigInt(fs.statSync(path.join(bundle,'shop.db')).size)
  const estimatedRequiredBytes = bytes*4n+64n*1024n*1024n
  const volume = fs.statfsSync(path.dirname(target),{bigint:true})
  if(volume.bavail*volume.bsize < estimatedRequiredBytes)throw Error('Không đủ dung lượng cho bản sao, backup V2, restore V2 và quay lui V1. Cần tối thiểu '+estimatedRequiredBytes+' bytes trống; chưa tạo gói')
  fs.mkdirSync(target)
  writeDurable(path.join(target,'preparation-plan.json'),JSON.stringify({format:1,mode:'V2_LOCAL_COPY_PREPARATION',bundle,oldWarehouse:old,baseline,manifestHash}))
  checkpoint('plan')
  const candidate = restoreLosslessBackup(bundle,path.join(target,'candidate'),old)
  // Preserve the original restore evidence under an explicit V1 name before migration.
  fs.renameSync(path.join(candidate.targetRoot,'restore-ready.json'),path.join(candidate.targetRoot,'restore-v1-ready.json'))
  checkpoint('restored-v1')
  const db = new DatabaseSync(candidate.database)
  let backup:ReturnType<typeof createSalesBackup>
  const same = (handle:DatabaseSync,warehouse:string) => {
    const result = businessSnapshot(handle,warehouse)
    if (result.sha256 !== baseline.sha256) throw Error('ID/giá/lịch sử/cấu hình/dữ liệu nghiệp vụ không khớp backup V1')
    return result
  }
  try {
    db.exec('PRAGMA foreign_keys=ON;PRAGMA synchronous=FULL')
    same(db,candidate.warehouse)
    for (const row of db.prepare('SELECT id,file_path FROM product_images ORDER BY id').all()) {
      if(!['.jpg','.jpeg','.png','.webp','.heic'].includes(path.extname(String(row.file_path)).toLowerCase()))throw Error('Định dạng ảnh chưa hỗ trợ: '+row.id)
      await sharp(exactFile(String(row.file_path)),{limitInputPixels:40_000_000,failOn:'warning'}).stats()
      checkpoint('decoded:'+row.id)
    }
    bootstrapSalesDrafts(db);checkpoint('schema120')
    bootstrapSalesExecution(db,candidate.targetRoot);checkpoint('schema130')
    same(db,candidate.warehouse);assertDatabaseIntegrity(db)
    if (db.prepare('SELECT COUNT(*) n FROM sales_confirmations').get()!.n !== 0 || db.prepare('SELECT COUNT(*) n FROM sales_ledger').get()!.n !== 0) throw Error('Chuẩn bị không được tự tạo giao dịch bán')
    backup = createSalesBackup(db,candidate.database,candidate.targetRoot)
  } finally { db.close() }
  checkpoint('backup130')
  const proof = restoreLosslessBackup(backup!.directory,path.join(target,'restore-proof-v2'),candidate.warehouse)
  const proofDb = new DatabaseSync(proof.database,{readOnly:true})
  try {same(proofDb,proof.warehouse);assertDatabaseIntegrity(proofDb);if(readSchemaVersion(proofDb)!==130)throw Error('Restore V2 sai schema')} finally {proofDb.close()}
  checkpoint('restore-proof')
  const rollback = restoreLosslessBackup(bundle,path.join(target,'rollback-proof-v1'),old)
  const rollbackDb = new DatabaseSync(rollback.database,{readOnly:true})
  try {same(rollbackDb,rollback.warehouse);assertDatabaseIntegrity(rollbackDb);if(readSchemaVersion(rollbackDb)!==110)throw Error('Bản quay lui sai schema')} finally {rollbackDb.close()}
  checkpoint('rollback-proof')
  verifyLosslessBackup(bundle);verifyLosslessBackup(backup!.directory)
  if(digest(exactFile(manifest))!==manifestHash)throw Error('Backup nguồn thay đổi trong khi chuẩn bị')
  const result = {format:1,status:'READY_FOR_REVIEW',mode:'V2_LOCAL_COPY_PREPARATION',activated:false,businessActivationAllowed:false,sourceBundle:bundle,sourceManifestHash:manifestHash,originalWarehouse:old,candidate:{...candidate,schema:130},baseline,imagesVerified:verified.imagesVerified,estimatedRequiredBytes:estimatedRequiredBytes.toString(),postMigrationBackup:backup!.directory,restoreProof:proof,rollbackProof:rollback,retainedOriginals:true,completedAt:new Date().toISOString()}
  checkpoint('before-ready')
  writeDurable(path.join(target,'local-v2-ready.json'),JSON.stringify(result,null,2))
  checkpoint('ready')
  return result
}

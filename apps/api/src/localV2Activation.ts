import fs from 'node:fs'
import path from 'node:path'
import {DatabaseSync} from 'node:sqlite'
import {businessSnapshot} from './localV2Preparation.js'
import {checkLocalV2Release} from './localV2ReleaseCheck.js'
import {ACTIVE_MARKER,RUNTIME_LOCK,physical,inside,sha,readLocalConfig,type LocalConfig} from './localRuntime.js'
import {writeDurable,exactFile} from './salesExecution.js'
import {createSalesBackup,restoreSalesBackup} from './salesBackup.js'

export const ACTIVATE_PHRASE='TOI DA DUYET BAN SAO VA DUNG V1'
export const ROLLBACK_PHRASE='QUAY LAI V1 CHUA PHAT SINH DU LIEU'
/** Explicit activation, never migrates the source V1 database or renames source images. */
export function activateLocalV2(packageRoot:string,sourceDatabase:string,dataRoot:string,consent:string,checkpoint:(point:string)=>void=()=>{}) {
  if(consent!==ACTIVATE_PHRASE)throw Error('Chưa xác nhận duyệt bản sao và dừng toàn bộ V1')
  packageRoot=physical(path.resolve(packageRoot),true);sourceDatabase=physical(path.resolve(sourceDatabase));dataRoot=path.resolve(dataRoot)
  const ready=JSON.parse(exactFile(path.join(packageRoot,'local-v2-ready.json')).toString()),warehouse=physical(ready.originalWarehouse,true)
  if(fs.existsSync(dataRoot)||warehouse===path.parse(warehouse).root||[warehouse,packageRoot,path.dirname(sourceDatabase)].some(p=>inside(p,dataRoot)||inside(dataRoot,p)))throw Error('Chọn thư mục dữ liệu V2 mới, tách biệt kho/V1/gói duyệt')
  physical(path.dirname(dataRoot),true)
  if(fs.existsSync(path.join(warehouse,ACTIVE_MARKER))||fs.existsSync(path.join(warehouse,RUNTIME_LOCK)))throw Error('Kho đã có marker/khóa LOCAL; không ghi đè')
  const release=checkLocalV2Release(packageRoot,ready.sourceBundle)
  if(release.status!=='TECHNICALLY_READY_FOR_REVIEW')throw Error('Gói duyệt chưa đạt: '+release.checks.filter(c=>!c.ok).map(c=>c.message).join('; '))
  const manifest=JSON.parse(exactFile(path.join(ready.sourceBundle,'lossless-manifest.json')).toString())
  const required=manifest.files.reduce((n:bigint,f:{size:number})=>n+BigInt(f.size),0n)*2n+BigInt(fs.statSync(ready.candidate.database).size)*3n+64n*1024n*1024n
  const volume=fs.statfsSync(path.dirname(dataRoot),{bigint:true})
  if(volume.bavail*volume.bsize<required)throw Error('Không đủ dung lượng backup/restore trước kích hoạt. Cần ít nhất '+required+' bytes trống; chưa tạo DB V2')
  const images=manifest.files.map((f:{id:number;source_path:string;sha256:string})=>({id:f.id,relative:path.relative(warehouse,f.source_path),sha256:f.sha256}))
  function frozen(){const source=new DatabaseSync(sourceDatabase,{readOnly:true});try{source.exec('BEGIN');if(source.prepare("SELECT value FROM app_metadata WHERE key='schema_version'").get()?.value!=='110'||businessSnapshot(source,warehouse).sha256!==ready.baseline.sha256)throw Error('V1 thay đổi sau backup; tạo backup và gói duyệt mới');for(const f of images)exactFile(path.join(warehouse,f.relative),f.sha256)
    const registered=new Set(images.map((f:{relative:string})=>path.join(warehouse,f.relative)))
    function walk(dir:string){for(const name of fs.readdirSync(dir)){if(name.startsWith('.mecacao-'))continue;const p=path.join(dir,name),stat=fs.lstatSync(p);if(stat.isSymbolicLink())throw Error('Kho có liên kết; kiểm tra thủ công trước khi chuyển');if(stat.isDirectory()){physical(p,true);walk(p)}else if(/\.(jpg|jpeg|png|webp|heic)$/i.test(name)&&!registered.has(p))throw Error('Có ảnh chưa đăng ký/duyệt trong V1: '+p)}}
    walk(warehouse)
  }finally{source.close()}}
  frozen()
  fs.mkdirSync(dataRoot);writeDurable(path.join(dataRoot,'activation-plan.json'),JSON.stringify({format:1,packageRoot,sourceDatabase,warehouse,status:'PREPARING'}));checkpoint('plan')
  const incoming=path.join(dataRoot,'incoming'),database=path.join(dataRoot,'database','shop-business.db');fs.mkdirSync(incoming);fs.mkdirSync(path.dirname(database))
  writeDurable(database,exactFile(ready.candidate.database));checkpoint('database-copy')
  const db=new DatabaseSync(database)
  let backup:ReturnType<typeof createSalesBackup>
  try{
    db.exec('PRAGMA foreign_keys=ON;PRAGMA synchronous=FULL;BEGIN IMMEDIATE')
    try{for(const f of images)db.prepare('UPDATE product_images SET file_path=? WHERE id=?').run(path.join(warehouse,f.relative),f.id)
      const row=db.prepare("SELECT value FROM app_settings WHERE key='warehouse-watch'").get();if(row)db.prepare("UPDATE app_settings SET value=? WHERE key='warehouse-watch'").run(JSON.stringify({...JSON.parse(String(row.value)),rootPath:warehouse,startup:false,periodic:false,autoRename:false}))
      db.prepare("DELETE FROM app_settings WHERE key IN ('warehouse-last-scan','warehouse-notices')").run()
      db.prepare("INSERT OR REPLACE INTO app_metadata(key,value) VALUES('warehouse_layout','DIRECT')").run()
      if(businessSnapshot(db,warehouse).sha256!==ready.baseline.sha256)throw Error('Metadata V2 không khớp V1')
      db.exec('COMMIT')
    }catch(e){db.exec('ROLLBACK');throw e}
    checkpoint('database-ready');backup=createSalesBackup(db,database,warehouse)
  }finally{db.close()}
  checkpoint('backup')
  const proof=restoreSalesBackup(backup!.directory,path.join(dataRoot,'activation-restore-proof'),warehouse)
  const proofDb=new DatabaseSync(proof.database,{readOnly:true});try{if(businessSnapshot(proofDb,proof.warehouse).sha256!==ready.baseline.sha256)throw Error('Restore proof khác dữ liệu V1')}finally{proofDb.close()}
  checkpoint('restore-proof');frozen()
  const config:LocalConfig={format:1,mode:'LOCAL_V2_BUSINESS',dataRoot,warehouse,incoming,database,sourceV1Database:sourceDatabase,sourceBackup:ready.sourceBundle,baselineHash:ready.baseline.sha256,imageHashes:images,activatedAt:new Date().toISOString()}
  const configPath=path.join(dataRoot,'local-v2-config.json');writeDurable(configPath,JSON.stringify(config,null,2));readLocalConfig(configPath,false)
  writeDurable(path.join(dataRoot,'activation-proof.json'),JSON.stringify({backup:backup!.directory,restore:proof,sourceUnchanged:true,originalsRetained:true},null,2))
  checkpoint('before-active');frozen()
  writeDurable(path.join(warehouse,ACTIVE_MARKER),JSON.stringify({format:1,configPath,configSha:sha(exactFile(configPath)),warehouse,database}))
  checkpoint('active');return readLocalConfig(configPath)
}

/** Retains every DB/backup/image. Only removes this activation marker after proving no business changes. */
export function rollbackUnusedLocalV2(configPath:string,consent:string){
  if(consent!==ROLLBACK_PHRASE)throw Error('Chưa xác nhận quay lui')
  const c=readLocalConfig(configPath)
  if(fs.existsSync(path.join(c.warehouse,RUNTIME_LOCK)))throw Error('Dừng server LOCAL trước khi quay lui; không tự phá khóa')
  const db=new DatabaseSync(c.database,{readOnly:true})
  try{db.exec('BEGIN');for(const table of ['sales_orders','sales_order_images','sales_operations','sales_confirmations','sales_units','sales_ledger'])if(Number(db.prepare('SELECT COUNT(*) n FROM '+table).get()!.n))throw Error('Đã phát sinh đơn/giao dịch; không quay lui V1. Dùng restore V2 vào thư mục mới')
    if(businessSnapshot(db,c.warehouse).sha256!==c.baselineHash)throw Error('Dữ liệu đã thay đổi; không quay lui V1')
    for(const f of c.imageHashes)exactFile(path.join(c.warehouse,f.relative),f.sha256)
    const source=new DatabaseSync(c.sourceV1Database,{readOnly:true});try{if(businessSnapshot(source,c.warehouse).sha256!==c.baselineHash)throw Error('DB V1 thay đổi; không quay lui')}finally{source.close()}
    const marker=path.join(c.warehouse,ACTIVE_MARKER),payload=exactFile(marker)
    const report={status:'ROLLED_BACK_WITHOUT_BUSINESS_CHANGES',completedAt:new Date().toISOString(),retainedDatabase:c.database,retainedBackup:c.sourceBackup,warehouse:c.warehouse}
    writeDurable(path.join(c.dataRoot,'rollback-completed.json'),JSON.stringify(report));if(!exactFile(marker).equals(payload))throw Error('Marker thay đổi; cần kiểm tra thủ công');fs.unlinkSync(marker);return report
  }finally{db.close()}
}

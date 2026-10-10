import fs from 'node:fs'
import path from 'node:path'
import {DatabaseSync} from 'node:sqlite'
import {assertDatabaseIntegrity,readSchemaVersion} from './schema.js'
import {businessSnapshot} from './localV2Preparation.js'
import {verifyLosslessBackup} from './losslessVerify.js'
import {contained,digest,exactFile,SALES_AREA} from './salesExecution.js'

type Check={id:string;label:string;ok:boolean;message:string}
type Image={id:number;source_path:string;sha256:string}
function v1Evidence(bundle:string,warehouse:string){
  verifyLosslessBackup(bundle)
  const manifest=JSON.parse(exactFile(path.join(bundle,'lossless-manifest.json')).toString()) as {version:number;files:Image[]}
  if(![1,2].includes(manifest.version))throw Error('Cần backup V1, không dùng backup sandbox V2')
  const db=new DatabaseSync(path.join(bundle,'shop.db'),{readOnly:true})
  try{
    assertDatabaseIntegrity(db)
    if(readSchemaVersion(db)!==110)throw Error('Backup phải là V1 schema110')
    return {snapshot:businessSnapshot(db,warehouse),images:manifest.files.map(f=>({id:f.id,relative:path.relative(warehouse,f.source_path),sha256:f.sha256})).sort((a,b)=>a.id-b.id)}
  }finally{db.close()}
}

/** Read-only advisory checks. This never approves activation, starts a server or changes the live store. */
export function checkLocalV2Release(packageInput:string, latestV1Backup?:string){
  const root=path.resolve(packageInput)
  if(fs.realpathSync(root)!==root)throw Error('Gói kiểm tra không được qua symlink')
  const ready=JSON.parse(exactFile(path.join(root,'local-v2-ready.json')).toString())
  if(ready.format!==1||ready.status!=='READY_FOR_REVIEW'||ready.mode!=='V2_LOCAL_COPY_PREPARATION'||ready.activated!==false||ready.businessActivationAllowed!==false||typeof ready.originalWarehouse!=='string'||!path.isAbsolute(ready.originalWarehouse))throw Error('Gói chuẩn bị không hợp lệ')
  const checks:Check[]=[]
  function check(id:string,label:string,fn:()=>string){try{checks.push({id,label,ok:true,message:fn()})}catch(e){checks.push({id,label,ok:false,message:e instanceof Error?e.message:'Không kiểm chứng được'})}}
  let baseline:ReturnType<typeof v1Evidence>|undefined
  check('source','Backup V1 nguồn',()=>{
    if(typeof ready.sourceBundle!=='string'||!path.isAbsolute(ready.sourceBundle)||fs.realpathSync(ready.sourceBundle)!==ready.sourceBundle)throw Error('Đường dẫn backup nguồn không hợp lệ')
    if(digest(exactFile(path.join(ready.sourceBundle,'lossless-manifest.json')))!==ready.sourceManifestHash)throw Error('Backup nguồn thay đổi so với lúc chuẩn bị')
    baseline=v1Evidence(ready.sourceBundle,ready.originalWarehouse)
    if(baseline.snapshot.sha256!==ready.baseline?.sha256)throw Error('Fingerprint nghiệp vụ trong marker không khớp nguồn')
    return 'Schema110, DB/ảnh/checksum đã kiểm chứng'
  })
  const copies=[['candidate','Bản sao V2 để duyệt',130],['restoreProof','Kho phục hồi V2',130],['rollbackProof','Kho quay lui thử V1',110]] as const
  const folders={candidate:'candidate',restoreProof:'restore-proof-v2',rollbackProof:'rollback-proof-v1'}
  let counts:Record<string,number>|undefined
  for(const [key,label,schema] of copies)check(key,label,()=>{
    if(!baseline)throw Error('Backup nguồn chưa đạt; không thể đối chiếu')
    const target=path.join(root,folders[key]),warehouse=path.join(target,'warehouse'),database=path.join(target,'database','shop-restored.db'),marker=ready[key]
    if(marker?.targetRoot!==target||marker.database!==database||marker.warehouse!==warehouse||marker.schema!==schema)throw Error('Marker/path/schema bản sao không khớp gói')
    exactFile(database)
    if(fs.existsSync(path.join(target,SALES_AREA+'-pending.json')))throw Error('Có giao dịch bán cần phục hồi; chưa kiểm tra chuyển đổi')
    const db=new DatabaseSync(database,{readOnly:true})
    try{
      db.exec('BEGIN')
      assertDatabaseIntegrity(db)
      if(readSchemaVersion(db)!==schema)throw Error('Schema bản sao thay đổi')
      if(schema===130)for(const table of ['sales_orders','sales_order_images','sales_operations','sales_confirmations','sales_units','sales_ledger']){
        if(Number(db.prepare('SELECT COUNT(*) n FROM '+table).get()!.n)>0)throw Error('Có đơn/giao dịch test trong '+table+'. Tạo gói mới từ backup V1, không xóa đơn để ép đạt.')
      }
      const snapshot=businessSnapshot(db,warehouse)
      if(snapshot.sha256!==baseline.snapshot.sha256)throw Error('ID/Size/giá/lịch sử/cấu hình đã khác V1. Tạo gói mới, không ghi đè dữ liệu.')
      for(const image of baseline.images)if(digest(exactFile(path.join(warehouse,image.relative)))!==image.sha256)throw Error('Ảnh thay đổi/thiếu: ID '+image.id)
      if(key==='candidate')counts=snapshot.counts
      return 'Giữ đúng dữ liệu và ảnh; không có đơn test'
    }finally{db.close()}
  })
  check('backup130','Backup đầy đủ V2',()=>{
    const dir=ready.postMigrationBackup
    if(typeof dir!=='string'||!contained(path.join(root,'candidate','database','backups'),dir))throw Error('Backup V2 không thuộc gói đã chuẩn bị')
    const verified=verifyLosslessBackup(dir)
    if(verified.imagesVerified!==baseline?.images.length)throw Error('Số ảnh backup V2 không khớp V1')
    const db=new DatabaseSync(path.join(dir,'shop.db'),{readOnly:true})
    try{
      if(readSchemaVersion(db)!==130||businessSnapshot(db,path.join(root,'candidate','warehouse')).sha256!==baseline?.snapshot.sha256)throw Error('Backup V2 khác dữ liệu nguồn')
      for(const table of ['sales_orders','sales_order_images','sales_operations','sales_confirmations','sales_units','sales_ledger'])if(Number(db.prepare('SELECT COUNT(*) n FROM '+table).get()!.n)>0)throw Error('Backup V2 có đơn/giao dịch test')
    }finally{db.close()}
    return 'DB + ảnh gốc đầy đủ, checksum hợp lệ'
  })
  check('latestV1','Backup V1 cuối để đối chiếu',()=>{
    if(!latestV1Backup)throw Error('Chưa chọn backup V1 cuối. Tạo backup mới trong V1 rồi chạy lại kiểm tra.')
    if(!baseline)throw Error('Backup nguồn chưa đạt')
    const latest=v1Evidence(fs.realpathSync(path.resolve(latestV1Backup)),ready.originalWarehouse)
    if(latest.snapshot.sha256!==baseline.snapshot.sha256||digest(JSON.stringify(latest.images))!==digest(JSON.stringify(baseline.images)))throw Error('V1 đã có thay đổi sau backup dùng để chuẩn bị. Tạo gói mới từ backup V1 cuối; không chuyển các đơn test.')
    return 'Dữ liệu và ảnh khớp backup V1 được chọn; chưa xác minh V1 đang chạy đã dừng ghi'
  })
  return {format:1,mode:'V2_LOCAL_RELEASE_READ_ONLY_CHECK',status:checks.every(c=>c.ok)?'TECHNICALLY_READY_FOR_REVIEW':'BLOCKED',packageRoot:root,checks,counts,checkedAt:new Date().toISOString(),businessActivationAllowed:false,requiresRecheckAtActivation:true,pendingGates:['Chủ shop nghiệm thu dữ liệu bản sao','Đặc tả và duyệt kích hoạt LOCAL kinh doanh','Dừng ghi V1, backup mới và đối chiếu cuối tại thời điểm chuyển'],originalsRetained:true}
}

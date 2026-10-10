import fs from 'node:fs'
import path from 'node:path'
import {DatabaseSync} from 'node:sqlite'
import {createHash,randomUUID} from 'node:crypto'
import {SalesError} from './salesDrafts.js'
import {isInternalWarehousePath} from './warehouseAreas.js'
const digest=(v:string)=>createHash('sha256').update(v).digest('hex')
const note=(v:unknown)=>{if(typeof v!=='string'||!v.trim()||v.length>500)throw new SalesError('Ghi nội dung từ 1 đến 500 ký tự');return v.trim()}
export function bootstrapStocktake(db:DatabaseSync){db.exec(`
 CREATE TABLE IF NOT EXISTS stocktake_sessions(id TEXT PRIMARY KEY,request_key TEXT NOT NULL UNIQUE,input_hash TEXT NOT NULL,title TEXT NOT NULL,status TEXT NOT NULL CHECK(status IN ('OPEN','CLOSED','CANCELLED')),version INTEGER NOT NULL CHECK(version>0),fingerprint TEXT NOT NULL,snapshot_hash TEXT NOT NULL,created_at TEXT NOT NULL DEFAULT(datetime('now')),closed_at TEXT,conclusion TEXT NOT NULL DEFAULT '');
 CREATE TABLE IF NOT EXISTS stocktake_rows(session_id TEXT NOT NULL REFERENCES stocktake_sessions(id),variant_id INTEGER NOT NULL REFERENCES product_variants(id),snapshot TEXT NOT NULL,counted INTEGER CHECK(counted BETWEEN 0 AND 1000000),note TEXT NOT NULL DEFAULT '',PRIMARY KEY(session_id,variant_id));
 CREATE TRIGGER IF NOT EXISTS stocktake_final_no_update BEFORE UPDATE ON stocktake_sessions WHEN OLD.status<>'OPEN' BEGIN SELECT RAISE(ABORT,'Final stocktake is immutable'); END;
 CREATE TRIGGER IF NOT EXISTS stocktake_identity_no_update BEFORE UPDATE OF id,request_key,input_hash,title,fingerprint,snapshot_hash,created_at ON stocktake_sessions BEGIN SELECT RAISE(ABORT,'Stocktake snapshot is immutable'); END;
 CREATE TRIGGER IF NOT EXISTS stocktake_transition BEFORE UPDATE ON stocktake_sessions WHEN NEW.version<>OLD.version+1 OR (NEW.status='OPEN' AND (NEW.closed_at IS NOT NULL OR NEW.conclusion<>'')) OR (NEW.status<>'OPEN' AND (NEW.closed_at IS NULL OR length(trim(NEW.conclusion))=0)) BEGIN SELECT RAISE(ABORT,'Invalid stocktake transition'); END;
 CREATE TRIGGER IF NOT EXISTS stocktake_no_delete BEFORE DELETE ON stocktake_sessions BEGIN SELECT RAISE(ABORT,'Stocktake history is immutable'); END;
 CREATE TRIGGER IF NOT EXISTS stocktake_row_no_update BEFORE UPDATE ON stocktake_rows WHEN (SELECT status FROM stocktake_sessions WHERE id=OLD.session_id)<>'OPEN' OR NEW.session_id<>OLD.session_id OR NEW.variant_id<>OLD.variant_id OR NEW.snapshot<>OLD.snapshot BEGIN SELECT RAISE(ABORT,'Stocktake snapshot is immutable'); END;
 CREATE TRIGGER IF NOT EXISTS stocktake_row_no_insert BEFORE INSERT ON stocktake_rows WHEN (SELECT status FROM stocktake_sessions WHERE id=NEW.session_id)<>'OPEN' BEGIN SELECT RAISE(ABORT,'Final stocktake is immutable'); END;
 CREATE TRIGGER IF NOT EXISTS stocktake_row_no_delete BEFORE DELETE ON stocktake_rows BEGIN SELECT RAISE(ABORT,'Stocktake snapshot is immutable'); END;
 `)}
export function stocktakeService(db:DatabaseSync,root:string){
 function capture(){
  const sold=new Set(db.prepare('SELECT image_id FROM sales_units').all().map(i=>Number(i.image_id)))
  const variants=db.prepare('SELECT v.id AS variantId,v.sku,v.size,v.status AS variantStatus,p.name AS productName,p.product_code AS productCode,p.status AS productStatus,COALESCE(s.stock,0) ledger FROM product_variants v JOIN products p ON p.id=v.product_id LEFT JOIN inventory_stock s ON s.variant_id=v.id ORDER BY v.id').all()
  const images=db.prepare('SELECT id,product_id,variant_id,file_path FROM product_images ORDER BY id').all(),evidence:unknown[]=[],byVariant=new Map<number,typeof images>();for(const i of images){const id=Number(i.variant_id),group=byVariant.get(id)??[];group.push(i);byVariant.set(id,group)}
  const rows=variants.map(v=>{
   let physical=0,missing=0,retired=0
   for(const i of (byVariant.get(Number(v.variantId))??[])){
    const file=String(i.file_path);if(sold.has(Number(i.id))){retired++;evidence.push([i.id,'SOLD']);continue}
    let found=false,stamp='MISSING'
    if(!isInternalWarehousePath(file)&&['.jpg','.jpeg','.png','.webp','.heic'].includes(path.extname(file).toLowerCase()))try{const real=fs.realpathSync(file),rel=path.relative(fs.realpathSync(root),real),stat=fs.statSync(file);if(stat.isFile()&&!isInternalWarehousePath(real)&&!path.isAbsolute(rel)&&rel!=='..'&&!rel.startsWith('..'+path.sep)){found=true;stamp=stat.size+':'+stat.mtimeMs+':'+stat.ctimeMs}}catch(e){if(!['ENOENT','ENOTDIR'].includes((e as NodeJS.ErrnoException).code??''))throw e}
    if(found)physical++;else missing++;evidence.push([i.id,path.relative(root,file),stamp])
   }
   return {variantId:Number(v.variantId),sku:String(v.sku),size:String(v.size),productName:String(v.productName),productCode:String(v.productCode),productStatus:String(v.productStatus),variantStatus:String(v.variantStatus),ledger:Number(v.ledger),physical,missing,retired}
  })
  return {rows,fingerprint:digest(JSON.stringify({rows,evidence}))}
 }
 function get(id:string){const s=db.prepare('SELECT * FROM stocktake_sessions WHERE id=?').get(id) as {id:string;title:string;status:string;version:number;fingerprint:string;created_at:string;closed_at:string|null;conclusion:string}|undefined;if(!s)throw new SalesError('Không tìm thấy phiên kiểm kê',404);const rows=db.prepare('SELECT * FROM stocktake_rows WHERE session_id=? ORDER BY variant_id').all(id).map(r=>({...JSON.parse(String(r.snapshot)),counted:r.counted===null?null:Number(r.counted),note:String(r.note),difference:r.counted===null?null:Number(r.counted)-Number(JSON.parse(String(r.snapshot)).physical)}));return {...s,version:Number(s.version),rows}}
 function tx<T>(fn:()=>T){db.exec('BEGIN IMMEDIATE');try{const r=fn();db.exec('COMMIT');return r}catch(e){db.exec('ROLLBACK');throw e}}
 function expected(s:ReturnType<typeof get>,raw:any){if(s.status!=='OPEN'||raw.version!==s.version)throw new SalesError('Phiên đã thay đổi hoặc đã kết thúc. Mở lại trước khi lưu.',409)}
 return {get,capture,list(){return db.prepare('SELECT * FROM stocktake_sessions ORDER BY created_at DESC,id').all()},
 create(raw:any,key:unknown){const title=note(raw.title);if(typeof key!=='string'||! /^[A-Za-z0-9_-]{16,100}$/.test(key))throw new SalesError('Thiếu mã yêu cầu kiểm kê');return tx(()=>{const old=db.prepare('SELECT * FROM stocktake_sessions WHERE request_key=?').get(key);if(old){if(old.input_hash!==digest(title))throw new SalesError('Mã yêu cầu đã dùng với tên khác',409);return get(String(old.id))}if(db.prepare("SELECT 1 FROM stocktake_sessions WHERE status='OPEN'").get())throw new SalesError('Hoàn tất hoặc hủy phiên đang mở trước khi tạo phiên mới',409);const snap=capture();if(!snap.rows.length)throw new SalesError('Nhập kho trước khi tạo phiên kiểm kê');const id=randomUUID();db.prepare("INSERT INTO stocktake_sessions(id,request_key,input_hash,title,status,version,fingerprint,snapshot_hash) VALUES(?,?,?,?,'OPEN',1,?,?)").run(id,key,digest(title),title,snap.fingerprint,digest(JSON.stringify(snap.rows)));for(const r of snap.rows)db.prepare('INSERT INTO stocktake_rows(session_id,variant_id,snapshot) VALUES(?,?,?)').run(id,r.variantId,JSON.stringify(r));return get(id)})},
 save(id:string,raw:any){return tx(()=>{const s=get(id);expected(s,raw);if(!Array.isArray(raw.rows)||raw.rows.length!==s.rows.length)throw new SalesError('Lưu đủ các Size trong phiên');const ids=new Set<number>();for(const r of raw.rows){if(ids.has(r.variantId)||!s.rows.some(v=>v.variantId===r.variantId)||!(r.counted===null||(Number.isSafeInteger(r.counted)&&r.counted>=0&&r.counted<=1000000))||typeof r.note!=='string'||r.note.length>500)throw new SalesError('Số đếm, Size hoặc ghi chú không hợp lệ');ids.add(r.variantId);db.prepare('UPDATE stocktake_rows SET counted=?,note=? WHERE session_id=? AND variant_id=?').run(r.counted,r.note.trim(),id,r.variantId)}db.prepare('UPDATE stocktake_sessions SET version=version+1 WHERE id=?').run(id);return get(id)})},
 finish(id:string,raw:any){return tx(()=>{const s=get(id),status=raw.cancel===true?'CANCELLED':'CLOSED',conclusion=note(raw.conclusion);if(s.status===status&&s.version===raw.version+1&&s.conclusion===conclusion)return get(id);expected(s,raw);if(status==='CLOSED'){if(raw.confirmed!==true||s.rows.some(r=>r.counted===null))throw new SalesError('Đếm đủ các Size và xác nhận hoàn tất');if(capture().fingerprint!==s.fingerprint)throw new SalesError('Kho đã thay đổi trong lúc đếm. Hủy phiên này rồi tạo phiên mới để kiểm kê đúng mốc.',409);if(s.rows.some(r=>r.difference!==0&&!r.note.trim()))throw new SalesError('Ghi lý do cho từng Size có chênh lệch')}db.prepare('UPDATE stocktake_sessions SET status=?,version=version+1,closed_at=datetime(\'now\'),conclusion=? WHERE id=?').run(status,conclusion,id);return get(id)})},
 current(id:string){const s=get(id);return {...s,changedSinceStart:s.status==='OPEN'?capture().fingerprint!==s.fingerprint:false}}
 }
}
export function validateStocktakes(db:DatabaseSync){
 if(!db.prepare("SELECT 1 FROM sqlite_master WHERE name='stocktake_sessions'").get())return
 for(const s of db.prepare('SELECT * FROM stocktake_sessions').all()){
  if(s.input_hash!==digest(String(s.title))||! /^[a-f0-9]{64}$/.test(String(s.fingerprint))||!['OPEN','CLOSED','CANCELLED'].includes(String(s.status)))throw Error('Bằng chứng kiểm kê không hợp lệ')
  const rows=db.prepare('SELECT * FROM stocktake_rows WHERE session_id=? ORDER BY variant_id').all(s.id!)
  if(!rows.length||s.snapshot_hash!==digest(JSON.stringify(rows.map(r=>JSON.parse(String(r.snapshot))))))throw Error('Kiểm kê thiếu hoặc sai snapshot Size')
  for(const r of rows){const p=JSON.parse(String(r.snapshot));if(p.variantId!==r.variant_id||!Number.isSafeInteger(p.physical)||p.physical<0||!Number.isSafeInteger(p.ledger)||!Number.isSafeInteger(p.missing)||p.missing<0||!Number.isSafeInteger(p.retired)||p.retired<0||typeof p.sku!=='string'||typeof p.productName!=='string')throw Error('Snapshot kiểm kê sai');if(s.status==='CLOSED'&&(r.counted===null||(!String(r.note).trim()&&Number(r.counted)!==p.physical)))throw Error('Kiểm kê hoàn tất thiếu số đếm/lý do')}
  if(s.status!=='OPEN'&&(!s.closed_at||!String(s.conclusion).trim()))throw Error('Kiểm kê thiếu kết luận')
 }
}

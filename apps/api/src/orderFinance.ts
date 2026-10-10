import {DatabaseSync} from 'node:sqlite'
import {createHash,randomUUID} from 'node:crypto'
import {SalesError} from './salesDrafts.js'
export function bootstrapFinance(db:DatabaseSync){
 db.exec(`CREATE TABLE IF NOT EXISTS order_finance(order_id TEXT PRIMARY KEY REFERENCES sales_orders(id),version INTEGER NOT NULL CHECK(version>0),method TEXT NOT NULL CHECK(method IN ('COD','TRANSFER','CASH')),delivery TEXT NOT NULL CHECK(delivery IN ('NEW','SHIPPED','DELIVERED','FAILED')),tracking TEXT NOT NULL DEFAULT '');
 CREATE TABLE IF NOT EXISTS finance_entries(id TEXT PRIMARY KEY,order_id TEXT NOT NULL REFERENCES sales_orders(id),request_key TEXT NOT NULL UNIQUE,input_hash TEXT NOT NULL,payload TEXT NOT NULL,sequence INTEGER NOT NULL CHECK(sequence>0),kind TEXT NOT NULL CHECK(kind IN ('RECEIPT','REFUND','CREDIT')),amount INTEGER NOT NULL CHECK(amount BETWEEN 1 AND 9007199254740991),method TEXT NOT NULL CHECK(method IN ('COD','TRANSFER','CASH')),note TEXT NOT NULL,created_at TEXT NOT NULL DEFAULT(datetime('now')),UNIQUE(order_id,sequence));
 CREATE TABLE IF NOT EXISTS aftercare_cases(id TEXT PRIMARY KEY,order_id TEXT NOT NULL REFERENCES sales_orders(id),request_key TEXT NOT NULL UNIQUE,input_hash TEXT NOT NULL,kind TEXT NOT NULL CHECK(kind IN ('RETURN','EXCHANGE','SUPPORT')),note TEXT NOT NULL,status TEXT NOT NULL CHECK(status IN ('OPEN','RESOLVED')),resolution TEXT NOT NULL DEFAULT '',version INTEGER NOT NULL DEFAULT 1,created_at TEXT NOT NULL DEFAULT(datetime('now')),updated_at TEXT NOT NULL DEFAULT(datetime('now')));
 CREATE INDEX IF NOT EXISTS finance_order ON finance_entries(order_id,created_at);
 CREATE INDEX IF NOT EXISTS aftercare_order ON aftercare_cases(order_id,created_at);
 CREATE TRIGGER IF NOT EXISTS finance_no_update BEFORE UPDATE ON finance_entries BEGIN SELECT RAISE(ABORT,'Finance ledger is immutable'); END;
 CREATE TRIGGER IF NOT EXISTS finance_no_delete BEFORE DELETE ON finance_entries BEGIN SELECT RAISE(ABORT,'Finance ledger is immutable'); END;
 CREATE TRIGGER IF NOT EXISTS aftercare_identity_immutable BEFORE UPDATE OF id,order_id,request_key,input_hash,kind,note,created_at ON aftercare_cases BEGIN SELECT RAISE(ABORT,'Aftercare request is immutable'); END;
 CREATE TRIGGER IF NOT EXISTS aftercare_resolution_immutable BEFORE UPDATE ON aftercare_cases WHEN OLD.status='RESOLVED' OR NEW.status<>'RESOLVED' OR NEW.version<>OLD.version+1 BEGIN SELECT RAISE(ABORT,'Aftercare resolution is immutable'); END;
 CREATE TRIGGER IF NOT EXISTS aftercare_no_delete BEFORE DELETE ON aftercare_cases BEGIN SELECT RAISE(ABORT,'Aftercare history is immutable'); END;`)
}
const safe=(n:bigint)=>{if(n<0n||n>BigInt(Number.MAX_SAFE_INTEGER))throw new SalesError('Tổng tiền vượt giới hạn an toàn');return Number(n)}
const text=(v:unknown,max=500)=>{if(typeof v!=='string'||v.length>max)throw new SalesError('Nội dung không hợp lệ hoặc quá dài');return v.trim()}
const methods=['COD','TRANSFER','CASH'],deliveries=['NEW','SHIPPED','DELIVERED','FAILED']
export function financeService(db:DatabaseSync){
 const hasSales=!!db.prepare("SELECT 1 FROM sqlite_master WHERE name='sales_confirmations'").get()
 function order(id:string){const o=db.prepare('SELECT * FROM sales_orders WHERE id=?').get(id) as {discount:number;version:number;status:string}|undefined;if(!o)throw new SalesError('Không tìm thấy đơn',404);return {...o,status:hasSales&&db.prepare('SELECT 1 FROM sales_confirmations WHERE order_id=?').get(id)?'SOLD':String(o.status)}}
 function summary(id:string){
  const o=order(id),cfg=db.prepare('SELECT * FROM order_finance WHERE order_id=?').get(id)
  const items=db.prepare('SELECT unit_price FROM sales_order_images WHERE order_id=?').all(id)
  const shipping=Number(db.prepare('SELECT shipping_fee FROM order_contacts WHERE order_id=?').get(id)?.shipping_fee??0)
  const original=safe(items.reduce((n,i)=>n+BigInt(Number(i.unit_price)),0n)-BigInt(Number(o.discount))+BigInt(shipping))
  const entries=db.prepare('SELECT * FROM finance_entries WHERE order_id=? ORDER BY sequence').all(id)
  const sum=(kind:string)=>safe(entries.filter(e=>e.kind===kind).reduce((n,e)=>n+BigInt(Number(e.amount)),0n))
  const receipts=sum('RECEIPT'),refunds=sum('REFUND'),credit=sum('CREDIT'),netCollected=receipts-refunds,adjustedTotal=original-credit
  if(netCollected<0||adjustedTotal<0)throw new SalesError('Sổ thu/hoàn tiền cần đối soát',409)
  const due=Math.max(0,adjustedTotal-netCollected),refundDue=Math.max(0,netCollected-adjustedTotal)
  return {orderId:id,orderVersion:Number(o.version),orderStatus:o.status,version:Number(cfg?.version??0),method:String(cfg?.method??'COD'),delivery:String(cfg?.delivery??'NEW'),tracking:String(cfg?.tracking??''),originalTotal:original,adjustedTotal,receipts,refunds,credit,netCollected,due,refundDue,paymentStatus:refundDue?'REFUND_DUE':due?netCollected?'PARTIAL':'UNPAID':'PAID',entries,cases:db.prepare('SELECT * FROM aftercare_cases WHERE order_id=? ORDER BY created_at DESC,id').all(id)}
 }
 function tx<T>(fn:()=>T){db.exec('BEGIN IMMEDIATE');try{const r=fn();db.exec('COMMIT');return r}catch(e){db.exec('ROLLBACK');throw e}}
 function expected(s:ReturnType<typeof summary>,raw:any){if(raw.version!==s.version||raw.orderVersion!==s.orderVersion)throw new SalesError('Đơn hoặc sổ thanh toán đã thay đổi. Mở lại trước khi ghi.',409)}
 function bump(s:ReturnType<typeof summary>,method=s.method,delivery=s.delivery,tracking=s.tracking){db.prepare('INSERT INTO order_finance(order_id,version,method,delivery,tracking) VALUES(?,?,?,?,?) ON CONFLICT(order_id) DO UPDATE SET version=excluded.version,method=excluded.method,delivery=excluded.delivery,tracking=excluded.tracking').run(s.orderId,s.version+1,method,delivery,tracking)}
 function requestKey(key:unknown){if(typeof key!=='string'||! /^[A-Za-z0-9_-]{16,100}$/.test(key))throw new SalesError('Thiếu mã yêu cầu hợp lệ');return key}
 return {summary,
 configure(id:string,raw:any){return tx(()=>{const s=summary(id);if(raw.version===s.version-1&&raw.orderVersion===s.orderVersion&&raw.method===s.method&&raw.delivery===s.delivery&&raw.tracking===s.tracking)return s;expected(s,raw);if(s.orderStatus==='CANCELLED_DRAFT')throw new SalesError('Đơn đã hủy');if(!methods.includes(raw.method)||!deliveries.includes(raw.delivery))throw new SalesError('Hình thức thu hoặc giao hàng không hợp lệ');if(s.orderStatus!=='SOLD'&&raw.delivery!=='NEW')throw new SalesError('Chỉ ghi trạng thái giao hàng sau khi xác nhận bán');bump(s,raw.method,raw.delivery,text(raw.tracking,150));return summary(id)})},
 record(id:string,raw:any,key:unknown){
  const k=requestKey(key),kind=raw.kind,amount=raw.amount,method=raw.method,note=text(raw.note)
  if(!['RECEIPT','REFUND','CREDIT'].includes(kind)||!Number.isSafeInteger(amount)||amount<=0||!methods.includes(method)||!note)throw new SalesError('Nhập loại chứng từ, số tiền nguyên dương, hình thức và nội dung')
  const payload=JSON.stringify({id,kind,amount,method,note,version:raw.version,orderVersion:raw.orderVersion}),hash=createHash('sha256').update(payload).digest('hex')
  return tx(()=>{
   const old=db.prepare('SELECT * FROM finance_entries WHERE request_key=?').get(k)
   if(old){if(old.input_hash!==hash)throw new SalesError('Mã yêu cầu đã dùng với nội dung khác',409);return {...summary(id),entryId:old.id,replayed:true}}
   const s=summary(id);expected(s,raw);if(s.orderStatus==='CANCELLED_DRAFT')throw new SalesError('Đơn đã hủy, không ghi chứng từ mới')
   if(kind==='RECEIPT'&&amount>s.due)throw new SalesError('Tiền thu vượt số còn phải thu')
   if(kind==='REFUND'&&amount>s.netCollected)throw new SalesError('Tiền hoàn vượt số shop đang giữ')
   if(kind==='CREDIT'&&(s.orderStatus!=='SOLD'||amount>s.adjustedTotal))throw new SalesError('Điều chỉnh giảm chỉ cho đơn đã bán, không vượt giá trị còn lại')
   safe(BigInt(kind==='RECEIPT'?s.receipts:kind==='REFUND'?s.refunds:s.credit)+BigInt(amount))
   const entryId=randomUUID();db.prepare('INSERT INTO finance_entries(id,order_id,request_key,input_hash,payload,sequence,kind,amount,method,note) VALUES(?,?,?,?,?,?,?,?,?,?)').run(entryId,id,k,hash,payload,s.version+1,kind,amount,method,note);bump(s);return {...summary(id),entryId,replayed:false}
  })
 },
 createCase(id:string,raw:any,key:unknown){const k=requestKey(key),note=text(raw.note),kind=raw.kind;if(!['RETURN','EXCHANGE','SUPPORT'].includes(kind)||!note)throw new SalesError('Chọn loại hậu mãi và ghi nội dung');const hash=createHash('sha256').update(JSON.stringify({id,kind,note})).digest('hex');return tx(()=>{const old=db.prepare('SELECT * FROM aftercare_cases WHERE request_key=?').get(k);if(old){if(old.input_hash!==hash)throw new SalesError('Mã yêu cầu hậu mãi đã dùng',409);return summary(id)}const s=summary(id);expected(s,raw);if(s.orderStatus!=='SOLD')throw new SalesError('Hậu mãi áp dụng cho đơn đã bán');db.prepare('INSERT INTO aftercare_cases(id,order_id,request_key,input_hash,kind,note,status) VALUES(?,?,?,?,?,?,?)').run(randomUUID(),id,k,hash,kind,note,'OPEN');bump(s);return summary(id)})},
 resolveCase(id:string,caseId:string,raw:any){return tx(()=>{const s=summary(id);const c=db.prepare('SELECT * FROM aftercare_cases WHERE id=? AND order_id=?').get(caseId,id);if(c?.status==='RESOLVED'&&Number(c.version)===raw.caseVersion+1&&c.resolution===raw.resolution&&raw.orderVersion===s.orderVersion)return s;expected(s,raw);if(!c||c.status!=='OPEN'||raw.caseVersion!==c.version)throw new SalesError('Yêu cầu đã thay đổi hoặc đã xử lý',409);const resolution=text(raw.resolution);if(!resolution)throw new SalesError('Ghi kết quả xử lý');db.prepare("UPDATE aftercare_cases SET status='RESOLVED',resolution=?,version=version+1,updated_at=datetime('now') WHERE id=?").run(resolution,caseId);bump(s);return summary(id)})},
 debts(){const ids=db.prepare("SELECT id FROM sales_orders WHERE status='DRAFT' ORDER BY created_at DESC,id").all();return ids.map(r=>{const s=summary(String(r.id)),c=db.prepare('SELECT recipient_name,phone,customer_id FROM order_contacts WHERE order_id=?').get(r.id!);return {...s,customerId:c?.customer_id??null,recipientName:String(c?.recipient_name??''),phone:String(c?.phone??'')}}).filter(s=>s.orderStatus==='SOLD'&&(s.due>0||s.refundDue>0))}
 }
}
export function assertFinanceEdit(db:DatabaseSync,id:string,payableTotal:number,cancelling=false){
 if(!db.prepare("SELECT 1 FROM sqlite_master WHERE name='finance_entries'").get())return
 const entries=db.prepare('SELECT kind,amount FROM finance_entries WHERE order_id=?').all(id)
 const net=entries.reduce((n,e)=>n+(e.kind==='RECEIPT'?BigInt(Number(e.amount)):e.kind==='REFUND'?-BigInt(Number(e.amount)):0n),0n)
 const credits=entries.filter(e=>e.kind==='CREDIT').reduce((n,e)=>n+BigInt(Number(e.amount)),0n)
 if(cancelling&&net>0n)throw new SalesError('Đơn đã thu tiền. Ghi hoàn tiền trước khi hủy nháp.',409)
 if(!cancelling&&BigInt(payableTotal)<net+credits)throw new SalesError('Giá trị đơn mới thấp hơn tiền đã thu/điều chỉnh. Ghi hoàn tiền trước khi giảm giá trị đơn.',409)
}
export function validateFinance(db:DatabaseSync){
 if(!db.prepare("SELECT 1 FROM sqlite_master WHERE name='finance_entries'").get())return
 for(const e of db.prepare('SELECT * FROM finance_entries').all()){
  const p=JSON.parse(String(e.payload));if(createHash('sha256').update(String(e.payload)).digest('hex')!==e.input_hash||p.id!==e.order_id||p.kind!==e.kind||p.amount!==e.amount||p.method!==e.method||p.note!==e.note||p.version+1!==e.sequence)throw Error('Chứng từ thu/hoàn tiền không khớp bằng chứng')
 }
 const service=financeService(db)
 for(const o of db.prepare('SELECT DISTINCT order_id FROM finance_entries').all()){const s=service.summary(String(o.order_id));const max=Number(db.prepare('SELECT MAX(sequence) n FROM finance_entries WHERE order_id=?').get(o.order_id!)!.n);if(s.version<max)throw Error('Revision tài chính thấp hơn chứng từ đã ghi')}
 for(const c of db.prepare('SELECT * FROM aftercare_cases').all()){const hash=createHash('sha256').update(JSON.stringify({id:c.order_id,kind:c.kind,note:c.note})).digest('hex');if(hash!==c.input_hash||Number(c.version)!==(c.status==='OPEN'?1:2))throw Error('Yêu cầu hậu mãi không khớp bằng chứng')}
}

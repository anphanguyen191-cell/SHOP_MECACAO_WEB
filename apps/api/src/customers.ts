import {DatabaseSync} from 'node:sqlite'
import {randomUUID} from 'node:crypto'
import {SalesError} from './salesDrafts.js'

export function bootstrapCustomers(db:DatabaseSync){
 db.exec(`CREATE TABLE IF NOT EXISTS shop_customers(
 id TEXT PRIMARY KEY,name TEXT NOT NULL,phone TEXT NOT NULL,phone_key TEXT NOT NULL,
 address TEXT NOT NULL,note TEXT NOT NULL,version INTEGER NOT NULL DEFAULT 1,
 created_at TEXT NOT NULL DEFAULT (datetime('now')),updated_at TEXT NOT NULL DEFAULT (datetime('now')));
 CREATE INDEX IF NOT EXISTS idx_customers_phone ON shop_customers(phone_key);
 CREATE TABLE IF NOT EXISTS order_contacts(
 order_id TEXT PRIMARY KEY REFERENCES sales_orders(id),customer_id TEXT REFERENCES shop_customers(id),
 recipient_name TEXT NOT NULL DEFAULT '',phone TEXT NOT NULL DEFAULT '',address TEXT NOT NULL DEFAULT '',
 shipping_fee INTEGER NOT NULL DEFAULT 0 CHECK(shipping_fee BETWEEN 0 AND 9007199254740991));`)
 if(db.prepare("SELECT 1 FROM sqlite_master WHERE name='sales_confirmations'").get())db.exec(`
 CREATE TRIGGER IF NOT EXISTS sold_contact_update BEFORE UPDATE ON order_contacts WHEN EXISTS(SELECT 1 FROM sales_confirmations WHERE order_id=OLD.order_id) BEGIN SELECT RAISE(ABORT,'Sold contact is immutable'); END;
 CREATE TRIGGER IF NOT EXISTS sold_contact_delete BEFORE DELETE ON order_contacts WHEN EXISTS(SELECT 1 FROM sales_confirmations WHERE order_id=OLD.order_id) BEGIN SELECT RAISE(ABORT,'Sold contact is immutable'); END;`)

}
export function text(value:unknown,label:string,max:number){if(typeof value!=='string'||value.length>max)throw new SalesError(label+' tối đa '+max+' ký tự');return value.trim()}
export function customerService(db:DatabaseSync){
 const get=(id:string)=>{const row=db.prepare('SELECT * FROM shop_customers WHERE id=?').get(id);if(!row)throw new SalesError('Không tìm thấy khách hàng',404);return row}
 return {get,list(q=''){if(q.length>100)throw new SalesError('Từ khóa quá dài');const needle='%'+q.trim()+'%';return db.prepare('SELECT * FROM shop_customers WHERE name LIKE ? OR phone LIKE ? OR phone_key LIKE ? ORDER BY updated_at DESC,id LIMIT 200').all(needle,needle,needle)},
 save(raw:any,id?:string){
 const name=text(raw?.name,'Tên khách',100),phone=text(raw?.phone,'Điện thoại',30),address=text(raw?.address,'Địa chỉ',500),note=text(raw?.note,'Ghi chú',500)
 if(!name)throw new SalesError('Nhập tên khách hàng')
 if(phone&&!/^[+0-9().\s-]{5,30}$/.test(phone))throw new SalesError('Số điện thoại không hợp lệ')
 let key=phone.replace(/\D/g,'');if(key.startsWith('84'))key='0'+key.slice(2)
 const duplicate=key?db.prepare('SELECT id,name,phone FROM shop_customers WHERE phone_key=? AND id<>?').all(key,id??''):[]
 if(duplicate.length&&raw.allowDuplicate!==true)throw new SalesError('Số điện thoại đã có khách hàng. Chọn khách cũ hoặc xác nhận tạo riêng.',409,{code:'CUSTOMER_DUPLICATE',duplicates:duplicate})
 if(id){const old=get(id);if(raw.version!==old.version)throw new SalesError('Khách đã thay đổi. Mở lại trước khi lưu.',409);db.prepare("UPDATE shop_customers SET name=?,phone=?,phone_key=?,address=?,note=?,version=version+1,updated_at=datetime('now') WHERE id=?").run(name,phone,key,address,note,id)}
 else{id=randomUUID();db.prepare('INSERT INTO shop_customers(id,name,phone,phone_key,address,note) VALUES(?,?,?,?,?,?)').run(id,name,phone,key,address,note)}
 return get(id)
 }}
}
export function contactInput(db:DatabaseSync,raw:any){
 if(!raw||typeof raw!=='object')throw new SalesError('Thông tin giao hàng không hợp lệ')
 const customerId=raw.customerId??null
 if(customerId!==null&&(typeof customerId!=='string'||!db.prepare('SELECT 1 FROM shop_customers WHERE id=?').get(customerId)))throw new SalesError('Khách hàng không còn tồn tại')
 const recipientName=text(raw.recipientName,'Người nhận',100),phone=text(raw.phone,'Điện thoại',30),address=text(raw.address,'Địa chỉ',500)
 if(phone&&!/^[+0-9().\s-]{5,30}$/.test(phone))throw new SalesError('Số điện thoại giao hàng không hợp lệ')
 const shippingFee=raw.shippingFee
 if(!Number.isSafeInteger(shippingFee)||shippingFee<0)throw new SalesError('Phí ship phải là số đồng nguyên không âm')
 return {customerId,recipientName,phone,address,shippingFee}
}

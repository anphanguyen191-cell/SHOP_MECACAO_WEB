import {DatabaseSync} from 'node:sqlite'
export function rejectSoldSource(db:DatabaseSync,sha:string){if(db.prepare("SELECT 1 FROM sqlite_master WHERE name='sales_units'").get()&&db.prepare('SELECT 1 FROM sales_units WHERE source_hash=?').get(sha))throw Error('Ảnh trùng hàng đã bán. Cần kiểm tra nghiệp vụ hoàn hàng; không tự nhập lại thành tồn mới.')}

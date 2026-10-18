import fs from 'node:fs'
import path from 'node:path'
import type {DatabaseSync} from 'node:sqlite'

export const STOCK_RETURN_LOCK='.mecacao-v2-sales-return-pending.json'
export function hasStockReturns(db:DatabaseSync){return !!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='stock_return_operations'").get()}
export function pendingStockReturn(db:DatabaseSync,root:string){return fs.existsSync(path.join(root,STOCK_RETURN_LOCK))||(hasStockReturns(db)&&!!db.prepare("SELECT 1 FROM stock_return_operations WHERE status='PREPARED'").get())}
export function bootstrapStockReturns(db:DatabaseSync){
 db.exec(`CREATE TABLE IF NOT EXISTS stock_return_operations(
 id TEXT PRIMARY KEY,order_id TEXT NOT NULL REFERENCES sales_confirmations(order_id),request_key TEXT NOT NULL UNIQUE,
 input_hash TEXT NOT NULL,payload TEXT NOT NULL,payload_hash TEXT NOT NULL,
 status TEXT NOT NULL CHECK(status IN ('PREPARED','RETURNED','ROLLED_BACK')),created_at TEXT NOT NULL DEFAULT(datetime('now')));
 CREATE TABLE IF NOT EXISTS stock_return_units(
 source_image_id INTEGER PRIMARY KEY REFERENCES sales_units(image_id),operation_id TEXT NOT NULL REFERENCES stock_return_operations(id),
 new_image_id INTEGER NOT NULL UNIQUE REFERENCES product_images(id),transaction_id INTEGER NOT NULL UNIQUE REFERENCES inventory_transactions(id));
 CREATE TRIGGER IF NOT EXISTS stock_return_units_no_update BEFORE UPDATE ON stock_return_units BEGIN SELECT RAISE(ABORT,'Chứng từ nhận lại bất biến');END;
 CREATE TRIGGER IF NOT EXISTS stock_return_units_no_delete BEFORE DELETE ON stock_return_units BEGIN SELECT RAISE(ABORT,'Chứng từ nhận lại bất biến');END;
 CREATE TRIGGER IF NOT EXISTS stock_return_operations_no_delete BEFORE DELETE ON stock_return_operations BEGIN SELECT RAISE(ABORT,'Chứng từ nhận lại bất biến');END;
 CREATE TRIGGER IF NOT EXISTS stock_return_operations_guard BEFORE UPDATE ON stock_return_operations
 WHEN OLD.status<>'PREPARED' OR NEW.id<>OLD.id OR NEW.order_id<>OLD.order_id OR NEW.request_key<>OLD.request_key OR NEW.input_hash<>OLD.input_hash OR NEW.payload<>OLD.payload OR NEW.payload_hash<>OLD.payload_hash OR NEW.created_at<>OLD.created_at OR NEW.status NOT IN ('RETURNED','ROLLED_BACK')
 BEGIN SELECT RAISE(ABORT,'Chứng từ nhận lại bất biến');END;`)
}

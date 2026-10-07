import { DatabaseSync } from 'node:sqlite'

export const TARGET_SCHEMA=110

function metadataExists(db:DatabaseSync){return Boolean(db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='app_metadata'").get())}
export function readSchemaVersion(db:DatabaseSync){
 if(!metadataExists(db))return 0
 const row=db.prepare("SELECT value FROM app_metadata WHERE key='schema_version'").get() as {value?:string}|undefined
 const raw=row?.value;if(raw===undefined)return 0
 if(!/^\d+$/.test(raw))throw new Error('schema_version không hợp lệ; dừng để bảo vệ dữ liệu')
 return Number(raw)
}
export function assertDatabaseIntegrity(db:DatabaseSync){
 const integrity=db.prepare('PRAGMA integrity_check').get() as {integrity_check?:string}|undefined
 if(integrity?.integrity_check!=='ok')throw new Error('SQLite integrity_check thất bại')
 if(db.prepare('PRAGMA foreign_key_check').all().length)throw new Error('SQLite foreign_key_check phát hiện lỗi quan hệ')
}
function createV100(db:DatabaseSync){
 db.exec(`
 CREATE TABLE app_metadata(key TEXT PRIMARY KEY,value TEXT NOT NULL,updated_at TEXT NOT NULL DEFAULT (datetime('now')));
 CREATE TABLE categories(id INTEGER PRIMARY KEY AUTOINCREMENT,name TEXT NOT NULL UNIQUE,status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','inactive')),created_at TEXT NOT NULL DEFAULT (datetime('now')),updated_at TEXT NOT NULL DEFAULT (datetime('now')));
 CREATE TABLE products(id INTEGER PRIMARY KEY AUTOINCREMENT,product_code TEXT NOT NULL UNIQUE,name TEXT NOT NULL,category_id INTEGER,cost_price INTEGER NOT NULL DEFAULT 0 CHECK(cost_price>=0),sale_price INTEGER NOT NULL DEFAULT 0 CHECK(sale_price>=0),description TEXT,status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','inactive')),created_at TEXT NOT NULL DEFAULT (datetime('now')),updated_at TEXT NOT NULL DEFAULT (datetime('now')),FOREIGN KEY(category_id) REFERENCES categories(id));
 CREATE TABLE product_variants(id INTEGER PRIMARY KEY AUTOINCREMENT,product_id INTEGER NOT NULL,sku TEXT NOT NULL UNIQUE,size TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','inactive')),created_at TEXT NOT NULL DEFAULT (datetime('now')),updated_at TEXT NOT NULL DEFAULT (datetime('now')),UNIQUE(product_id,size),FOREIGN KEY(product_id) REFERENCES products(id));
 CREATE TABLE product_images(id INTEGER PRIMARY KEY AUTOINCREMENT,product_id INTEGER NOT NULL,variant_id INTEGER,file_path TEXT NOT NULL,sort_order INTEGER NOT NULL DEFAULT 0,is_primary INTEGER NOT NULL DEFAULT 0 CHECK(is_primary IN (0,1)),created_at TEXT NOT NULL DEFAULT (datetime('now')),FOREIGN KEY(product_id) REFERENCES products(id),FOREIGN KEY(variant_id) REFERENCES product_variants(id));
 CREATE TABLE inventory_transactions(id INTEGER PRIMARY KEY AUTOINCREMENT,variant_id INTEGER NOT NULL,transaction_type TEXT NOT NULL CHECK(transaction_type IN ('OPENING','IMPORT','ADJUST_PLUS','ADJUST_MINUS')),quantity INTEGER NOT NULL CHECK(quantity>0),unit_cost INTEGER CHECK(unit_cost IS NULL OR unit_cost>=0),note TEXT,created_at TEXT NOT NULL DEFAULT (datetime('now')),FOREIGN KEY(variant_id) REFERENCES product_variants(id));
 CREATE TABLE app_settings(key TEXT PRIMARY KEY,value TEXT NOT NULL,updated_at TEXT NOT NULL DEFAULT (datetime('now')));
 CREATE INDEX idx_products_name ON products(name); CREATE INDEX idx_variants_product ON product_variants(product_id); CREATE INDEX idx_variants_size ON product_variants(size); CREATE INDEX idx_inventory_variant ON inventory_transactions(variant_id); CREATE INDEX idx_images_product_variant ON product_images(product_id,variant_id);
 CREATE VIEW inventory_stock AS SELECT variant_id,COALESCE(SUM(CASE WHEN transaction_type IN ('OPENING','IMPORT','ADJUST_PLUS') THEN quantity WHEN transaction_type='ADJUST_MINUS' THEN -quantity ELSE 0 END),0) AS stock FROM inventory_transactions GROUP BY variant_id;
 INSERT INTO app_metadata(key,value) VALUES('schema_version','100'); INSERT INTO app_metadata(key,value) VALUES('app_version','1.0.0-dev'); INSERT INTO app_settings(key,value) VALUES('low_stock_threshold','2');
 `)
}
function migrate100to110(db:DatabaseSync){
 db.exec(`
 ALTER TABLE product_variants ADD COLUMN cost_price INTEGER NOT NULL DEFAULT 0 CHECK(cost_price>=0);
 ALTER TABLE product_variants ADD COLUMN sale_price INTEGER NOT NULL DEFAULT 0 CHECK(sale_price>=0);
 UPDATE product_variants SET cost_price=(SELECT cost_price FROM products WHERE products.id=product_variants.product_id),sale_price=(SELECT sale_price FROM products WHERE products.id=product_variants.product_id);
 UPDATE app_metadata SET value='110',updated_at=datetime('now') WHERE key='schema_version';
 `)
}
export function bootstrapV100(db:DatabaseSync){
 const current=readSchemaVersion(db)
 if(current>TARGET_SCHEMA)throw new Error('Database schema mới hơn phiên bản ứng dụng; dừng để bảo vệ dữ liệu')
 if(current===TARGET_SCHEMA){assertDatabaseIntegrity(db);return current}
 if(current!==0&&current!==100)throw new Error('Chưa có migration được duyệt cho schema '+current)
 if(current===0){
  const hasBusinessTables=Boolean(db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name IN ('products','product_variants','inventory_transactions') LIMIT 1").get())
  if(hasBusinessTables)throw new Error('Phát hiện database legacy chưa có schema_version; không tự động ghi đè')
 }
 db.exec('BEGIN IMMEDIATE')
 try{if(current===0)createV100(db);migrate100to110(db);db.exec('COMMIT')}catch(e){db.exec('ROLLBACK');throw e}
 assertDatabaseIntegrity(db);return TARGET_SCHEMA
}

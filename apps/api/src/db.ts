import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { DatabaseSync } from 'node:sqlite'

const here = path.dirname(fileURLToPath(import.meta.url))
const projectRoot = path.resolve(here, '../../..')
const dataDir = path.join(projectRoot, 'data')
fs.mkdirSync(dataDir, { recursive: true })

const dbPath = process.env.SHOP_DB_PATH ? path.resolve(process.env.SHOP_DB_PATH) : path.join(dataDir, 'shop.db')
fs.mkdirSync(path.dirname(dbPath), { recursive: true })
export const db = new DatabaseSync(dbPath)

db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;

  CREATE TABLE IF NOT EXISTS app_metadata (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','inactive')),
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    product_code TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    category_id INTEGER,
    cost_price INTEGER NOT NULL DEFAULT 0 CHECK(cost_price >= 0),
    sale_price INTEGER NOT NULL DEFAULT 0 CHECK(sale_price >= 0),
    description TEXT,
    status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','inactive')),
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY(category_id) REFERENCES categories(id)
  );

  CREATE TABLE IF NOT EXISTS product_variants (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id INTEGER NOT NULL,
    sku TEXT NOT NULL UNIQUE,
    size TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','inactive')),
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(product_id, size),
    FOREIGN KEY(product_id) REFERENCES products(id)
  );

  CREATE TABLE IF NOT EXISTS product_images (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id INTEGER NOT NULL,
    variant_id INTEGER,
    file_path TEXT NOT NULL,
    sort_order INTEGER NOT NULL DEFAULT 0,
    is_primary INTEGER NOT NULL DEFAULT 0 CHECK(is_primary IN (0,1)),
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY(product_id) REFERENCES products(id),
    FOREIGN KEY(variant_id) REFERENCES product_variants(id)
  );

  CREATE TABLE IF NOT EXISTS inventory_transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    variant_id INTEGER NOT NULL,
    transaction_type TEXT NOT NULL CHECK(transaction_type IN ('OPENING','IMPORT','ADJUST_PLUS','ADJUST_MINUS')),
    quantity INTEGER NOT NULL CHECK(quantity > 0),
    unit_cost INTEGER CHECK(unit_cost IS NULL OR unit_cost >= 0),
    note TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY(variant_id) REFERENCES product_variants(id)
  );

  CREATE TABLE IF NOT EXISTS app_settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_products_name ON products(name);
  CREATE INDEX IF NOT EXISTS idx_variants_product ON product_variants(product_id);
  CREATE INDEX IF NOT EXISTS idx_variants_size ON product_variants(size);
  CREATE INDEX IF NOT EXISTS idx_inventory_variant ON inventory_transactions(variant_id);
  CREATE INDEX IF NOT EXISTS idx_images_product_variant ON product_images(product_id, variant_id);

  CREATE VIEW IF NOT EXISTS inventory_stock AS
  SELECT
    variant_id,
    COALESCE(SUM(
      CASE
        WHEN transaction_type IN ('OPENING','IMPORT','ADJUST_PLUS') THEN quantity
        WHEN transaction_type = 'ADJUST_MINUS' THEN -quantity
        ELSE 0
      END
    ), 0) AS stock
  FROM inventory_transactions
  GROUP BY variant_id;
`)

const upsert = db.prepare(`
  INSERT INTO app_metadata (key, value, updated_at)
  VALUES (?, ?, datetime('now'))
  ON CONFLICT(key) DO UPDATE SET
    value = excluded.value,
    updated_at = datetime('now')
`)

const currentSchema = Number((db.prepare("SELECT value FROM app_metadata WHERE key='schema_version'").get() as { value?: string } | undefined)?.value ?? 0)
if (currentSchema > 100) throw new Error('Database schema mới hơn phiên bản ứng dụng; dừng để bảo vệ dữ liệu')
upsert.run('schema_version', '100')
upsert.run('app_version', '1.0.0-dev')

const settingsUpsert = db.prepare(`
  INSERT INTO app_settings (key, value, updated_at)
  VALUES (?, ?, datetime('now'))
  ON CONFLICT(key) DO NOTHING
`)
settingsUpsert.run('low_stock_threshold', '2')

export { dbPath }

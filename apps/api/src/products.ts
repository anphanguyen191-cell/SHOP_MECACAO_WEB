import fs from 'node:fs'
import { db } from './db.js'

export type VariantInput = { size: string; sku?: string; openingStock?: number; costPrice?: number; salePrice?: number }
export type ProductInput = {
  name: string
  productCode?: string
  category?: string
  costPrice?: number
  salePrice?: number
  description?: string
  variants: VariantInput[]
}

function slug(value: string) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D')
    .replace(/[^a-zA-Z0-9]+/g, '').toUpperCase()
}

export function suggestProductCode(name: string) {
  const prefix = slug(name).slice(0, 2) || 'SP'
  let n = 1
  const exists = db.prepare('SELECT 1 FROM products WHERE product_code = ?')
  while (exists.get(prefix + String(n).padStart(4, '0'))) n++
  return prefix + String(n).padStart(4, '0')
}

export function suggestSku(productCode: string, size: string) {
  const base = `${slug(productCode) || 'SP'}-${slug(size).slice(0, 12) || 'SIZE'}`
  const exists = db.prepare('SELECT 1 FROM product_variants WHERE sku = ?')
  if (!exists.get(base)) return base
  let n = 2
  while (exists.get(`${base}-${n}`)) n++
  return `${base}-${n}`
}

function physicalStock(variantId:number){const images=db.prepare('SELECT file_path FROM product_images WHERE variant_id=?').all(variantId) as Array<{file_path:string}>;return images.filter(x=>fs.existsSync(x.file_path)).length}

export function listProducts(search = '') {
  const q = `%${search.trim()}%`
  const rows=db.prepare(`
    SELECT p.id, p.product_code, p.name, p.cost_price, p.sale_price, p.status,
           c.name AS category,
           (SELECT pi.id FROM product_images pi WHERE pi.product_id=p.id ORDER BY pi.is_primary DESC,pi.sort_order,pi.id LIMIT 1) AS image_id,
           COUNT(DISTINCT v.id) AS variant_count,
           COALESCE(SUM(s.stock), 0) AS total_stock
    FROM products p
    LEFT JOIN categories c ON c.id = p.category_id
    LEFT JOIN product_variants v ON v.product_id = p.id
    LEFT JOIN inventory_stock s ON s.variant_id = v.id
    WHERE (? = '%%' OR p.name LIKE ? OR p.product_code LIKE ? OR v.sku LIKE ?)
    GROUP BY p.id
    ORDER BY p.id DESC
  `).all(q, q, q, q) as Array<any>
  const byProduct=db.prepare('SELECT id FROM product_variants WHERE product_id=? AND status=\'active\'')
  return rows.map(p=>({...p,ledger_stock:p.total_stock,total_stock:(byProduct.all(p.id) as Array<{id:number}>).reduce((n,v)=>n+physicalStock(v.id),0)}))
}

export function getProduct(id: number) {
  const product = db.prepare(`
    SELECT p.*, c.name AS category
    FROM products p LEFT JOIN categories c ON c.id = p.category_id
    WHERE p.id = ?
  `).get(id)
  if (!product) return null
  const variants = db.prepare(`
    SELECT v.*, COALESCE(s.stock, 0) AS stock
    FROM product_variants v
    LEFT JOIN inventory_stock s ON s.variant_id = v.id
    WHERE v.product_id = ? ORDER BY v.id
  `).all(id) as Array<any>
  const physicalVariants=variants.map(v=>({...v,ledger_stock:v.stock,stock:physicalStock(v.id)}))
  const images = db.prepare('SELECT * FROM product_images WHERE product_id = ? ORDER BY sort_order, id').all(id)
  return { product, variants:physicalVariants, images }
}

export function createProduct(input: ProductInput) {
  if (!input.name?.trim()) throw new Error('Tên sản phẩm là bắt buộc')
  if (!Array.isArray(input.variants) || input.variants.length === 0) throw new Error('Cần ít nhất một size')
  if (!Number.isFinite(input.costPrice ?? 0) || (input.costPrice ?? 0) < 0) throw new Error('Giá nhập không hợp lệ')
  if (!Number.isFinite(input.salePrice ?? 0) || (input.salePrice ?? 0) < 0) throw new Error('Giá bán không hợp lệ')
  const sizes = input.variants.map(v => v.size.trim())
  if (sizes.some(s => !s)) throw new Error('Size không được để trống')
  if (new Set(sizes.map(s => s.toLowerCase())).size !== sizes.length) throw new Error('Size bị trùng')

  db.exec('BEGIN IMMEDIATE')
  try {
    let categoryId: number | null = null
    if (input.category?.trim()) {
      db.prepare('INSERT INTO categories(name) VALUES (?) ON CONFLICT(name) DO NOTHING').run(input.category.trim())
      const cat = db.prepare('SELECT id FROM categories WHERE name = ?').get(input.category.trim()) as { id: number }
      categoryId = cat.id
    }

    const productCode = (input.productCode?.trim() || suggestProductCode(input.name)).toUpperCase()
    const result = db.prepare(`
      INSERT INTO products(product_code,name,category_id,cost_price,sale_price,description)
      VALUES(?,?,?,?,?,?)
    `).run(productCode, input.name.trim(), categoryId, input.costPrice ?? 0, input.salePrice ?? 0, input.description ?? null)
    const productId = Number(result.lastInsertRowid)

    const insertVariant = db.prepare('INSERT INTO product_variants(product_id,sku,size,cost_price,sale_price) VALUES(?,?,?,?,?)')
    const opening = db.prepare(`
      INSERT INTO inventory_transactions(variant_id,transaction_type,quantity,unit_cost,note)
      VALUES(?,'OPENING',?,?,?)
    `)
    for (const item of input.variants) {
      const size = item.size.trim()
      const sku = (item.sku?.trim() || suggestSku(productCode, size)).toUpperCase()
      const variantCost=item.costPrice ?? input.costPrice ?? 0,variantSale=item.salePrice ?? input.salePrice ?? 0
      if(!Number.isFinite(variantCost)||variantCost<0||!Number.isFinite(variantSale)||variantSale<0)throw new Error('Giá theo size không hợp lệ')
      const vr = insertVariant.run(productId, sku, size, variantCost, variantSale)
      const qty = item.openingStock ?? 0
      if (!Number.isFinite(qty) || !Number.isInteger(qty) || qty < 0) throw new Error('Tồn đầu phải là số nguyên không âm')
      if (qty > 0) opening.run(Number(vr.lastInsertRowid), qty, variantCost, 'Tồn đầu')
    }
    db.exec('COMMIT')
    return getProduct(productId)
  } catch (error) {
    db.exec('ROLLBACK')
    throw error
  }
}

export function listCategories() {
  return db.prepare("SELECT id,name,status FROM categories WHERE status='active' ORDER BY name").all()
}

export function setProductStatus(id: number, status: 'active'|'inactive') {
  if (!Number.isInteger(id) || id <= 0) throw new Error('Sản phẩm không hợp lệ')
  if (status !== 'active' && status !== 'inactive') throw new Error('Trạng thái không hợp lệ')
  const result = db.prepare("UPDATE products SET status=?,updated_at=datetime('now') WHERE id=?").run(status,id)
  if (Number(result.changes) !== 1) throw new Error('Không tìm thấy sản phẩm')
  return getProduct(id)
}

export function updateVariantPricing(id:number,costPrice:number,salePrice:number){
 if(!Number.isInteger(id)||id<=0)throw new Error('SKU không hợp lệ')
 if(!Number.isFinite(costPrice)||costPrice<0||!Number.isFinite(salePrice)||salePrice<0)throw new Error('Giá theo size không hợp lệ')
 const r=db.prepare("UPDATE product_variants SET cost_price=?,sale_price=?,updated_at=datetime('now') WHERE id=?").run(costPrice,salePrice,id)
 if(Number(r.changes)!==1)throw new Error('Không tìm thấy SKU')
 return db.prepare('SELECT * FROM product_variants WHERE id=?').get(id)
}

import { db } from './db.js'

export type VariantInput = { size: string; sku?: string; openingStock?: number }
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
  const row = db.prepare('SELECT COUNT(*) AS total FROM products WHERE product_code LIKE ?').get(prefix + '%') as { total: number }
  return prefix + String(row.total + 1).padStart(4, '0')
}

export function suggestSku(productCode: string, size: string) {
  const sizePart = slug(size).slice(0, 12) || 'SIZE'
  return `${productCode}-${sizePart}`
}

export function listProducts(search = '') {
  const q = `%${search.trim()}%`
  return db.prepare(`
    SELECT p.id, p.product_code, p.name, p.cost_price, p.sale_price, p.status,
           c.name AS category,
           COUNT(DISTINCT v.id) AS variant_count,
           COALESCE(SUM(s.stock), 0) AS total_stock
    FROM products p
    LEFT JOIN categories c ON c.id = p.category_id
    LEFT JOIN product_variants v ON v.product_id = p.id
    LEFT JOIN inventory_stock s ON s.variant_id = v.id
    WHERE (? = '%%' OR p.name LIKE ? OR p.product_code LIKE ? OR v.sku LIKE ?)
    GROUP BY p.id
    ORDER BY p.id DESC
  `).all(q, q, q, q)
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
  `).all(id)
  const images = db.prepare('SELECT * FROM product_images WHERE product_id = ? ORDER BY sort_order, id').all(id)
  return { product, variants, images }
}

export function createProduct(input: ProductInput) {
  if (!input.name?.trim()) throw new Error('Tên sản phẩm là bắt buộc')
  if (!Array.isArray(input.variants) || input.variants.length === 0) throw new Error('Cần ít nhất một size')
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

    const insertVariant = db.prepare('INSERT INTO product_variants(product_id,sku,size) VALUES(?,?,?)')
    const opening = db.prepare(`
      INSERT INTO inventory_transactions(variant_id,transaction_type,quantity,unit_cost,note)
      VALUES(?,'OPENING',?,?,?)
    `)
    for (const item of input.variants) {
      const size = item.size.trim()
      const sku = (item.sku?.trim() || suggestSku(productCode, size)).toUpperCase()
      const vr = insertVariant.run(productId, sku, size)
      const qty = Math.max(0, Math.trunc(item.openingStock ?? 0))
      if (qty > 0) opening.run(Number(vr.lastInsertRowid), qty, input.costPrice ?? 0, 'Tồn đầu')
    }
    db.exec('COMMIT')
    return getProduct(productId)
  } catch (error) {
    db.exec('ROLLBACK')
    throw error
  }
}

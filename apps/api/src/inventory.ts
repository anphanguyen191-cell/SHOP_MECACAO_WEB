import { db } from './db.js'

export type InventoryType = 'IMPORT' | 'ADJUST_PLUS' | 'ADJUST_MINUS'

export function addInventory(variantId: number, type: InventoryType, quantity: number, unitCost?: number, note?: string) {
  const qty = Math.trunc(quantity)
  if (!Number.isInteger(variantId) || variantId <= 0) throw new Error('Variant không hợp lệ')
  if (!Number.isInteger(qty) || qty <= 0) throw new Error('Số lượng phải lớn hơn 0')
  const variant = db.prepare('SELECT id FROM product_variants WHERE id = ?').get(variantId)
  if (!variant) throw new Error('Không tìm thấy SKU')
  if (type === 'ADJUST_MINUS') {
    const row = db.prepare('SELECT COALESCE(stock,0) AS stock FROM inventory_stock WHERE variant_id = ?').get(variantId) as { stock: number } | undefined
    if (qty > Number(row?.stock ?? 0)) throw new Error('Điều chỉnh âm vượt quá tồn hiện tại')
  }
  return db.prepare(`
    INSERT INTO inventory_transactions(variant_id,transaction_type,quantity,unit_cost,note)
    VALUES(?,?,?,?,?)
  `).run(variantId, type, qty, unitCost ?? null, note ?? null)
}

export function history(variantId: number) {
  return db.prepare(`
    SELECT id, transaction_type, quantity, unit_cost, note, created_at
    FROM inventory_transactions WHERE variant_id = ? ORDER BY id DESC
  `).all(variantId)
}

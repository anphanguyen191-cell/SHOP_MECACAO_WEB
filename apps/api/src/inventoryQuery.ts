import { db } from './db.js'

export type InventoryFilters = { search?: string; category?: string; size?: string; state?: 'all'|'out'|'low'|'ok'; threshold?: number }

export function inventoryRows(filters: InventoryFilters = {}) {
  const q = '%' + (filters.search ?? '').trim() + '%'
  const category = (filters.category ?? '').trim()
  const size = (filters.size ?? '').trim()
  const state = filters.state ?? 'all'
  const threshold = Number.isInteger(filters.threshold) && Number(filters.threshold) >= 0 ? Number(filters.threshold) : 2
  return db.prepare(`
    SELECT v.id AS variant_id, v.sku, v.size, v.status AS variant_status,
           p.id AS product_id, p.product_code, p.name AS product_name, p.status AS product_status,
           c.name AS category, COALESCE(s.stock,0) AS stock
    FROM product_variants v
    JOIN products p ON p.id=v.product_id
    LEFT JOIN categories c ON c.id=p.category_id
    LEFT JOIN inventory_stock s ON s.variant_id=v.id
    WHERE (?='%%' OR p.name LIKE ? OR p.product_code LIKE ? OR v.sku LIKE ?)
      AND (?='' OR c.name=?)
      AND (?='' OR v.size=?)
      AND (?='all' OR (?='out' AND COALESCE(s.stock,0)=0)
        OR (?='low' AND COALESCE(s.stock,0)>0 AND COALESCE(s.stock,0)<=?)
        OR (?='ok' AND COALESCE(s.stock,0)>?))
    ORDER BY p.name, v.id
  `).all(q,q,q,q,category,category,size,size,state,state,state,threshold,state,threshold)
}

export function inventoryHistory(limit = 200) {
  const safeLimit = Number.isInteger(limit) ? Math.min(Math.max(limit,1),1000) : 200
  return db.prepare(`
    SELECT t.id,t.transaction_type,t.quantity,t.unit_cost,t.note,t.created_at,
           v.id AS variant_id,v.sku,v.size,p.id AS product_id,p.product_code,p.name AS product_name
    FROM inventory_transactions t
    JOIN product_variants v ON v.id=t.variant_id
    JOIN products p ON p.id=v.product_id
    ORDER BY t.id DESC LIMIT ?
  `).all(safeLimit)
}

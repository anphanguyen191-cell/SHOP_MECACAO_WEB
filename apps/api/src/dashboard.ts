import { db } from './db.js'
import { getLowStockThreshold } from './settings.js'
export function dashboardSummary(){
 const threshold=getLowStockThreshold()
 const totals=db.prepare(`SELECT
 (SELECT COUNT(*) FROM products WHERE status='active') AS products,
 (SELECT COUNT(*) FROM product_variants v JOIN products p ON p.id=v.product_id WHERE p.status='active' AND v.status='active') AS skus,
 (SELECT COALESCE(SUM(COALESCE(s.stock,0)),0) FROM product_variants v JOIN products p ON p.id=v.product_id LEFT JOIN inventory_stock s ON s.variant_id=v.id WHERE p.status='active' AND v.status='active') AS stock,
 (SELECT COUNT(*) FROM product_variants v JOIN products p ON p.id=v.product_id LEFT JOIN inventory_stock s ON s.variant_id=v.id WHERE p.status='active' AND v.status='active' AND COALESCE(s.stock,0)=0) AS outOfStock,
 (SELECT COUNT(*) FROM product_variants v JOIN products p ON p.id=v.product_id LEFT JOIN inventory_stock s ON s.variant_id=v.id WHERE p.status='active' AND v.status='active' AND COALESCE(s.stock,0)>0 AND COALESCE(s.stock,0)<=?) AS lowStock`).get(threshold)
 const attention=db.prepare(`SELECT p.id AS product_id,p.product_code,p.name AS product_name,v.id AS variant_id,v.sku,v.size,COALESCE(s.stock,0) AS stock
 FROM product_variants v JOIN products p ON p.id=v.product_id LEFT JOIN inventory_stock s ON s.variant_id=v.id
 WHERE p.status='active' AND v.status='active' AND COALESCE(s.stock,0)<=? ORDER BY COALESCE(s.stock,0),p.name LIMIT 12`).all(threshold)
 return {...(totals as object),lowStockThreshold:threshold,attention}
}

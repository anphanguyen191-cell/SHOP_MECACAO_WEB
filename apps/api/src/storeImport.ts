import fs from 'node:fs'
import path from 'node:path'
import { db } from './db.js'
import { getProduct, suggestSku } from './products.js'
import { isPathInsideRoot } from './storeScanner.js'

type ImportVariant = { size: string; sku?: string; openingStock?: number; images?: string[]; costPrice?: number; salePrice?: number }
export type ApprovedStoreImport = {
  rootPath: string; name: string; productCode: string; category?: string;
  costPrice?: number; salePrice?: number; variants: ImportVariant[]
}

export function commitStoreImport(input: ApprovedStoreImport) {
  if (!input.rootPath?.trim()) throw new Error('Thiếu thư mục kho')
  if (!input.name?.trim()) throw new Error('Tên sản phẩm là bắt buộc')
  if (!input.productCode?.trim()) throw new Error('Mã sản phẩm phải được duyệt trước khi lưu')
  if (!Array.isArray(input.variants) || input.variants.length === 0) throw new Error('Cần ít nhất một size')

  const root = path.resolve(input.rootPath)
  if (!fs.existsSync(root) || !fs.statSync(root).isDirectory()) throw new Error('Thư mục kho không còn tồn tại')
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
      categoryId = Number((db.prepare('SELECT id FROM categories WHERE name=?').get(input.category.trim()) as {id:number}).id)
    }
    const code = input.productCode.trim().toUpperCase()
    const duplicateCode = db.prepare('SELECT 1 FROM products WHERE product_code=?').get(code)
    if (duplicateCode) throw new Error('Mã sản phẩm "'+code+'" đã tồn tại. Hãy đổi mã sản phẩm rồi lưu lại.')
    const requestedSkus = input.variants.map(v => (v.sku?.trim() || suggestSku(code, v.size.trim())).toUpperCase())
    if (new Set(requestedSkus).size !== requestedSkus.length) throw new Error('SKU bị trùng trong sản phẩm đang duyệt. Hãy kiểm tra lại SKU.')
    const skuExists = db.prepare('SELECT 1 FROM product_variants WHERE sku=?')
    const duplicateSku = requestedSkus.find(sku => skuExists.get(sku))
    if (duplicateSku) throw new Error('SKU "'+duplicateSku+'" đã tồn tại. Hãy đổi SKU rồi lưu lại.')
    const pr = db.prepare('INSERT INTO products(product_code,name,category_id,cost_price,sale_price) VALUES(?,?,?,?,?)')
      .run(code, input.name.trim(), categoryId, input.costPrice ?? 0, input.salePrice ?? 0)
    const productId = Number(pr.lastInsertRowid)
    const insertVariant = db.prepare('INSERT INTO product_variants(product_id,sku,size,cost_price,sale_price) VALUES(?,?,?,?,?)')
    const insertImage = db.prepare('INSERT INTO product_images(product_id,variant_id,file_path,sort_order,is_primary) VALUES(?,?,?,?,?)')
    const opening = db.prepare("INSERT INTO inventory_transactions(variant_id,transaction_type,quantity,unit_cost,note) VALUES(?,'OPENING',?,?,?)")

    for (const [variantIndex, variant] of input.variants.entries()) {
      const size = variant.size.trim()
      const sku = requestedSkus[variantIndex]
      const variantCost=variant.costPrice ?? input.costPrice ?? 0,variantSale=variant.salePrice ?? input.salePrice ?? 0
      if(!Number.isFinite(variantCost)||variantCost<0||!Number.isFinite(variantSale)||variantSale<0)throw new Error('Giá theo size không hợp lệ')
      const vr = insertVariant.run(productId, sku, size, variantCost, variantSale)
      const variantId = Number(vr.lastInsertRowid)
      const images = variant.images ?? []
      images.forEach((file, index) => {
        if (!isPathInsideRoot(root, file)) throw new Error('Ảnh nằm ngoài thư mục kho đã duyệt')
        const resolved = path.resolve(file)
        if (!fs.existsSync(resolved) || !fs.statSync(resolved).isFile()) throw new Error('Không tìm thấy ảnh: ' + file)
        insertImage.run(productId, variantId, resolved, index, index === 0 ? 1 : 0)
      })
      const qty = variant.openingStock ?? 0
      if (!Number.isFinite(qty) || !Number.isInteger(qty) || qty < 0) throw new Error('Tồn đầu phải là số nguyên không âm')
      if (qty > 0) opening.run(variantId, qty, variantCost, 'Tồn đầu từ kho hiện hữu')
    }
    db.exec('COMMIT')
    return getProduct(productId)
  } catch (error) {
    db.exec('ROLLBACK')
    throw error
  }
}

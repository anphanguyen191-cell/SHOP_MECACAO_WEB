import fs from 'node:fs'
import path from 'node:path'
import { suggestProductCode, suggestSku } from './products.js'
import { db } from './db.js'

const IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.heic'])

export type ScannedSize = { size:string;folderPath:string;images:string[];suggestedSku:string;existingVariantId?:number;existingSku?:string;costPrice?:number;salePrice?:number;status:'NEW'|'EXISTING' }
export type ScannedProduct = { name:string;folderPath:string;suggestedProductCode:string;existingProductId?:number;status:'NEW'|'EXISTING'|'PARTIAL';sizes:ScannedSize[];warnings:string[] }

function safeChildren(dir: string) {
  try { return fs.readdirSync(dir, { withFileTypes: true }) } catch { return [] }
}

export function scanStore(rootPath: string): ScannedProduct[] {
  const root = path.resolve(rootPath)
  if (!fs.existsSync(root) || !fs.statSync(root).isDirectory()) throw new Error('Không tìm thấy thư mục kho')
  const rootChildren = safeChildren(root)
  const hasDirectImages = (dir:string) => safeChildren(dir).some(e=>e.isFile()&&IMAGE_EXTENSIONS.has(path.extname(e.name).toLowerCase()))
  if (hasDirectImages(root) || rootChildren.some(e=>e.isDirectory()&&hasDirectImages(path.join(root,e.name)))) {
    throw new Error('Đang chọn thư mục Product hoặc Size. Hãy chọn thư mục kho gốc chứa các Product (ví dụ warehouse), theo cấu trúc Kho / Product / Size / ảnh. Chưa ghi dữ liệu.')
  }
  const products: ScannedProduct[] = []
  const reservedCodes = new Set<string>()
  for (const productDir of rootChildren.filter(e => e.isDirectory())) {
    const productPath = path.join(root, productDir.name)
    let code = suggestProductCode(productDir.name)
    if (reservedCodes.has(code)) {
      const match = code.match(/^(.*?)(\d+)$/)
      const prefix = match?.[1] ?? code
      let n = match ? Number(match[2]) + 1 : 2
      const width = match?.[2].length ?? 4
      while (reservedCodes.has(prefix + String(n).padStart(width, '0'))) n++
      code = prefix + String(n).padStart(width, '0')
    }
    reservedCodes.add(code)
    const existingProduct=db.prepare('SELECT id,product_code FROM products WHERE lower(name)=lower(?) OR product_code=? LIMIT 1').get(productDir.name,code) as {id:number;product_code:string}|undefined
    if(existingProduct){code=existingProduct.product_code;reservedCodes.add(code)}
    const sizes: ScannedSize[] = []
    const warnings: string[] = []
    for (const sizeDir of safeChildren(productPath).filter(e => e.isDirectory())) {
      const sizePath = path.join(productPath, sizeDir.name)
      const images = safeChildren(sizePath)
        .filter(e => e.isFile() && IMAGE_EXTENSIONS.has(path.extname(e.name).toLowerCase()))
        .map(e => path.join(sizePath, e.name))
      if (images.length === 0) warnings.push(`${sizeDir.name}: không có ảnh sản phẩm`)
      const existing=existingProduct?db.prepare('SELECT id,sku,cost_price,sale_price FROM product_variants WHERE product_id=? AND lower(size)=lower(?)').get(existingProduct.id,sizeDir.name) as {id:number;sku:string;cost_price:number;sale_price:number}|undefined:undefined
      sizes.push({size:sizeDir.name,folderPath:sizePath,images,suggestedSku:existing?.sku??suggestSku(code,sizeDir.name),existingVariantId:existing?.id,existingSku:existing?.sku,costPrice:existing?.cost_price,salePrice:existing?.sale_price,status:existing?'EXISTING':'NEW'})
    }
    if (sizes.length === 0) warnings.push('Không phát hiện folder size')
    const existingCount=sizes.filter(s=>s.status==='EXISTING').length
    const status:ScannedProduct['status']=existingProduct?(existingCount===sizes.length?'EXISTING':'PARTIAL'):'NEW'
    products.push({name:productDir.name,folderPath:productPath,suggestedProductCode:code,existingProductId:existingProduct?.id,status,sizes,warnings})
  }
  return products
}

export function isPathInsideRoot(rootPath: string, candidate: string) {
  const root = path.resolve(rootPath)
  const target = path.resolve(candidate)
  const rel = path.relative(root, target)
  return rel.length > 0 && rel !== '..' && !rel.startsWith('..' + path.sep) && !path.isAbsolute(rel)
}

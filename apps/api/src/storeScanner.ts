import fs from 'node:fs'
import path from 'node:path'
import { suggestProductCode, suggestSku } from './products.js'

const IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.heic'])

export type ScannedSize = { size: string; folderPath: string; images: string[]; suggestedSku: string }
export type ScannedProduct = { name: string; folderPath: string; suggestedProductCode: string; sizes: ScannedSize[]; warnings: string[] }

function safeChildren(dir: string) {
  try { return fs.readdirSync(dir, { withFileTypes: true }) } catch { return [] }
}

export function scanStore(rootPath: string): ScannedProduct[] {
  const root = path.resolve(rootPath)
  if (!fs.existsSync(root) || !fs.statSync(root).isDirectory()) throw new Error('Không tìm thấy thư mục kho')
  const products: ScannedProduct[] = []
  const reservedCodes = new Set<string>()
  for (const productDir of safeChildren(root).filter(e => e.isDirectory())) {
    const productPath = path.join(root, productDir.name)
    let code = suggestProductCode(productDir.name)
    if (reservedCodes.has(code)) {
      const match = code.match(/^(.*?)(\\d+)$/)
      const prefix = match?.[1] ?? code
      let n = match ? Number(match[2]) + 1 : 2
      const width = match?.[2].length ?? 4
      while (reservedCodes.has(prefix + String(n).padStart(width, '0'))) n++
      code = prefix + String(n).padStart(width, '0')
    }
    reservedCodes.add(code)
    const sizes: ScannedSize[] = []
    const warnings: string[] = []
    for (const sizeDir of safeChildren(productPath).filter(e => e.isDirectory())) {
      const sizePath = path.join(productPath, sizeDir.name)
      const images = safeChildren(sizePath)
        .filter(e => e.isFile() && IMAGE_EXTENSIONS.has(path.extname(e.name).toLowerCase()))
        .map(e => path.join(sizePath, e.name))
      if (images.length === 0) warnings.push(`${sizeDir.name}: không có ảnh sản phẩm`)
      sizes.push({ size: sizeDir.name, folderPath: sizePath, images, suggestedSku: suggestSku(code, sizeDir.name) })
    }
    if (sizes.length === 0) warnings.push('Không phát hiện folder size')
    products.push({ name: productDir.name, folderPath: productPath, suggestedProductCode: code, sizes, warnings })
  }
  return products
}

export function isPathInsideRoot(rootPath: string, candidate: string) {
  const root = path.resolve(rootPath)
  const target = path.resolve(candidate)
  const rel = path.relative(root, target)
  return rel.length > 0 && rel !== '..' && !rel.startsWith('..' + path.sep) && !path.isAbsolute(rel)
}

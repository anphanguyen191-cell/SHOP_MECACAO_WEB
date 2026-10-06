import { db } from './db.js'

export function getLowStockThreshold() {
  const row = db.prepare("SELECT value FROM app_settings WHERE key = 'low_stock_threshold'").get() as { value?: string } | undefined
  return Number(row?.value ?? 2)
}

export function updateLowStockThreshold(value: number) {
  if (!Number.isInteger(value) || value < 0) throw new Error('Ngưỡng tồn thấp phải là số nguyên không âm')
  db.prepare("UPDATE app_settings SET value = ?, updated_at = datetime('now') WHERE key = 'low_stock_threshold'").run(String(value))
  return getLowStockThreshold()
}

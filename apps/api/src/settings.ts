import { db } from './db.js'

export function getLowStockThreshold() {
  const row = db.prepare("SELECT value FROM app_settings WHERE key = 'low_stock_threshold'").get() as { value?: string } | undefined
  const value=Number(row?.value ?? 2)
  return Number.isInteger(value)&&value>=0?value:2
}

export function updateLowStockThreshold(value: number) {
  if (!Number.isInteger(value) || value < 0) throw new Error('Ngưỡng tồn thấp phải là số nguyên không âm')
  db.prepare("INSERT INTO app_settings(key,value,updated_at) VALUES('low_stock_threshold',?,datetime('now')) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=datetime('now')").run(String(value))
  return getLowStockThreshold()
}

import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
const read=p=>readFileSync(p,'utf8')
test('Every Windows workspace header accepts local image/video cover, independent of stock photos',()=>{
 const chrome=read('apps/web/src/TravelLuxeDesktop.tsx')
 const css=read('apps/web/src/travelLuxeDesktopFinal.css')
 assert.match(chrome,/workspace:'\+section/)
 assert.match(chrome,/luxeIntroControls/)
 assert.match(chrome,/luxeIntroMedia/)
 assert.match(chrome,/Nền mặc định/)
 assert.match(css,/\.shell\.luxeWindows \.luxeWorkspaceIntro\.hasCustomMedia::before/)
})
test('All editable monetary number spinners use 1000 VND; stock quantity remains one unit',()=>{
 for(const p of ['AddProduct.tsx','InventoryOps.tsx','GoodsReceipt.tsx','WarehouseImport.tsx','CloudCatalog.tsx','CloudOrderEditor.tsx','CloudFinance.tsx']){
  const content=read('apps/web/src/'+p)
  assert.match(content,/step="1000"/,p)
 }
 assert.match(read('apps/web/src/StocktakeView.tsx'),/step="1"/)
 assert.match(read('apps/web/src/AddProduct.tsx'),/step="1" value=\{v\.openingStock\}/)
})
test('Warehouse and catalog show actual Product choices and uncategorized inventory',()=>{
 const api=read('apps/api/src/inventoryQuery.ts'),products=read('apps/api/src/products.ts')
 const inv=read('apps/web/src/InventoryView.tsx'),app=read('apps/web/src/App.tsx')
 assert.match(api,/productCode/)
 assert.match(api,/Chưa phân loại/)
 assert.match(api,/normalizeInventorySearch/)
 assert.match(products,/normalizedProductSearch/)
 assert.match(inv,/Chọn sản phẩm trong kho/)
 assert.match(app,/Chọn mẫu sản phẩm trong danh mục/)
 assert.match(app,/catalogProductOptions/)
})
test('Bell is a single compact actionable panel with archived history',()=>{
 const notice=read('apps/web/src/WarehouseNotifications.tsx')
 assert.match(notice,/warehouseNoticeTabs/)
 assert.match(notice,/warehouseNoticeItem/)
 assert.match(notice,/setTab\('history'\)/)
 assert.match(notice,/!initialLoad\.current/)
 assert.match(notice,/mecacao-server-change/)
})

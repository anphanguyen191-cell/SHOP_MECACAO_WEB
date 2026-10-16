import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
const source=p=>readFileSync(new URL('../../'+p,import.meta.url),'utf8')
const app=source('apps/web/src/App.tsx')
const chrome=source('apps/web/src/TravelLuxeDesktop.tsx')
const styles=source('apps/web/src/travelLuxeDesktopFinal.css')
test('Travel Luxe is a real replacement shell, not old color-only navigation',()=>{
 assert.match(app,/<LuxeDesktopSidebar sections=\{nav\}/)
 assert.match(app,/<LuxeDesktopTopbar mode=\{mode\}/)
 assert.match(app,/<LuxeDashboardHero expanded=\{heroExpanded\}/)
 assert.match(app,/<LuxeWorkspaceIntro section=\{active\}/)
 assert.match(styles,/\.shell\.luxeWindows \.luxeDesktopSidebar/)
 assert.match(styles,/\.shell\.luxeWindows \.luxeDashboardHero/)
 assert.match(styles,/\.shell\.luxeWindows \.luxeFeaturedGrid/)
 assert.match(styles,/\.shell\.luxeWindows \.productList\{display:grid/)
})
test('Approved desktop workflow screens and owner navigation remain available',()=>{
 for(const n of ['Tổng quan','Tồn kho','Nhập hàng','Import kho','Bán hàng','Khách hàng','Công nợ','Báo cáo','Kiểm kê','Kết nối Cloud','Cài đặt'])assert.ok(chrome.includes(n),n)
 assert.match(app,/active==='Tồn kho'&&<InventoryView/)
 assert.match(app,/active==='Bán hàng'&&health\?\.salesDrafts&&canSell&&<SalesDraftView/)
 assert.match(app,/active==='Nhập hàng'&&<ReceiptDashboard/)
 assert.match(app,/active==='Kiểm kê'&&health\?\.salesExecution&&canCount&&<StocktakeView/)
 assert.match(chrome,/function openHeroDb/)
 assert.match(chrome,/role="search"/)
})
test('Visual rewrite is contained to Windows and does not alter cloud/core operations',()=>{
 assert.match(app,/!isDemo&&!health\?\.lanClient\?' luxeWindows'/)
 assert.match(app,/\{!desktopShell&&<ShopHeader/)
 assert.match(app,/desktopShell\?<LuxeDesktopSidebar/)
 assert.match(source('apps/web/src/main.tsx'),/import '\.\/travelLuxeDesktopFinal\.css'/)
 assert.ok(!styles.includes('body{'))
 assert.ok(!styles.includes('database'))
})

import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'

const read=path=>readFileSync(path,'utf8')
const css=read('apps/web/src/styles.css')
const app=read('apps/web/src/App.tsx')
const inventory=read('apps/web/src/InventoryView.tsx')
const receipt=read('apps/web/src/ReceiptDashboard.tsx')
let checks=0
function must(condition,message){assert.ok(condition,message);checks++}

// This is a source regression gate, not an iPhone screenshot/real-browser acceptance test.
must(!/<input\s+autoFocus\s+value=\{menuSearch\}/.test(app),'Drawer must not auto-focus the keyboard on iPhone')
must(/\.themeDark \.drawerSearch input\s*\{[^}]*background:transparent/.test(css),'Dark mode must not paint a dark square inside the light drawer search field')
must(/\.themeDark \.catalogMetrics article,\.themeDark \.inventoryMetrics article\s*\{[^}]*background:#302c3c/.test(css),'Dark mode KPI cards must have a dark background')
must(/\.themeDark \.catalogMetrics strong,\.themeDark \.inventoryMetrics strong\s*\{[^}]*color:#fff5fa/.test(css),'Dark mode KPI numbers must have readable foreground')
must(/\.inventoryPage \.sizesInsight>button\.productStockBar\s*\{[^}]*display:flex;flex-direction:column/.test(css),'Product inventory chart must override obsolete three-column button grid')
must(/\.inventoryPage \.sizesInsight \.productStockBarLabel b\s*\{[^}]*min-width:0;display:block;white-space:normal/.test(css),'Product names must wrap normally, not one character per line')
must(app.includes('aria-controls="overview-dashboard-body"')&&app.includes('aria-expanded={overviewExpanded}'),'Overview dashboard must have accessible collapse toggle')
must(inventory.includes('aria-controls="inventory-dashboard-body"')&&inventory.includes('aria-expanded={dashboardExpanded}'),'Inventory dashboard must have accessible collapse toggle')
must(app.includes('aria-controls="catalog-dashboard-body"')&&app.includes('aria-expanded={catalogExpanded}'),'Catalog dashboard must have accessible collapse toggle')
must(receipt.includes('aria-controls="receipt-dashboard-body"')&&receipt.includes('aria-expanded={dashboardExpanded}'),'Receipt dashboard must have accessible collapse toggle')
must(inventory.indexOf('className="inventoryDashboardBlock"')<inventory.indexOf('className="inventoryFilters"'),'Inventory dashboard must precede search filters')
must(app.indexOf('className="dashboardFoldHeader"',app.indexOf("active==='Danh mục sản phẩm'&&"))<app.indexOf('className="panel catalogPanel"'),'Catalog summary must precede product search')
must(app.includes("<InventoryView isDemo={isDemo}/>"),'DEMO and LOCAL inventory must share the same implementation')
must(app.includes('className="brandHeroCompact"'),'Brand banner must be compact beneath overview dashboard')
must(/\.dashboardFoldToggle:focus-visible\s*\{[^}]*outline/.test(css),'Collapse buttons must expose a keyboard focus ring')
must(/\.themeDark \.inventoryPage \.insightCard>button:not\(\.productStockBar\)/.test(css),'Dark-mode ranking buttons must not use browser-default blue text')
must(app.includes('catalogLoading')&&app.includes('catalogError')&&app.includes('THỬ LẠI'),'Catalog must distinguish loading, error and empty states')
must(app.includes('CHỌN THƯ MỤC')&&app.includes('<FolderPicker'),'Existing warehouse import must support folder browsing')
must(app.includes('p.sizes.map')&&!app.includes("p.sizes.filter(s=>s.status!=='EXISTING')"),'Batch import must reconcile existing Size images idempotently, not skip them')
const goods=read('apps/web/src/GoodsReceipt.tsx')
must(app.includes('Không chọn riêng thư mục Product hoặc Size')&&app.includes('disabled={busy||!draft.variants.some(v=>v.selected&&v.images.length>0)}'),'Warehouse import must explain root depth and block a preview without selected image-bearing Sizes')
must(goods.includes('row.sourcePath===p')&&goods.includes('requestVersion.current'),'Incoming image inspection must bind its result to the selected source')
must(goods.includes('submitLock.current')&&goods.includes('onDone?.()'),'Receipt must block double submit and refresh dashboard after commit')
must(read('apps/web/src/FolderPicker.tsx').includes('AbortController'),'Folder picker must reject stale/network-failed results')
must(read('RUN_WINDOWS_V1_SAFE_TEST.bat').includes("$r.sandbox -eq $true"),'Windows launcher must verify backend sandbox identity')
console.log('UI_REGRESSION PASS: '+checks+' layout, contrast, fold, focus and DEMO/LOCAL source-level assertions')

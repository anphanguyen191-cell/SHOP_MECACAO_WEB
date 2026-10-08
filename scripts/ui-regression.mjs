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
must(app.indexOf('className="dashboardFoldHeader"',app.indexOf("active==='Danh mục sản phẩm'&&"))<app.indexOf('className="catalogPanel"'),'Catalog summary must precede product search')
must(app.includes("<InventoryView isDemo={isDemo}/>"),'DEMO and LOCAL inventory must share the same implementation')
must(app.includes('className="brandHeroCompact"'),'Brand banner must be compact beneath overview dashboard')
must(/\.dashboardFoldToggle:focus-visible\s*\{[^}]*outline/.test(css),'Collapse buttons must expose a keyboard focus ring')
must(/\.themeDark \.inventoryPage \.insightCard>button:not\(\.productStockBar\)/.test(css),'Dark-mode ranking buttons must not use browser-default blue text')
console.log('UI_REGRESSION PASS: '+checks+' layout, contrast, fold, focus and DEMO/LOCAL source-level assertions')

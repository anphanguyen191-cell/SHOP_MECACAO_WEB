import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
const source=p=>readFileSync(new URL('../../'+p,import.meta.url),'utf8')
const style=source('apps/web/src/mobileLuxeV2.css')
const app=source('apps/web/src/App.tsx')
const cloud=source('apps/web/src/CloudWorkspace.tsx')
const component=source('apps/web/src/MobileLuxeSectionHeader.tsx')
const main=source('apps/web/src/main.tsx')
test('M2 isolated responsive treatment for LAN and Cloud',()=>{
 assert.match(app,/mobileLuxeWorkspace/)
 assert.match(cloud,/mobileLuxeWorkspace/)
 assert.match(app,/<MobileLuxeSectionHeader/)
 assert.match(cloud,/<MobileLuxeSectionHeader/)
 assert.match(component,/mode:.*'LAN'.*'CLOUD'/)
 assert.match(style,/@media \(max-width:800px\)/)
 assert.match(style,/@media\(min-width:801px\)/)
 assert.match(style,/\.shell\.mobileLuxeWorkspace/)
 assert.match(style,/\.mobileLuxeSectionHeader/)
})
test('M2 covers screen families without changing business behavior',()=>{
 for(const family of ['overviewStats','inventoryMetrics','inventoryTree','selectableGallery','salesWorkspace','cloudSettings','stocktakePanel','featureDrawer','mobileLuxeNav','luxeControlCenterGrid'])assert.ok(style.includes(family),family)
 assert.doesNotMatch(component,/fetch\(|cloudRpc\(|apiJson\(|localStorage|supabase/i)
 assert.match(style,/safe-area-inset-bottom/)
 assert.match(style,/prefers-reduced-motion:reduce/)
 assert.match(style,/min-height:50px/)
})
test('M2 CSS is last and scoped; desktop styles remain imported',()=>{
 const anchor=main.indexOf("import './travelLuxeContrast.css'")
 const m2=main.indexOf("import './mobileLuxeV2.css'")
 assert.ok(anchor>=0&&m2>anchor)
 assert.match(main,/travelLuxeDesktopFinal\.css/)
 assert.doesNotMatch(style,/@media[^\n]+\{\s*(?:body|html)\b/)
})

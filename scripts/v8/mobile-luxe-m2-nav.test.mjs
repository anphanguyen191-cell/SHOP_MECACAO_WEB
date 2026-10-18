import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
const source=p=>readFileSync(new URL('../../'+p,import.meta.url),'utf8')
const dock=source('apps/web/src/MobileLuxeNav.tsx')
const css=source('apps/web/src/mobileLuxeV2.css')
const app=source('apps/web/src/App.tsx')
const cloud=source('apps/web/src/CloudWorkspace.tsx')
const entry=source('apps/web/src/main.tsx')

test('M2 dock reuses existing routes without replacing application business logic',()=>{
 assert.match(dock,/onNavigate\(i\.key\)/)
 assert.match(dock,/onMore/)
 assert.match(dock,/aria-current/)
 assert.match(app,/<MobileLuxeNav items=\{nav\.map/)
 assert.match(cloud,/<MobileLuxeNav items=\{sections\}/)
 assert.match(cloud,/cloudRoute="connect"/)
})
test('M2 mobile design stays scoped and respects reduced motion',()=>{
 assert.match(css,/@media\(max-width:800px\)/)
 assert.match(css,/\.shell \.mobileLuxeNav/)
 assert.match(css,/@media\(prefers-reduced-motion:reduce\)/)
 assert.match(css,/min-height:48px/)
 assert.match(entry,/import '\.\/mobileLuxeV2\.css'/)
 assert.doesNotMatch(css,/database|sqlite|delete from|supabase\.from/i)
})
test('M2 mobile navigation never adds a new sales API route',()=>{
 assert.match(dock,/const candidates=/)
 assert.match(dock,/Tổng quan/)
 assert.match(dock,/Tồn kho/)
 assert.match(dock,/Bán hàng/)
 assert.match(dock,/Kết nối Cloud/)
 assert.doesNotMatch(dock,/fetch\(|cloudRpc\(|apiJson\(/)
})

import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {cloudAuthorityWriteBlocked} from '../../apps/api/src/localWriteAuthority.ts'
test('Cloud active does not lock official Windows CORE sales and catalog writes',()=>{
 assert.equal(cloudAuthorityWriteBlocked(true,true,false),false)
 assert.equal(cloudAuthorityWriteBlocked(false,true,false),false)
})
test('Cloud authority still fences LAN and non-Windows callers',()=>{
 assert.equal(cloudAuthorityWriteBlocked(true,true,true),true)
 assert.equal(cloudAuthorityWriteBlocked(true,false,false),true)
 assert.equal(cloudAuthorityWriteBlocked(true,false,true),true)
})
test('All local sales, prices, and product gates apply authenticated decision',()=>{
 const source=readFileSync('apps/api/src/server.ts','utf8')
 assert.match(source,/!localStockReturn&&cloudWriteBlocked\(res\)/)
 assert.equal((source.match(/if\(cloudWriteBlocked\(res\)\)/g)||[]).length,3)
})
test('Cloud may not replace local V8 orders, statuses, or prices',()=>{
 const source=readFileSync('apps/api/src/cloudRoutes.ts','utf8')
 assert.match(source,/if\(localAuthority\)return res.status\(409\).json\(\{code:'WINDOWS_LOCAL_AUTHORITY'/)
 assert.match(source,/if\(v8Home\)return res.json\(\{updated:0,authority:'WINDOWS_LOCAL'\}\)/)
 assert.match(source,/v8Home\?null:await reconcileCloudSale/)
 assert.match(source,/if\(localAuthority\|\|!db.prepare/)
 assert.match(source,/if\(localAuthority\)return res.json\(await uploadLocalBusiness\(db,root,\(name,args\)=>rpc\(token,name,args\),true\)\)/)
})

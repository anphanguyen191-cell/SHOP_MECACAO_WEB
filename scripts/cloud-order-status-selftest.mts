import assert from 'node:assert/strict'
import {cloudOrderCounts,effectiveCloudOrders} from '../apps/web/src/cloudOrderStatus.js'

const ids=['018ce4b0','63ebf748','e90f3621','c0a9eddf','4820ec15','53105450']
const orders=[
 ...ids.map(id=>({id,status:'DRAFT',version:2})),
 {id:'03083ff1',status:'CANCELLED_DRAFT',version:2},
 {id:'c66e96ea',status:'DRAFT',version:2}
]
const confirmations=ids.map(order_id=>({order_id}))
const original=structuredClone(orders)
const effective=effectiveCloudOrders(orders,confirmations)
assert.deepEqual(cloudOrderCounts(effective),{drafts:1,sold:6,cancelled:1})
assert.deepEqual(orders,original,'Projection must not mutate the Cloud source or laptop snapshot')
for(const id of ids)assert.equal(effective.find(o=>o.id===id)?.status,'SOLD')
assert.equal(effective.find(o=>o.id==='c66e96ea')?.status,'DRAFT')
assert.equal(effective.find(o=>o.id==='03083ff1')?.status,'CANCELLED_DRAFT')
assert.equal(effective.length,8,'Projection keeps all original order identities; no duplicate or deletion')
assert.equal(effective.filter(o=>o.status==='DRAFT').length,1,'A SOLD confirmation can never be counted/actioned as a draft')
console.log('CLOUD_ORDER_STATUS PASS: exact shop fixture 8 orders → 6 SOLD, 1 cancelled draft, 1 open draft; authoritative confirmations, no source mutation or row loss')

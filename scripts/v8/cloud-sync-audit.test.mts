import test from 'node:test'
import assert from 'node:assert/strict'
import {reconcileCloudImages,validateCloudVariants} from '../../apps/web/src/cloudSyncAudit.ts'
const photo=(id:number,variant_id=10,product_id=2)=>({id,product_id,variant_id})
const asset=(image_id:number,ready=true,source_present=true)=>({image_id,ready,source_present,object_path:'v7/shop/'+image_id+'.jpg'})
const variant=(id:number,sku='ABC8',size='8',product_id=2)=>({id,sku,size,product_id})
test('catalog: clean same inventory with one ready image per physical unit',()=>{
 assert.deepEqual(reconcileCloudImages([photo(1),photo(2)],[photo(1),photo(2)],[asset(1),asset(2)],[],1),{expected:2,ready:2,withdrawn:[]})
 assert.equal(validateCloudVariants([variant(10)],[variant(10)]),1)
})
test('catalog: a SOLD historical image must not be withdrawn or counted as available inventory',()=>{
 const r=reconcileCloudImages([photo(2)],[photo(1),photo(2)],[asset(1),asset(2)],[{image_id:1}],1)
 assert.deepEqual(r.withdrawn,[]);assert.equal(r.ready,1)
})
test('catalog: deleted source image is withdrawn without deleting historical catalog row',()=>{
 const r=reconcileCloudImages([photo(2)],[photo(1),photo(2)],[asset(1),asset(2)],[],1)
 assert.deepEqual(r.withdrawn,[1])
 assert.deepEqual(reconcileCloudImages([photo(2)],[photo(1),photo(2)],[asset(1,true,false),asset(2)],[],1).withdrawn,[])
})
test('catalog: empty source root cannot silently withdraw every Cloud image',()=>{
 assert.throws(()=>reconcileCloudImages([],[photo(1)],[asset(1)],[],0),/kho không có sản phẩm/)
})
test('catalog: same total but wrong image ID is not considered reconciled',()=>{
 assert.throws(()=>reconcileCloudImages([photo(3)],[photo(4)],[asset(4)],[],1),/ảnh tồn #3/)
})
test('catalog: registered but missing/not-ready/unavailable image cannot activate',()=>{
 for(const a of [[],[asset(1,false)],[asset(1,true,false)]])
  assert.throws(()=>reconcileCloudImages([photo(1)],[photo(1)],a,[],1),/chưa sẵn sàng/)
})
test('catalog: conflicting image identity and selling an in-stock image fail closed',()=>{
 assert.throws(()=>reconcileCloudImages([photo(1)],[photo(1,11)],[asset(1)],[],1),/khác Product\/Size/)
 assert.throws(()=>reconcileCloudImages([photo(1)],[photo(1)],[asset(1)],[{image_id:1}],1),/đang SOLD/)
})
test('catalog: duplicate image/asset IDs cannot understate stock counts',()=>{
 assert.throws(()=>reconcileCloudImages([photo(1),photo(1)],[photo(1)],[asset(1)],[],1),/bị trùng/)
 assert.throws(()=>reconcileCloudImages([photo(1)],[photo(1)],[asset(1),asset(1)],[],1),/bị trùng/)
})
test('catalog: variant ID alone is insufficient to reconcile SKU or Size',()=>{
 assert.throws(()=>validateCloudVariants([variant(10)],[variant(10,'XYZ8')]),/không khớp/)
 assert.throws(()=>validateCloudVariants([variant(10)],[variant(10,'ABC8','10')]),/không khớp/)
 assert.throws(()=>validateCloudVariants([variant(10)],[]),/không khớp/)
})

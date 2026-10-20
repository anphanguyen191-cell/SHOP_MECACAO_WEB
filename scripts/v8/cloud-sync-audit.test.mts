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

test('inventory with a missing source cannot activate as if it were ready',()=>{
 assert.deepEqual(reconcileCloudImages([photo(1)],[photo(1),photo(2)],[asset(1),asset(2,true,false)],[],2).withdrawn,[])
 assert.deepEqual(reconcileCloudImages([photo(1)],[photo(1),photo(2)],[asset(1),asset(2)],[],2).withdrawn,[2])
})

const {readCloudSourceSnapshot}=await import('../../apps/web/src/cloudSyncAudit.ts')
const page=(images:any[],sourceState:any[],extra={})=>({instance:'warehouse',images,sourceState,done:true,...extra})
test('source preflight rejects total source loss before caller can write anything',async()=>{
 let writes=0
 await assert.rejects(async()=>{await readCloudSourceSnapshot(async()=>page([photo(1)],[{id:1,present:false}]));writes++},/Toàn bộ/)
 assert.equal(writes,0)
})
test('source preflight validates all pages and allows partial missing files',async()=>{
 const calls:number[]=[]
 const pages=await readCloudSourceSnapshot(async offset=>{calls.push(offset);return offset===0?page([photo(1)],[{id:1,present:false}],{done:false,nextOffset:100}):page([photo(2)],[{id:2,present:true}])})
 assert.deepEqual(calls,[0,100]);assert.equal(pages.length,2)
})
test('source preflight rejects duplicate IDs, different instance and stuck pagination',async()=>{
 await assert.rejects(()=>readCloudSourceSnapshot(async()=>page([photo(1),photo(2)],[{id:1,present:true},{id:1,present:true}])),/trùng/)
 await assert.rejects(()=>readCloudSourceSnapshot(async()=>page([],[],{done:false,nextOffset:0})),/Phân trang/)
 await assert.rejects(()=>readCloudSourceSnapshot(async offset=>offset===0?page([],[],{done:false,nextOffset:100}):page([],[],{instance:'other'})),/định danh/)
})

const {verifyStorageDeletion}=await import('../../apps/web/src/cloudSyncAudit.ts')
test('cleanup never reports freed space on silent or partial Storage refusal',()=>{
 const entries=[{path:'old/1.jpg',bytes:100},{path:'old/2.jpg',bytes:200}]
 assert.throws(()=>verifyStorageDeletion(entries,[]),/0\/2/)
 assert.throws(()=>verifyStorageDeletion(entries,[{name:'old/1.jpg'}]),/1\/2/)
 assert.throws(()=>verifyStorageDeletion(entries,null),/chưa xác nhận/)
 assert.throws(()=>verifyStorageDeletion(entries,[{name:'other.jpg'}]),/không khớp/)
 assert.deepEqual(verifyStorageDeletion(entries,[{name:'old/2.jpg'},{name:'old/1.jpg'}]),{count:2,bytes:300})
})

const {runImageSyncQueue}=await import('../../apps/web/src/cloudSyncAudit.ts')
test('image upload queue stays bounded and processes each ID once',async()=>{
 let active=0,peak=0;const seen:number[]=[]
 await runImageSyncQueue([1,2,3,4,5],async id=>{active++;peak=Math.max(peak,active);await new Promise(r=>setTimeout(r,5));seen.push(id);active--},()=>false)
 assert.equal(peak,2);assert.deepEqual(seen.sort(),[1,2,3,4,5]);assert.equal(active,0)
})
test('failed queue drains in-flight work before returning and does not start later images',async()=>{
 let finished=false;const seen:number[]=[]
 await assert.rejects(()=>runImageSyncQueue([1,2,3,4],async id=>{seen.push(id);if(id===1)throw Error('network lost');await new Promise(r=>setTimeout(r,15));finished=true},()=>false),/network lost/)
 assert.deepEqual(seen,[1,2]);assert.equal(finished,true)
 let calls=0;await runImageSyncQueue([1],async()=>{calls++},()=>true);assert.equal(calls,0)
})

const {validateCloudProductNames}=await import('../../apps/web/src/cloudSyncAudit.ts')
test('V8 Cloud keeps exact Vietnamese product names and IDs from Windows',()=>{
 const local=[{id:1,product_code:'VA0001',name:'Vải tole Bé Gái'},{id:2,product_code:'DO0002',name:'Đồ bộ Gấu Hồng'}]
 assert.equal(validateCloudProductNames(local,[...local]),2)
 assert.throws(()=>validateCloudProductNames(local,[{...local[0],name:'Vai tole Be Gai'},local[1]]),/chưa trùng chính xác/)
 assert.throws(()=>validateCloudProductNames(local,[{...local[0],product_code:'VA0002'},local[1]]),/chưa trùng chính xác/)
 assert.throws(()=>validateCloudProductNames(local,[local[0]]),/chưa trùng chính xác/)
 assert.throws(()=>validateCloudProductNames(local,[...local,{id:3,product_code:'X',name:'dư'}]),/không thuộc kho Windows/)
})

const {assessCloudSyncPreview}=await import('../../apps/web/src/cloudSyncAudit.ts')
test('3149 laptop vs 3084 Cloud is explained by exact missing IDs, not a count adjustment',()=>{
 const p={id:1,product_code:'P1',name:'Bộ tole'},v={id:1,product_id:1,sku:'P1-S',size:'S'}
 const images=Array.from({length:3149},(_,i)=>({id:i+1,product_id:1,variant_id:1}))
 const pages=[{instance:'warehouse-A',products:[p],variants:[v],images,sourceState:images.map(i=>({id:i.id,present:true}))}]
 const remote={products:[p],variants:[v],images:images.slice(0,3096),assets:images.slice(0,3096).map(i=>({image_id:i.id,ready:true,source_present:i.id<=3084})),sold:[] as {image_id:number}[]}
 const report=assessCloudSyncPreview(pages,remote,'warehouse-A')
 assert.equal(report.local.stock,3149);assert.equal(report.cloud.ready,3084)
 assert.deepEqual(report.differences.unavailable,Array.from({length:12},(_,i)=>3085+i))
 assert.deepEqual(report.differences.unregistered,Array.from({length:53},(_,i)=>3097+i))
 const conflict=assessCloudSyncPreview(pages,{...remote,sold:[{image_id:1}]},'warehouse-A')
 assert.equal(conflict.cloud.ready,3083);assert.deepEqual(conflict.differences.soldConflict,[1]);assert.equal(conflict.safe,false)
})
const checkSource=(products:any[],variants:any[],images:any[],present=true)=>[{instance:'warehouse-A',products,variants,images,sourceState:images.map(i=>({id:i.id,present})),done:true}]
test('read-only Cloud preview counts exact Vietnamese Product/Size/stock before first sync',()=>{
 const p=[{id:3,name:'Đồ bộ tole Bé Gái',product_code:'BG03'}],v=[{id:9,product_id:3,size:'8',sku:'BG03-S8'}],i=[{id:10,product_id:3,variant_id:9}]
 const report=assessCloudSyncPreview(checkSource(p,v,i),{products:[],variants:[],images:[],assets:[]},null)
 assert.deepEqual(report.local,{products:1,sizes:1,stock:1,missing:0})
 assert.equal(report.cloud.products,0);assert.equal(report.newUploads,1);assert.equal(report.safe,true)
})
test('read-only preview exposes exact product-name mismatch and foreign warehouse',()=>{
 const p=[{id:3,name:'Đồ bộ tole Bé Gái',product_code:'BG03'}],v=[{id:9,product_id:3,size:'8',sku:'BG03-S8'}],i=[{id:10,product_id:3,variant_id:9}]
 const report=assessCloudSyncPreview(checkSource(p,v,i),{products:[{...p[0],name:'Do bo tole Be Gai'}],variants:v,images:i,assets:[]},'other')
 assert.equal(report.needsHandoff,true);assert.equal(report.safe,false);assert.match(report.conflicts.join(' '),/tên\/mã Cloud/)
})
test('preview rejects duplicate IDs and broken Product-Size-image links',()=>{
 const p={id:3,name:'Gấu',product_code:'G03'},v={id:9,product_id:3,size:'8',sku:'G03-S8'},i={id:10,product_id:3,variant_id:9},remote={products:[],variants:[],images:[],assets:[]}
 assert.throws(()=>assessCloudSyncPreview(checkSource([p,p],[v],[i]),remote,null),/bị trùng/)
 assert.throws(()=>assessCloudSyncPreview(checkSource([p],[{...v,product_id:12}],[i]),remote,null),/thiếu Product/)
 assert.throws(()=>assessCloudSyncPreview(checkSource([p],[v],[{...i,variant_id:99}]),remote,null),/thiếu hoặc sai/)
})
test('preview counts only physically present photos and avoids unnecessary reupload',()=>{
 const p={id:3,name:'Gấu',product_code:'G03'},v={id:9,product_id:3,size:'8',sku:'G03-S8'},i=[{id:10,product_id:3,variant_id:9},{id:11,product_id:3,variant_id:9}]
 const pages=checkSource([p],[v],i);pages[0].sourceState[1].present=false
 const r=assessCloudSyncPreview(pages,{products:[p],variants:[v],images:i,assets:[{image_id:10,ready:true,source_present:true}]},'warehouse-A')
 assert.equal(r.local.stock,1);assert.equal(r.local.missing,1);assert.equal(r.newUploads,0)
})

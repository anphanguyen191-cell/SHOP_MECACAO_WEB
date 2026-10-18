import test from 'node:test'
import assert from 'node:assert/strict'
import {catalogDefaults,CATALOG_BANNER_URL,CATALOG_SIZE_IMAGE_URL,SIZE_GUIDE,matchSizes,readCart,validateCartLine,lineCount,catalogCartSummary,sortCatalogProducts,type CatalogProduct,type CartLine} from '../apps/web/src/customerCatalogModel.ts'
test('Size guide preserves 12 approved rows, gaps and ambiguous boundaries',()=>{assert.equal(SIZE_GUIDE.length,12);assert.deepEqual(matchSizes(16,98),['8']);assert.deepEqual(matchSizes(11.5,null),[]);assert.deepEqual(matchSizes(null,139),[]);assert.deepEqual(matchSizes(10,80),['4','5']);assert.deepEqual(matchSizes(16,145),[]);assert.deepEqual(matchSizes(NaN,98),[]);assert.deepEqual(matchSizes(null,null),[])})
const line:CartLine={product_id:1,variant_id:2,name:'Mẫu',size:'8',quick_quantity:3,selected_image_ids:[1,2],expected_price:50000}
test('Receipt text preserves exact image identities and mixed quantity',()=>{assert.equal(catalogCartSummary([line]),'Mẫu · Size 8: 5 bộ · ảnh #1, #2')})
test('Favorites sorted by either price direction keep contact-only prices last',()=>{
 const product=(id:number,price:number|null):CatalogProduct=>({public_product_id:id,name:'Mẫu',public_code:String(id),updated_at:'2026-10-18T00:00:00Z',stock_as_of:null,cover_image_id:null,sizes:[{variant_id:id,size_label:'8',available_count:1,sale_price:price}]})
 const rows=[product(1,null),product(2,50000),product(3,100000)]
 assert.deepEqual(sortCatalogProducts(rows,'asc').map(p=>p.public_product_id),[2,3,1]);assert.deepEqual(sortCatalogProducts(rows,'desc').map(p=>p.public_product_id),[3,2,1])
})
test('Mixed quantity: 2 exact + 3 quick fits five, 2 + 4 cannot fit',()=>{assert.equal(lineCount(line),5);assert(validateCartLine(line,5));assert(!validateCartLine({...line,quick_quantity:4},5));assert(!validateCartLine({...line,selected_image_ids:[1,1]},5));assert(!validateCartLine({...line,quick_quantity:-1},5));assert(!validateCartLine({...line,quick_quantity:0.5},5))})
test('Cart persistence rejects corrupt local data and never invents unknown price',()=>{assert.deepEqual(readCart('{broken'),[]);assert.deepEqual(readCart('[null]'),[]);assert.equal(readCart(JSON.stringify([{...line,expected_price:null}]))[0].expected_price,null);assert.deepEqual(readCart(JSON.stringify([{...line,selected_image_ids:['1']}])) ,[])})

test('Empty Cloud settings are ready without image URLs; custom settings survive',()=>{
 const ready=catalogDefaults({guide:[],banner_url:'',size_image_url:''})
 assert.equal(ready.banner_url,CATALOG_BANNER_URL);assert.equal(ready.size_image_url,CATALOG_SIZE_IMAGE_URL);assert.deepEqual(ready.guide,SIZE_GUIDE)
 assert.equal(ready.zalo_url,'');assert.equal(ready.messenger_url,'')
 const custom={banner_url:'https://shop.example/banner.jpg',size_image_url:'https://shop.example/size.jpg',guide:SIZE_GUIDE.map(r=>[...r]),zalo_url:'https://zalo.me/shop'}
 assert.deepEqual(catalogDefaults(custom),{...custom,messenger_url:''})
 assert.deepEqual(catalogDefaults({guide:[null]}).guide,SIZE_GUIDE)
})

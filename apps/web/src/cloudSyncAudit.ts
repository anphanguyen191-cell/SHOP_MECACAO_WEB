/** Pure, fail-closed inventory reconciliation. No Storage or payment mutations here.
 * Sold rows remain immutable history; withdrawn physical images are retained as
 * unavailable catalog entries so orders/receipts retain their references.
 */
export type SyncPhoto = {id:number|string;product_id:number|string;variant_id:number|string}
export type SyncAsset = {image_id:number|string;ready:boolean;source_present?:boolean|null;object_path?:string}
export type SyncSold = {image_id:number|string}
export type SyncVariant = {id:number|string;product_id:number|string;sku:string;size:string}
export type SyncProduct = {id:number|string;product_code:string;name:string}
export function validateCloudProductNames(local:SyncProduct[],remote:SyncProduct[]){
 const source=indexed(local,p=>id(p.id,'Product Windows'),'Product Windows')
 const cloud=indexed(remote,p=>id(p.id,'Product Cloud'),'Product Cloud')
 for(const [number,product] of source){
  const saved=cloud.get(number)
  if(!saved||saved.product_code!==product.product_code||saved.name!==product.name)
   throw Error('Tên/mã sản phẩm Cloud #'+number+' chưa trùng chính xác Windows. Dừng kích hoạt; không tự sửa tên kho gốc.')
 }
 if(cloud.size!==source.size)throw Error('Danh mục Cloud có sản phẩm không thuộc kho Windows; cần đọc lại trước khi kích hoạt.')
 return source.size
}
const id=(value:unknown,name:string):number=>{
 const n=Number(value)
 if(!Number.isSafeInteger(n)||n<1)throw Error('Cloud: ID '+name+' không hợp lệ; dừng đối chiếu.')
 return n
}
function indexed<T>(rows:T[],key:(row:T)=>number,name:string):Map<number,T>{
 const map=new Map<number,T>()
 for(const row of rows){const k=key(row);if(map.has(k))throw Error('Cloud: ID '+name+' bị trùng ('+k+'); dừng đồng bộ.');map.set(k,row)}
 return map
}
export function validateCloudVariants(local:SyncVariant[],remote:SyncVariant[]){
 const server=indexed(remote,v=>id(v.id,'Size Cloud'),'Size Cloud')
 const seen=indexed(local,v=>id(v.id,'Size Windows'),'Size Windows')
 for(const [key,row] of seen){
  const other=server.get(key)
  if(!other||id(other.product_id,'Product Cloud')!==id(row.product_id,'Product Windows')
   ||other.sku!==row.sku||other.size!==row.size)
   throw Error('Cloud: Size #'+key+' không khớp Product/SKU/Size Windows. Dừng để kiểm tra.')
 }
 return seen.size
}
export function reconcileCloudImages(
 local:SyncPhoto[],remote:SyncPhoto[],assets:SyncAsset[],soldRows:SyncSold[],localProducts:number
){
 const expected=indexed(local,x=>id(x.id,'ảnh Windows'),'ảnh Windows')
 const images=indexed(remote,x=>id(x.id,'ảnh Cloud'),'ảnh Cloud')
 const available=indexed(assets,x=>id(x.image_id,'asset Cloud'),'asset Cloud')
 const sold=new Set(soldRows.map(x=>id(x.image_id,'SOLD')))
 if(localProducts===0&&images.size>0)throw Error('Windows báo kho không có sản phẩm nhưng Cloud có ảnh. Không tự rút hàng khi chưa xác minh lại kho.')
 for(const [key,photo] of expected){
  const entry=images.get(key),asset=available.get(key)
  if(!entry||!asset||!asset.ready||asset.source_present===false)
   throw Error('Cloud: ảnh tồn #'+key+' chưa sẵn sàng hoặc chưa có file đăng ký; không kích hoạt.')
  if(sold.has(key))throw Error('Cloud: ảnh #'+key+' đang SOLD nhưng Windows báo còn tồn. Cần đối soát.')
  if(id(entry.product_id,'Product Cloud')!==id(photo.product_id,'Product Windows')
     ||id(entry.variant_id,'Size Cloud')!==id(photo.variant_id,'Size Windows'))
   throw Error('Cloud: ảnh #'+key+' khác Product/Size Windows; ngừng để tránh trộn kho.')
  if(typeof asset.object_path!=='string'||!asset.object_path)
   throw Error('Cloud: ảnh #'+key+' thiếu đường dẫn Storage.')
 }
 const withdrawn:number[]=[]
 for(const [key,photo] of images){
  if(expected.has(key)||sold.has(key))continue
  const asset=available.get(key)
  if(asset?.ready&&asset.source_present!==false)withdrawn.push(key)
 }
 return {expected:expected.size,ready:expected.size,withdrawn:withdrawn.sort((a,b)=>a-b)}
}

/** Read-only preflight: no remote mutations until every page is validated. */
export async function readCloudSourceSnapshot(read:(offset:number)=>Promise<any>){
 const pages:any[]=[],seen=new Set<number>();let offset=0,present=0,total=0,instance:string|undefined
 for(;;){
  const page=await read(offset)
  if(typeof page.instance!=='string'||!page.instance||(instance&&page.instance!==instance)||!Array.isArray(page.images)||!Array.isArray(page.sourceState)||page.sourceState.length!==page.images.length)throw Error('Kho Windows trả dữ liệu không đầy đủ hoặc đổi định danh; chưa đồng bộ.')
  instance=page.instance
  const states=new Map<number,boolean>()
  for(const state of page.sourceState){const key=id(state.id,'nguồn');if(states.has(key)||typeof state.present!=='boolean')throw Error('Trạng thái nguồn bị trùng hoặc không hợp lệ.');states.set(key,state.present)}
  for(const image of page.images){const key=id(image.id,'nguồn');if(seen.has(key)||!states.has(key))throw Error('Danh sách ảnh nguồn bị trùng hoặc thiếu trạng thái.');seen.add(key);total++;if(states.get(key))present++}
  pages.push(page)
  if(page.done===true)break
  if(!Number.isSafeInteger(page.nextOffset)||page.nextOffset<=offset)throw Error('Phân trang Windows không tiến tới; dừng đồng bộ.')
  offset=page.nextOffset
 }
 if(total>0&&present===0)throw Error('Toàn bộ ảnh nguồn Windows đang thiếu. Kiểm tra ổ đĩa/kho; chưa thay đổi tồn Cloud.')
 return pages
}

export function verifyStorageDeletion(entries:Array<{path:string;bytes:number}>,removed:unknown){
 const paths=new Set<string>()
 for(const x of entries){if(typeof x.path!=='string'||!x.path||paths.has(x.path)||!Number.isFinite(x.bytes)||x.bytes<0)throw Error('Danh sách xóa Storage không hợp lệ.');paths.add(x.path)}
 if(!Array.isArray(removed))throw Error('Storage chưa xác nhận kết quả xóa; chưa cộng dung lượng đã dọn.')
 const deleted=new Set<string>()
 for(const x of removed){if(!x||typeof x.name!=='string'||!paths.has(x.name)||deleted.has(x.name))throw Error('Kết quả xóa Storage không khớp yêu cầu.');deleted.add(x.name)}
 if(deleted.size!==paths.size)throw Error('Storage mới xác nhận xóa '+deleted.size+'/'+paths.size+' file; dừng để đối soát quyền xóa.')
 return {count:deleted.size,bytes:entries.reduce((n,x)=>n+x.bytes,0)}
}

/** Bound work and drain every active request before releasing the sync lock. */
export async function runImageSyncQueue<T>(items:T[],worker:(item:T)=>Promise<void>,stopped:()=>boolean,concurrency=2){
 if(!Number.isInteger(concurrency)||concurrency<1||concurrency>4)throw Error('Invalid sync concurrency')
 let index=0,failed=false,failure:unknown
 await Promise.all(Array.from({length:Math.min(concurrency,items.length)},async()=>{
  while(!failed&&!stopped()){
   const current=index++;if(current>=items.length)return
   try{await worker(items[current])}catch(e){failed=true;failure??=e}
  }
 }))
 if(failed)throw failure
}

/** Read-only Windows-to-Cloud preview; never changes database or Storage. */
export function assessCloudSyncPreview(pages:any[],remote:{products:SyncProduct[];variants:SyncVariant[];images:SyncPhoto[];assets:SyncAsset[]},cloudInstance:string|null){
 if(!pages.length||typeof pages[0]?.instance!=='string'||!pages[0].instance)throw Error('Chưa xác định được kho Windows để đối chiếu.')
 const ps:any[]=[],vs:any[]=[],is:any[]=[],ss:any[]=[]
 for(const page of pages){
  if(page.instance!==pages[0].instance)throw Error('Kho Windows đã thay đổi khi đọc.')
  for(const k of ['products','variants','images','sourceState'])if(!Array.isArray(page[k]))throw Error('Thiếu dữ liệu '+k+' trên Windows.')
  if(page.images.length!==page.sourceState.length)throw Error('Ảnh Windows không khớp trạng thái nguồn.')
  ps.push(...page.products);vs.push(...page.variants);is.push(...page.images);ss.push(...page.sourceState)
 }
 const lp=indexed(ps,p=>id(p.id,'Product Windows'),'Product Windows')
 const lv=indexed(vs,p=>id(p.id,'Size Windows'),'Size Windows')
 const li=indexed(is,p=>id(p.id,'ảnh Windows'),'ảnh Windows')
 const ls=indexed(ss,p=>id(p.id,'nguồn Windows'),'nguồn Windows')
 const rp=indexed(remote.products,p=>id(p.id,'Product Cloud'),'Product Cloud')
 const rv=indexed(remote.variants,p=>id(p.id,'Size Cloud'),'Size Cloud')
 const ri=indexed(remote.images,p=>id(p.id,'ảnh Cloud'),'ảnh Cloud')
 const ra=indexed(remote.assets,p=>id(p.image_id,'file Cloud'),'file Cloud')
 const conflicts:string[]=[]
 for(const [number,p] of lp){
  if(typeof p.name!=='string'||!p.name.trim()||typeof p.product_code!=='string'||!p.product_code.trim())throw Error('Product Windows #'+number+' thiếu tên/mã.')
  const other=rp.get(number)
  if(other&&(other.name!==p.name||other.product_code!==p.product_code))conflicts.push('Product #'+number+': tên/mã Cloud khác Windows ('+p.name+').')
 }
 for(const [number,v] of lv){
  if(!lp.has(id(v.product_id,'Product của Size')))throw Error('Size #'+number+' thiếu Product Windows.')
  const other=rv.get(number)
  if(other&&(Number(other.product_id)!==Number(v.product_id)||other.sku!==v.sku||other.size!==v.size))
    conflicts.push('Size #'+number+': Product/SKU/Size Cloud không khớp Windows.')
 }
 let stock=0,missing=0,newUploads=0
 for(const [number,p] of li){
  const v=lv.get(id(p.variant_id,'Size của ảnh'))
  if(!v||id(v.product_id,'Product của Size')!==id(p.product_id,'Product của ảnh'))throw Error('Ảnh #'+number+' thiếu hoặc sai Product/Size Windows.')
  const source=ls.get(number)
  if(!source||typeof source.present!=='boolean')throw Error('Ảnh #'+number+' không có trạng thái nguồn Windows.')
  const other=ri.get(number)
  if(other&&(Number(other.product_id)!==Number(p.product_id)||Number(other.variant_id)!==Number(p.variant_id)))
    conflicts.push('Ảnh #'+number+': Product/Size Cloud không khớp Windows.')
  if(source.present){stock++;const asset=ra.get(number);if(!asset?.ready||asset.source_present===false)newUploads++}else missing++
 }
 if(ls.size!==li.size)throw Error('Nguồn Windows trả ID ảnh dư.')
 const needsHandoff=!!cloudInstance&&cloudInstance!==pages[0].instance
 return {local:{products:lp.size,sizes:lv.size,stock,missing},cloud:{products:rp.size,sizes:rv.size,images:ri.size,ready:[...ra.values()].filter(a=>a.ready&&a.source_present!==false).length},
  newUploads,needsHandoff,conflictCount:conflicts.length,conflicts:conflicts.slice(0,10),safe:!needsHandoff&&!conflicts.length&&stock>0}
}

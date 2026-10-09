import { useEffect,useMemo,useRef,useState } from 'react'
import FolderPicker from './FolderPicker'
import {apiJson} from './uiState'

type Product={id:number;product_code:string;name:string}
type Variant={id:number;sku:string;size:string;cost_price:number;sale_price:number}
type ProductDetail={product:any;variants:Variant[]}
type Flow='NEW_PRODUCT'|'NEW_SIZE'|'EXISTING_SIZE'
type SizeRow={size:string;sku:string;quantity:number;costPrice:number;salePrice:number;sourcePath:string;imageCount:number}
type Progress={phase:string;percent:number;copied:number;total:number;current?:string}
const blank=():SizeRow=>({size:'',sku:'',quantity:1,costPrice:0,salePrice:0,sourcePath:'',imageCount:0})
const labels:Record<string,string>={VALIDATE:'Kiểm tra dữ liệu',PREPARE:'Chuẩn bị thư mục kho',COPY:'Copy ảnh vào kho',VERIFY:'Kiểm tra ảnh',DB_COMMIT:'Ghi dữ liệu kho',INTEGRITY:'Kiểm tra toàn vẹn',DONE:'Hoàn tất',ROLLBACK:'Hoàn tác'}

export default function GoodsReceipt({onDone}:{onDone?:()=>void}){
 const [products,setProducts]=useState<Product[]>([]),[flow,setFlow]=useState<Flow>('EXISTING_SIZE'),[productId,setProductId]=useState(0),[detail,setDetail]=useState<ProductDetail|null>(null)
 const [name,setName]=useState(''),[code,setCode]=useState(''),[category,setCategory]=useState(''),[storeRoot,setStoreRoot]=useState(''),[rows,setRows]=useState<SizeRow[]>([blank()]),[note,setNote]=useState('')
 const [busy,setBusy]=useState(false),[msg,setMsg]=useState(''),[progress,setProgress]=useState<Progress|null>(null),[productSearch,setProductSearch]=useState(''),[pick,setPick]=useState<{kind:'store'|'source';row?:number}|null>(null)
 const [reading,setReading]=useState(false)
 const requestVersion=useRef(0),submitLock=useRef(false)
 useEffect(()=>{let alive=true;apiJson<Product[]>('/api/products').then(j=>{if(alive)setProducts(j)}).catch(e=>{if(alive)setMsg(e.message)});return()=>{alive=false;requestVersion.current++}},[])
 const filteredProducts=useMemo(()=>{const q=productSearch.trim().toLowerCase();return q?products.filter(p=>p.name.toLowerCase().includes(q)||p.product_code.toLowerCase().includes(q)):products},[products,productSearch])
 async function chooseProduct(id:number){
  const version=++requestVersion.current
  setProductId(id);setMsg('');setDetail(null);setRows([blank()]);setReading(true)
  try{
   const j=await apiJson<ProductDetail>('/api/products/'+id)
   if(version!==requestVersion.current)return
   setDetail(j);setName(j.product.name);setCode(j.product.product_code)
   const first=j.variants?.[0]
   if(flow==='EXISTING_SIZE')setRows(first?[{...blank(),size:first.size,sku:first.sku,costPrice:first.cost_price??0,salePrice:first.sale_price??0}]:[blank()])
  }catch(e){if(version===requestVersion.current){setProductId(0);setMsg(e instanceof Error?e.message:'Không đọc được sản phẩm')}}
  finally{if(version===requestVersion.current)setReading(false)}
 }
 function switchFlow(next:Flow){requestVersion.current++;setReading(false);setFlow(next);setMsg('');setProgress(null);setProductId(0);setDetail(null);setProductSearch('');setName('');setCode('');setCategory('');setRows([blank()])}
 function patch(i:number,k:keyof SizeRow,v:string|number){setRows(previous=>previous.map((row,index)=>index===i?{...row,[k]:typeof row[k]==='number'?Math.max(0,Number(v)||0):v,...(k==='sourcePath'?{imageCount:0,quantity:0}:{})}:row))}
 async function inspect(i:number,selectedPath?:string){
  const p=(selectedPath??rows[i].sourcePath).trim()
  if(!p)return
  const version=++requestVersion.current;setReading(true);setMsg('')
  setRows(previous=>previous.map((row,index)=>index===i?{...row,sourcePath:p,imageCount:0,quantity:0}:row))
  try{
   const j=await apiJson('/api/goods-receipt/inspect',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({path:p})})
   if(version!==requestVersion.current)return
   setRows(previous=>previous.map((row,index)=>index===i&&row.sourcePath===p?{...row,imageCount:j.count,quantity:j.count}:row))
   setMsg(j.count+' ảnh hợp lệ — tồn nhập đề xuất '+j.count)
  }catch(e){if(version===requestVersion.current)setMsg(e instanceof Error?e.message:'Không đọc được folder ảnh')}
  finally{if(version===requestVersion.current)setReading(false)}
 }
 function chooseExistingVariant(id:number){const v=detail?.variants.find(x=>x.id===id);if(v)setRows([{size:v.size,sku:v.sku,quantity:1,costPrice:v.cost_price??0,salePrice:v.sale_price??0,sourcePath:'',imageCount:0}])}
 async function submit(){if(submitLock.current||reading)return;submitLock.current=true;setBusy(true);setMsg('');setProgress({phase:'VALIDATE',percent:2,copied:0,total:rows.reduce((n,r)=>n+r.imageCount,0)})
  try{
   if(rows.some(x=>!x.size.trim()||!x.sourcePath||x.imageCount<1))throw new Error('Mỗi Size cần tên và ảnh nguồn hợp lệ. Xóa Size trống trước khi lưu.')
   for(const r of rows) if(r.imageCount!==r.quantity) throw new Error('Tồn phải bám theo ảnh thực tế: Size '+r.size+' có '+r.imageCount+' ảnh nhưng SL nhập là '+r.quantity)
   const payload={storeRoot,productId:flow==='NEW_PRODUCT'?undefined:productId||undefined,name,productCode:code,category,note,sizes:rows.filter(r=>r.size.trim()).map(r=>({size:r.size,sku:r.sku||undefined,quantity:r.imageCount,costPrice:Math.trunc(r.costPrice),salePrice:Math.trunc(r.salePrice),sourcePath:r.sourcePath||undefined}))}
   const r=await fetch('/api/goods-receipt',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});const j=await r.json();if(!r.ok)throw new Error(j.error||'Nhập hàng thất bại')
   setProgress((j.events??[]).at(-1)??{phase:'DONE',percent:100,copied:j.result.copiedImages,total:j.result.copiedImages})
   setMsg('Nhập thành công: '+j.result.totalQuantity+' bộ · '+j.result.copiedImages+' ảnh đã copy vào kho. Tiến độ được xác nhận sau khi máy chủ hoàn tất, không phải cập nhật trực tiếp.')
   setRows(previous=>previous.map(row=>({...row,sourcePath:'',imageCount:0,quantity:0})))
   if(flow==='NEW_PRODUCT'){setName('');setCode('');setRows([blank()])}
   apiJson<Product[]>('/api/products').then(setProducts).catch(()=>{})
   onDone?.()
  }catch(e){setProgress(null);setMsg(e instanceof Error?e.message:'Nhập hàng thất bại')}finally{submitLock.current=false;setBusy(false)}
 }
 const existingSizes=detail?.variants??[]
 return <section className="receipt receiptV2">
  <div className="receiptHero"><div><p className="eyebrow">NHẬP HÀNG</p><h3>Chọn đúng tình huống nhập kho</h3><p>Dữ liệu đã có thì chọn lại từ hệ thống; chỉ nhập tay khi tạo mới.</p></div></div>
  <fieldset className="receiptFields" disabled={busy||reading}><div className="flowTabs">
   <button className={flow==='NEW_PRODUCT'?'active':''} onClick={()=>switchFlow('NEW_PRODUCT')}><b>1. Mẫu mới hoàn toàn</b><span>Tạo Product + Size mới</span></button>
   <button className={flow==='NEW_SIZE'?'active':''} onClick={()=>switchFlow('NEW_SIZE')}><b>2. Thêm Size mới</b><span>Product đã có, Size chưa có</span></button>
   <button className={flow==='EXISTING_SIZE'?'active':''} onClick={()=>switchFlow('EXISTING_SIZE')}><b>3. Nhập thêm Size đã có</b><span>Product + Size đều có sẵn</span></button>
  </div>
  <div className="formGrid"><label>Kho đích<div className="pickerInput"><input value={storeRoot} readOnly placeholder={'D:\\1-Me CaCao Store'}/><button onClick={()=>setPick({kind:'store'})}>CHỌN KHO</button></div></label><label>Ghi chú<input value={note} onChange={e=>setNote(e.target.value)} placeholder="Ví dụ: Hàng về đợt chiều"/></label></div>
  {flow!=='NEW_PRODUCT'&&<div className="productPicker"><label>Tìm sản phẩm có sẵn<input value={productSearch} onChange={e=>setProductSearch(e.target.value)} placeholder="Gõ tên hoặc mã sản phẩm..."/></label><div className="pickerResults">{filteredProducts.slice(0,12).map(p=><button key={p.id} className={productId===p.id?'selected':''} onClick={()=>void chooseProduct(p.id)}><b>{p.name}</b><span>{p.product_code}</span></button>)}</div></div>}
  {flow==='NEW_PRODUCT'&&<div className="formGrid"><label>Tên sản phẩm mới<input value={name} onChange={e=>setName(e.target.value)}/></label><label>Mã sản phẩm<input value={code} onChange={e=>setCode(e.target.value)} placeholder="Để trống = tự đề xuất"/></label><label>Danh mục<input value={category} onChange={e=>setCategory(e.target.value)} placeholder="Danh mục mới hoặc hiện có"/></label></div>}
  {flow==='NEW_SIZE'&&detail&&<div className="existingContext"><b>{detail.product.name}</b><span>Size đang có: {existingSizes.map(v=>v.size).join(' · ')||'Chưa có'}</span></div>}
  {flow==='EXISTING_SIZE'&&detail&&<div className="variantChooser"><span>Chọn Size có sẵn:</span>{existingSizes.map(v=><button key={v.id} className={rows[0]?.sku===v.sku?'active':''} onClick={()=>chooseExistingVariant(v.id)}>{v.size}<small>{v.sku}</small></button>)}</div>}
  <h4>{flow==='EXISTING_SIZE'?'Ảnh mới / SL theo ảnh / Giá nhập / Giá bán':'Size / SKU / Folder ảnh / SL theo ảnh / Giá nhập / Giá bán'}</h4>
  {rows.map((x,i)=><div className="receiptRowV2" key={i}>
   <label>Size<input aria-label={'Size dòng '+(i+1)} value={x.size} disabled={flow==='EXISTING_SIZE'} onChange={e=>patch(i,'size',e.target.value)} placeholder="Size"/></label>
   <label>SKU<input value={x.sku} disabled={flow==='EXISTING_SIZE'} onChange={e=>patch(i,'sku',e.target.value)} placeholder="SKU tự động"/></label>
   <div className="sourcePicker"><input value={x.sourcePath} readOnly placeholder="Folder ảnh nguồn"/><button onClick={()=>setPick({kind:'source',row:i})} disabled={busy}>CHỌN ẢNH</button><button onClick={()=>void inspect(i)} disabled={busy||!x.sourcePath}>QUÉT</button></div>
   <div className="imageCountBadge"><b>{x.imageCount}</b><span>ảnh = tồn nhập</span></div>
   <label>Giá nhập (đ)<input type="number" min="0" step="1" value={x.costPrice} onChange={e=>patch(i,'costPrice',e.target.value)} placeholder="Giá nhập"/></label>
   <label>Giá bán (đ)<input type="number" min="0" step="1" value={x.salePrice} onChange={e=>patch(i,'salePrice',e.target.value)} placeholder="Giá bán"/></label>
  </div>)}
  {flow!=='EXISTING_SIZE'&&<div className="row"><button onClick={()=>setRows(previous=>[...previous,blank()])}>+ THÊM SIZE</button>{rows.length>1&&<button onClick={()=>setRows(previous=>previous.slice(0,-1))}>BỎ SIZE CUỐI</button>}</div>}
  <div className="row actions"><span className="receiptRule">1 ảnh hợp lệ trong Size = 1 sản phẩm vật lý nhập kho</span><button className="primary" disabled={busy||reading||!storeRoot||(flow==='NEW_PRODUCT'?!name.trim():!productId)||rows.some(r=>!r.imageCount||!r.size.trim()||!r.sourcePath)} onClick={()=>void submit()}>{busy?'ĐANG NHẬP...':'XÁC NHẬN NHẬP HÀNG'}</button></div>
  </fieldset>{reading&&<p className="loadingState" role="status">Đang kiểm tra dữ liệu...</p>}
  {progress&&<div className="progressBox"><div className="row"><b>{labels[progress.phase]??progress.phase}</b><strong>{progress.percent}%</strong></div><progress max="100" value={progress.percent}/><small>{progress.total?progress.copied+'/'+progress.total+' ảnh':''}{progress.current?' · '+progress.current:''}</small></div>}
  {msg&&<p className="notice" role="status">{msg}</p>}
  {pick&&<FolderPicker title={pick.kind==='store'?'Chọn kho ảnh Shop Mẹ CaCao':'Chọn folder ảnh hàng mới'} onClose={()=>setPick(null)} onPick={p=>{if(pick.kind==='store')setStoreRoot(p);else if(pick.row!==undefined){void inspect(pick.row,p)}setPick(null)}}/>}
 </section>
}

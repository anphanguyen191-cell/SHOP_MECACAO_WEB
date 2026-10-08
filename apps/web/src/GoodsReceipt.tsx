import { useEffect,useMemo,useState } from 'react'
import FolderPicker from './FolderPicker'

type Product={id:number;product_code:string;name:string}
type Variant={id:number;sku:string;size:string;cost_price:number;sale_price:number}
type ProductDetail={product:any;variants:Variant[]}
type Flow='NEW_PRODUCT'|'NEW_SIZE'|'EXISTING_SIZE'
type SizeRow={size:string;sku:string;quantity:number;costPrice:number;salePrice:number;sourcePath:string;imageCount:number}
type Progress={phase:string;percent:number;copied:number;total:number;current?:string}
const blank=():SizeRow=>({size:'',sku:'',quantity:1,costPrice:0,salePrice:0,sourcePath:'',imageCount:0})
const labels:Record<string,string>={VALIDATE:'Kiểm tra dữ liệu',PREPARE:'Chuẩn bị thư mục kho',COPY:'Copy ảnh vào kho',VERIFY:'Kiểm tra ảnh',DB_COMMIT:'Ghi dữ liệu kho',INTEGRITY:'Kiểm tra toàn vẹn',DONE:'Hoàn tất',ROLLBACK:'Hoàn tác'}

export default function GoodsReceipt(){
 const [products,setProducts]=useState<Product[]>([]),[flow,setFlow]=useState<Flow>('EXISTING_SIZE'),[productId,setProductId]=useState(0),[detail,setDetail]=useState<ProductDetail|null>(null)
 const [name,setName]=useState(''),[code,setCode]=useState(''),[category,setCategory]=useState(''),[storeRoot,setStoreRoot]=useState(''),[rows,setRows]=useState<SizeRow[]>([blank()]),[note,setNote]=useState('')
 const [busy,setBusy]=useState(false),[msg,setMsg]=useState(''),[progress,setProgress]=useState<Progress|null>(null),[productSearch,setProductSearch]=useState(''),[pick,setPick]=useState<{kind:'store'|'source';row?:number}|null>(null)
 useEffect(()=>{fetch('/api/products').then(r=>r.json()).then(setProducts).catch(()=>{})},[])
 const filteredProducts=useMemo(()=>{const q=productSearch.trim().toLowerCase();return q?products.filter(p=>p.name.toLowerCase().includes(q)||p.product_code.toLowerCase().includes(q)):products},[products,productSearch])
 async function chooseProduct(id:number){setProductId(id);setMsg('');if(!id){setDetail(null);return}const r=await fetch('/api/products/'+id);const j=await r.json();if(r.ok){setDetail(j);setName(j.product.name);setCode(j.product.product_code);if(flow==='EXISTING_SIZE'){const first=j.variants?.[0];setRows(first?[{size:first.size,sku:first.sku,quantity:1,costPrice:first.cost_price??0,salePrice:first.sale_price??0,sourcePath:'',imageCount:0}]:[blank()])}else if(flow==='NEW_SIZE'){setRows([blank()])}}}
 function switchFlow(next:Flow){setFlow(next);setMsg('');setProgress(null);setProductId(0);setDetail(null);setProductSearch('');setName('');setCode('');setCategory('');setRows([blank()])}
 function patch(i:number,k:keyof SizeRow,v:string|number){const a=[...rows];a[i]={...a[i],[k]:typeof a[i][k]==='number'?Math.max(0,Number(v)||0):v};setRows(a)}
 async function inspect(i:number,selectedPath?:string){const p=(selectedPath??rows[i].sourcePath).trim();if(!p){setMsg('Chọn hoặc nhập folder ảnh nguồn của Size.');return}const r=await fetch('/api/goods-receipt/inspect',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({path:p})});const j=await r.json();if(!r.ok){setMsg(j.error||'Không đọc được folder ảnh');return}const a=[...rows];a[i]={...a[i],imageCount:j.count,quantity:j.count};setRows(a);setMsg(j.count+' ảnh hợp lệ — tồn nhập đề xuất '+j.count)}
 function chooseExistingVariant(id:number){const v=detail?.variants.find(x=>x.id===id);if(v)setRows([{size:v.size,sku:v.sku,quantity:1,costPrice:v.cost_price??0,salePrice:v.sale_price??0,sourcePath:'',imageCount:0}])}
 async function submit(){if(busy)return;setBusy(true);setMsg('');setProgress({phase:'VALIDATE',percent:2,copied:0,total:rows.reduce((n,r)=>n+r.imageCount,0)})
  try{
   for(const r of rows.filter(x=>x.size.trim())) if(r.imageCount!==r.quantity) throw new Error('Tồn phải bám theo ảnh thực tế: Size '+r.size+' có '+r.imageCount+' ảnh nhưng SL nhập là '+r.quantity)
   const payload={storeRoot,productId:flow==='NEW_PRODUCT'?undefined:productId||undefined,name,productCode:code,category,note,sizes:rows.filter(r=>r.size.trim()).map(r=>({size:r.size,sku:r.sku||undefined,quantity:r.imageCount,costPrice:Math.trunc(r.costPrice),salePrice:Math.trunc(r.salePrice),sourcePath:r.sourcePath||undefined}))}
   const r=await fetch('/api/goods-receipt',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});const j=await r.json();if(!r.ok)throw new Error(j.error||'Nhập hàng thất bại')
   setProgress((j.events??[]).at(-1)??{phase:'DONE',percent:100,copied:j.result.copiedImages,total:j.result.copiedImages})
   setMsg('Nhập thành công: '+j.result.totalQuantity+' bộ · '+j.result.copiedImages+' ảnh đã copy vào kho. Tiến độ được xác nhận sau khi máy chủ hoàn tất, không phải cập nhật trực tiếp.')
  }catch(e){setMsg(e instanceof Error?e.message:'Nhập hàng thất bại')}finally{setBusy(false)}
 }
 const existingSizes=detail?.variants??[]
 return <section className="receipt receiptV2">
  <div className="receiptHero"><div><p className="eyebrow">NHẬP HÀNG</p><h3>Chọn đúng tình huống nhập kho</h3><p>Dữ liệu đã có thì chọn lại từ hệ thống; chỉ nhập tay khi tạo mới.</p></div></div>
  <div className="flowTabs">
   <button className={flow==='NEW_PRODUCT'?'active':''} onClick={()=>switchFlow('NEW_PRODUCT')}><b>1. Mẫu mới hoàn toàn</b><span>Tạo Product + Size mới</span></button>
   <button className={flow==='NEW_SIZE'?'active':''} onClick={()=>switchFlow('NEW_SIZE')}><b>2. Thêm Size mới</b><span>Product đã có, Size chưa có</span></button>
   <button className={flow==='EXISTING_SIZE'?'active':''} onClick={()=>switchFlow('EXISTING_SIZE')}><b>3. Nhập thêm Size đã có</b><span>Product + Size đều có sẵn</span></button>
  </div>
  <div className="formGrid"><label>Kho đích<div className="pickerInput"><input value={storeRoot} readOnly placeholder={'D:\\1-Me CaCao Store'}/><button onClick={()=>setPick({kind:'store'})}>CHỌN KHO</button></div></label><label>Ghi chú<input value={note} onChange={e=>setNote(e.target.value)} placeholder="Ví dụ: Hàng về đợt chiều"/></label></div>
  {flow!=='NEW_PRODUCT'&&<div className="productPicker"><label>Tìm sản phẩm có sẵn<input value={productSearch} onChange={e=>setProductSearch(e.target.value)} placeholder="Gõ tên hoặc mã sản phẩm..."/></label><div className="pickerResults">{filteredProducts.slice(0,12).map(p=><button key={p.id} className={productId===p.id?'selected':''} onClick={()=>void chooseProduct(p.id)}><b>{p.name}</b><span>{p.product_code}</span></button>)}</div></div>}
  {flow==='NEW_PRODUCT'&&<div className="formGrid"><label>Tên sản phẩm mới<input value={name} onChange={e=>setName(e.target.value)}/></label><label>Mã sản phẩm<input value={code} onChange={e=>setCode(e.target.value)} placeholder="Để trống = tự đề xuất"/></label><label>Danh mục<input value={category} onChange={e=>setCategory(e.target.value)} placeholder="Danh mục mới hoặc hiện có"/></label></div>}
  {flow==='NEW_SIZE'&&detail&&<div className="existingContext"><b>{detail.product.name}</b><span>Size đang có: {existingSizes.map(v=>v.size).join(' · ')||'Chưa có'}</span></div>}
  {flow==='EXISTING_SIZE'&&detail&&<div className="variantChooser"><span>Chọn Size có sẵn:</span>{existingSizes.map(v=><button key={v.id} className={rows[0]?.sku===v.sku?'active':''} onClick={()=>chooseExistingVariant(v.id)}>Size {v.size}<small>{v.sku}</small></button>)}</div>}
  <h4>{flow==='EXISTING_SIZE'?'Ảnh mới / SL theo ảnh / Giá nhập / Giá bán':'Size / SKU / Folder ảnh / SL theo ảnh / Giá nhập / Giá bán'}</h4>
  {rows.map((x,i)=><div className="receiptRowV2" key={i}>
   <input value={x.size} disabled={flow==='EXISTING_SIZE'} onChange={e=>patch(i,'size',e.target.value)} placeholder="Size"/>
   <input value={x.sku} disabled={flow==='EXISTING_SIZE'} onChange={e=>patch(i,'sku',e.target.value)} placeholder="SKU tự động"/>
   <div className="sourcePicker"><input value={x.sourcePath} readOnly placeholder="Folder ảnh nguồn"/><button onClick={()=>setPick({kind:'source',row:i})} disabled={busy}>CHỌN ẢNH</button><button onClick={()=>void inspect(i)} disabled={busy||!x.sourcePath}>QUÉT</button></div>
   <div className="imageCountBadge"><b>{x.imageCount}</b><span>ảnh = tồn nhập</span></div>
   <input type="number" min="0" value={x.costPrice} onChange={e=>patch(i,'costPrice',e.target.value)} placeholder="Giá nhập"/>
   <input type="number" min="0" value={x.salePrice} onChange={e=>patch(i,'salePrice',e.target.value)} placeholder="Giá bán"/>
  </div>)}
  {flow!=='EXISTING_SIZE'&&<div className="row"><button onClick={()=>setRows([...rows,blank()])}>+ THÊM SIZE</button></div>}
  <div className="row actions"><span className="receiptRule">1 ảnh hợp lệ trong Size = 1 sản phẩm vật lý nhập kho</span><button className="primary" disabled={busy||!storeRoot||(flow!=='NEW_PRODUCT'&&!productId)||rows.every(r=>!r.imageCount)} onClick={()=>void submit()}>{busy?'ĐANG NHẬP...':'XÁC NHẬN NHẬP HÀNG'}</button></div>
  {progress&&<div className="progressBox"><div className="row"><b>{labels[progress.phase]??progress.phase}</b><strong>{progress.percent}%</strong></div><progress max="100" value={progress.percent}/><small>{progress.total?progress.copied+'/'+progress.total+' ảnh':''}{progress.current?' · '+progress.current:''}</small></div>}
  {msg&&<p className="notice">{msg}</p>}
  {pick&&<FolderPicker title={pick.kind==='store'?'Chọn kho ảnh Shop Mẹ CaCao':'Chọn folder ảnh hàng mới'} onClose={()=>setPick(null)} onPick={p=>{if(pick.kind==='store')setStoreRoot(p);else if(pick.row!==undefined){patch(pick.row,'sourcePath',p);void inspect(pick.row,p)}setPick(null)}}/>}
 </section>
}

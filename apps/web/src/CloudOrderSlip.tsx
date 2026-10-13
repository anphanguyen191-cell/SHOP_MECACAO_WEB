import {useEffect,useRef,useState} from 'react'
import {cloudRpc} from './cloudClient'
import {renderOrderSlip,slipDate,slipModel} from './orderSlipLayout'
export default function CloudOrderSlip({order,items,contact,urls,assets=[],confirmedAt,disabled=false}:{disabled?:boolean;order:any;items:any[];contact:any;urls:Record<string,string>;assets?:any[];confirmedAt?:string}){
 const [files,setFiles]=useState<File[]>([]),[links,setLinks]=useState<string[]>([]),[busy,setBusy]=useState(false),[error,setError]=useState(''),lock=useRef(false)
 useEffect(()=>{const urls=files.map(f=>URL.createObjectURL(f));setLinks(urls);return()=>urls.forEach(u=>URL.revokeObjectURL(u))},[files])
 async function make(){if(lock.current)return;lock.current=true;setBusy(true);setError('');setFiles([]);try{
  const before=await cloudRpc('mc_v7_finance',{p_id:order.id});if(before.orderVersion!==order.version)throw Error('Đơn đã đổi. Đọc lại trước khi tạo phiếu.')
  if(!items.length)throw Error('Đơn chưa có ảnh sản phẩm.')
  const model=slipModel(order,items,contact,before,slipDate(confirmedAt,new Date()))
  const bannerResponse=await fetch(import.meta.env.BASE_URL+'brand/banner.jpg');if(!bannerResponse.ok)throw Error('Không tải được banner shop.');const banner=await createImageBitmap(await bannerResponse.blob()),generated:File[]=[],pageCount=Math.ceil(items.length/8)
  try{for(let start=0;start<items.length;start+=8){const page=items.slice(start,start+8),images:ImageBitmap[]=[]
   try{for(const item of page){const url=urls[item.image_id];if(!url)throw Error('Ảnh chưa tải đủ. Thử lại sau.');const response=await fetch(url);if(!response.ok)throw Error('Không đọc được ảnh riêng tư.');const blob=await response.blob(),asset=assets.find(a=>Number(a.image_id)===Number(item.image_id));if(asset&&!asset.ready&&asset.proof_sha256){const bytes=await blob.arrayBuffer(),hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))).map(v=>v.toString(16).padStart(2,'0')).join('');if(bytes.byteLength>40000||hash!==asset.proof_sha256)throw Error('Ảnh chứng từ chưa khớp kiểm chứng.')}images.push(await createImageBitmap(blob))}
    const canvas=document.createElement('canvas');renderOrderSlip(canvas,banner,page,images,model,start,items.length,start/8+1,pageCount)
    const blob=await new Promise<Blob>((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(Error('Không tạo được PNG.')),'image/png'));generated.push(new File([blob],'MECACAO-'+order.id.slice(0,8)+'-'+(start/8+1)+'.png',{type:'image/png'}))
   }finally{images.forEach(image=>image.close())}
  }}finally{banner.close()}
  const after=await cloudRpc('mc_v7_finance',{p_id:order.id});if(after.orderVersion!==before.orderVersion||after.version!==before.version||after.adjustedTotal!==before.adjustedTotal||after.netCollected!==before.netCollected||after.due!==before.due)throw Error('Đơn hoặc tiền đã đổi trong lúc tạo phiếu. Tạo lại để dùng số mới.');setFiles(generated)
 }catch(e){setError((e as Error).message);setFiles([])}finally{lock.current=false;setBusy(false)}}
 return <div className="salesButtons"><p role="status">{error}</p><button className="salesAction salesActionPrimary" disabled={disabled||busy||!navigator.onLine} onClick={()=>void make()}>{busy?'Đang tạo…':'Tạo phiếu PNG'}</button>{files.map((file,i)=><a key={file.name} download={file.name} href={links[i]}>Tải trang {i+1}</a>)}{files.length>0&&navigator.canShare?.({files})&&<button onClick={()=>void navigator.share({files,title:'Shop Mẹ CaCao'}).catch(e=>{if(e.name!=='AbortError')setError(e.message)})}>Chia sẻ PNG</button>}</div>
}

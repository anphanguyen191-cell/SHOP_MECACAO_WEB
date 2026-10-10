import {useEffect,useState} from 'react'
import {apiJson} from './uiState'
export default function OrderSlip({id,version,disabled}:{id:string;version:number;disabled:boolean}){
 const [urls,setUrls]=useState<string[]>([]),[error,setError]=useState(''),[busy,setBusy]=useState(false)
 useEffect(()=>()=>{urls.forEach(u=>URL.revokeObjectURL(u))},[urls])
 async function generate(){if(busy||disabled)return;setBusy(true);setError('');setUrls([]);const next:string[]=[];try{const info=await apiJson('/api/sales/drafts/'+id+'/slip?version='+version);for(let page=1;page<=info.pages;page++){const r=await fetch('/api/sales/drafts/'+id+'/slip.png?version='+version+'&page='+page);if(!r.ok){const e=await r.json();throw Error(e.error)}next.push(URL.createObjectURL(await r.blob()))}setUrls(next)}catch(e){next.forEach(u=>URL.revokeObjectURL(u));setError(e instanceof Error?e.message:'Không tạo được PNG')}finally{setBusy(false)}}
 return <section className="orderSlip"><h3>Phiếu chốt đơn PNG</h3><p>Xuất từ đơn đã lưu. Đơn nhiều hàng được chia trang để đọc rõ trên điện thoại.</p><button className="salesAction salesActionPrimary" disabled={disabled||busy} onClick={()=>void generate()}>{busy?'Đang tạo phiếu…':'Xem trước / Tạo lại PNG'}</button>{disabled&&<p>Lưu thay đổi trước khi xuất phiếu.</p>}{error&&<p role="alert">{error}</p>}{urls.map((u,i)=><article key={u}><a className="salesAction salesActionMint" href={u} download={'CHOT_DON_'+id.slice(0,8).toUpperCase()+'_'+(i+1)+'.png'}>Tải PNG · Trang {i+1}</a><img src={u} alt={'Phiếu chốt đơn trang '+(i+1)}/></article>)}</section>
}

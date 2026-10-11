import {useEffect,useRef,useState} from 'react'
import type {ChosenImage} from './InventorySharing'
export default function CloudShare({items,urls,onBusy}:{items:ChosenImage[];urls:Record<string,string>;onBusy:(busy:boolean)=>void}){
 const [files,setFiles]=useState<File[]>([]),[links,setLinks]=useState<string[]>([]),[busy,setBusy]=useState(false),[error,setError]=useState(''),ids=items.map(i=>i.id).join(',')
 const current=useRef(ids),lock=useRef(false);current.current=ids
 useEffect(()=>()=>{current.current='';onBusy(false)},[])
 useEffect(()=>{setFiles([]);setError('')},[ids])
 useEffect(()=>{const links=files.map(file=>URL.createObjectURL(file));setLinks(links);return()=>links.forEach(url=>URL.revokeObjectURL(url))},[files])
 async function prepare(){if(lock.current)return;lock.current=true;const snapshot=ids;setBusy(true);onBusy(true);setError('');try{if(items.length>100)throw Error('Chia sẻ tối đa 100 ảnh mỗi lần.');const prepared:File[]=[];for(const item of items){if(!urls[item.id])throw Error('Ảnh chưa tải đủ.');const response=await fetch(urls[item.id],{signal:AbortSignal.timeout(20000)});if(!response.ok)throw Error('Không tải được ảnh riêng tư.');const blob=await response.blob();if(blob.size>150000)throw Error('Ảnh Cloud vượt giới hạn 150KB.');prepared.push(new File([blob],(item.product+'-'+item.size+'-'+item.id).replace(/[\\/:*?"<>|]/g,'_')+'.jpg',{type:'image/jpeg'}))}if(current.current===snapshot)setFiles(prepared)}catch(e){if(current.current===snapshot){setError((e as Error).message);setFiles([])}}finally{lock.current=false;setBusy(false);onBusy(false)}}
 return <div><p role="status">{error}</p><button disabled={busy||!navigator.onLine} onClick={()=>void prepare()}>{busy?'Đang chuẩn bị…':'Chuẩn bị chia sẻ'}</button>{files.length>0&&navigator.canShare?.({files})&&<button disabled={!navigator.onLine} onClick={()=>void navigator.share({files,title:'Shop Mẹ Ca Cao'}).catch(e=>{if(e.name!=='AbortError')setError(e.message)})}>Chia sẻ {files.length} ảnh</button>}{files.map((file,i)=><a key={file.name} href={links[i]} download={file.name}>Tải ảnh {i+1}</a>)}</div>
}

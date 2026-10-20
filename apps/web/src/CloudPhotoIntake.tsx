import {useEffect,useState} from 'react'
import CloudPhotos from './CloudPhotos'
import {cloud,cloudRows} from './cloudClient'
export default function CloudPhotoIntake({onReceived}:{onReceived:()=>void}){
 const [rows,setRows]=useState<any[]>([]),[signed,setSigned]=useState(false),[error,setError]=useState('')
 async function refresh(){try{const session=(await cloud.auth.getSession()).data.session;setSigned(!!session);if(!session){setRows([]);return}setRows(await cloudRows('cloud_photo_inbox'));setError('')}catch(e){setError((e as Error).message)}}
 useEffect(()=>{void refresh();const timer=setInterval(()=>void refresh(),15000);const {data}=cloud.auth.onAuthStateChange(()=>{void refresh()});return()=>{clearInterval(timer);data.subscription.unsubscribe()}},[])
 return <details className="panel" open><summary>1. Nhận ảnh từ Cloud · 2. Duyệt ảnh trên laptop · 3. Nhập hàng</summary>{!signed&&<p>Đăng nhập Cloud tại Kết nối Cloud để nhận ảnh iPhone qua Internet.</p>}{error&&<p role="alert">{error} <button onClick={()=>void refresh()}>Đọc lại</button></p>}{signed&&<CloudPhotos rows={rows} desktop onChanged={refresh} onReview={()=>{onReceived();document.getElementById('local-phone-review')?.scrollIntoView({block:'start'})}}/>}</details>
}

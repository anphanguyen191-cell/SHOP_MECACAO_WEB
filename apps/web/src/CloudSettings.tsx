import {useEffect,useRef,useState} from 'react'
import type {Session} from '@supabase/supabase-js'
import {saveCloudPassword} from './cloudPassword'
import {cloud,cloudRpc,cloudRows,cloudCommand,CLOUD_BUCKET} from './cloudClient'
import {CLOUD_RELEASE,CLOUD_MOBILE_URL} from './cloudRelease'
import {apiJson,useBooleanPreference} from './uiState'
const sha=async(value:string)=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value)))).map(v=>v.toString(16).padStart(2,'0')).join('')
export default function CloudSettings({desktop=true,autoSync=false}:{desktop?:boolean;autoSync?:boolean}){
 const [email,setEmail]=useState(''),[code,setCode]=useState(''),[sent,setSent]=useState(false),[signed,setSigned]=useState(false),[status,setStatus]=useState('Chưa đăng nhập'),[busy,setBusy]=useState(false),[health,setHealth]=useState<any>(null),[progress,setProgress]=useState({registered:0,uploaded:0,skipped:0}),[mobile,setMobile]=useState('')
 const authSession=useRef<Session|null>(null)
 const paused=useRef(false),inflight=useRef(false),latestSync=useRef<()=>Promise<void>>(async()=>{})
 const [automatic,setAutomatic]=useBooleanPreference('cloud-auto-sync',true)
 const [loginLink,setLoginLink]=useState(''),[password,setPassword]=useState(''),[newPassword,setNewPassword]=useState(''),[repeatPassword,setRepeatPassword]=useState('')
 useEffect(()=>{let alive=true;void cloud.auth.getSession().then(({data})=>{if(alive){authSession.current=data.session;setSigned(!!data.session)}});const {data}=cloud.auth.onAuthStateChange((_event,session)=>{if(alive){authSession.current=session;setSigned(!!session)}});try{setMobile(localStorage.getItem('mecacao-v7-mobile-url')||CLOUD_MOBILE_URL)}catch{}return()=>{alive=false;paused.current=true;data.subscription.unsubscribe()}},[])
 useEffect(()=>{window.dispatchEvent(new CustomEvent('mecacao-cloud-sync-status',{detail:status}))},[status])
 useEffect(()=>{if(!desktop||!autoSync||!signed||!automatic)return;const start=async()=>{if(inflight.current||!navigator.onLine)return;try{const state=await apiJson('/api/cloud/state');if(state.enabled&&(await cloudRpc('mc_v7_health')).role==='owner')await latestSync.current()}catch(e){setStatus((e as Error).message)}};void start();const timer=setInterval(()=>void start(),300000);const requested=()=>void start();window.addEventListener('mecacao-cloud-sync-now',requested);return()=>{clearInterval(timer);window.removeEventListener('mecacao-cloud-sync-now',requested)}},[desktop,autoSync,signed,automatic])
 async function action(fn:()=>Promise<void>){if(inflight.current)return;inflight.current=true;setBusy(true);try{await fn()}catch(e){setStatus(e instanceof Error&&/email rate limit exceeded/i.test(e.message)?'Gửi email đang bị giới hạn. Hãy đăng nhập bằng mật khẩu tài khoản shop ở phía trên.':e instanceof Error?e.message:'Không kết nối được Cloud. Đọc lại trước khi xác nhận kết quả.')}finally{inflight.current=false;setBusy(false)}}
 async function check(){const h=await cloudRpc('mc_v7_health');if(h.contract!==1||h.schema!==130)throw Error('Cần cập nhật ứng dụng để tương thích Cloud.');setHealth(h);setStatus('Đã kết nối · quyền '+h.role);return h}
 async function savePassword(){await action(async()=>{if(newPassword.length<12)throw Error('Mật khẩu Cloud cần ít nhất 12 ký tự.');if(newPassword!==repeatPassword)throw Error('Hai ô mật khẩu chưa giống nhau.');await saveCloudPassword(cloud.auth,authSession.current,newPassword);setNewPassword('');setRepeatPassword('');setStatus('Đã lưu mật khẩu Cloud. Dùng email và mật khẩu vừa đặt để đăng nhập trên iPhone hoặc laptop.');})}
 async function requestPasswordReset(){await action(async()=>{if(!email.trim())throw Error('Nhập email tài khoản shop trước khi yêu cầu đặt lại mật khẩu.');const {error}=await cloud.auth.resetPasswordForEmail(email.trim(),{redirectTo:CLOUD_MOBILE_URL});if(error)throw error;setStatus('Supabase đã tiếp nhận yêu cầu khôi phục mật khẩu. Mở email mới nhất, chọn Reset Password; sau khi trở lại Shop Mẹ CaCao, đặt mật khẩu Cloud mới và bấm Lưu. Nếu chưa có email, kiểm tra Spam; không gửi liên tục.')})}
 async function loginPassword(){await action(async()=>{const {error}=await cloud.auth.signInWithPassword({email:email.trim(),password});if(error){if(error.code==='invalid_credentials'||/invalid login credentials/i.test(error.message))throw Error('Email hoặc mật khẩu tài khoản shop chưa đúng. Đây không phải mật khẩu Gmail.');throw error}setPassword('');setSent(false);await check()})}
 async function login(){await action(async()=>{const {error}=await cloud.auth.signInWithOtp({email:email.trim(),options:{shouldCreateUser:false,emailRedirectTo:CLOUD_MOBILE_URL}});if(error)throw error;setSent(true);setStatus('Đã yêu cầu email đăng nhập. Liên kết mở bản Cloud trên Internet. Để đăng nhập ngay trên thiết bị này, nhấn giữ nút trong email, sao chép liên kết chưa mở và dán vào ô bên dưới. Tài khoản phải có quyền shop.')})}
 async function verify(){await action(async()=>{const {error}=await cloud.auth.verifyOtp({email:email.trim(),token:code.trim(),type:'email'});if(error)throw error;setCode('');setSent(false);await check()})}
 async function verifyLink(){await action(async()=>{let token:string;try{const url=new URL(loginLink.trim());if(url.protocol!=='https:'||url.hostname!=='eyckwoewpomssjjggslr.supabase.co'||url.pathname!=='/auth/v1/verify'||!!url.username||!!url.password||!!url.port)throw Error();token=url.searchParams.get('token_hash')||url.searchParams.get('token')||'';if(!token||!['email','magiclink'].includes(url.searchParams.get('type')||''))throw Error()}catch{throw Error('Dán liên kết đăng nhập Supabase từ email vừa nhận. Không dùng liên kết đổi mật khẩu hoặc liên kết của project khác.')}setLoginLink('');const {error}=await cloud.auth.verifyOtp({token_hash:token,type:'email'});if(error)throw Error('Liên kết đã hết hạn hoặc được mở trước đó. Yêu cầu email đăng nhập mới.');setSent(false);await check()})}
 async function sync(){await action(async()=>{
  if((await check()).role!=='owner')throw Error('Chỉ chủ shop được đồng bộ kho Windows. Các tài khoản khác vẫn xem dữ liệu theo quyền.');paused.current=false;setProgress({registered:0,uploaded:0,skipped:0});let offset=0,registered=0,uploaded=0,skipped=0,localImageCount=0,missingCount=0
  const session=(await cloud.auth.getSession()).data.session;if(!session)throw Error('Phiên Cloud đã hết hạn.')
  const initial=await apiJson('/api/cloud/catalog?offset=0')
  const localHealth=await apiJson('/api/health')
  if(localHealth.release?.stage===8){
   if(!localHealth.customWarehouse)throw Error('Chưa chọn kho ảnh thật V8 trên Windows.')
   const remoteHealth=await cloudRpc<any>('mc_v7_health')
   if(remoteHealth.instance&&remoteHealth.instance!==initial.instance){
    const preview=await cloudRpc<any>('mc_v8_handoff_preview',{p_target_instance:initial.instance})
    if(preview.currentInstance!==remoteHealth.instance||preview.targetInstance!==initial.instance||preview.sequence!==remoteHealth.sequence)throw Error('Cloud đã thay đổi. Đọc lại trước khi chuyển.')
    if(preview.sold||preview.finance)throw Error('Cloud có giao dịch đã bán hoặc thanh toán; không được xóa dữ liệu nghiệp vụ.')
    const consent=window.prompt('Cloud đang gắn với KHO TEST CŨ.\n\n'+
     'Ảnh cũ: '+preview.images+' · đơn nháp/hủy: '+preview.orders+
     ' · Storage: '+preview.objects+' ('+Math.round(preview.bytes/1024/1024)+' MiB).\n\n'+
     'V8 sẽ lưu trữ toàn bộ hồ sơ cũ trước khi chuyển, giữ nguyên ảnh trên laptop và chưa xóa ảnh Cloud cũ. '+
     'Sau khi đồng bộ V8 đủ, chỉ dọn ảnh cũ đã đối chiếu trùng SHA-256.\n\n'+
     'Nhập TIEP_NHAN_V8_CHINH_THUC để xác nhận:','')
    if(consent!=='TIEP_NHAN_V8_CHINH_THUC')throw Error('Đã hủy chuyển Cloud; dữ liệu giữ nguyên.')
    const result=await cloudRpc<any>('mc_v8_handoff',{
     p_target_instance:initial.instance,p_source_instance:remoteHealth.instance,
     p_expected_sequence:preview.sequence,p_confirmation:consent
    })
    if(!result?.ok||result.newInstance!==initial.instance)throw Error('Chuyển Cloud chưa xác nhận thành công.')
    const confirmed=await cloudRpc<any>('mc_v7_health')
    if(confirmed.instance!==initial.instance||confirmed.status!=='RPC_READY')throw Error('Cloud mới chưa xác minh được.')
    setStatus('Đã lưu trữ hồ sơ cũ, đang đồng bộ kho V8 chính thức.')
   }
  }
  await cloudRpc('mc_v7_catalog',{p_instance:initial.instance,p_request:'bootstrap:'+initial.instance+':'+session.user.id,p_payload:{}})
  const state=await apiJson('/api/cloud/state'),sold=(await cloudRows('sales_confirmations')).map(c=>c.order_id).filter(id=>!state.reconciled.includes(id))
  for(let start=0;start<sold.length;start+=100)await apiJson('/api/cloud/reconcile',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+session.access_token},body:JSON.stringify({orders:sold.slice(start,start+100)})})
  const existingImages=new Map((await cloudRows('product_images')).map(a=>[Number(a.id),a]))
  const ready=new Map((await cloudRows('cloud_image_assets')).filter(a=>a.ready).map(a=>[Number(a.image_id),a.sha256]))
  for(;;){
   if(paused.current){setStatus('Đã tạm dừng. Bấm Tiếp tục để đọc lại và đồng bộ phần thiếu.');return}
   const batch=await apiJson('/api/cloud/catalog?offset='+offset)
   localImageCount+=batch.images.length
   // Each request is bounded; dependencies are registered in order.
   for(const field of ['categories','products','variants','images'])for(let start=0;start<batch[field].length;start+=100){
    const group=batch[field].slice(start,start+100)
    if(field==='images')for(const item of group){
     const old=existingImages.get(Number(item.id))
     if(old&&(Number(old.product_id)!==Number(item.product_id)||Number(old.variant_id)!==Number(item.variant_id)))throw Error('Ảnh Cloud #'+item.id+' khác Product/Size Windows. Dừng đối soát.')
    }
    const rows=field==='images'?group.filter((item:any)=>!existingImages.has(Number(item.id))):group
    if(!rows.length)continue
    const payload={[field]:rows},hash=await sha(JSON.stringify(payload)),request='catalog:'+batch.instance+':'+hash
    if(field==='variants')await cloudRpc('mc_v8_catalog_variants',{p_instance:batch.instance,p_request:request,p_rows:rows})
    else await cloudRpc('mc_v7_catalog',{p_instance:batch.instance,p_request:request,p_payload:payload})
    if(field==='images')for(const item of rows)existingImages.set(Number(item.id),item)
    registered+=rows.length;setProgress({registered,uploaded,skipped})
   }
   for(let start=0;start<batch.transactions.length;start+=100){const rows=batch.transactions.slice(start,start+100),hash=await sha(JSON.stringify(rows));await cloudRpc('mc_v7_ledger',{p_instance:batch.instance,p_request:'ledger:'+batch.instance+':'+hash,p_rows:rows})}
   const availability=new Map((batch.sourceState||[]).map((x:any)=>[Number(x.id),x.present])),verifiedSource:any[]=[],missingSource=(batch.sourceState||[]).filter((x:any)=>!x.present);missingCount+=missingSource.length;for(let start=0;start<missingSource.length;start+=100)await cloudRpc('mc_v7_presence',{p_instance:batch.instance,p_request:'presence:'+crypto.randomUUID(),p_images:missingSource.slice(start,start+100)})
   for(const image of batch.images){
    if(availability.get(Number(image.id))===false){skipped++;setStatus('Ảnh nguồn #'+image.id+' đang thiếu; Cloud đã tạm ngừng cho chọn bán ảnh này, file Cloud được giữ để đối soát.');continue}
    if(paused.current){setStatus('Đã tạm dừng. Tiếp tục sẽ giữ các ảnh đã hoàn tất.');return}
    setStatus('Đang tối ưu/upload ảnh #'+image.id)
    const response=await fetch('/api/cloud/images/'+image.id);if(!response.ok){const err=await response.json();throw Error(err.error||'Không đọc được ảnh')}
    const bytes=await response.arrayBuffer(),hash=response.headers.get('X-Image-Sha256');if(bytes.byteLength>150000||!hash)throw Error('Ảnh tối ưu chưa đạt điều kiện upload.')
    if(ready.has(Number(image.id))){if(ready.get(Number(image.id))!==hash){if(batch.sourceState)await cloudRpc('mc_v7_presence',{p_instance:batch.instance,p_request:'presence:'+crypto.randomUUID(),p_images:[{id:Number(image.id),present:false}]});throw Error('Ảnh nguồn #'+image.id+' đã thay đổi so với Cloud. Đã ngừng cho chọn bán ảnh này để đối soát.')}verifiedSource.push({id:Number(image.id),present:true});skipped++;setProgress({registered,uploaded,skipped});continue}
    // SHA-256 of optimized JPEG, independent of Windows app release and image ID.
    const reuse=await cloudRpc<{reused:boolean;ready:boolean;path?:string}>('mc_v8_reuse_image',{p_image:image.id,p_sha:hash})
    if(reuse.reused&&reuse.ready){
     ready.set(Number(image.id),hash);verifiedSource.push({id:Number(image.id),present:true})
     skipped++;setProgress({registered,uploaded,skipped});continue
    }
    const path='v7/'+batch.instance+'/'+image.id+'.jpg';const {error}=await cloud.storage.from(CLOUD_BUCKET).upload(path,bytes,{contentType:'image/jpeg',upsert:false,cacheControl:'3600'})
    if(error){const {data, error:readError}=await cloud.storage.from(CLOUD_BUCKET).download(path);if(readError||!data)throw Error(error.message);const existing=await data.arrayBuffer(),digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',existing))).map(v=>v.toString(16).padStart(2,'0')).join('');if(digest!==hash)throw Error('Ảnh Cloud khác ảnh đang upload. Dừng để đối soát.')}
    await cloudRpc('mc_v7_image',{p_image:image.id,p_sha:hash});ready.set(Number(image.id),hash);verifiedSource.push({id:Number(image.id),present:true});uploaded++;setProgress({registered,uploaded,skipped})
   }
   if(batch.sourceState)for(let start=0;start<verifiedSource.length;start+=100)await cloudRpc('mc_v7_presence',{p_instance:batch.instance,p_request:'presence:'+crypto.randomUUID(),p_images:verifiedSource.slice(start,start+100)})
   if(batch.done)break;offset=batch.nextOffset
  }
  const afterImages=await cloudRows('product_images'),afterAssets=await cloudRows('cloud_image_assets')
  if(missingCount>0)throw Error('Có '+missingCount+' ảnh nguồn thiếu trên Windows. Chưa bật Cloud để tránh sai tồn kho.')
  if(afterImages.length!==localImageCount||afterAssets.filter(a=>a.ready&&a.source_present!==false).length!==localImageCount)throw Error('Ảnh Cloud chưa khớp '+localImageCount+' ảnh Windows; không kích hoạt kho Cloud.')
  await apiJson('/api/cloud/activate',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+session.access_token},body:'{}'})
  await apiJson('/api/cloud/prices',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+session.access_token},body:'{}'})
  const assets=await cloudRows('cloud_image_assets'),inbox=await cloudRows('cloud_photo_inbox')
  for(const photo of inbox.filter(p=>p.status==='LOCAL_READY'&&assets.some(a=>a.ready&&a.sha256===p.sha256))){await cloudCommand('inbox.consume',{id:photo.id});const {error}=await cloud.storage.from(CLOUD_BUCKET).remove([photo.object_path]);if(error)throw Error('Ảnh đã vào tồn. File hộp chờ chưa dọn được; dọn tại Ảnh Cloud.')}
  window.dispatchEvent(new Event('mecacao-cloud-sold-check'));window.dispatchEvent(new Event('mecacao-cloud-activated'))
  // Cleanup only after complete current inventory matching and activation.
  // RLS protects every prior Storage path still referenced by V8 inventory.
  try{
   const freed=await cleanupLegacyObjects()
   setStatus('Đã đồng bộ V8 '+localImageCount+' ảnh · dùng lại '+skipped+' · tải mới '+uploaded+' · dọn '+freed.count+' ảnh dư ('+Math.round(freed.bytes/1024/1024)+' MiB). Mở Cloud trên Windows/iPhone để nghiệm thu.')
  }catch(e){
   setStatus('Kho V8 đã đồng bộ nhưng chưa dọn hết ảnh cũ: '+(e as Error).message+'. Các file chưa dọn vẫn được giữ nguyên.')
  }
 })}
 async function cleanupLegacyObjects():Promise<{count:number;bytes:number}>{
  const state=await apiJson('/api/cloud/state'),local=await apiJson('/api/cloud/catalog?offset=0'),remote=await cloudRpc<any>('mc_v7_health')
  if(!state.enabled||remote.status!=='CLOUD_TEST_READY'||remote.instance!==local.instance)throw Error('Chưa xác minh cùng kho V8 Windows/Cloud; không dọn ảnh.')
  let entries=await cloudRpc<Array<{path:string;bytes:number}>>('mc_v8_legacy_cleanup_candidates',{p_limit:100})
  if(!Array.isArray(entries))throw Error('Danh sách ảnh chờ dọn không hợp lệ.')
  let count=0,bytes=0
  for(let step=0;step<150&&entries.length;step++){
   if(entries.length>100||entries.some(x=>typeof x.path!=='string'||!Number.isFinite(x.bytes)))throw Error('Danh sách xóa chưa kiểm chứng.')
   const {error}=await cloud.storage.from(CLOUD_BUCKET).remove(entries.map(x=>x.path))
   if(error)throw Error('Dọn Storage tạm dừng: '+error.message)
   count+=entries.length;bytes+=entries.reduce((n,x)=>n+x.bytes,0)
   setStatus('Đã dọn '+count+' bản cũ không còn tham chiếu trong tồn V8.')
   entries=await cloudRpc<Array<{path:string;bytes:number}>>('mc_v8_legacy_cleanup_candidates',{p_limit:100})
   if(!Array.isArray(entries))throw Error('Chưa xác minh được kết quả dọn.')
  }
  if(entries.length)throw Error('Số lượng file cũ còn lớn; có thể dọn tiếp sau.')
  return {count,bytes}
 }
 async function cleanupLegacy(){await action(async()=>{
  if(!window.confirm('Dọn các file Cloud cũ KHÔNG còn được tồn V8 tham chiếu? Giữ nguyên ảnh laptop và nghiệp vụ kinh doanh.'))return
  const freed=await cleanupLegacyObjects()
  setStatus('Đã dọn '+freed.count+' file Cloud cũ ('+Math.round(freed.bytes/1024/1024)+' MiB). Ảnh đang được V8 sử dụng giữ nguyên.')
 })}
 latestSync.current=sync
 function saveMobile(){try{const url=new URL(mobile);if(url.protocol!=='https:')throw Error('Link Mobile phải là HTTPS');url.searchParams.set('cloud','1');localStorage.setItem('mecacao-v7-mobile-url',url.href);setMobile(url.href);setStatus('Đã lưu link Mobile.')}catch(e){setStatus(e instanceof Error&&/email rate limit exceeded/i.test(e.message)?'Gửi email đang bị giới hạn. Hãy đăng nhập bằng mật khẩu tài khoản shop ở phía trên.':e instanceof Error?e.message:'Link không hợp lệ')}}
 return <section className="panel cloudSettings"><h3>Cloud · {CLOUD_RELEASE}</h3><p>ShopMeCaCao-Cloud · ảnh JPEG ≤150KB · một kho Windows kết nối Cloud.</p>{desktop&&<p>Ảnh đã SOLD tự dọn khỏi Cloud sau khi laptop xác minh ảnh lưu; kiểm tra khi mở, khi có thay đổi và mỗi 30 giây. Giữ nguyên ảnh laptop, đơn hàng và lịch sử tiền.</p>}<p className="notice" role="status">{signed&&status==='Chưa đăng nhập'?'Đã đăng nhập Cloud':status}</p>{!signed?<><h4>Đăng nhập Shop Mẹ CaCao</h4><form onSubmit={e=>{e.preventDefault();void loginPassword()}}><label>Email tài khoản shop<input type="email" autoComplete="username" required value={email} onChange={e=>setEmail(e.target.value)}/></label><label>Mật khẩu tài khoản shop<input type="password" autoComplete="current-password" required value={password} onChange={e=>setPassword(e.target.value)}/></label><p className="muted">Dùng mật khẩu của Shop Mẹ CaCao. Phiên đăng nhập được ghi nhớ trên thiết bị này.</p><button type="submit" className="primary" disabled={busy||!email.trim()||!password}>Đăng nhập</button></form><button type="button" disabled={busy||!email.trim()} onClick={requestPasswordReset}>Quên mật khẩu Cloud? Gửi email đặt lại</button><details className="cloudEmailLogin"><summary>Xác nhận email để thiết lập mật khẩu Cloud</summary><p>Chỉ dùng khi cần. Gửi email có giới hạn; không bấm gửi nhiều lần liên tục.</p><button disabled={busy||!email} onClick={login}>Gửi email đăng nhập</button>{sent&&<><label>Mã trong email (nếu có)<input autoComplete="one-time-code" inputMode="numeric" value={code} onChange={e=>setCode(e.target.value)}/></label><button disabled={busy||!code} onClick={verify}>Xác nhận mã</button></>}<div className="cloudDirectLogin"><h4>Đăng nhập ngay trên thiết bị này</h4><p>Trong email mới nhận, nhấn giữ nút đăng nhập → Sao chép liên kết → quay lại đây và dán. Không mở liên kết trước khi dán.</p><p>Nếu đã mở nhầm localhost, hãy yêu cầu email mới. Cách này xác nhận ngay tại đây, không cần vào Dashboard hay dùng passkey.</p><label>Liên kết đăng nhập<input type="url" autoComplete="off" autoCapitalize="none" spellCheck={false} value={loginLink} onChange={e=>setLoginLink(e.target.value)}/></label><button className="primary" disabled={busy||!loginLink} onClick={verifyLink}>Đăng nhập trên thiết bị này</button><p className="muted">Liên kết chỉ dùng một lần. Không chia sẻ liên kết cho người khác.</p></div></details></>:<><div className="inventoryActions"><button disabled={busy} onClick={()=>action(check)}>Kiểm tra kết nối</button>{desktop&&<><button className="primary" disabled={busy} onClick={sync}>Đồng bộ / Tiếp tục</button><button disabled={busy} onClick={cleanupLegacy}>Dọn ảnh Cloud cũ đã đối soát</button><button disabled={!busy} onClick={()=>{paused.current=true;setAutomatic(false);setStatus('Đang hoàn tất tác vụ hiện tại rồi tạm dừng…')}}>Tạm dừng</button></>}<button disabled={busy} onClick={()=>action(async()=>{const {error}=await cloud.auth.signOut();if(error)throw error;setHealth(null);setNewPassword('');setRepeatPassword('');setStatus('Đã đăng xuất')})}>Đăng xuất</button></div><details className="cloudPasswordSetup" open><summary>Thiết lập mật khẩu Cloud</summary><p>Đặt mật khẩu riêng cho tài khoản Cloud đang đăng nhập. Sau khi lưu, dùng email + mật khẩu này trên Windows và iPhone.</p><form onSubmit={e=>{e.preventDefault();void savePassword()}}><label>Mật khẩu Cloud mới<input type="password" autoComplete="new-password" minLength={12} required value={newPassword} onChange={e=>setNewPassword(e.target.value)}/></label><label>Nhập lại mật khẩu Cloud<input type="password" autoComplete="new-password" minLength={12} required value={repeatPassword} onChange={e=>setRepeatPassword(e.target.value)}/></label><button type="submit" className="primary" disabled={busy||!newPassword||!repeatPassword}>Lưu mật khẩu Cloud</button></form></details>{health&&<p>Quyền: {({owner:'Chủ shop',cashier:'Bán hàng',inventory:'Kho',viewer:'Chỉ xem'} as Record<string,string>)[health.role]||health.role}</p>}{desktop&&<label><input type="checkbox" checked={automatic} onChange={e=>setAutomatic(e.target.checked)}/> Tự đồng bộ khi mở ứng dụng và mỗi 5 phút; cập nhật sau nhập hàng</label>}{desktop&&<p>Đăng ký: {progress.registered} · ảnh tải mới: {progress.uploaded} · ảnh giữ nguyên / tạm thiếu: {progress.skipped}</p>}</>}{desktop&&<><p>Quét QR để mở bản Cloud từ main (đăng nhập tài khoản shop trên iPhone).</p><img width="220" height="220" style={{background:'#fff'}} src={import.meta.env.BASE_URL+'brand/cloud-mobile-qr.svg'} alt="QR mở Cloud Mobile chính thức"/><label>Link Mobile HTTPS<input type="url" value={mobile} onChange={e=>setMobile(e.target.value)}/></label><div className="inventoryActions"><button onClick={saveMobile}>Lưu link Mobile</button>{mobile.startsWith('https://')&&<a href={mobile} target="_blank" rel="noreferrer">Mở Mobile</a>}</div></>}<p><a href="?cloud=1">Mở giao diện nghiệp vụ Cloud trên máy này</a></p><p className="muted">Đăng nhập ứng dụng khác đăng nhập Dashboard Supabase. Không nhập Secret Key tại đây.</p></section>
}

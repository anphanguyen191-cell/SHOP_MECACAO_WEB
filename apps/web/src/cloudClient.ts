import {createClient} from '@supabase/supabase-js'
export const CLOUD_URL='https://eyckwoewpomssjjggslr.supabase.co'
export const CLOUD_BUCKET='shop-mobile-images'
// Capture only the recovery intent before the SDK consumes and clears the URL.
// This flag routes the UI; only a validated SDK session permits password updates.
export const cloudRecoveryRequested=new URLSearchParams(location.hash.slice(1)).get('type')==='recovery'
export const cloud=createClient(CLOUD_URL,'sb_publishable_iyEI25gFfU4pXxmdFJ823Q_YYG-ViGJ',{auth:{storageKey:'mecacao-v7-auth',persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}})
export class CloudRpcError extends Error {constructor(message:string,public code:string,public raw:string=message){super(message)}}
export async function cloudRpc<T=any>(name:string,args:Record<string,unknown>={}){const {data,error}=await cloud.rpc(name,args);if(error)throw new CloudRpcError(cloudError(error.message),error.code,error.message);return data as T}
export function cloudError(message:string){const errors:Record<string,string>={CLOUD_DRAFT_CONFLICT:'Ảnh đã có trong đơn nháp khác. Kiểm tra các đơn liên quan trước khi thêm.',CLOUD_VERSION_CONFLICT:'Đơn đã thay đổi trên thiết bị khác. Đọc lại trước khi lưu.',CLOUD_SOURCE_MISSING:'Ảnh nguồn đang thiếu trên laptop. Đối soát kho trước khi bán.',CLOUD_IMAGE_SOLD_OR_MISSING:'Ảnh vừa được bán hoặc chưa khớp kho. Đọc lại để đối soát.',CLOUD_ARCHIVE_NOT_VERIFIED:'Chưa xác minh được ảnh lưu trên laptop. Ảnh Cloud đang được giữ lại.',CLOUD_PRICE_INVALID:'Kiểm tra giá bán, giá vốn và giảm giá: nhập số nguyên không âm.',CLOUD_CONTACT_OR_TOTAL_INVALID:'Kiểm tra khách, địa chỉ, phí ship và tổng tiền của đơn.',CLOUD_MONEY_OVERFLOW:'Số tiền vượt giới hạn được hỗ trợ. Kiểm tra lại số đã nhập.',CLOUD_TABLE_INVALID:'Ứng dụng cần cập nhật để đọc dữ liệu này.',CLOUD_LOGIN_REQUIRED:'Đăng nhập tài khoản shop để kết nối.',CLOUD_ACCESS_DENIED:'Tài khoản chưa được cấp quyền vào shop.',CLOUD_ROLE_DENIED:'Tài khoản không có quyền thực hiện thao tác này.',CLOUD_WAREHOUSE_MISMATCH:'Cloud đang kết nối với kho khác. Không tự gộp hai kho.',CLOUD_REQUEST_CONFLICT:'Yêu cầu đã có nội dung khác. Đọc lại trước khi tiếp tục.',CLOUD_IMAGE_SOLD:'Ảnh đã được bán; đọc lại dữ liệu.',CLOUD_UPLOAD_NOT_VERIFIED:'File ảnh chưa upload xong hoặc vượt 150KB.',CLOUD_IMAGE_REVISION_CONFLICT:'Ảnh nguồn đã thay đổi. Cần đối soát trước khi thay ảnh Cloud.'};for(const [key,value]of Object.entries(errors))if(message.includes(key))return value;return message}
export async function cloudRows(table:string){const rows:any[]=[];let offset=0;for(;;){const result=await cloudRpc('mc_v7_rows',{p_table:table,p_after:String(offset),p_limit:200});rows.push(...result.rows);if(result.rows.length<200)return rows;offset=result.nextOffset}}
export async function cloudImageUrl(path:string){const {data,error}=await cloud.storage.from(CLOUD_BUCKET).createSignedUrl(path,1800);if(error)throw Error(cloudError(error.message));return data.signedUrl}

const pendingKey='mecacao-v7-pending-command'
let commandInFlight=false
async function withCommandLock<T>(send:()=>Promise<T>):Promise<T>{
 if(commandInFlight)throw Error('Đang xác minh thao tác Cloud. Chờ kết quả trước khi tiếp tục.')
 commandInFlight=true
 try{
  if(navigator.locks)return await navigator.locks.request('mecacao-v7-command',{ifAvailable:true},lock=>{if(!lock)throw Error('Tab khác đang gửi thao tác Cloud. Chờ kết quả trước khi tiếp tục.');return send()})
  return await send()
 }finally{commandInFlight=false}
}

export async function pendingCloudCommand(){const {data}=await cloud.auth.getUser();if(!data.user)throw Error('Cần đăng nhập Cloud.');const raw=localStorage.getItem(pendingKey);if(!raw)return null;const pending=JSON.parse(raw);if(pending.user!==data.user.id)throw Error('Thiết bị còn yêu cầu chưa xác minh của tài khoản khác. Đăng nhập lại tài khoản đó để đọc kết quả.');return pending as {user:string;request:string;action:string;payload:any}}
async function sendPendingCloudCommand(){const pending=await pendingCloudCommand();if(!pending)return null;try{const result=await cloudRpc(pending.action.startsWith('inbox.')?'mc_v7_inbox':pending.action.startsWith('stocktake.')?'mc_v7_stocktake':['variant.price','product.status'].includes(pending.action)?'mc_v7_catalog_command':'mc_v7_command',{p_request:pending.request,p_action:pending.action,p_payload:pending.payload});localStorage.removeItem(pendingKey);return result}catch(e){if(e instanceof CloudRpcError&&['P0001','42501','23503','23505','23514','22P02','22003'].includes(e.code))localStorage.removeItem(pendingKey);throw e}}
export async function retryCloudCommand(){return withCommandLock(sendPendingCloudCommand)}
export async function cloudCommand(action:string,payload:any){return withCommandLock(async()=>{
 if(await pendingCloudCommand())throw Error('Còn thao tác chưa xác minh kết quả. Bấm Kiểm tra thao tác trước trước khi tạo yêu cầu mới.')
 const {data,error}=await cloud.auth.getUser();if(error||!data.user)throw Error('Cần đăng nhập Cloud.')
 localStorage.setItem(pendingKey,JSON.stringify({user:data.user.id,request:crypto.randomUUID(),action,payload}))
 return sendPendingCloudCommand()
})}

import {createClient} from '@supabase/supabase-js'
export const CLOUD_URL='https://eyckwoewpomssjjggslr.supabase.co'
export const CLOUD_BUCKET='shop-mobile-images'
// Capture only the recovery intent before the SDK consumes and clears the URL.
// This flag routes the UI; only a validated SDK session permits password updates.
export const cloudRecoveryRequested=new URLSearchParams(location.hash.slice(1)).get('type')==='recovery'
export const cloud=createClient(CLOUD_URL,'sb_publishable_iyEI25gFfU4pXxmdFJ823Q_YYG-ViGJ',{auth:{storageKey:'mecacao-v7-auth',persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}})
export class CloudQueuedRequest extends Error {constructor(public requestKey:string,public state='PENDING'){super(state==='CONFIRMED'?'Laptop đã ghi nhận yêu cầu. Đang đọc lại sổ tiền.':state==='REJECTED'?'Yêu cầu chưa được ghi nhận; đọc lý do xử lý từ laptop.':'Đã gửi yêu cầu; chờ laptop kiểm tra và ghi nhận. Sổ tiền chưa thay đổi.')}}
export class CloudRpcError extends Error {constructor(message:string,public code:string,public raw:string=message){super(message)}}
export async function cloudRpc<T=any>(name:string,args:Record<string,unknown>={}){const {data,error}=await cloud.rpc(name,args);if(error)throw new CloudRpcError(Object.entries(localSaleErrors).find(([key])=>error.message.includes(key))?.[1]??Object.entries(businessErrors).find(([key])=>error.message.includes(key))?.[1]??cloudError(error.message),error.code,error.message);return data as T}
const localSaleErrors:Record<string,string>={CLOUD_LOCAL_FINAL_REQUIRED:'Laptop xác nhận bán cuối cùng. Cập nhật ứng dụng rồi gửi yêu cầu bán.',CLOUD_LOCAL_FINAL_UPDATE_REQUIRED:'Mở bản mới trên laptop và đăng nhập Cloud để bật nhận yêu cầu bán.',CLOUD_LOCAL_SALE_PENDING:'Đơn đang chờ laptop kiểm tra. Chờ kết quả trước khi sửa, thu tiền hoặc gửi lại.',CLOUD_STOCK_UNAVAILABLE:'Ảnh vừa thay đổi hoặc không còn tồn. Đọc lại kho trước khi gửi yêu cầu.'}
const businessErrors:Record<string,string>={CLOUD_BUSINESS_NOT_READY:'Laptop chưa đồng bộ đủ hồ sơ nghiệp vụ. Mở Kết nối Cloud trên laptop và bấm Đồng bộ / Tiếp tục.',CLOUD_BUSINESS_ALREADY_ACTIVE:'Cloud đã nhận nghiệp vụ dùng chung. Mở lại ứng dụng để đối soát.',CLOUD_BUSINESS_EXISTING_HISTORY:'Cloud có hồ sơ nghiệp vụ riêng cần đối soát. Dữ liệu đang được giữ nguyên.',CLOUD_BUSINESS_EVIDENCE_CONFLICT:'Chứng từ laptop và Cloud không khớp. Đã dừng để giữ nguyên lịch sử.'}
export function cloudError(message:string){const errors:Record<string,string>={CLOUD_CUSTOMER_VERSION_CONFLICT:'Hồ sơ khách đã thay đổi. Mở lại hồ sơ mới trước khi gửi yêu cầu.',CLOUD_CUSTOMER_LAPTOP_UPDATE_REQUIRED:'Cập nhật ứng dụng trên laptop và đăng nhập Cloud để bật nhận yêu cầu hồ sơ khách.',CLOUD_CUSTOMER_PENDING:'Hồ sơ này đang chờ laptop. Chờ kết quả trước khi sửa tiếp.',CLOUD_CUSTOMER_INVALID:'Kiểm tra tên, số điện thoại và nội dung hồ sơ khách.',CLOUD_CUSTOMER_DUPLICATE:'Số điện thoại đã có khách. Chọn khách cũ hoặc xác nhận tạo khách riêng.',CLOUD_CUSTOMER_NO_PHONE:'Xác nhận lưu khách không có số điện thoại.',CLOUD_PRICE_FILE_LIMIT:'File cần từ 1 đến 5.000 dòng và không vượt giới hạn.',CLOUD_PRICE_FILE_IDENTITY:'Mã/size không khớp hoặc hàng không còn tồn. Xuất lại báo cáo.',CLOUD_PRICE_FILE_INVALID:'File có mã trùng hoặc phiên bản giá không hợp lệ.',CLOUD_DRAFT_CONFLICT:'Ảnh đã có trong đơn nháp khác. Kiểm tra các đơn liên quan trước khi thêm.',CLOUD_VERSION_CONFLICT:'Đơn đã thay đổi trên thiết bị khác. Đọc lại trước khi lưu.',CLOUD_SOURCE_MISSING:'Ảnh nguồn đang thiếu trên laptop. Đối soát kho trước khi bán.',CLOUD_IMAGE_SOLD_OR_MISSING:'Ảnh vừa được bán hoặc chưa khớp kho. Đọc lại để đối soát.',CLOUD_ARCHIVE_NOT_VERIFIED:'Chưa xác minh được ảnh lưu trên laptop. Ảnh Cloud đang được giữ lại.',CLOUD_PRICE_INVALID:'Kiểm tra giá bán, giá vốn và giảm giá: nhập số nguyên không âm.',CLOUD_CONTACT_OR_TOTAL_INVALID:'Kiểm tra khách, địa chỉ, phí ship và tổng tiền của đơn.',CLOUD_MONEY_OVERFLOW:'Số tiền vượt giới hạn được hỗ trợ. Kiểm tra lại số đã nhập.',CLOUD_TABLE_INVALID:'Ứng dụng cần cập nhật để đọc dữ liệu này.',CLOUD_LOGIN_REQUIRED:'Đăng nhập tài khoản shop để kết nối.',CLOUD_ACCESS_DENIED:'Tài khoản chưa được cấp quyền vào shop.',CLOUD_ROLE_DENIED:'Tài khoản không có quyền thực hiện thao tác này.',CLOUD_WAREHOUSE_MISMATCH:'Cloud đang kết nối với kho khác. Không tự gộp hai kho.',CLOUD_REQUEST_CONFLICT:'Yêu cầu đã có nội dung khác. Đọc lại trước khi tiếp tục.',CLOUD_IMAGE_SOLD:'Ảnh đã được bán; đọc lại dữ liệu.',CLOUD_UPLOAD_NOT_VERIFIED:'File ảnh chưa upload xong hoặc vượt 150KB.',CLOUD_IMAGE_REVISION_CONFLICT:'Ảnh nguồn đã thay đổi. Cần đối soát trước khi thay ảnh Cloud.'};for(const [key,value]of Object.entries(errors))if(message.includes(key))return value;return message}
/**
 * V8 Cloud paging uses the existing RPC's verified upper bound of 500 rows.
 * The cursor and array guards fail closed if the API contract changes, rather
 * than looping indefinitely or displaying an incomplete inventory as current.
 */
export async function cloudRows(table:string){
 const pageSize=500,rows:any[]=[]
 let offset=0
 for(;;){
  const result=await cloudRpc<{rows:any[];nextOffset:number}>('mc_v7_rows',{p_table:table,p_after:String(offset),p_limit:pageSize})
  if(!Array.isArray(result?.rows)||result.rows.length>pageSize||!Number.isSafeInteger(result.nextOffset)||result.nextOffset!==offset+result.rows.length)throw Error('Trang dữ liệu Cloud không hợp lệ; dừng đọc để đối soát.')
  rows.push(...result.rows)
  if(result.rows.length<pageSize)return rows
  if(result.nextOffset>100000)throw Error('Khối lượng dữ liệu vượt giới hạn tải hiện tại; yêu cầu tra cứu theo trang.')
  offset=result.nextOffset
 }
}
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
async function sendPendingCloudCommand(){const pending=await pendingCloudCommand();if(!pending)return null;try{const customer=pending.action==='customer.request';const deferred=(pending.action==='draft.save'&&pending.payload.version>0)||['draft.cancel','finance.entry','finance.configure','aftercare.create','aftercare.resolve'].includes(pending.action);const result=customer?await cloudRpc('mc_v8_local_customers',{p_action:'request',p_key:pending.request,p_payload:pending.payload}):pending.action==='sale.request'||deferred?await cloudRpc('mc_v8_local_sales',{p_action:'request',p_key:pending.request,p_payload:{...pending.payload,...(deferred?{action:pending.action}:{})}}):await cloudRpc(pending.action.startsWith('prices.')?'mc_v7_prices':pending.action.startsWith('inbox.')?'mc_v7_inbox':pending.action.startsWith('stocktake.')?'mc_v7_stocktake':['variant.price','product.status'].includes(pending.action)?'mc_v7_catalog_command':'mc_v7_command',{p_request:pending.request,p_action:pending.action,p_payload:pending.payload});if(customer&&(result?.queued!==true||typeof result.requestKey!=='string'||result.customerId!==pending.payload.id))throw Error('Cloud chưa xác nhận tiếp nhận yêu cầu khách. Kiểm tra thao tác trước trước khi gửi tiếp.');localStorage.removeItem(pendingKey);if(deferred){if(result?.queued!==true||typeof result.requestKey!=='string')throw Error('Cloud chưa xác nhận tiếp nhận yêu cầu. Đọc lại trước khi gửi tiếp.');throw new CloudQueuedRequest(result.requestKey,result.state);}return result}catch(e){if(e instanceof CloudRpcError&&['P0001','42501','23503','23505','23514','22P02','22003'].includes(e.code))localStorage.removeItem(pendingKey);throw e}}
export async function retryCloudCommand(){return withCommandLock(sendPendingCloudCommand)}
export async function cloudCommand(action:string,payload:any){return withCommandLock(async()=>{
 if(await pendingCloudCommand())throw Error('Còn thao tác chưa xác minh kết quả. Bấm Kiểm tra thao tác trước trước khi tạo yêu cầu mới.')
 const {data,error}=await cloud.auth.getUser();if(error||!data.user)throw Error('Cần đăng nhập Cloud.')
 localStorage.setItem(pendingKey,JSON.stringify({user:data.user.id,request:crypto.randomUUID(),action,payload}))
 return sendPendingCloudCommand()
})}

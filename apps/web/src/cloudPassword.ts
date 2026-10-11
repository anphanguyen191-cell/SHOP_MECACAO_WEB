import type {Session, SupabaseClient} from '@supabase/supabase-js'

// A recovery callback can announce its session while browser storage is being
// resumed. Keep only the latest SDK event, cleared on SIGNED_OUT by the caller.
// Supabase still validates both restored tokens and the password update.
export async function saveCloudPassword(auth:SupabaseClient['auth'],callbackSession:Session|null,password:string){
 const {data,error}=await auth.getSession()
 if(error)throw error
 if(!data.session){
  if(!callbackSession)throw Error('Phiên đăng nhập không còn trên trình duyệt này. Mở lại trang bằng trình duyệt đã dùng để xác nhận email.')
  const restored=await auth.setSession({access_token:callbackSession.access_token,refresh_token:callbackSession.refresh_token})
  if(restored.error)throw restored.error
  if(!restored.data.session)throw Error('Không khôi phục được phiên đăng nhập Cloud.')
 }
 // updateUser validates the active session at the Auth server. Avoid an extra
 // getUser request that turned temporary read/network failures into a generic
 // "confirm login" message, despite a successful recovery callback.
 const result=await auth.updateUser({password})
 if(result.error)throw result.error
 if(!result.data.user)throw Error('Máy chủ chưa xác nhận lưu mật khẩu Cloud. Chưa được báo thành công.')
}

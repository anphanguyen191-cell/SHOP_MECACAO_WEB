import {useEffect,useState} from 'react'

/** Presentation preferences only; never shop data or inventory. */
export function useBooleanPreference(key:string,fallback:boolean){
 const [value,setValue]=useState(()=>{
  try{const stored=localStorage.getItem('mecacao-ui-'+key);return stored===null?fallback:stored==='true'}catch{return fallback}
 })
 useEffect(()=>{try{localStorage.setItem('mecacao-ui-'+key,String(value))}catch{}},[key,value])
 return [value,setValue] as const
}

export type DisplaySize='small'|'medium'|'large'
/** Device-local UI setting, independent of shop data and account permissions. */
export function useDisplaySize(){
 const [value,setValue]=useState<DisplaySize>(()=>{try{const v=localStorage.getItem('mecacao-ui-display-size');return v==='small'||v==='large'?v:'medium'}catch{return 'medium'}})
 useEffect(()=>{try{localStorage.setItem('mecacao-ui-display-size',value)}catch{}},[value])
 return [value,setValue] as const
}

export class ApiError extends Error{constructor(message:string,public status:number,public data:any){super(message)}}
export async function apiJson<T=any>(url:string,options?:RequestInit):Promise<T>{
 const reading=!options?.method||['GET','HEAD'].includes(options.method.toUpperCase())
 const controller=reading?new AbortController():null
 const forward=()=>controller?.abort()
 if(options?.signal?.aborted)forward()
 options?.signal?.addEventListener('abort',forward,{once:true})
 const timer=controller?setTimeout(()=>controller.abort(),20000):null
 try{
  let r:Response
  try{r=await fetch(url,{...options,signal:controller?.signal??options?.signal})}catch(e){if(options?.signal?.aborted)throw e;throw new Error('Không kết nối được Windows. Kết quả chưa được xác nhận; kết nối lại và đọc lại dữ liệu hoặc tiếp tục yêu cầu đang chờ.')}
  if(r.status===401)window.dispatchEvent(new Event('mecacao-lan-expired'))
  let data:any
  try{data=await r.json()}catch(e){if(options?.signal?.aborted)throw e;throw new ApiError('Phản hồi máy chủ chưa hợp lệ; đọc lại để kiểm tra kết quả.',r.status>=400?r.status:502,null)}
  if(!r.ok)throw new ApiError(data.error||'Không đọc được dữ liệu từ máy chủ',r.status,data)
  return data as T
 }finally{if(timer!==null)clearTimeout(timer);options?.signal?.removeEventListener('abort',forward)}
}

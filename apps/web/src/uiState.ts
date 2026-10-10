import {useEffect,useState} from 'react'

/** Presentation preferences only; never shop data or inventory. */
export function useBooleanPreference(key:string,fallback:boolean){
 const [value,setValue]=useState(()=>{
  try{const stored=localStorage.getItem('mecacao-ui-'+key);return stored===null?fallback:stored==='true'}catch{return fallback}
 })
 useEffect(()=>{try{localStorage.setItem('mecacao-ui-'+key,String(value))}catch{}},[key,value])
 return [value,setValue] as const
}

export class ApiError extends Error{constructor(message:string,public status:number,public data:any){super(message)}}
export async function apiJson<T=any>(url:string,options?:RequestInit):Promise<T>{
 const r=await fetch(url,options)
 const data=await r.json()
 if(!r.ok)throw new ApiError(data.error||'Không đọc được dữ liệu từ máy chủ',r.status,data)
 return data as T
}

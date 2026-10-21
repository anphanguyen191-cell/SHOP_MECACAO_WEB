import {useSyncExternalStore} from 'react'
import type {CSSProperties} from 'react'

export const MOBILE_APPEARANCE_KEY='mecacao-ui-mobile-appearance-v1'
export type MobileAppearancePreferences={
 palette:'classic'|'rose'|'lavender'|'mint'|'champagne'
 material:'flat'|'glass'|'pearl'
 cards:'original'|'soft'|'outlined'|'lifted'
 banner:'none'|'nature'|'family'|'muse'|'custom'
 motion:'system'|'gentle'|'none'
 mascot:boolean
 customBanner:string
}
export const defaultMobileAppearance:Readonly<MobileAppearancePreferences>=Object.freeze({palette:'classic',material:'flat',cards:'original',banner:'none',motion:'system',mascot:false,customBanner:''})
export const mobileAppearancePresets={
 classic:{...defaultMobileAppearance},
 signature:{...defaultMobileAppearance,palette:'rose',material:'pearl',cards:'soft',banner:'muse',motion:'gentle',mascot:true},
 garden:{...defaultMobileAppearance,palette:'mint',material:'flat',cards:'outlined',banner:'nature',motion:'gentle',mascot:true},
 lavender:{...defaultMobileAppearance,palette:'lavender',material:'glass',cards:'soft',banner:'family',motion:'gentle',mascot:true},
 champagne:{...defaultMobileAppearance,palette:'champagne',material:'pearl',cards:'lifted',banner:'muse',motion:'gentle',mascot:true}
} satisfies Record<string,MobileAppearancePreferences>

const oneOf=<T extends string>(value:unknown,choices:readonly T[],fallback:T):T=>choices.includes(value as T)?value as T:fallback
export function normalizeMobileAppearance(value:unknown):MobileAppearancePreferences{
 const p=value&&typeof value==='object'?value as Record<string,unknown>:{}
 const customBanner=typeof p.customBanner==='string'&&p.customBanner.length<=400000&&/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(p.customBanner)?p.customBanner:''
 const banner=oneOf(p.banner,['none','nature','family','muse','custom'],'none')
 return {palette:oneOf(p.palette,['classic','rose','lavender','mint','champagne'],'classic'),material:oneOf(p.material,['flat','glass','pearl'],'flat'),cards:oneOf(p.cards,['original','soft','outlined','lifted'],'original'),banner:banner==='custom'&&!customBanner?'none':banner,motion:oneOf(p.motion,['system','gentle','none'],'system'),mascot:p.mascot===true,customBanner}
}

let rawCache:string|null|undefined,snapshot:Readonly<MobileAppearancePreferences>=defaultMobileAppearance,temporary=false
const changed='mecacao-mobile-appearance-changed'
function read(){
 if(temporary)return snapshot
 try{
  const raw=localStorage.getItem(MOBILE_APPEARANCE_KEY)
  if(raw!==rawCache){rawCache=raw;try{snapshot=raw?normalizeMobileAppearance(JSON.parse(raw)):defaultMobileAppearance}catch{snapshot=defaultMobileAppearance}}
 }catch{/* Storage can be unavailable in a private/restricted browser. */}
 return snapshot
}
function subscribe(listener:()=>void){
 const storage=(event:StorageEvent)=>{if(event.key===MOBILE_APPEARANCE_KEY||event.key===null){temporary=false;rawCache=undefined;listener()}}
 window.addEventListener(changed,listener);window.addEventListener('storage',storage)
 return()=>{window.removeEventListener(changed,listener);window.removeEventListener('storage',storage)}
}
/** Only this browser's presentation key is written; no account or business I/O. */
export function setMobileAppearance(patch:Partial<MobileAppearancePreferences>){
 const next=normalizeMobileAppearance({...read(),...patch}),serialized=JSON.stringify(next)
 let persisted=true
 try{localStorage.setItem(MOBILE_APPEARANCE_KEY,serialized);temporary=false;rawCache=serialized}catch{temporary=true;persisted=false}
 snapshot=next;window.dispatchEvent(new Event(changed));return persisted
}
export function resetMobileAppearance(){return setMobileAppearance({...defaultMobileAppearance})}
export function useMobileAppearance(){return useSyncExternalStore(subscribe,read,()=>defaultMobileAppearance)}
export function mobileAppearanceAttributes(p:Readonly<MobileAppearancePreferences>,enabled=true){
 if(!enabled)return {}
 return {'data-mobile-palette':p.palette,'data-mobile-material':p.material,'data-mobile-cards':p.cards,'data-mobile-banner':p.banner,'data-mobile-motion':p.motion,'data-mobile-mascot':String(p.mascot),style:{'--mobile-mascot-image':`url("${import.meta.env.BASE_URL}brand/logo.jpg")`} as CSSProperties}
}

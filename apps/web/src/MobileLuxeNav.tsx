import ShopIcon from './ShopIcon'
import {useEffect,useState} from 'react'

/** Presentation-only navigation: passes existing route keys to existing handlers. */
export type MobileLuxeNavItem={key:string;label:string}
type Props={
 items:MobileLuxeNavItem[]
 active:string
 onNavigate:(key:string)=>void
 onMore:()=>void
 cloudRoute?:string
}
export default function MobileLuxeNav({items,active,onNavigate,onMore,cloudRoute}:Props){
 const [keyboard,setKeyboard]=useState(false)
 useEffect(()=>{const viewport=window.visualViewport;const measure=()=>setKeyboard(!!viewport&&innerHeight-viewport.height>140&&/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName||''));viewport?.addEventListener('resize',measure);document.addEventListener('focusin',measure);document.addEventListener('focusout',measure);return()=>{viewport?.removeEventListener('resize',measure);document.removeEventListener('focusin',measure);document.removeEventListener('focusout',measure)}},[])
 const candidates=[
  {key:'overview',labels:['Tổng quan'],caption:'Tổng quan'},
  {key:'inventory',labels:['Tồn kho'],caption:'Kho'},
  {key:'orders',labels:['Bán hàng'],caption:'Bán hàng'},
  {key:'cloud',labels:['Kết nối Cloud'],caption:'Cloud'}
 ]
 const resolved=candidates.map(c=>{
  const match=items.find(i=>(c.key==='cloud'&&cloudRoute&&i.key===cloudRoute)||c.labels.includes(i.label))
  return match?{...match,caption:c.caption}:null
 }).filter((item):item is MobileLuxeNavItem & {caption:string}=>item!==null)
 const primaryKeys=new Set(resolved.map(i=>i.key))
 const moreActive=items.some(i=>i.key===active&&!primaryKeys.has(i.key))
 return <nav className={'mobileQuickNav mobileLuxeNav'+(keyboard?' isKeyboardOpen':'')} aria-label="Điều hướng Mobile Travel Luxe">
  {resolved.map(i=><button type="button" key={i.key} className={active===i.key?'selected':''} aria-current={active===i.key?'page':undefined} aria-label={i.label} onClick={()=>onNavigate(i.key)}>
   <span className="mobileLuxeNavIcon" aria-hidden="true"><ShopIcon label={i.label}/></span>
   <small>{i.caption}</small>
  </button>)}
  <button type="button" className={moreActive?'selected':''} onClick={onMore} aria-label="Mở thêm chức năng">
   <span className="mobileLuxeNavIcon" aria-hidden="true"><ShopIcon label="Menu thêm"/></span><small>Thêm</small>
  </button>
 </nav>
}

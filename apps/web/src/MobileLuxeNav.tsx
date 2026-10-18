import ShopIcon from './ShopIcon'

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
 return <nav className="mobileQuickNav mobileLuxeNav" aria-label="Điều hướng Mobile Travel Luxe">
  {resolved.map(i=><button type="button" key={i.key} className={active===i.key?'selected':''} aria-current={active===i.key?'page':undefined} aria-label={i.label} onClick={()=>onNavigate(i.key)}>
   <span className="mobileLuxeNavIcon" aria-hidden="true"><ShopIcon label={i.label}/></span>
   <small>{i.caption}</small>
  </button>)}
  <button type="button" className={moreActive?'selected':''} onClick={onMore} aria-label="Mở thêm chức năng">
   <span className="mobileLuxeNavIcon" aria-hidden="true">☰</span><small>Thêm</small>
  </button>
 </nav>
}

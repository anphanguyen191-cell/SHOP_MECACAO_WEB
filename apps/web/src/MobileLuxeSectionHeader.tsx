/** Presentation-only mobile heading; never infers inventory state or cloud freshness. */
type Props={title:string;mode:'LAN'|'CLOUD'|'LOCAL'|'DEMO';description?:string}
export default function MobileLuxeSectionHeader({title,mode,description}:Props){
 return <header className="mobileLuxeSectionHeader" aria-label={'Màn hình '+title}>
  <div><small>SHOP MẸ CACAO · TRAVEL LUXE</small><h2>{title}</h2><p>{description||'Quản lý cửa hàng thuận tiện trên điện thoại'}</p></div>
  <span className="mobileLuxeSource" aria-label={'Nguồn kết nối '+mode}>{mode==='CLOUD'?'☁ ':mode==='LAN'?'↔ ':mode==='LOCAL'?'⌂ ':'◇ '}{mode}</span>
 </header>
}

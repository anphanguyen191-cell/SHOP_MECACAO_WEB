/** Presentation-only mobile heading; never infers inventory state or cloud freshness. */
type Props={title:string;mode:'LAN'|'CLOUD'|'LOCAL'|'DEMO';description?:string}
export default function MobileLuxeSectionHeader({title,mode,description}:Props){
 return <header className="mobileLuxeSectionHeader" data-mobile-luxe-version="M2-V2.0" aria-label={'Màn hình '+title}>
  <div><small>SHOP MẸ CACAO · TRAVEL LUXE V2.0 · M2</small><h2>{title}</h2><p>{description||'Quản lý cửa hàng thuận tiện trên điện thoại'}</p></div>
  <span className="mobileLuxeSource" aria-label={'Nguồn kết nối '+mode}>{mode==='CLOUD'?'☁ ':mode==='LAN'?'↔ ':mode==='LOCAL'?'⌂ ':'◇ '}{mode}</span>
 </header>
}

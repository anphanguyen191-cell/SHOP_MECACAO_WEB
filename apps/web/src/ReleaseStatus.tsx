import {CLOUD_RELEASE} from './cloudRelease'
type Release={version:string;channel:string;stage:number;status:string;next:string}
export default function ReleaseStatus({version,release,warehouse,custom,onImport}:{version:string;release?:Release;warehouse?:string;custom?:boolean;onImport:()=>void}){
 return <section className="panel v8InstallSummary" aria-label="Phiên bản và thư mục kho"><div className="v8InstallHeading"><div><p className="eyebrow">THÔNG TIN CÀI ĐẶT</p><h3>Shop Mẹ CaCao · {release?.version||version}</h3><small>{CLOUD_RELEASE}</small></div><button type="button" onClick={onImport}>MỞ IMPORT KHO</button></div><div className="v8InstallPath"><strong>Kho đang dùng</strong><code>{custom?warehouse:'Chưa chọn kho nguồn · Chọn tại Import kho'}</code></div><p className="muted">Để chọn hoặc đổi kho khi chưa có dữ liệu, vào Import kho. Tất cả cấu hình quét tự động nằm bên dưới.</p></section>

}

import type {ReactNode} from 'react'
import './travelLuxeDemoAuth.css'

/** The scenic splash and two-column login reproduce the approved standalone Travel Luxe V2 HTML.
 * Only the visual shell is shared. Windows and LAN keep their separate, real authentication.
 */
export function TravelLuxeSplash({onContinue,busy=false,error=''}:{onContinue:()=>void;busy?:boolean;error?:string}){
 return <main className="luxeSplashScreen cacaoDemoSplash" aria-label="Màn hình chào CaCao Travel Luxe">
  <section className="cacaoDemoSplashCenter">
   <div className="cacaoDemoSplashMark" aria-hidden="true"><span>🌸</span></div>
   <div className="cacaoDemoEyebrow">Since 2023 · Shop Mẹ CaCao</div>
   <h1>Hành trình xinh đẹp bắt đầu...</h1>
   <p>Tole xinh cho bé yêu!</p>
   <div className="cacaoDemoSplashLine" aria-hidden="true"/>
   {error&&<p className="cacaoDemoError" role="alert">{error}</p>}
   <button type="button" className="luxeSplashContinue cacaoDemoSkip" onClick={onContinue} disabled={busy}>{busy?'Đang kết nối Windows…':'Bỏ qua lời chào'}</button>
  </section>
 </main>
}
export function TravelLuxeAuthLayout({children,variant='windows'}:{children:ReactNode;variant?:'windows'|'lan'}){
 return <main className="luxeStartupScreen cacaoDemoAuthScreen" aria-label="Đăng nhập Shop Mẹ CaCao">
  <section className="cacaoDemoLogin" aria-label={variant==='lan'?'Màn hình đăng nhập LAN Travel Luxe':'Màn hình đăng nhập Windows Travel Luxe'}>
   <div className="cacaoDemoVisual">
    <div className="cacaoDemoScene" style={{backgroundImage:'url("'+import.meta.env.BASE_URL+'brand/travel-luxe-login-scene.svg")'}} aria-hidden="true"/>
    <div className="cacaoDemoWording">
     <div className="cacaoDemoEyebrow">CaCao Travel Luxe · Since 2023</div>
     <h1>Mỗi ngày làm việc là một chuyến đi thật đẹp.</h1>
     <p>Một không gian quản lý cửa hàng dịu dàng, tràn đầy cảm hứng. Chào mừng trở lại với Shop Mẹ CaCao.</p>
    </div>
    <div className="cacaoDemoVisualBottom"><div className="cacaoDemoGlass">✦ Trải nghiệm desktop mới</div><div className="cacaoDemoGlass">✧ Thiết kế riêng cho Shop Mẹ CaCao</div></div>
   </div>
   <div className="cacaoDemoFormZone luxeStartupCard">
    <div className="cacaoDemoFields">
     <div className="cacaoDemoBrandRow"><div className="cacaoDemoBrandIcon" aria-hidden="true">✿</div><div><b>Shop Mẹ CaCao</b><small>TOLE XINH CHO BÉ YÊU!</small></div></div>
     {children}
     <div className="cacaoDemoBottomLine"><span>CaCao Travel Luxe V2.0</span><span className="cacaoDemoPill">✧ {variant==='lan'?'LAN · Wi-Fi':'Windows · Laptop'}</span></div>
    </div>
   </div>
  </section>
 </main>
}

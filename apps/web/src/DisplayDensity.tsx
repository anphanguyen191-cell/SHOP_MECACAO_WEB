export default function DisplayDensity({compact,onChange}:{compact:boolean;onChange:(value:boolean)=>void}){
 return <div className="densitySwitch" role="group" aria-label="Mật độ hiển thị">
  <button type="button" aria-pressed={compact} onClick={()=>onChange(true)} title="Gọn hơn trên màn hình máy tính">Gọn</button>
  <button type="button" aria-pressed={!compact} onClick={()=>onChange(false)} title="Khoảng cách rộng, dễ đọc">Thoải mái</button>
 </div>
}

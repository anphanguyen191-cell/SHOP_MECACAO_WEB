import type {DisplaySize} from './uiState'
const sizes=[['small','Nhỏ','Xem nhiều thông tin, ít cuộn'],['medium','Vừa','Cân bằng thông tin và thao tác'],['large','Lớn','Chữ và nút lớn, dễ chạm']] as const
export default function DisplayDensity({value,onChange}:{value:DisplaySize;onChange:(value:DisplaySize)=>void}){
 return <div className="densitySwitch" role="group" aria-label="Mật độ hiển thị">{sizes.map(([size,label,title])=><button key={size} type="button" aria-pressed={value===size} onClick={()=>onChange(size)} title={title}>{label}</button>)}</div>
}

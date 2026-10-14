import type {SVGProps} from 'react'
const icons:Record<string,string>={
 home:'M3 10.5 12 3l9 7.5V21h-7v-7h-4v7H3z',
 box:'M3 7l9-4 9 4v10l-9 4-9-4z M3 7l9 4 9-4 M12 11v10',
 photo:'M3 4h18v16H3z M7 13l3-3 3 3 3-4 5 7 M8 8h.01',
 sales:'M4 6h16v15H4z M4 10h16 M8 15h8 M8 18h5',
 users:'M16 19v-2a4 4 0 0 0-8 0v2z M12 7a3 3 0 1 0 0 6 3 3 0 0 0 0-6',
 chart:'M4 20V5 M4 20h17 M8 16v-4 M13 16V8 M18 16V4',
 settings:'M12 3v3 M12 18v3 M3 12h3 M18 12h3 M5.6 5.6l2.1 2.1 M16.3 16.3l2.1 2.1 M18.4 5.6l-2.1 2.1 M7.7 16.3l-2.1 2.1 M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6',
 check:'M4 12l5 5L20 6',
 truck:'M3 7h11v11H3z M14 11h4l3 4v3h-7 M7 20h.01 M18 20h.01',
 cloud:'M5 18h14a4 4 0 0 0 0-8h-1a6 6 0 0 0-12 1 3.5 3.5 0 0 0-1 7',
 search:'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14 M16 16l5 5',
 money:'M12 3v18 M16 7H9a3 3 0 0 0 0 6h6a3 3 0 0 1 0 6H7'
}
function kind(label:string){
 const t=label.toLocaleLowerCase('vi')
 if(/tổng quan|trang chủ/.test(t))return 'home'
 if(/tồn kho|ảnh|hình/.test(t))return 'photo'
 if(/nhập|giao|ship/.test(t))return 'truck'
 if(/sản phẩm|danh mục|import kho/.test(t))return 'box'
 if(/đơn|bán hàng/.test(t))return 'sales'
 if(/khách hàng/.test(t))return 'users'
 if(/báo cáo|thống kê|kiểm kê/.test(t))return 'chart'
 if(/tiền|công nợ|giá/.test(t))return 'money'
 if(/cloud|đồng bộ|lan/.test(t))return 'cloud'
 if(/cài đặt/.test(t))return 'settings'
 return 'check'
}
export default function ShopIcon({label,...props}:{label:string}&SVGProps<SVGSVGElement>){
 return <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.85" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}><path d={icons[kind(label)]}/></svg>
}

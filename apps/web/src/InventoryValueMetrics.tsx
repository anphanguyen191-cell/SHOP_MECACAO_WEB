import type {InventoryValuation} from '../../api/src/inventoryValue'
import './inventoryValue.css'

export default function InventoryValueMetrics({value}:{value?:InventoryValuation}){
 const money=(amount:string)=>BigInt(amount).toLocaleString('vi-VN')+' đ'
 const values=[{key:'cost',title:'Tổng giá trị tồn · giá vốn',amount:value?.costValue,missing:value?.unpricedCostStock,price:'giá vốn'},{key:'sale',title:'Tổng giá bán dự kiến',amount:value?.saleValue,missing:value?.unpricedSaleStock,price:'giá bán'}]
 return <section className="inventoryValuation" aria-label="Giá trị hàng tồn"><div className="inventoryValueMetrics">{values.map(v=><article key={v.key} data-inventory-value={v.key}><span>{v.title}</span><strong>{!value||v.amount===undefined?'—':value.stock>0&&v.missing===value.stock?'Chưa có giá':money(v.amount)}</strong><small>{!value?'Chưa có số liệu định giá':v.missing?`${v.missing.toLocaleString('vi-VN')} bộ chưa có ${v.price} · chưa tính vào tổng`:`Đã tính đủ ${value.stock.toLocaleString('vi-VN')} bộ tồn`}{!!value&&!!v.missing&&v.missing<value.stock?' · Tạm tính':''}</small></article>)}</div><p>Toàn kho · Tồn ảnh × giá hiện tại từng Size. Giá bán dự kiến chưa cộng ship, chưa trừ giảm giá.</p></section>
}

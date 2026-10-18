/** Environment-neutral: the LOCAL physical snapshot and Cloud snapshot use the same arithmetic. */
export type InventoryValuation={stock:number;costValue:string;saleValue:string;unpricedCostStock:number;unpricedSaleStock:number}
type PricedStock={stock:number;cost_price:unknown;sale_price:unknown;cost_price_set?:boolean;sale_price_set?:boolean}
export function inventoryValuation(rows:ReadonlyArray<PricedStock>):InventoryValuation{
 let stock=0,cost=0n,sale=0n,unpricedCostStock=0,unpricedSaleStock=0
 const known=(price:unknown,set?:boolean):price is number=>typeof price==='number'&&Number.isSafeInteger(price)&&price>=0&&(price>0||set===true)
 for(const row of rows){
  if(!Number.isSafeInteger(row.stock)||row.stock<0||!Number.isSafeInteger(stock+row.stock))throw Error('Số tồn không hợp lệ để tính giá trị kho')
  stock+=row.stock
  if(known(row.cost_price,row.cost_price_set))cost+=BigInt(row.stock)*BigInt(row.cost_price);else unpricedCostStock+=row.stock
  if(known(row.sale_price,row.sale_price_set))sale+=BigInt(row.stock)*BigInt(row.sale_price);else unpricedSaleStock+=row.stock
 }
 return {stock,costValue:cost.toString(),saleValue:sale.toString(),unpricedCostStock,unpricedSaleStock}
}

import {CATALOG_ZALO_URL,CATALOG_MESSENGER_URL} from './customerCatalogContacts'
export type CatalogSize={variant_id:number;size_label:string;sale_price:number|null;available_count:number}
export type CatalogProduct={public_product_id:number;name:string;public_code:string;sizes:CatalogSize[];cover_image_id:number|null;stock_as_of:string|null;updated_at:string}
export type CatalogPhoto={id:number;variant_id:number}
export type CartLine={product_id:number;variant_id:number;name:string;size:string;quick_quantity:number;selected_image_ids:number[];expected_price:number|null}
export const SIZE_GUIDE=[['4',9,10,80,80],['5',10,11,80,85],['6',12,13,85,90],['7',14,15,90,95],['8',16,17,95,100],['9',18,20,100,105],['10',21,23,105,110],['11',24,27,110,117],['12',28,30,118,125],['S',31,36,125,132],['M',37,42,133,138],['L',43,50,140,150]] as const
export function matchSizes(weight:number|null,height:number|null,rows:readonly (readonly [string,number,number,number,number])[]=SIZE_GUIDE){
 if(weight===null&&height===null)return []
 if((weight!==null&&(!Number.isFinite(weight)||weight<=0||weight>200))||(height!==null&&(!Number.isFinite(height)||height<=0||height>250)))return []
 return rows.filter(r=>(weight===null||(weight>=r[1]&&weight<=r[2]))&&(height===null||(height>=r[3]&&height<=r[4]))).map(r=>r[0])
}
export const lineCount=(l:CartLine)=>l.quick_quantity+new Set(l.selected_image_ids).size
export function validateCartLine(l:CartLine,available:number){return Number.isSafeInteger(l.quick_quantity)&&l.quick_quantity>=0&&l.selected_image_ids.every(i=>Number.isSafeInteger(i)&&i>0)&&new Set(l.selected_image_ids).size===l.selected_image_ids.length&&lineCount(l)<=available}
export const catalogSizeLabel=(value:string)=>value.trim().replace(/^(?:size\s*)+/i,'').trim()
export function catalogOrderedSizes(sizes:CatalogSize[]){
 const rank=(label:string)=>{const value=catalogSizeLabel(label).toUpperCase();if(/^\d+$/.test(value))return Number(value);const letters=['XS','S','M','L','XL','XXL'];return letters.includes(value)?1000+letters.indexOf(value):2000}
 return [...sizes].sort((a,b)=>rank(a.size_label)-rank(b.size_label)||catalogSizeLabel(a.size_label).localeCompare(catalogSizeLabel(b.size_label),'vi',{numeric:true}))
}
export const catalogMoney=(n:number|null)=>n===null?'Liên hệ Shop':new Intl.NumberFormat('vi-VN').format(n)+' ₫'
export function catalogStored(key:string){try{return localStorage.getItem(key)}catch{return null}}
export function removeCatalogStored(key:string){try{localStorage.removeItem(key)}catch{}}
export function catalogCartSummary(cart:CartLine[]){return cart.map(l=>`${l.name} · Size ${catalogSizeLabel(l.size)}: ${lineCount(l)} bộ${l.selected_image_ids.length?' · ảnh #'+l.selected_image_ids.join(', #'):''}`).join('\n')}
export function sortCatalogProducts(products:CatalogProduct[],sort:string){
 const price=(p:CatalogProduct)=>{const values=p.sizes.map(v=>v.sale_price).filter((n):n is number=>n!==null);return values.length?Math.min(...values):null}
 return [...products].sort((a,b)=>{const x=price(a),y=price(b);if(sort==='asc'||sort==='desc'){if(x===null)return y===null?0:1;if(y===null)return -1;return sort==='asc'?x-y:y-x}return Date.parse(b.updated_at)-Date.parse(a.updated_at)||b.public_product_id-a.public_product_id})
}
export function readCart(raw:string|null):CartLine[]{try{const a=JSON.parse(raw||'[]');return Array.isArray(a)&&a.length<=100?a.filter(l=>l&&Number.isSafeInteger(l.product_id)&&Number.isSafeInteger(l.variant_id)&&typeof l.name==='string'&&typeof l.size==='string'&&Array.isArray(l.selected_image_ids)&&validateCartLine(l,100)&&(l.expected_price===null||Number.isSafeInteger(l.expected_price))):[]}catch{return []}}

// Bundled brand assets work without asking the owner to host images elsewhere.
export const CATALOG_ASSET_BASE='https://anphanguyen191-cell.github.io/SHOP_MECACAO_WEB/brand/'
export const CATALOG_BANNER_URL=CATALOG_ASSET_BASE+'catalog-boutique-hero.jpg'
export const CATALOG_SIZE_IMAGE_URL=CATALOG_ASSET_BASE+'catalog-shop-size.jpg'
export function catalogDefaults(raw:any){
 const cfg=raw&&typeof raw==='object'?raw:{}
 const guide=cfg.guide,labels=new Set(SIZE_GUIDE.map(r=>r[0] as string))
 const valid=Array.isArray(guide)&&guide.length===12&&new Set(guide.map((r:any)=>r?.[0])).size===12&&guide.every((r:any)=>Array.isArray(r)&&r.length===5&&labels.has(r[0])&&r.slice(1).every((n:any)=>typeof n==='number'&&Number.isFinite(n))&&r[1]>0&&r[2]>=r[1]&&r[3]>0&&r[4]>=r[3])
 return {...cfg,banner_url:!cfg.banner_url||[CATALOG_ASSET_BASE+'catalog-mobile-banner.svg',CATALOG_ASSET_BASE+'catalog-shop-banner.jpg'].includes(cfg.banner_url)?CATALOG_BANNER_URL:cfg.banner_url,size_image_url:!cfg.size_image_url||cfg.size_image_url===CATALOG_ASSET_BASE+'catalog-size-guide.svg'?CATALOG_SIZE_IMAGE_URL:cfg.size_image_url,zalo_url:cfg.zalo_url||CATALOG_ZALO_URL,messenger_url:cfg.messenger_url||CATALOG_MESSENGER_URL,guide:valid?guide:SIZE_GUIDE}
}

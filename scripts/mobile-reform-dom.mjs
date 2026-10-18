// Presentation integration: exact image IDs, filter persistence, inactive protection and sheet lifecycle.
import fs from 'node:fs'
import path from 'node:path'
import assert from 'node:assert/strict'
import {build} from 'esbuild'
import {JSDOM} from 'jsdom'
const dir=fs.mkdtempSync(path.resolve('.mobile-reform-dom-'))
try{
 fs.writeFileSync(path.join(dir,'entry.tsx'),`import React,{act,useState} from 'react';import {createRoot} from 'react-dom/client';import MobileInventory from '../apps/web/src/MobileInventory';
 const img=id=>({id,file_name:id+'.jpg',exists:true,file_path:'/fixture/'+id+'.jpg'});
 const variant=(id,size,ids,inactive=false)=>({variant_id:id,size,stock:ids.length,images:ids.map(img),variant_status:inactive?'inactive':'active',sku:'V'+id,ledger_stock:ids.length,sale_price:50000,cost_price:0});
 const products=[{product_id:1,product_code:'A',product_name:'Bộ hoa',product_status:'active',stock:3,variants:[variant(11,'S',[1,2]),variant(12,'M',[3])]},{product_id:2,product_code:'B',product_name:'Bộ gấu',product_status:'active',stock:1,variants:[variant(21,'S',[4])]},{product_id:3,product_code:'C',product_name:'Bộ đã ngưng',product_status:'active',stock:1,variants:[variant(31,'L',[5],true)]}];
 const audit={act,source:JSON.stringify(products),selected:[],viewed:[]};window.audit=audit;window.IS_REACT_ACT_ENVIRONMENT=true;
 function Harness(){const [search,setSearch]=useState(''),[selected,setSelected]=useState(new Set());audit.selected=[...selected];const visible=products.filter(p=>p.product_name.toLowerCase().includes(search.toLowerCase()));return <div className="shell mobileLuxeWorkspace"><MobileInventory products={visible} dashboard={null} selected={selected} search={search} onSearch={setSearch} filters={<label>Size<select><option>Tất cả</option><option>S</option></select></label>} categories={[]} category="" onCategory={()=>{}} loading={false} busy={false} demo={false} urls={{1:'/1.jpg',2:'/2.jpg',3:'/3.jpg',4:'/4.jpg',5:'/5.jpg'}} onChoose={image=>setSelected(old=>{const next=new Set(old);next.has(image.id)?next.delete(image.id):next.add(image.id);return next})} onSelect={images=>setSelected(old=>new Set([...old,...images.map(i=>i.id)]))} onRemove={ids=>setSelected(old=>new Set([...old].filter(id=>!ids.includes(id))))} onView={(images,index)=>audit.viewed.push(images[index].id)} onRefresh={()=>{}} onAdvanced={()=>{}}/></div>}
 const root=createRoot(document.getElementById('root'));audit.mount=()=>root.render(<Harness/>);audit.unmount=()=>root.unmount();audit.assertSource=()=>JSON.stringify(products);`)
 const bundle=await build({entryPoints:[path.join(dir,'entry.tsx')],bundle:true,write:false,platform:'browser',format:'iife',loader:{'.css':'empty'},define:{'process.env.NODE_ENV':'"development"','import.meta.env.BASE_URL':'"/"'}})
 const dom=new JSDOM('<div id="root"></div>',{url:'http://localhost/',runScripts:'dangerously',pretendToBeVisual:true}),w=dom.window
 w.MessageChannel=class{constructor(){this.port1={onmessage:null};this.port2={postMessage:()=>w.setTimeout(()=>this.port1.onmessage?.(),0)}}};w.fetch=()=>{throw Error('Presentation must not issue requests')};w.eval(bundle.outputFiles[0].text)
 const a=w.audit,act=a.act,doc=w.document
 const click=async selector=>{const e=doc.querySelector(selector);assert(e,selector);assert(!e.disabled,selector+' disabled');await act(()=>e.click())}
 const search=async value=>act(()=>{const input=doc.querySelector('#mobile-inventory-search');Object.getOwnPropertyDescriptor(w.HTMLInputElement.prototype,'value').set.call(input,value);input.dispatchEvent(new w.Event('input',{bubbles:true}))})
 await act(()=>a.mount());assert.equal(doc.querySelectorAll('.mobileStockCard').length,4)
 assert(doc.querySelector('[aria-label="Chọn ảnh Bộ đã ngưng L"]').disabled,'Inactive Size cannot be selected')
 await click('[aria-label="Chọn ảnh Bộ hoa S"]');assert.deepEqual([...a.selected],[1,2])
 await click('[aria-label="Xem Bộ hoa S"]');assert(doc.querySelector('[role=dialog]'));assert.equal(doc.activeElement.getAttribute('aria-label'),'Đóng Chi tiết sản phẩm')
 await click('[aria-label="Chọn ảnh 1.jpg"]');assert.deepEqual([...a.selected],[2])
 await click('.mobileSizeChoices button:nth-child(2)');await click('[aria-label="Chọn ảnh 3.jpg"]');assert.deepEqual([...a.selected],[2,3])
 await click('[aria-label="Xem ảnh gốc"]');assert.deepEqual([...a.viewed],[3])
 await act(()=>doc.dispatchEvent(new w.KeyboardEvent('keydown',{key:'Escape',bubbles:true})));assert(!doc.querySelector('[role=dialog]'));assert.equal(doc.body.style.overflow,'')
 await search('gấu');assert.equal(doc.querySelectorAll('.mobileStockCard').length,1);assert.deepEqual([...a.selected],[2,3])
 await click('[aria-label="Chọn ảnh Bộ gấu S"]');assert.deepEqual([...a.selected],[2,3,4])
 await search('');await click('[aria-label="Bộ lọc kho hàng"]');assert(doc.querySelector('[role=dialog] select'))
 await click('[aria-label="Đóng Lọc & sắp xếp"]');assert.deepEqual([...a.selected],[2,3,4]);assert.equal(a.assertSource(),a.source,'Browsing must not mutate source inventory')
 await act(()=>a.unmount());dom.window.close()
 console.log('MOBILE_REFORM_DOM PASS: exact photo IDs, Product/Size switching, cross-product/filter selection persistence, inactive protection, source immutability, sheet focus/Escape and original-view callback')
}finally{fs.rmSync(dir,{recursive:true,force:true})}

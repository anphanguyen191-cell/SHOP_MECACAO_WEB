import { receiveGoods } from '../src/goodsReceipt.ts'
const [root,source,name,code]=process.argv.slice(2)
if(!root||!source||!name||!code)throw new Error('Missing test arguments')
receiveGoods({
 storeRoot:root,name,productCode:code,
 sizes:[{size:'Size Crash',quantity:1,costPrice:10000,salePrice:20000,images:[source]}]
},progress=>{
 if(progress.phase==='COPY')process.exit(77)
})
throw new Error('Expected hard crash at first copied image')

import fs from 'node:fs'
import path from 'node:path'
import sharp from 'sharp'
import {fileURLToPath} from 'node:url'

const project=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..')
const base=path.join(project,'data','stage6-main-test-fixture')
const marker=path.join(base,'.mecacao-stage6-main-test.json')
if(fs.existsSync(base)){
 if(fs.realpathSync(base)!==base||fs.lstatSync(base).isSymbolicLink()||!fs.lstatSync(base).isDirectory())throw Error('Kho mau khong an toan')
 if(fs.readdirSync(base).length&&!fs.existsSync(marker))throw Error('Thu muc da co du lieu khong ro nguon, khong ghi vao do')
}else fs.mkdirSync(base,{recursive:true})
if(!fs.existsSync(marker)){
 const fd=fs.openSync(marker,'wx',0o600)
 try{fs.writeFileSync(fd,JSON.stringify({format:1,purpose:'SHOP_MECACAO_STAGE6_MAIN_TEST_ONLY',note:'Synthetic test images; never business stock'})+'\n');fs.fsyncSync(fd)}
 finally{fs.closeSync(fd)}
}
const items=[
 ['Bo gai pastel - GIA LAP','Size 1','01.jpg',{r:242,g:190,b:204}],
 ['Bo gai pastel - GIA LAP','Size 2','01.jpg',{r:237,g:215,b:157}],
 ['Bo trai xanh - GIA LAP','Size 3','01.jpg',{r:157,g:201,b:237}]
]
for(const [product,size,file,color] of items){
 const filePath=path.join(base,product,size,file)
 fs.mkdirSync(path.dirname(filePath),{recursive:true})
 if(!fs.existsSync(filePath))await sharp({create:{width:480,height:640,channels:3,background:color}}).jpeg({quality:82}).toFile(filePath)
}
console.log('KHO GIA LAP CHO MAIN TEST: '+base)
console.log('Khong dat anh hoac du lieu kinh doanh that vao kho test.')

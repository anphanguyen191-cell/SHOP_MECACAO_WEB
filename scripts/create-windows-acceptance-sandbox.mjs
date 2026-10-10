import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import sharp from 'sharp'

if(process.platform!=='win32')console.log('Sandbox fixture is cross-platform; Windows launcher uses LOCALAPPDATA by default.')
const base=path.resolve(process.env.SHOP_SANDBOX_ROOT||path.join(process.env.LOCALAPPDATA||os.tmpdir(),'ShopMeCaCao','V1AcceptanceSandbox'))
const warehouse=path.join(base,'warehouse')
const incoming=path.join(base,'incoming')
const dbFolder=path.join(base,'database')
fs.mkdirSync(warehouse,{recursive:true})
fs.mkdirSync(incoming,{recursive:true})
fs.mkdirSync(dbFolder,{recursive:true})
const images=[
 [path.join(warehouse,'Bo gai hoa pastel','Size 1','001.jpg'),246,135,180],
 [path.join(warehouse,'Bo gai hoa pastel','Size 2','001.jpg'),120,185,235],
 [path.join(warehouse,'Bo trai xanh','Size 4','001.jpg'),100,195,173],
 [path.join(incoming,'Them Size 1','001.jpg'),244,208,105],
 [path.join(incoming,'Them Size moi','001.jpg'),177,122,230],
 [path.join(incoming,'Mau moi','001.jpg'),225,139,107]
]
for(const [target,r,g,b] of images){
 fs.mkdirSync(path.dirname(target),{recursive:true})
 if(process.env.SHOP_ENABLE_V2_SALES==='1'&&process.env.SHOP_DB_PATH&&fs.existsSync(process.env.SHOP_DB_PATH))continue // sale restart must never recreate sold canonical images
 if(fs.existsSync(target))continue // never overwrite a tester's file
 await sharp({create:{width:900,height:1100,channels:3,background:{r,g,b}}}).jpeg({quality:87}).toFile(target)
}
console.log('\n=== SHOP MẸ CACAO — WINDOWS ACCEPTANCE SANDBOX ===')
console.log('KHO GIẢ LẬP (SCAN): '+warehouse)
console.log('ẢNH HÀNG MỚI (NHẬP): '+incoming)
console.log('DATABASE RIÊNG: '+(process.env.SHOP_DB_PATH||path.join(dbFolder,'shop-acceptance.db')))
console.log('KHÔNG xóa/ghi đè bất kỳ dữ liệu thật nào. Ảnh mới chỉ tạo khi chưa tồn tại.')
console.log('KHÔNG chọn D:\\1-Me CaCao Store trong các thử nghiệm ghi dữ liệu.\n')

import fs from 'node:fs'
import path from 'node:path'
import readline from 'node:readline'
import {fileURLToPath} from 'node:url'
import {makeLanCredential,changeLanAccount} from '../apps/api/src/lanSecurity.ts'

const repo=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..')
const directory=path.join(repo,'data','stage4','lan')
if(!process.stdin.isTTY||!process.stdout.isTTY)throw Error('Chỉ chỉnh tài khoản trực tiếp trên Windows')
const rl=readline.createInterface({input:process.stdin,output:process.stdout})
const ask=(prompt)=>new Promise(resolve=>rl.question(prompt,resolve))
function secret(prompt){
 return new Promise((resolve,reject)=>{
  rl.pause()
  process.stdout.write(prompt)
  let value='',done=false
  const stdin=process.stdin
  stdin.setRawMode(true);stdin.resume()
  function finish(err){
   if(done)return
   done=true
   stdin.removeListener('data',listen);stdin.setRawMode(false);stdin.pause();process.stdout.write('\n')
   if(err)reject(err);else resolve(value)
  }
  function listen(chunk){
   for(const c of String(chunk)){
    if(c==='\r'||c==='\n'){finish();return}
    if(c==='\u0003'){finish(Error('Đã hủy'));return}
    if(c==='\u007f'||c==='\b'){if(value.length){value=value.slice(0,-1);process.stdout.write('\b \b')}continue}
    if(c>=' '&&value.length<256){value+=c;process.stdout.write('*')}
   }
  }
  stdin.on('data',listen)
 })
}
try{
 fs.mkdirSync(directory,{recursive:true})
 if(fs.realpathSync(directory)!==directory||fs.lstatSync(directory).isSymbolicLink())throw Error('Thư mục LAN không an toàn')
 const file=path.join(directory,'users.json'),exists=fs.existsSync(file)
 let users=[]
 if(exists){
  if(fs.realpathSync(file)!==file||fs.lstatSync(file).isSymbolicLink())throw Error('File tài khoản không an toàn')
  const cfg=JSON.parse(fs.readFileSync(file,'utf8'))
  if(cfg.format!==1||!Array.isArray(cfg.users))throw Error('Cấu hình LAN không hợp lệ')
  users=cfg.users
 }
 const choice=exists?String(await ask('1=Thêm tài khoản / 2=Đổi mật khẩu / 3=Khóa tài khoản: ')).trim():'1'
 const kind=choice==='1'?'add':choice==='2'?'reset':choice==='3'?'disable':null
 if(!kind)throw Error('Lựa chọn không hợp lệ')
 const actor=exists?String(await ask('Tài khoản chủ shop xác nhận: ')).trim():''
 const username=String(await ask('Tên tài khoản cần thao tác: ')).trim()
 const role=kind==='add'&&exists?String(await ask('Quyền (owner/cashier/inventory/viewer): ')).trim():kind==='add'?'owner':undefined
 const ownerPassword=exists?await secret('Mật khẩu CHỦ SHOP: '):''
 let newPassword
 if(kind!=='disable'){
  newPassword=await secret('Mật khẩu mới (14+ ký tự, có chữ và số): ')
  const confirm=await secret('Nhập lại mật khẩu mới: ')
  if(newPassword!==confirm)throw Error('Mật khẩu mới nhập lại không khớp')
 }
 const changed=exists
  ?changeLanAccount(users,actor,ownerPassword,{action:kind,username,role,password:newPassword})
  :[makeLanCredential(username,newPassword,role)]
 const out=JSON.stringify({format:1,users:changed},null,2)+'\n'
 const tmp=file+'.tmp-'+process.pid
 const fd=fs.openSync(tmp,'wx',0o600)
 try{fs.writeFileSync(fd,out);fs.fsyncSync(fd)}finally{fs.closeSync(fd)}
 fs.renameSync(tmp,file)
 console.log('Đã lưu cấu hình tài khoản, không lưu mật khẩu nguyên văn.')
 console.log('QUAN TRỌNG: Đóng và mở lại START_SHOP_LAN.bat để áp dụng quyền mới và hủy toàn bộ phiên đăng nhập cũ.')
}catch(err){console.error('THẤT BẠI:',err.message);process.exitCode=1}finally{rl.close()}

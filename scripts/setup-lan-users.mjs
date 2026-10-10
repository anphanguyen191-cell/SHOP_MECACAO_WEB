import fs from 'node:fs'
import path from 'node:path'
import readline from 'node:readline'
import {fileURLToPath} from 'node:url'
import {makeLanCredential} from '../apps/api/src/lanSecurity.ts'

const repo=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..')
const directory=path.join(repo,'data','stage4','lan')
if(!process.stdin.isTTY||!process.stdout.isTTY)throw Error('Chỉ tạo tài khoản LAN trực tiếp tại cửa sổ Windows, không dùng terminal tự động')
const rl=readline.createInterface({input:process.stdin,output:process.stdout})
const ask=(prompt)=>new Promise(resolve=>rl.question(prompt,resolve))
const secret=(prompt)=>new Promise((resolve,reject)=>{
 rl.pause()
 process.stdout.write(prompt)
 let value=''
 const stdin=process.stdin
 stdin.setRawMode(true);stdin.resume()
 function done(err){
  stdin.removeListener('data',listen);stdin.setRawMode(false);stdin.pause();process.stdout.write('\n')
  if(err)reject(err);else resolve(value)
 }
 function listen(chunk){
  for(const c of String(chunk)){
   if(c==='\r'||c==='\n'){done();return}
   if(c==='\u0003'){done(Error('Đã hủy'));return}
   if(c==='\u007f'||c==='\b'){if(value.length){value=value.slice(0,-1);process.stdout.write('\b \b')}continue}
   if(c>=' '&&value.length<256){value+=c;process.stdout.write('*')}
  }
 }
 stdin.on('data',listen)
})
try{
 const username=(await ask('Tài khoản (chữ thường, từ 3 ký tự): ')).trim()
 const existingFile=path.join(directory,'users.json')
 const exists=fs.existsSync(existingFile)
 const role=exists?(await ask('Quyền (owner/cashier/inventory/viewer): ')).trim():'owner'
 const password=await secret('Mật khẩu (14+ ký tự, có chữ và số): ')
 const confirm=await secret('Nhập lại mật khẩu: ')
 if(password!==confirm)throw Error('Mật khẩu xác nhận không khớp')
 const row=makeLanCredential(username,password,role)
 fs.mkdirSync(directory,{recursive:true})
 if(fs.realpathSync(directory)!==directory)throw Error('Thư mục LAN không an toàn')
 let rows=[]
 if(exists){
  if(fs.realpathSync(existingFile)!==existingFile)throw Error('File tài khoản không an toàn')
  const previous=JSON.parse(fs.readFileSync(existingFile,'utf8'))
  if(previous.format!==1||!Array.isArray(previous.users))throw Error('Cấu hình tài khoản hiện hành không hợp lệ')
  rows=previous.users
  if(rows.some(x=>x.username===row.username))throw Error('Tên đăng nhập đã tồn tại; không ghi đè')
 }else if(role!=='owner')throw Error('Tài khoản đầu tiên phải là chủ shop')
 rows.push(row)
 const out=JSON.stringify({format:1,users:rows},null,2)+'\n'
 const tmp=existingFile+'.tmp-'+process.pid
 const fd=fs.openSync(tmp,'wx',0o600)
 try{fs.writeFileSync(fd,out);fs.fsyncSync(fd)}finally{fs.closeSync(fd)}
 fs.renameSync(tmp,existingFile)
 console.log('Đã tạo tài khoản LAN. Không lưu mật khẩu nguyên văn.')
 console.log('Tiếp theo cần cert.pem / key.pem đúng IP Wi-Fi trong '+directory)
}catch(err){console.error('THẤT BẠI:',err.message);process.exitCode=1}finally{rl.close()}

import fs from 'node:fs'
import path from 'node:path'
import net from 'node:net'
import {randomUUID} from 'node:crypto'
import {createInterface} from 'node:readline/promises'
import {spawn} from 'node:child_process'

if(process.platform!=='win32'||!process.env.LOCALAPPDATA)throw Error('Chức năng này dành cho Windows LOCAL')
// Never inherit another testing/live environment into activation or a newly selected server.
for(const key of ['SHOP_LOCAL_V2_CONFIG','SHOP_LOCAL_V2_RESTORE_READY','SHOP_SANDBOX_ROOT','SHOP_DB_PATH','SHOP_ENABLE_V2_DRAFTS','SHOP_ENABLE_V2_SALES','SHOP_LOCAL_V2_REVIEW'])delete process.env[key]
const {activateLocalV2,rollbackUnusedLocalV2,ACTIVATE_PHRASE,ROLLBACK_PHRASE}=await import('../apps/api/dist/localV2Activation.js')
const {readLocalConfig}=await import('../apps/api/dist/localRuntime.js')
const rl=createInterface({input:process.stdin,output:process.stdout}),mode=process.argv[2]
const base=path.join(process.env.LOCALAPPDATA,'ShopMeCaCao','LocalV2'),pointer=path.join(base,'active-config.json')
const ask=async(label)=>{const value=(await rl.question(label)).trim();return value.replace(/^"(.*)"$/,'$1')}
async function stopped(){for(const port of [3000,3005,3006,3007,3016,3017])await new Promise((resolve,reject)=>{const socket=net.connect({host:'127.0.0.1',port});socket.setTimeout(1000);socket.once('connect',()=>{socket.destroy();reject(Error(`Cổng ${port} đang chạy. Dừng tất cả cửa sổ Shop trước.`))});socket.once('error',e=>{socket.destroy();e.code==='ECONNREFUSED'?resolve():reject(e)});socket.once('timeout',()=>{socket.destroy();reject(Error('Không kiểm chứng được cổng '+port))})})}
try{
 if(mode==='activate'){
  await stopped()
  if(fs.existsSync(pointer))throw Error('Đã có cấu hình LOCAL ghi nhớ. Không kích hoạt thêm kho; kiểm tra cấu hình hiện tại.')
  console.log('DỪNG V1/Python cũ. Backup V1 mới nhất, duyệt bản sao thực tế trước khi tiếp tục. Không dùng gói đã tạo đơn test. Ảnh đã bán giữ gốc phục hồi, CHƯA tự xóa.')
  const prepared=await ask('Thư mục gói V2 sạch đã duyệt: '),source=await ask('File database V1 đang dùng (shop.db): ')
  const phrase=await ask(`Nhập chính xác ${ACTIVATE_PHRASE}: `)
  await stopped();fs.mkdirSync(path.join(base,'stores'),{recursive:true})
  const c=activateLocalV2(prepared,source,path.join(base,'stores',randomUUID()),phrase,p=>console.log('Đã kiểm chứng: '+p))
  fs.writeFileSync(pointer,JSON.stringify({configPath:c.configPath}),{flag:'wx'})
  console.log('Kích hoạt hoàn tất. Kho: '+c.warehouse+'\nDB: '+c.database+'\nẢnh nhập mới đặt trong: '+c.incoming+'\nChạy START_SHOP_V2_LOCAL.bat. Không mở lại V1/Python cũ.')
 }else if(mode==='rollback'){
  await stopped();const file=await ask('Đường dẫn local-v2-config.json cần quay lui: ')
  console.log(rollbackUnusedLocalV2(file,await ask(`Nhập chính xác ${ROLLBACK_PHRASE}: `)))
  if(fs.existsSync(pointer)&&JSON.parse(fs.readFileSync(pointer,'utf8')).configPath===file)fs.renameSync(pointer,pointer+'.rolled-back-'+Date.now())
 }else if(mode==='start'||mode==='restore'){
  await stopped()
  const file=mode==='restore'?await ask('Đường dẫn restore-ready.json của kho phục hồi thử: '):fs.existsSync(pointer)?JSON.parse(fs.readFileSync(pointer,'utf8')).configPath:await ask('Đường dẫn local-v2-config.json đã kích hoạt: ')
  if(mode==='start'){const c=readLocalConfig(file);console.log('KHO KINH DOANH: '+c.warehouse+'\nDATABASE: '+c.database+'\nNGUỒN NHẬP: '+c.incoming);process.env.SHOP_LOCAL_V2_CONFIG=file}
  else process.env.SHOP_LOCAL_V2_RESTORE_READY=file
  rl.close();const port=mode==='start'?'3000':'3016'
  const child=spawn(process.execPath,['apps/api/dist/server.js'],{stdio:'inherit',env:{...process.env,PORT:port,SHOP_HOST:'127.0.0.1'}})
  console.log('Mở http://127.0.0.1:'+port+'. Restart: Ctrl+C, chờ dừng, chạy lại cùng BAT.');child.on('exit',code=>{process.exitCode=code??1})
 }else throw Error('Chế độ không hợp lệ')
}catch(e){console.error('DỪNG AN TOÀN: '+e.message);process.exitCode=1}finally{rl.close()}

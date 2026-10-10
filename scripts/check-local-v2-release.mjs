import fs from 'node:fs'
import path from 'node:path'
import {randomUUID} from 'node:crypto'
import {createInterface} from 'node:readline/promises'
import {checkLocalV2Release} from '../apps/api/dist/localV2ReleaseCheck.js'
import {writeDurable} from '../apps/api/dist/salesExecution.js'
if(!process.env.LOCALAPPDATA)throw Error('Cần LOCALAPPDATA Windows')
const base=path.resolve(process.env.LOCALAPPDATA,'ShopMeCaCao','V2LocalPreparation')
if(fs.realpathSync(base)!==base)throw Error('Vùng chuẩn bị không an toàn')
const packages=fs.readdirSync(base).filter(n=>/^prepare-[a-f0-9-]{36}$/.test(n)).map(n=>path.join(base,n)).filter(p=>fs.existsSync(path.join(p,'local-v2-ready.json'))).sort()
if(!packages.length)throw Error('Chưa có gói; chạy PREPARE_WINDOWS_V2_LOCAL_COPY.bat trước')
const prompt=createInterface({input:process.stdin,output:process.stdout})
try{
  console.log('KIỂM TRA TRƯỚC KHI CHUYỂN V2 — chỉ đọc, không kích hoạt kho thật.')
  packages.forEach((p,i)=>console.log((i+1)+'. '+p))
  const choice=await prompt.question('Chọn số gói: ')
  if(!/^[1-9]\d*$/.test(choice)||!packages[Number(choice)-1])throw Error('Số gói không hợp lệ')
  const latest=(await prompt.question('Thư mục backup đầy đủ V1 cuối (Enter để ghi nhận chưa có): ')).trim().replace(/^"(.*)"$/,'$1')
  const root=packages[Number(choice)-1],result=checkLocalV2Release(root,latest||undefined)
  const text=['KIỂM TRA LOCAL V2: '+result.status,...result.checks.map(c=>(c.ok?'PASS':'CHƯA ĐẠT')+' | '+c.label+' | '+c.message),'',...Object.entries(result.counts||{}).map(([k,v])=>k+': '+v),'','CÒN CHỜ:',...result.pendingGates,'','Báo cáo chỉ phản ánh lúc kiểm tra; chưa cho phép kích hoạt kinh doanh.'].join('\n')
  const dir=path.join(root,'release-reports');fs.mkdirSync(dir,{recursive:true});if(fs.realpathSync(dir)!==dir)throw Error('Thư mục báo cáo không an toàn')
  const id=randomUUID();writeDurable(path.join(dir,id+'.json'),JSON.stringify(result,null,2));writeDurable(path.join(dir,id+'.txt'),text)
  console.log(text+'\n\nBáo cáo: '+path.join(dir,id+'.txt'))
  if(result.status==='BLOCKED')process.exitCode=1
}finally{prompt.close()}

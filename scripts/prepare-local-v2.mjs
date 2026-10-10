import fs from 'node:fs'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { createInterface } from 'node:readline/promises'
import { prepareLocalV2 } from '../apps/api/dist/localV2Preparation.js'

if(!process.env.LOCALAPPDATA)throw Error('Cần chạy bộ chuẩn bị trên Windows có LOCALAPPDATA')
const prompt = createInterface({input:process.stdin,output:process.stdout})
const clean = value => value.trim().replace(/^"(.*)"$/,'$1')
try {
  console.log('CHUẨN BỊ LOCAL V2 TRÊN BẢN SAO — chỉ đọc backup, không đổi kho/database đang dùng.')
  console.log('Trong V1: Cài đặt → Backup đầy đủ DB + ảnh gốc. Dán thư mục backup đó dưới đây.')
  const bundle = clean(await prompt.question('Thư mục backup đầy đủ V1: '))
  const warehouse = clean(await prompt.question('Đường dẫn kho gốc đã dùng khi backup (Product / Size / ảnh): '))
  if(!bundle||!warehouse)throw Error('Thiếu đường dẫn; chưa chuẩn bị')
  const base = path.join(process.env.LOCALAPPDATA,'ShopMeCaCao','V2LocalPreparation')
  fs.mkdirSync(base,{recursive:true})
  if(fs.realpathSync(base)!==base)throw Error('Thư mục chuẩn bị không được đi qua symlink')
  const target = path.join(base,'prepare-'+randomUUID())
  const result = await prepareLocalV2(bundle,warehouse,target,p=>console.log('✓ '+p))
  console.log('\nREADY_FOR_REVIEW\nGói chuẩn bị: '+target+'\nẢnh kiểm chứng: '+result.imagesVerified+'\nBản sao V2: '+result.candidate.database+'\nQuay lui thử V1: '+result.rollbackProof.database+'\nChưa kích hoạt kho thật. Mở RUN_WINDOWS_V2_LOCAL_REVIEW.bat để xem bản sao.')
} finally {prompt.close()}

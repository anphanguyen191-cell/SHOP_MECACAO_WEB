import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'

const dir=fs.mkdtempSync(path.join(os.tmpdir(),'shop-mecacao-v1-'))
const dbPath=path.join(dir,'self-test.db')
const tsx=path.resolve('node_modules/tsx/dist/cli.mjs')
const result=spawnSync(process.execPath,[tsx,'src/selfTest.ts'],{
 cwd:path.resolve('.'),
 env:{...process.env,SHOP_DB_PATH:dbPath},
 stdio:'inherit'
})
try{fs.rmSync(dir,{recursive:true,force:true})}catch{}
process.exit(result.status ?? 1)

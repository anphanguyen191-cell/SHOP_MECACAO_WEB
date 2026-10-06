import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'

const require=createRequire(import.meta.url)
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'shop-mecacao-v1-'))
const dbPath=path.join(dir,'self-test.db')
const tsxPackage=require.resolve('tsx/package.json')
const tsx=path.join(path.dirname(tsxPackage),'dist','cli.mjs')
const result=spawnSync(process.execPath,[tsx,'src/selfTest.ts'],{
 cwd:path.resolve('.'),
 env:{...process.env,SHOP_DB_PATH:dbPath},
 stdio:'inherit'
})
try{fs.rmSync(dir,{recursive:true,force:true})}catch{}
if(result.error){console.error(result.error)}
process.exit(result.status ?? 1)

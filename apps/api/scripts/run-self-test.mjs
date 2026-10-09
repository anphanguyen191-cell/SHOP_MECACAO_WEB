import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'shop-mecacao-v1-'))
const dbPath=path.join(dir,'self-test.db')
const result=spawnSync(process.execPath,['--import','tsx',process.argv[2]||'src/selfTest.ts'],{
 cwd:path.resolve('.'),
 // Windows launcher exports a sandbox root; tests use their own temp root.
 env:{...process.env,SHOP_DB_PATH:dbPath,SHOP_SANDBOX_ROOT:''},
 stdio:'inherit'
})
try{fs.rmSync(dir,{recursive:true,force:true})}catch{}
if(result.error){console.error(result.error)}
process.exit(result.status ?? 1)

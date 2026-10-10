import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import {createLanAudit} from './lanAudit.js'
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'mecacao-lan-audit-')),file=path.join(dir,'audit.jsonl')
let checks=0
try{
 const a=createLanAudit(file)
 const e={event:'WRITE_START',actor:'cashier',role:'cashier',method:'POST',target:'/api/sales/drafts',status:0} as const
 a.append(e);checks++;a.append({...e,event:'WRITE_RESULT',status:201});checks++
 const contents=fs.readFileSync(file,'utf8')
 assert.equal(contents.includes('cashier'),true);checks++
 assert.equal(createLanAudit(file).readOnlyStatus().count,2);checks++
 const parts=contents.trim().split('\n'),broken=JSON.parse(parts[0]);broken.actor='intruder'
 fs.writeFileSync(file,JSON.stringify(broken)+'\n'+parts[1]+'\n')
 assert.throws(()=>createLanAudit(file),/checksum/);checks++
 fs.writeFileSync(file,contents.slice(0,-1))
 assert.throws(()=>createLanAudit(file),/partial/);checks++
 console.log('STAGE6 LAN AUDIT PASS',checks)
}finally{fs.rmSync(dir,{recursive:true,force:true})}

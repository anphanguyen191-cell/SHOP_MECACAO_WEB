import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import ts from 'typescript'
import {pathToFileURL} from 'node:url'
const source=fs.readFileSync(new URL('../../apps/api/src/imageNaming.ts',import.meta.url),'utf8')
const cwd=fs.mkdtempSync(path.join(os.tmpdir(),'mecacao-image-name-history-'))
const meta=new Map()
fs.writeFileSync(path.join(cwd,'db.mjs'),`
export const db={prepare(sql){
 if(sql.startsWith('SELECT value FROM app_metadata'))return {get(k){const v=globalThis.__testMeta.get(k);return v===undefined?undefined:{value:v}}}
 if(sql.startsWith('INSERT INTO app_metadata'))return {run(k,v){const prev=globalThis.__testMeta.get(k);if(prev===undefined||Number(prev)<Number(v))globalThis.__testMeta.set(k,v)}}
 throw Error('Unexpected SQL: '+sql)
}}`)
globalThis.__testMeta=meta
const compiled=ts.transpileModule(source.replace("'./db.js'","'./db.mjs'"),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText
fs.writeFileSync(path.join(cwd,'naming.mjs'),compiled)
const {nextNamedImage,reserveNamedImageSequences,imagePrefix}=await import(pathToFileURL(path.join(cwd,'naming.mjs')).href)
test('named image allocation never recycles an assigned file number after physical deletion or app restart',()=>{
 const dir=path.join(cwd,'size8');fs.mkdirSync(dir)
 const prefix=imagePrefix('Bộ Gấu Hồng','Size 8')
 fs.writeFileSync(path.join(dir,prefix+'0007.jpg'),'OLD')
 const first=nextNamedImage(dir,'Bộ Gấu Hồng','Size 8','.jpg',new Set())
 assert(first.endsWith('0008.jpg'))
 reserveNamedImageSequences([first])
 fs.writeFileSync(first,'NEW');fs.unlinkSync(first)
 fs.unlinkSync(path.join(dir,prefix+'0007.jpg'))
 const next=nextNamedImage(dir,'Bộ Gấu Hồng','Size 8','.png',new Set())
 assert(next.endsWith('0009.png'),'Must not reuse old number even for different extension')
 reserveNamedImageSequences([next])
 assert(nextNamedImage(dir,'Bộ Gấu Hồng','Size 8','.jpg',new Set()).endsWith('0010.jpg'))
})
test('failed receipt reserves assigned number without reusing it',()=>{
 const dir=path.join(cwd,'size9');fs.mkdirSync(dir)
 const old=nextNamedImage(dir,'Đồ tole Bé Gái','9','.jpeg',new Set())
 reserveNamedImageSequences([old])
 const second=nextNamedImage(dir,'Đồ tole Bé Gái','9','.jpeg',new Set())
 assert(second.endsWith('0002.jpeg'))
 assert(!fs.existsSync(old))
})
test('other Sizes use separate permanent counters and registered missing names count',()=>{
 const dir=path.join(cwd,'size10');fs.mkdirSync(dir)
 const prefix=imagePrefix('Đồ tole Bé Gái','Size 10')
 const missing=path.join(dir,prefix+'0042.jpg')
 const got=nextNamedImage(dir,'Đồ tole Bé Gái','Size 10','.jpg',new Set([missing.toLowerCase()]))
 assert(got.endsWith('0043.jpg'))
 reserveNamedImageSequences([missing])
 assert(nextNamedImage(dir,'Đồ tole Bé Gái','Size 10','.jpg',new Set()).endsWith('0043.jpg'))
})
test.after(()=>{delete globalThis.__testMeta;fs.rmSync(cwd,{recursive:true,force:true})})

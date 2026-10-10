import fs from 'node:fs'
import path from 'node:path'
import {randomUUID} from 'node:crypto'
import {Router} from 'express'
import {dbPath} from './db.js'
import {restoreLosslessBackup} from './losslessRestore.js'
import {verifyLosslessBackup} from './losslessVerify.js'
/** Disposable restore in test sandbox. No arbitrary target and no switch of the live DB. */
export function restoreTestRouter(sandboxRoot:string,port:number){
 const router=Router(),root=fs.realpathSync(sandboxRoot),backups=path.join(path.dirname(dbPath),'backups'),tests=path.join(root,'restore-tests')
 const inside=(base:string,p:string)=>{const r=path.relative(base,p);return !!r&&!path.isAbsolute(r)&&r!=='..'&&!r.startsWith('..'+path.sep)}
 router.use((req,res,next)=>{let same=false;try{const u=new URL(req.get('origin')||'');same=u.protocol==='http:'&&['localhost','127.0.0.1','[::1]'].includes(u.hostname)&&Number(u.port||80)===port}catch{}if(!same||!['127.0.0.1','::1','::ffff:127.0.0.1'].includes(req.socket.remoteAddress||''))return res.status(403).json({error:'Restore thử chỉ từ giao diện sandbox trên cùng máy'});next()})
 router.post('/',(req,res)=>{
  try{
   if(typeof req.body.directory!=='string'||typeof req.body.warehouseRoot!=='string'||req.body.confirmed!==true)throw Error('Chọn backup và xác nhận tạo kho restore thử mới')
   const directory=fs.realpathSync(req.body.directory),warehouse=fs.realpathSync(req.body.warehouseRoot)
   if(!inside(backups,directory)||!inside(root,warehouse))throw Error('Chỉ restore backup/kho gốc nằm trong sandbox hiện tại')
   verifyLosslessBackup(directory)
   if(!fs.existsSync(tests))fs.mkdirSync(tests);if(fs.realpathSync(tests)!==tests)throw Error('Thư mục restore thử không an toàn')
   const result=restoreLosslessBackup(directory,path.join(tests,randomUUID()),warehouse)
   res.json(result)
  }catch(e){res.status(400).json({error:e instanceof Error?e.message:'Restore thử thất bại; giữ thư mục dở để kiểm tra'})}
 })
 return router
}

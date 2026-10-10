import fs from 'node:fs'
import path from 'node:path'
import {createHash,randomUUID} from 'node:crypto'
import {spawn} from 'node:child_process'
import {fileURLToPath} from 'node:url'
import {EventEmitter} from 'node:events'
import {taskActivity} from './taskActivity.js'
export type TaskKind='SCAN'|'RECEIPT'|'REGISTER_BATCH'|'BACKUP'
type Task={format:1;id:string;key:string;hash:string;kind:TaskKind;status:'QUEUED'|'RUNNING'|'SUCCEEDED'|'FAILED'|'REVIEW_REQUIRED';createdAt:string;updatedAt:string;progress?:any;result?:any;error?:string}
const digest=(s:string)=>createHash('sha256').update(s).digest('hex')
export function taskManager(dbPath:string){
 const root=path.join(path.dirname(dbPath),'operation-tasks');fs.mkdirSync(root,{recursive:true})
 if(fs.realpathSync(root)!==root)throw Error('Task directory cannot be a link')
 const events=new EventEmitter(),lock=path.join(root,'active.json'),index=new Map<string,Task>()
 const file=(id:string)=>{if(!/^[a-f0-9-]{36}$/.test(id))throw Error('Mã tác vụ không hợp lệ');return path.join(root,id+'.json')}
 function read(id:string):Task{const p=file(id);if(fs.realpathSync(p)!==p||!fs.lstatSync(p).isFile())throw Error('Task file unsafe');return JSON.parse(fs.readFileSync(p,'utf8'))}
 function write(p:string,value:unknown){const temp=p+'.'+randomUUID()+'.tmp',fd=fs.openSync(temp,'wx',0o600);try{fs.writeFileSync(fd,JSON.stringify(value));fs.fsyncSync(fd)}finally{fs.closeSync(fd)}fs.renameSync(temp,p);try{const d=fs.openSync(root,'r');try{fs.fsyncSync(d)}finally{fs.closeSync(d)}}catch(e){if(process.platform!=='win32')throw e}}
 function save(t:Task){t.updatedAt=new Date().toISOString();write(file(t.id),t);const {result,...summary}=t;index.set(t.id,summary);events.emit(t.id,t)}
 for(const n of fs.readdirSync(root).filter(n=>/^[a-f0-9-]{36}\.json$/.test(n))){const {result,...t}=read(n.slice(0,-5));index.set(t.id,t)}
 function list(){return [...index.values()].sort((a,b)=>b.createdAt.localeCompare(a.createdAt))}
 if(fs.existsSync(lock)){
  if(fs.realpathSync(lock)!==lock)throw Error('Task lock unsafe')
  const l=JSON.parse(fs.readFileSync(lock,'utf8'));if(!Number.isSafeInteger(l.pid)||l.pid<=0)throw Error('Khóa tác vụ không rõ; kiểm tra thủ công')
  try{process.kill(l.pid,0);throw Error('Worker cũ còn chạy. Chờ dừng trước khi mở server lại.')}catch(e){if((e as NodeJS.ErrnoException).code!=='ESRCH')throw e}
  const t=read(l.id);if(['RUNNING','QUEUED'].includes(t.status)){t.status='REVIEW_REQUIRED';t.error='Server/worker bị gián đoạn. Kiểm tra kho và nhật ký trước tác vụ mới; không tự chạy lại.';save(t)}fs.unlinkSync(lock)
 }
 for(const t of list())if(['QUEUED','RUNNING'].includes(t.status)){t.status='REVIEW_REQUIRED';t.error='Tác vụ không có kết quả cuối đã xác minh. Không tự chạy lại.';save(t)}
 const pendingReview=()=>list().some(t=>t.status==='REVIEW_REQUIRED')
 function start(kind:TaskKind,payload:unknown,key:string){
  if(!/^[a-zA-Z0-9_-]{16,100}$/.test(key))throw Error('Thiếu mã chống nhập trùng hợp lệ')
  const hash=digest(JSON.stringify({kind,payload})),old=list().find(t=>t.key===key)
  if(old){if(old.hash!==hash)throw Error('Cùng mã tác vụ nhưng dữ liệu đã thay đổi');return read(old.id)}
  if(taskActivity.busy||pendingReview())throw Error('Có tác vụ đang chạy hoặc cần kiểm tra. Không tạo tác vụ mới.')
  const t:Task={format:1,id:randomUUID(),key,hash,kind,status:'QUEUED',createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()};save(t);taskActivity.busy=true;taskActivity.readOnly=kind==='SCAN'
  // Seal parent ownership before spawning, child waits for the durable worker PID before opening DB.
  write(lock,{id:t.id,pid:process.pid})
  const extension=path.extname(fileURLToPath(import.meta.url)),worker=fileURLToPath(new URL('./taskWorker'+extension,import.meta.url))
  const args=extension==='.ts'?['--import','tsx',worker]:[worker]
  const child=spawn(process.execPath,args,{stdio:['ignore','ignore','pipe','ipc'],env:{...process.env,SHOP_TASK_WORKER:'1',SHOP_DB_PATH:dbPath}})
  let stderr='',last=0,final=false;child.stderr!.on('data',b=>{stderr=(stderr+b).slice(-2000)})
  const uncertain=(error:string)=>{t.status='REVIEW_REQUIRED';t.error=error;save(t)}
  child.on('message',(m:any)=>{try{if(m.progress){t.progress=m.progress;if(Date.now()-last>100||m.progress.phase==='DONE'){save(t);last=Date.now()}else events.emit(t.id,{...t,updatedAt:new Date().toISOString()})}else if('result'in m){t.result=m.result;save(t);final=true;child.send({persisted:true})}else if(m.error){t.error=m.error;save(t);final=true;child.send({persisted:true})}}catch(e){final=false;stderr+=' · Không lưu/xác nhận được kết quả: '+String(e);child.kill()}})
  child.once('spawn',()=>{try{write(lock,{id:t.id,pid:child.pid});t.status='RUNNING';save(t);child.send({kind,payload})}catch{child.kill()}})
  child.once('error',e=>{uncertain(e.message)})
  child.once('exit',()=>{try{if(fs.existsSync(lock)&&JSON.parse(fs.readFileSync(lock,'utf8')).id===t.id)fs.unlinkSync(lock);taskActivity.busy=false;if(!final)uncertain('Worker dừng trước kết quả cuối. '+stderr);else{t.status=t.error?'FAILED':'SUCCEEDED';save(t)}}finally{taskActivity.busy=false}})
  return t
 }
 function acknowledge(id:string){if(taskActivity.busy)throw Error('Worker đang chạy');const t=read(id);if(t.status!=='REVIEW_REQUIRED')throw Error('Tác vụ không cần đối soát');t.status='FAILED';t.error+=' · Chủ shop xác nhận đã kiểm tra kho/nhật ký; tác vụ cũ không chạy lại.';save(t);return t}
 return {start,read,list,events,pendingReview,acknowledge}
}

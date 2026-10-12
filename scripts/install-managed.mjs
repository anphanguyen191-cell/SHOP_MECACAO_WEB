import fs from 'node:fs'
import path from 'node:path'
import {fileURLToPath,pathToFileURL} from 'node:url'
import {spawn,spawnSync} from 'node:child_process'
import {atomic,read,physical,inspect,checkpoint,assertNoRuntime,copyVerified,prepare,digest,sameDatabase,inside} from './managed-core.mjs'
import {probe,launch} from './managed-runtime.mjs'
export async function migrate(source,home,program,commit,{prepareProgram=prepare,probeProgram=probe}={}){
 source=physical(source,true);program=physical(program,true);home=path.resolve(home);
 if(!/^[a-f0-9]{40}$/.test(commit)||inside(source,home)||inside(home,source)||inside(program,home)||inside(home,program))throw Error('Chọn vùng dữ liệu riêng ngoài thư mục chương trình');
 if(fs.existsSync(home)){
  const failed=path.join(home,'transfer-failed.json'),cfile=path.join(home,'installation.json');
  if(!fs.existsSync(failed)||!fs.existsSync(cfile)||read(failed).originalRetained!==true||read(cfile).sourceInstallation!==source)throw Error('Vùng dữ liệu cố định đã tồn tại. Không ghi đè; kiểm tra cấu hình cũ.');
  const runtime=path.join(home,'runtime.json');if(fs.existsSync(runtime)){try{process.kill(read(runtime).pid,0);throw Error('Bản chuyển trước vẫn đang chạy')}catch(e){if(e.code!=='ESRCH')throw e}}
  // Preserve the failed attempt for review; a retry starts from the current
  // original installation, never from an uncertain partial destination.
  fs.renameSync(home,home+'-failed-'+Date.now());
 }
 const oldData=physical(path.join(source,'data'),true),oldRoot=physical(path.join(oldData,'stage6-main-test'),true),oldDb=physical(path.join(oldRoot,'database','shop-stage6-main-test.db'));
 const cfg=path.join(oldRoot,'warehouse-config.json');if(!fs.existsSync(cfg))throw Error('Công cụ chuyển hiện yêu cầu kho ảnh riêng đã được chọn trên giao diện. Không tự đổi đường dẫn kho mặc định.');
 const warehouseConfig=read(cfg);if(warehouseConfig.format!==1)throw Error('Cấu hình kho không hợp lệ');const warehouse=physical(warehouseConfig.warehouse,true);if(inside(warehouse,home)||inside(home,warehouse))throw Error('Dữ liệu cố định phải tách khỏi kho ảnh');assertNoRuntime(warehouse,oldDb);assertNoRuntime(oldRoot,oldDb);
 checkpoint(oldDb);const before=inspect(oldDb);if(fs.existsSync(path.join(oldRoot,'managed-installation.json')))throw Error('Kho đã được chuyển; mở biểu tượng Shop mới.');
 fs.mkdirSync(home,{recursive:true});let switched=false;
 try{
  console.log('Đang sao chép database/cấu hình; giữ nguyên kho ảnh: '+warehouse);
  const manifest=copyVerified(oldData,path.join(home,'data'));atomic(path.join(home,'installation.json'),{format:1,home,data:path.join(home,'data'),schema:'130',sourceInstallation:source,warehouse,createdAt:new Date().toISOString()});
  sameDatabase(before,inspect(path.join(home,'data','stage6-main-test','database','shop-stage6-main-test.db')));
  atomic(path.join(home,'backups','initial-transfer.json'),{format:1,before,manifest,sourceInstallation:source,warehouse,originalRetained:true});
  const releaseDir=path.join(home,'releases',commit);copyVerified(program,releaseDir,{code:true});console.log('Đang chuẩn bị chương trình Windows mới…');await prepareProgram(releaseDir,s=>process.stdout.write(s));
  await probeProgram(home,{commit,path:releaseDir},s=>process.stdout.write(s));
  atomic(path.join(home,'active.json'),{format:1,commit});
  fs.writeFileSync(path.join(home,'runner.mjs'),`import fs from 'node:fs';import path from 'node:path';import {fileURLToPath,pathToFileURL} from 'node:url';const home=path.dirname(fileURLToPath(import.meta.url));const a=JSON.parse(fs.readFileSync(path.join(home,'active.json'),'utf8'));if(a.format!==1||!/^[a-f0-9]{40}$/.test(a.commit))throw Error('Invalid active release');const {run}=await import(pathToFileURL(path.join(home,'releases',a.commit,'scripts','managed-runtime.mjs')));await run(home);\n`);
  fs.writeFileSync(path.join(home,'START_SHOP.bat'),'@echo off\r\ncd /d "%~dp0"\r\nnode runner.mjs\r\nif errorlevel 1 pause\r\n');
  fs.writeFileSync(path.join(home,'MO_SHOP.vbs'),Buffer.from('\uFEFF'+vbs(),'utf16le'));
  // Retained source files are a recovery copy. Normal old shortcuts now delegate
  // to the one fixed database instead of opening the old database independently.
  fs.mkdirSync(path.join(home,'backups','old-launchers'),{recursive:true});
  for(const name of ['START_SHOP.bat','MO_SHOP.vbs'])if(fs.existsSync(path.join(source,name)))fs.copyFileSync(path.join(source,name),path.join(home,'backups','old-launchers',name));
  const app=await launch(home,{commit,path:releaseDir});app.child.send('SHOP_LOCAL_CLOSE');await app.exited;sameDatabase(before,inspect(path.join(home,'data','stage6-main-test','database','shop-stage6-main-test.db')));
  atomic(path.join(oldRoot,'managed-installation.json'),{format:1,home,database:path.join(home,'data','stage6-main-test','database','shop-stage6-main-test.db')});
  const launcher=`@echo off\r\nnode "${home.replaceAll('%','%%')}\\runner.mjs"\r\nif errorlevel 1 pause\r\n`;
  fs.writeFileSync(path.join(source,'START_SHOP.bat'),launcher);
  fs.writeFileSync(path.join(source,'MO_SHOP.vbs'),Buffer.from('\uFEFF'+`Set sh=CreateObject("WScript.Shell")\nsh.Run "wscript.exe " & Chr(34) & "${home.replaceAll('"','""')}\\MO_SHOP.vbs" & Chr(34),0,False\n`,'utf16le'));
  switched=true;console.log('CHUYỂN DỮ LIỆU PASS. Database/lịch sử/mã Cloud khớp; kho ảnh và dữ liệu gốc được giữ.');return {home,warehouse,before,manifest};
 }catch(e){if(!switched){for(const name of ['START_SHOP.bat','MO_SHOP.vbs']){const saved=path.join(home,'backups','old-launchers',name);if(fs.existsSync(saved))fs.copyFileSync(saved,path.join(source,name))}const marker=path.join(oldRoot,'managed-installation.json');if(fs.existsSync(marker)&&read(marker).home===home)fs.unlinkSync(marker);atomic(path.join(home,'transfer-failed.json'),{error:e.message,originalRetained:true})}throw e}
}
function vbs(){return `Option Explicit
Dim sh,fso,root,q,shortcut,code
Set sh=CreateObject("WScript.Shell")
Set fso=CreateObject("Scripting.FileSystemObject")
root=fso.GetParentFolderName(WScript.ScriptFullName)
q=Chr(34)
Set shortcut=sh.CreateShortcut(sh.SpecialFolders("Desktop") & "\\Shop Me CaCao.lnk")
shortcut.TargetPath=sh.ExpandEnvironmentStrings("%SystemRoot%\\System32\\wscript.exe")
shortcut.Arguments=q & WScript.ScriptFullName & q
shortcut.WorkingDirectory=root
shortcut.IconLocation=sh.ExpandEnvironmentStrings("%SystemRoot%\\System32\\shell32.dll,14")
shortcut.Description="Shop Me CaCao - du lieu co dinh"
shortcut.Save
sh.CurrentDirectory=root
code=sh.Run("cmd.exe /d /c " & q & "node " & q & root & "\\runner.mjs" & q & " >> " & q & root & "\\launcher.log" & q & " 2>&1" & q,0,True)
If code<>0 Then MsgBox "Khong mo duoc Shop. Giu nguyen du lieu va xem launcher.log.",48,"Shop Me CaCao"
`}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{
  const program=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');const info=read(path.join(program,'WINDOWS_RELEASE.json'));
  let source=process.argv[2];if(!source){if(process.platform!=='win32')throw Error('Chọn thư mục cài Windows cũ');const picked=spawnSync('cscript.exe',['//Nologo','//U',path.join(program,'scripts','select-installation.vbs')],{encoding:'buffer'});if(picked.status!==0)throw Error('Chưa chọn thư mục cài hiện tại');source=picked.stdout.toString('utf16le').replace(/^\uFEFF/,'').trim()}
  try{const r=await fetch('http://127.0.0.1:3000/api/health',{signal:AbortSignal.timeout(1000)});if(r.ok)throw Error('Shop đang chạy. Đóng cửa sổ chạy; nếu chạy ẩn hãy khởi động lại Windows rồi chạy công cụ này.')}catch(e){if(e.message.startsWith('Shop đang'))throw e}
  if(!process.env.LOCALAPPDATA&&!process.argv[3])throw Error('Không tìm được thư mục dữ liệu Windows');
  const home=process.argv[3]||path.join(process.env.LOCALAPPDATA,'ShopMeCaCao','Managed');
  await migrate(source,home,program,info.commit);
  if(process.platform==='win32')spawn('wscript.exe',[path.join(home,'MO_SHOP.vbs')],{detached:true,stdio:'ignore',windowsHide:true}).unref();
 }catch(e){console.error('CHƯA CHUYỂN: '+e.message);process.exitCode=1}
}

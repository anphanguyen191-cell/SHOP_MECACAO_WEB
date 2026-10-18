import fs from 'node:fs'
import path from 'node:path'
import {createHash,randomUUID} from 'node:crypto'
import {spawn} from 'node:child_process'
import sharp from 'sharp'

export async function shopWindowsIcon(logo:Buffer){
 const sizes=[16,24,32,48,64,128,256],frames:Buffer[]=[]
 for(const size of sizes)frames.push(await sharp(logo).resize(size,size,{fit:'contain',background:{r:255,g:255,b:255,alpha:0}}).png().toBuffer())
 const header=Buffer.alloc(6+16*sizes.length);header.writeUInt16LE(1,2);header.writeUInt16LE(sizes.length,4)
 let offset=header.length
 frames.forEach((frame,i)=>{const p=6+i*16;header[p]=sizes[i]===256?0:sizes[i];header[p+1]=header[p];header.writeUInt16LE(1,p+4);header.writeUInt16LE(32,p+6);header.writeUInt32LE(frame.length,p+8);header.writeUInt32LE(offset,p+12);offset+=frame.length})
 return Buffer.concat([header,...frames])
}

// Paths are data in a Unicode environment variable, never PowerShell source.
// Only links targeting this installation's EXE may be changed. Other Desktop
// files, pinned shortcuts, Explorer and the global Windows icon cache are left alone.
const repairScript=String.raw`
$ErrorActionPreference='Stop'
[Console]::OutputEncoding=[Text.UTF8Encoding]::new($false)
$c=[Environment]::GetEnvironmentVariable('SHOP_SHORTCUT_CONFIG') | ConvertFrom-Json
$desktop=if($c.desktop){[string]$c.desktop}else{[Environment]::GetFolderPath('DesktopDirectory')}
if(!(Test-Path -LiteralPath $desktop -PathType Container)){throw 'Desktop folder not found'}
$shell=New-Object -ComObject WScript.Shell
$links=[Collections.Generic.List[string]]::new()
foreach($file in Get-ChildItem -LiteralPath $desktop -Filter '*.lnk' -File){
 try{
  $link=$shell.CreateShortcut($file.FullName)
  if([string]::Equals([IO.Path]::GetFullPath($link.TargetPath),[IO.Path]::GetFullPath($c.exe),[StringComparison]::OrdinalIgnoreCase)){$links.Add($file.FullName)}
 }catch{}finally{if($link){[void][Runtime.InteropServices.Marshal]::FinalReleaseComObject($link);$link=$null}}
}
if($links.Count -eq 0){
 $target=Join-Path $desktop 'Shop Mẹ CaCao.lnk'
 if(Test-Path -LiteralPath $target){$target=Join-Path $desktop 'Shop Mẹ CaCao V8.lnk'}
 if(Test-Path -LiteralPath $target){throw 'Desktop names belong to other programs; no shortcut overwritten'}
 $links.Add($target)
}
Add-Type -TypeDefinition 'using System; using System.Runtime.InteropServices; public static class ShopDesktopNotify { [DllImport("shell32.dll", CharSet=CharSet.Unicode)] public static extern void SHChangeNotify(uint ev, uint flags, string path, IntPtr other); }'
foreach($file in $links){
 $link=$shell.CreateShortcut($file)
 try{$link.TargetPath=$c.exe;$link.Arguments='';$link.WorkingDirectory=$c.home;$link.IconLocation=$c.icon+',0';$link.Description='Shop Mẹ CaCao · CaCao Travel Luxe';$link.Save()}
 finally{[void][Runtime.InteropServices.Marshal]::FinalReleaseComObject($link)}
 [ShopDesktopNotify]::SHChangeNotify(0x2000,0x1005,$file,[IntPtr]::Zero)
}
[void][Runtime.InteropServices.Marshal]::FinalReleaseComObject($shell)
[Console]::WriteLine((@{links=@($links.ToArray());icon=$c.icon}|ConvertTo-Json -Compress))
`
export async function repairShopDesktopShortcut(home:string,logoPath:string,desktop?:string){
 if(process.platform!=='win32')return null
 const exe=path.join(home,'ShopMeCaCao.exe')
 if(!fs.statSync(exe).isFile())throw Error('Không tìm thấy EXE của bản cài hiện tại')
 const bytes=await shopWindowsIcon(fs.readFileSync(logoPath)),directory=path.join(home,'cache','icons')
 fs.mkdirSync(directory,{recursive:true})
 const icon=path.join(directory,'ShopMeCaCao-'+createHash('sha256').update(bytes).digest('hex').slice(0,24)+'.ico')
 if(!fs.existsSync(icon))fs.writeFileSync(icon,bytes,{flag:'wx'})
 else if(!fs.readFileSync(icon).equals(bytes))throw Error('File icon đã thay đổi; chưa ghi đè')
 const result=await new Promise<{links:string[];icon:string}>((resolve,reject)=>{
  const child=spawn('powershell.exe',['-NoProfile','-NonInteractive','-EncodedCommand',Buffer.from(repairScript,'utf16le').toString('base64')],{windowsHide:true,env:{...process.env,SHOP_SHORTCUT_CONFIG:JSON.stringify({home,exe,icon,desktop})},stdio:['ignore','pipe','pipe']})
  let output='',error='';const timer=setTimeout(()=>{child.kill();reject(Error('Windows chưa hoàn tất sửa shortcut'))},20000)
  child.stdout.on('data',b=>output+=b);child.stderr.on('data',b=>error+=b)
  child.once('error',e=>{clearTimeout(timer);reject(e)})
  child.once('exit',code=>{clearTimeout(timer);if(code!==0)return reject(Error(error.slice(-1200)||'Không sửa được shortcut'));try{resolve(JSON.parse(output.replace(/^\uFEFF/,'').trim()))}catch{reject(Error('Windows chưa trả kết quả sửa shortcut hợp lệ'))}})
 })
 const status=path.join(home,'cache','desktop-shortcut-status.json'),temp=status+'.'+randomUUID()+'.tmp'
 fs.writeFileSync(temp,JSON.stringify({...result,updatedAt:new Date().toISOString()}),{flag:'wx'});fs.renameSync(temp,status)
 return result
}

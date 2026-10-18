import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {createHash} from 'node:crypto'
import {spawnSync} from 'node:child_process'
import sharp from 'sharp'
import {shopShellLinkPowerShell} from '../apps/api/src/windowsShellLink.js'
import {shopWindowsIcon,repairShopDesktopShortcut} from '../apps/api/src/desktopShortcut.js'
const dir=fs.mkdtempSync(path.join(os.tmpdir(),"cacao-shortcut-' & "))
function ps(source:string,config:any){
 const r=spawnSync('powershell.exe',['-NoProfile','-NonInteractive','-EncodedCommand',Buffer.from(shopShellLinkPowerShell+source,'utf16le').toString('base64')],{encoding:'utf8',env:{...process.env,SHOP_SHORTCUT_TEST:JSON.stringify(config)},timeout:45000,windowsHide:true})
 assert.equal(r.status,0,r.stderr||String(r.error));return r.stdout.replace(/^\uFEFF/,'').trim()
}
try{
 const logo=fs.readFileSync('apps/web/public/brand/catalog-shop-logo.jpg'),hash=createHash('sha256').update(logo).digest('hex'),ico=await shopWindowsIcon(logo),sizes=[16,24,32,48,64,128,256]
 assert.equal(ico.readUInt16LE(0),0);assert.equal(ico.readUInt16LE(2),1);assert.equal(ico.readUInt16LE(4),7)
 let offset=6+7*16
 for(let i=0;i<7;i++){
  const p=6+i*16,bytes=ico.readUInt32LE(p+8),start=ico.readUInt32LE(p+12)
  assert.equal(start,offset);assert.equal(ico[p]||256,sizes[i]);assert.equal(ico[p+1]||256,sizes[i]);assert.equal(ico.readUInt16LE(p+6),32)
  const frame=ico.subarray(start,start+bytes),meta=await sharp(frame).metadata();assert.equal(meta.format,'png');assert.equal(meta.width,sizes[i]);assert.equal(meta.height,sizes[i]);offset+=bytes
 }
 assert.equal(offset,ico.length);assert.equal(createHash('sha256').update(fs.readFileSync('apps/web/public/brand/catalog-shop-logo.jpg')).digest('hex'),hash)
 if(process.platform==='win32'){
  const home=path.join(dir,'Shop Mẹ CaCao'),desktop=path.join(dir,'OneDrive Desktop'),source=path.join(dir,'logo.jpg')
  fs.mkdirSync(home);fs.mkdirSync(desktop);fs.writeFileSync(source,logo)
  const exe=path.join(home,'ShopMeCaCao.exe');fs.copyFileSync(process.execPath,exe)
  const originalExe=createHash('sha256').update(fs.readFileSync(exe)).digest('hex')
  // The old launcher is deliberately a generic Node EXE, not the new branded
  // launcher. This proves an update can repair the icon without replacing it.
  ps(String.raw`$ErrorActionPreference='Stop';$c=$env:SHOP_SHORTCUT_TEST|ConvertFrom-Json;foreach($n in @('Old Shop','Second Shop')){[ShopShellLink]::Write((Join-Path $c.desktop ($n+'.lnk')),$c.exe,($env:SystemRoot+'\system32\shell32.dll'),14,'','legacy')};[ShopShellLink]::Write((Join-Path $c.desktop 'Shop Mẹ CaCao.lnk'),($env:SystemRoot+'\system32\notepad.exe'),($env:SystemRoot+'\system32\notepad.exe'),0,'','unrelated')`,{desktop,exe})
  const unrelated=path.join(desktop,'Shop Mẹ CaCao.lnk'),before=fs.readFileSync(unrelated),first=await repairShopDesktopShortcut(home,source,desktop)
  assert.equal(first!.links.length,2);assert(fs.existsSync(first!.icon));assert(!first!.icon.includes('releases'))
  const inspected=JSON.parse(ps(String.raw`[Console]::OutputEncoding=[Text.UTF8Encoding]::new($false);$c=$env:SHOP_SHORTCUT_TEST|ConvertFrom-Json;$a=@();foreach($p in $c.links){$l=[ShopShellLink]::Read($p);$a+=@{target=$l.TargetPath;icon=$l.IconLocation;working=$l.WorkingDirectory;arguments=$l.Arguments}};Add-Type -AssemblyName System.Drawing;$i=[Drawing.Icon]::new($c.icon,32,32);if($i.Width -ne 32){throw 'Windows could not decode 32px shop icon'};$i.Dispose();[Console]::WriteLine((ConvertTo-Json -InputObject $a -Compress))`,{links:first!.links,icon:first!.icon}))
  for(const link of inspected){assert.equal(link.target,exe);assert.equal(link.icon,first!.icon+',0');assert.equal(link.working,home);assert.equal(link.arguments,'')}
  assert(fs.readFileSync(unrelated).equals(before),'Unrelated shortcut with the branded name must stay untouched')
  assert.equal(createHash('sha256').update(fs.readFileSync(exe)).digest('hex'),originalExe,'Running legacy EXE is never overwritten')
  ps(String.raw`$c=$env:SHOP_SHORTCUT_TEST|ConvertFrom-Json;foreach($p in $c.links){$l=[ShopShellLink]::Read($p);[ShopShellLink]::SetIcon($p,$c.exe,0)}`,{links:first!.links,exe})
  const again=await repairShopDesktopShortcut(home,source,desktop);assert.equal(again!.icon,first!.icon);assert.equal(fs.readdirSync(path.join(home,'cache','icons')).length,1)
  const rebound=ps(String.raw`[Console]::OutputEncoding=[Text.UTF8Encoding]::new($false);$c=$env:SHOP_SHORTCUT_TEST|ConvertFrom-Json;$read=[ShopShellLink]::Read($c.link);[Console]::WriteLine($read.IconLocation)`,{link:first!.links[0]})
  assert.equal(rebound,first!.icon+',0','An old launcher resetting the icon is repaired again on startup')
  fs.writeFileSync(source,await sharp({create:{width:60,height:60,channels:3,background:'#ff4499'}}).png().toBuffer())
  const changed=await repairShopDesktopShortcut(home,source,desktop);assert.notEqual(changed!.icon,first!.icon,'Changed artwork gets a new path to invalidate the Shell icon cache')
  assert(fs.readFileSync(unrelated).equals(before))
  // No matching link: create a branded one without modifying an occupied name.
  const clean=path.join(dir,'Clean Desktop');fs.mkdirSync(clean)
  const created=await repairShopDesktopShortcut(home,source,clean);assert.equal(created!.links.length,1);assert.equal(path.basename(created!.links[0]),'Shop Mẹ CaCao.lnk')
  console.log('DESKTOP_SHORTCUT_WINDOWS PASS: real COM links, legacy EXE unchanged, all matching shortcuts repaired, unrelated link preserved, Unicode/quotes/OneDrive path, Windows ICO decode, repeat launch and changed-logo cache refresh')
 }
 console.log('DESKTOP_ICON PASS: approved shop logo unchanged, 7 valid PNG ICO frames 16–256px')
}finally{fs.rmSync(dir,{recursive:true,force:true})}

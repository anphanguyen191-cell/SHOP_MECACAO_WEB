param([ValidateSet('PREVIEW','STABLE')][string]$Channel='PREVIEW')
$ErrorActionPreference='Stop'
$virtual = Join-Path $env:RUNNER_TEMP 'mecacao-v8-drive'
$installerZip = Join-Path (Resolve-Path '.').Path ('artifacts/ShopMeCaCao-V8-'+$Channel+'-win-x64.zip')
$createdDrive=$false
if(!(Test-Path 'D:\')){
 New-Item -ItemType Directory -Force $virtual | Out-Null
 subst D: $virtual
 if($LASTEXITCODE -ne 0){ throw 'Failed to create isolated D: drive' }
 $createdDrive=$true
}
$desktop = $null
try{
 $installDir='D:\ShopMeCaCao'
 if(Test-Path $installDir){ throw 'CI fixture install path is not empty' }
 New-Item -ItemType Directory -Force $installDir | Out-Null
 Expand-Archive -LiteralPath $installerZip -DestinationPath $installDir -Force
 $desktop=Start-Process -FilePath "$installDir\ShopMeCaCao.exe" -WorkingDirectory $installDir -PassThru
 $health=$null
 for($i=0;$i -lt 120;$i++){
  if($desktop.HasExited){ throw "Desktop EXE exited: $($desktop.ExitCode)" }
  try{
   $candidate=Invoke-RestMethod -Uri 'http://127.0.0.1:3000/api/health' -TimeoutSec 1
   if($candidate.ok -and $candidate.writeReady){ $health=$candidate; break }
  }catch{}
  Start-Sleep -Milliseconds 400
 }
 if($null -eq $health){ throw 'Desktop never became healthy' }
 if($health.database -ne 'shop-v8.db' -or $health.schema -ne 130){ throw 'Desktop loaded wrong database/schema' }
 if($health.release.stage -ne 8){throw 'Desktop did not load V8 release'}
 if($health.cloudAuthority){throw 'Fresh V8 must not be linked to legacy Cloud automatically'}
 $database=Join-Path $installDir 'data/shop-v8/database/shop-v8.db'
 if(!(Test-Path $database)){ throw 'V8 database missing on D:' }
 if(!(Test-Path (Join-Path $installDir 'installation.json'))){ throw 'V8 installation marker missing' }
 if($health.customWarehouse){throw 'V8 should not silently select a warehouse on fresh installation'}
 $settings=Invoke-RestMethod -Uri 'http://127.0.0.1:3000/api/warehouse/settings' -TimeoutSec 8
 if($settings.rootPath){throw 'Fresh V8 already has a warehouse watch path'}
 # Regression: early LOCAL builds left a runtime lock but no ownership marker.
 # This must be recoverable only if the PID is gone, without modifying photos.
 $orphan='D:\1-Me CaCao Store'
 $orphanPhoto=Join-Path $orphan 'Product A\Size 8\original.jpg'
 New-Item -ItemType Directory -Force (Split-Path $orphanPhoto) | Out-Null
 [System.IO.File]::WriteAllBytes($orphanPhoto,[byte[]](10,20,30,40,50,60))
 $originalHash=(Get-FileHash $orphanPhoto -Algorithm SHA256).Hash
 $oldLock=Join-Path $orphan '.mecacao-local-runtime.lock'
 @{format=1;pid=99999999;database='D:\OldShop\shop.db';configSha='stage4-fresh'} | ConvertTo-Json | Set-Content $oldLock -Encoding utf8
 # Selection must be possible directly from Import kho, including a subsequent
 # re-selection when the shop has no registered inventory or orders.
 foreach($destination in @('D:\Me CaCao Store','D:\Me CaCao Other',$orphan)){
  New-Item -ItemType Directory -Force $destination | Out-Null
  $preflight=Invoke-RestMethod -Uri ('http://127.0.0.1:3000/api/local/warehouse/preflight?warehouse='+[uri]::EscapeDataString($destination)) -TimeoutSec 8
  if($destination -eq $orphan -and !$preflight.legacyOwnership){throw 'Orphan LOCAL lock not detected as transferable'}
  $body=ConvertTo-Json -Compress @{warehouse=$destination;allowLegacyHandoff=[bool]$preflight.legacyOwnership}
  $result=Invoke-RestMethod -Method POST -Uri 'http://127.0.0.1:3000/api/local/warehouse' -ContentType 'application/json' -Headers @{Origin='http://127.0.0.1:3000'} -Body $body -TimeoutSec 15
  if($result.warehouse -ne $destination){throw 'Warehouse selection not accepted'}
  $changed=$false
  for($retry=0;$retry -lt 100;$retry++){
   try{
    $health=Invoke-RestMethod -Uri 'http://127.0.0.1:3000/api/health' -TimeoutSec 1
    if($health.writeReady -and $health.customWarehouse -and $health.warehouse -eq $destination){$changed=$true;break}
   }catch{}
   Start-Sleep -Milliseconds 500
  }
  if(!$changed){throw "Warehouse selection/restart failed for $destination"}
  $settings=Invoke-RestMethod -Uri 'http://127.0.0.1:3000/api/warehouse/settings' -TimeoutSec 8
  if($settings.rootPath -ne $destination){throw 'Warehouse settings still point to previous location'}
  if($destination -eq $orphan){
   if((Get-FileHash $orphanPhoto -Algorithm SHA256).Hash -ne $originalHash){throw 'Photo changed during orphan lock handoff'}
   $marker=Get-Content (Join-Path $orphan '.mecacao-local-active.json') -Raw | ConvertFrom-Json
   if($marker.format -ne 8){throw 'V8 ownership marker missing after orphan handoff'}
   $handoffs=Join-Path $installDir 'data/shop-v8/warehouse-handoffs'
   if(!(Test-Path $handoffs) -or !(Get-ChildItem $handoffs -Filter '*.json')){throw 'Original orphan lock evidence not archived'}
  }
 }
 Write-Host 'V8_DESKTOP_SMOKE_PASS: clean D: install, warehouse selection and change, backend restarts, schema 130.'
}catch{
 $log=Join-Path $installDir 'logs/desktop.log'
 if(Test-Path $log){Get-Content $log -Tail 60 | ForEach-Object {Write-Host $_}}
 throw
}finally{
 if($desktop){ & taskkill.exe /T /F /PID $desktop.Id 2>$null | Out-Null }
 if($createdDrive){subst D: /D}
}

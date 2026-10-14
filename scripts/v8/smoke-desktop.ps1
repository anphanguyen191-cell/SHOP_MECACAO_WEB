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
   if($candidate.ok){ $health=$candidate; break }
  }catch{}
  Start-Sleep -Milliseconds 400
 }
 if($null -eq $health){ throw 'Desktop never became healthy' }
 if($health.database -ne 'shop-v8.db' -or $health.schema -ne 130){ throw 'Desktop loaded wrong database/schema' }
 $database=Join-Path $installDir 'data/shop-v8/database/shop-v8.db'
 if(!(Test-Path $database)){ throw 'V8 database missing on D:' }
 if(!(Test-Path (Join-Path $installDir 'installation.json'))){ throw 'V8 installation marker missing' }
 if($health.customWarehouse){throw 'V8 should not silently select a warehouse on fresh installation'}
 $settings=Invoke-RestMethod -Uri 'http://127.0.0.1:3000/api/warehouse/settings' -TimeoutSec 8
 if($settings.rootPath){throw 'Fresh V8 already has a warehouse watch path'}
 # Selection must be possible directly from Import kho, including a subsequent
 # re-selection when the shop has no registered inventory or orders.
 foreach($destination in @('D:\Me CaCao Store','D:\Me CaCao Other')){
  New-Item -ItemType Directory -Force $destination | Out-Null
  $body=ConvertTo-Json -Compress @{warehouse=$destination}
  $result=Invoke-RestMethod -Method POST -Uri 'http://127.0.0.1:3000/api/local/warehouse' -ContentType 'application/json' -Headers @{Origin='http://127.0.0.1:3000'} -Body $body -TimeoutSec 15
  if($result.warehouse -ne $destination){throw 'Warehouse selection not accepted'}
  $changed=$false
  for($retry=0;$retry -lt 100;$retry++){
   try{
    $health=Invoke-RestMethod -Uri 'http://127.0.0.1:3000/api/health' -TimeoutSec 1
    if($health.customWarehouse -and $health.warehouse -eq $destination){$changed=$true;break}
   }catch{}
   Start-Sleep -Milliseconds 500
  }
  if(!$changed){throw "Warehouse selection/restart failed for $destination"}
  $settings=Invoke-RestMethod -Uri 'http://127.0.0.1:3000/api/warehouse/settings' -TimeoutSec 8
  if($settings.rootPath -ne $destination){throw 'Warehouse settings still point to previous location'}
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

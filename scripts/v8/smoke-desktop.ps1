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
 if($health.warehouse -ne 'D:\Me CaCao Store'){ throw 'Wrong physical warehouse location' }
 Write-Host 'V8_DESKTOP_SMOKE_PASS: clean D: install, schema 130, isolated warehouse, GUI EXE.'
}finally{
 if($desktop){ & taskkill.exe /T /F /PID $desktop.Id 2>$null | Out-Null }
 if($createdDrive){subst D: /D}
}

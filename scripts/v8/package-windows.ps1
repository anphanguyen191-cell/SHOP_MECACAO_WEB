$ErrorActionPreference = 'Stop'
$root = (Resolve-Path '.').Path
$artifact = Join-Path $root 'artifacts'
$package = Join-Path $artifact 'v8-win-x64'
$release = Join-Path $package 'releases/current'
if(Test-Path $package){ Remove-Item $package -Recurse -Force }
New-Item -ItemType Directory -Force $release | Out-Null
dotnet publish 'desktop/ShopMeCaCao.Desktop.csproj' -c Release -r win-x64 -o (Join-Path $package 'launcher') --self-contained true -p:PublishSingleFile=true
if($LASTEXITCODE -ne 0){ throw 'dotnet publish failed' }
New-Item -ItemType Directory -Force (Join-Path $package 'runtime') | Out-Null
Copy-Item (Get-Command node.exe).Source (Join-Path $package 'runtime/node.exe') -Force
Copy-Item (Join-Path $package 'launcher/ShopMeCaCao.exe') (Join-Path $package 'ShopMeCaCao.exe') -Force
Remove-Item (Join-Path $package 'launcher') -Recurse -Force
npm prune --omit=dev
if($LASTEXITCODE -ne 0){ throw 'production dependency prune failed' }
New-Item -ItemType Directory -Force (Join-Path $release 'apps/api'),(Join-Path $release 'apps/web'),(Join-Path $release 'scripts/v8') | Out-Null
Copy-Item 'apps/api/dist' (Join-Path $release 'apps/api/dist') -Recurse -Force
Copy-Item 'apps/web/dist' (Join-Path $release 'apps/web/dist') -Recurse -Force
Copy-Item 'apps/api/package.json' (Join-Path $release 'apps/api/package.json') -Force
Copy-Item 'apps/web/package.json' (Join-Path $release 'apps/web/package.json') -Force
Copy-Item 'node_modules' (Join-Path $release 'node_modules') -Recurse -Force
Copy-Item 'scripts/v8/node-runner.mjs' (Join-Path $release 'scripts/v8/node-runner.mjs') -Force
Copy-Item 'package.json' (Join-Path $release 'package.json') -Force
$sha = if($env:GITHUB_SHA){$env:GITHUB_SHA}else{'local-preview'}
$channel = if($env:GITHUB_REF_TYPE -eq 'tag' -and $env:GITHUB_REF_NAME -match '^v8\\.[0-9]+\\.[0-9]+\\.[0-9]+-stable
 format=8; channel=$channel; sourceCommit=$sha; schema=130;
 launcherSha256=(Get-FileHash (Join-Path $package 'ShopMeCaCao.exe') -Algorithm SHA256).Hash.ToLower();
 nodeSha256=(Get-FileHash (Join-Path $package 'runtime/node.exe') -Algorithm SHA256).Hash.ToLower()
}
$manifest | ConvertTo-Json | Set-Content -Path (Join-Path $package 'manifest.json') -Encoding utf8
New-Item -ItemType Directory -Force $artifact | Out-Null
$zip = Join-Path $artifact ('ShopMeCaCao-V8-' + $channel + '-win-x64.zip')
if(Test-Path $zip){Remove-Item $zip -Force}
Compress-Archive -Path (Join-Path $package '*') -DestinationPath $zip -CompressionLevel Optimal
Write-Host "V8_PREVIEW_PACKAGE_CREATED: $zip"
){'STABLE'}else{'PREVIEW'}
$manifest = [ordered]@{
 format=8; channel='PREVIEW'; sourceCommit=$sha; schema=130;
 launcherSha256=(Get-FileHash (Join-Path $package 'ShopMeCaCao.exe') -Algorithm SHA256).Hash.ToLower();
 nodeSha256=(Get-FileHash (Join-Path $package 'runtime/node.exe') -Algorithm SHA256).Hash.ToLower()
}
$manifest | ConvertTo-Json | Set-Content -Path (Join-Path $package 'manifest.json') -Encoding utf8
New-Item -ItemType Directory -Force $artifact | Out-Null
$zip = Join-Path $artifact 'ShopMeCaCao-V8-PREVIEW-win-x64.zip'
if(Test-Path $zip){Remove-Item $zip -Force}
Compress-Archive -Path (Join-Path $package '*') -DestinationPath $zip -CompressionLevel Optimal
Write-Host "V8_PREVIEW_PACKAGE_CREATED: $zip"

$ErrorActionPreference = 'Stop'
$root = (Resolve-Path '.').Path
$artifact = Join-Path $root 'artifacts'
$package = Join-Path $artifact 'v8-win-x64'
$release = Join-Path $package 'releases/current'
if(Test-Path $package){ Remove-Item $package -Recurse -Force }
New-Item -ItemType Directory -Force $release | Out-Null
# Create a real Windows executable icon from the shop's own logo before dotnet publish.
# A shortcut targeting ShopMeCaCao.exe will inherit this icon automatically.
Add-Type -AssemblyName System.Drawing
$logoPath = Join-Path $root 'apps/web/public/brand/logo.jpg'
$iconDirectory = Join-Path $root 'desktop/Assets'
$iconPath = Join-Path $iconDirectory 'ShopMeCaCao.ico'
if(-not (Test-Path $logoPath)){throw 'Missing original Shop MeCaCao logo for Windows icon'}
New-Item -ItemType Directory -Force $iconDirectory | Out-Null
$image = [System.Drawing.Image]::FromFile($logoPath)
$bitmap = New-Object System.Drawing.Bitmap(256,256,[System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
$graphics = [System.Drawing.Graphics]::FromImage($bitmap)
$pngStream = New-Object System.IO.MemoryStream
try {
  $graphics.Clear([System.Drawing.Color]::Transparent)
  $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
  $scale = [Math]::Min(256.0 / $image.Width,256.0 / $image.Height)
  $w = [int][Math]::Round($image.Width*$scale)
  $h = [int][Math]::Round($image.Height*$scale)
  $graphics.DrawImage($image,[int]((256-$w)/2),[int]((256-$h)/2),$w,$h)
  $bitmap.Save($pngStream,[System.Drawing.Imaging.ImageFormat]::Png)
  $bytes = $pngStream.ToArray()
  $ico = New-Object System.IO.MemoryStream
  $writer = New-Object System.IO.BinaryWriter($ico)
  try {
    $writer.Write([uint16]0);$writer.Write([uint16]1);$writer.Write([uint16]1)
    $writer.Write([byte]0);$writer.Write([byte]0);$writer.Write([byte]0);$writer.Write([byte]0)
    $writer.Write([uint16]1);$writer.Write([uint16]32)
    $writer.Write([uint32]$bytes.Length);$writer.Write([uint32]22)
    $writer.Write($bytes)
    [System.IO.File]::WriteAllBytes($iconPath,$ico.ToArray())
  } finally { $writer.Dispose();$ico.Dispose() }
} finally { $pngStream.Dispose();$graphics.Dispose();$bitmap.Dispose();$image.Dispose() }
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
Copy-Item 'scripts/v8/release-fetch.mjs' (Join-Path $release 'scripts/v8/release-fetch.mjs') -Force
Copy-Item 'scripts/v8/data-snapshot.mjs' (Join-Path $release 'scripts/v8/data-snapshot.mjs') -Force
Copy-Item 'package.json' (Join-Path $release 'package.json') -Force
# The immutable version travels with the API and is read from cwd by the running
# candidate; no hardcoded V8.0.0 in the backend or stale installation marker.
$runNumber=if($env:GITHUB_RUN_NUMBER){$env:GITHUB_RUN_NUMBER}else{'0'}
$channel=if($env:V8_BUILD_CHANNEL -eq 'STABLE'){'STABLE'}else{'PREVIEW'}
$sha=if($env:GITHUB_SHA){$env:GITHUB_SHA}else{('0'*40)}
$tag='v8.0.'+$runNumber+'-'+$channel.ToLowerInvariant()
@{ format=8; tag=$tag; sourceCommit=$sha } | ConvertTo-Json | Set-Content -Path (Join-Path $release 'release-info.json') -Encoding utf8

$sha = if($env:GITHUB_SHA){$env:GITHUB_SHA}else{'local-preview'}
$channel = if($env:V8_BUILD_CHANNEL -eq 'STABLE'){'STABLE'}else{'PREVIEW'}
$manifest = [ordered]@{
 format=8
 channel=$channel
 sourceCommit=$sha
 schema=130
 launcherSha256=(Get-FileHash (Join-Path $package 'ShopMeCaCao.exe') -Algorithm SHA256).Hash.ToLower()
 nodeSha256=(Get-FileHash (Join-Path $package 'runtime/node.exe') -Algorithm SHA256).Hash.ToLower()
}
$manifest | ConvertTo-Json | Set-Content -Path (Join-Path $package 'manifest.json') -Encoding utf8
New-Item -ItemType Directory -Force $artifact | Out-Null
$zip = Join-Path $artifact ('ShopMeCaCao-V8-' + $channel + '-win-x64.zip')
if(Test-Path $zip){Remove-Item $zip -Force}
Compress-Archive -Path (Join-Path $package '*') -DestinationPath $zip -CompressionLevel Optimal
Write-Host "V8_PACKAGE_CREATED: $zip"

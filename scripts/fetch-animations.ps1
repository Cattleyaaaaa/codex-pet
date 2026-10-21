param(
  [string]$Url = '',
  [string]$ZipPath = '',
  [switch]$Force
)
$ErrorActionPreference = 'Stop'
$projectRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$animationsDir = Join-Path $projectRoot 'assets\animations'
$manifestPath = Join-Path $animationsDir 'manifest.json'

if (-not (Test-Path -LiteralPath $manifestPath)) {
  throw "缺少 $manifestPath。这份清单必须跟代码一起提交，否则无法校验下载到的素材。"
}
$manifest = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
$expected = @($manifest.files)
if ($expected.Count -eq 0) { throw '清单里没有文件记录，先运行 npm run assets:pack 重新生成。' }
New-Item -ItemType Directory -Force $animationsDir | Out-Null

if (-not $Force -and -not $ZipPath) {
  $missing = @($expected | Where-Object { -not (Test-Path -LiteralPath (Join-Path $animationsDir $_.name)) })
  if ($missing.Count -eq 0) {
    Write-Host ("动画素材已齐全（{0} 段），不用下载。要重新装一遍就加 -Force。" -f $expected.Count)
    exit 0
  }
  Write-Host ("缺 {0} 段素材，开始下载 ..." -f $missing.Count)
}

$tempDirs = @()
$tempZip = $ZipPath
if (-not $tempZip) {
  $source = $Url
  if (-not $source) { $source = $env:CODEXPET_ASSETS_URL }
  if (-not $source) { $source = [string]$manifest.downloadUrl }
  if (-not $source) {
    throw "没有素材下载地址。请查看 README 的「动画素材」一节，或用 -Url 指定发布地址；已经手动下载了 zip 的话，用 -ZipPath 指向它。"
  }
  $downloadDir = Join-Path ([System.IO.Path]::GetTempPath()) ('codex-pet-assets-' + [guid]::NewGuid().ToString('N'))
  New-Item -ItemType Directory -Force $downloadDir | Out-Null
  $tempDirs += $downloadDir
  $archiveName = if ($manifest.archive.name) { [string]$manifest.archive.name } else { 'codex-pet-animations.zip' }
  $tempZip = Join-Path $downloadDir $archiveName
  Write-Host "下载：$source"
  $ProgressPreference = 'SilentlyContinue'
  Invoke-WebRequest -Uri $source -OutFile $tempZip -UseBasicParsing
}

$zipItem = Get-Item -LiteralPath $tempZip
Write-Host ("压缩包 {0:N1} MB" -f ($zipItem.Length / 1MB))
$zipHash = (Get-FileHash -LiteralPath $tempZip -Algorithm SHA256).Hash.ToLowerInvariant()
$expectedZipHash = [string]$manifest.archive.sha256
if ($expectedZipHash -and $zipHash -ne $expectedZipHash) {
  Write-Warning '压缩包 SHA-256 和清单不一致（素材包可能更新过）。继续逐个文件校验。'
}

$extractDir = Join-Path ([System.IO.Path]::GetTempPath()) ('codex-pet-extract-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Force $extractDir | Out-Null
$tempDirs += $extractDir
Add-Type -AssemblyName System.IO.Compression | Out-Null
Add-Type -AssemblyName System.IO.Compression.FileSystem | Out-Null
[System.IO.Compression.ZipFile]::ExtractToDirectory($tempZip, $extractDir)

# 先全部校验，再统一落盘：避免下载了一半、目录里一半新一半旧。
$verified = @()
$problems = @()
foreach ($entry in $expected) {
  $source = Join-Path $extractDir $entry.name
  if (-not (Test-Path -LiteralPath $source)) { $problems += "$($entry.name)：压缩包里没有这个文件"; continue }
  $actual = (Get-FileHash -LiteralPath $source -Algorithm SHA256).Hash.ToLowerInvariant()
  if ($actual -ne $entry.sha256) { $problems += "$($entry.name)：SHA-256 不符（可能下坏了）"; continue }
  $verified += @{ source = $source; name = $entry.name; bytes = $entry.bytes }
}
if ($problems.Count -gt 0) {
  throw ("素材校验失败，一个文件都没有写入：`n  " + ($problems -join "`n  "))
}

$installed = 0
$installedBytes = 0
foreach ($item in $verified) {
  Copy-Item -LiteralPath $item.source -Destination (Join-Path $animationsDir $item.name) -Force
  $installed++
  $installedBytes += $item.bytes
}

foreach ($dir in $tempDirs) {
  if (Test-Path -LiteralPath $dir) { Remove-Item -LiteralPath $dir -Recurse -Force -ErrorAction SilentlyContinue }
}

Write-Host ''
Write-Host ("已安装 {0} 段动画，共 {1:N1} MB → {2}" -f $installed, ($installedBytes / 1MB), $animationsDir)
Write-Host '重启桌宠（或在托盘退出后重新打开）就能看到新动作。'

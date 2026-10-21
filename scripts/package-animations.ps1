param(
  [string]$OutputDir = 'dist-assets',
  [string]$AnimationsDir = '',
  [string]$DownloadUrl = '',
  [switch]$ManifestOnly
)
$ErrorActionPreference = 'Stop'
$projectRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$animationsDir = if ($AnimationsDir) { [System.IO.Path]::GetFullPath($AnimationsDir) } else { Join-Path $projectRoot 'assets\animations' }
$manifestPath = Join-Path $animationsDir 'manifest.json'
$outputRoot = Join-Path $projectRoot $OutputDir
$zipName = 'codex-pet-animations.zip'
$zipPath = Join-Path $outputRoot $zipName

if (-not (Test-Path -LiteralPath $animationsDir)) { throw "找不到素材目录：$animationsDir" }
$clips = @(Get-ChildItem -LiteralPath $animationsDir -Filter '*.webm' | Sort-Object Name)
if ($clips.Count -eq 0) { throw "素材目录里没有 .webm：$animationsDir" }
$totalBytes = ($clips | Measure-Object -Property Length -Sum).Sum
Write-Host ("打包 {0} 段动画，共 {1:N1} MB ..." -f $clips.Count, ($totalBytes / 1MB))

$entries = @()
foreach ($clip in $clips) {
  $entries += [ordered]@{
    name   = $clip.Name
    bytes  = $clip.Length
    sha256 = (Get-FileHash -LiteralPath $clip.FullName -Algorithm SHA256).Hash.ToLowerInvariant()
  }
}

# downloadUrl 默认沿用清单里已有的值（重新打包时别把上次发布好的地址冲掉）；
# 发布脚本会用 -DownloadUrl 显式覆盖。
$downloadUrl = $DownloadUrl
$previousArchive = $null
if (Test-Path -LiteralPath $manifestPath) {
  try {
    $previous = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
    if (-not $downloadUrl) { $downloadUrl = [string]$previous.downloadUrl }
    if ($previous.archive) { $previousArchive = $previous.archive }
  } catch { if (-not $downloadUrl) { $downloadUrl = '' } }
}

if ($ManifestOnly) {
  # 只更新清单，不重打包（切换素材集后用，避免把 370 MB 的 zip 白打一遍）。
  $archiveInfo = if ($previousArchive) {
    [ordered]@{ name = $previousArchive.name; bytes = $previousArchive.bytes; sha256 = $previousArchive.sha256 }
  } else {
    [ordered]@{ name = $zipName; bytes = 0; sha256 = '' }
  }
} else {
  New-Item -ItemType Directory -Force $outputRoot | Out-Null
  if (Test-Path -LiteralPath $zipPath) { Remove-Item -LiteralPath $zipPath -Force }
  Add-Type -AssemblyName System.IO.Compression | Out-Null
  Add-Type -AssemblyName System.IO.Compression.FileSystem | Out-Null
  $archive = [System.IO.Compression.ZipFile]::Open($zipPath, [System.IO.Compression.ZipArchiveMode]::Create)
  try {
    # WebM 本身已经压缩过，用 Store 模式：打包快，也不会白白再压一遍。
    foreach ($clip in $clips) {
      [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile(
        $archive, $clip.FullName, $clip.Name,
        [System.IO.Compression.CompressionLevel]::NoCompression) | Out-Null
    }
  } finally {
    $archive.Dispose()
  }
  $zipItem = Get-Item -LiteralPath $zipPath
  $zipHash = (Get-FileHash -LiteralPath $zipPath -Algorithm SHA256).Hash.ToLowerInvariant()
  $archiveInfo = [ordered]@{ name = $zipName; bytes = $zipItem.Length; sha256 = $zipHash }
}

$manifest = [ordered]@{
  schema      = 1
  generatedAt = (Get-Date).ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ssZ')
  downloadUrl = $downloadUrl
  archive     = $archiveInfo
  files       = $entries
}
$json = $manifest | ConvertTo-Json -Depth 6
[System.IO.File]::WriteAllText($manifestPath, $json + "`n", (New-Object System.Text.UTF8Encoding($false)))

Write-Host ''
if (-not $ManifestOnly) {
  Write-Host ("素材包：{0}" -f $zipPath)
  Write-Host ("大小：{0:N1} MB  SHA-256：{1}" -f ($zipItem.Length / 1MB), $zipHash)
}
Write-Host ("清单：{0}（{1} 个文件，记得一起提交）" -f $manifestPath, $entries.Count)
Write-Host ''
if (-not $ManifestOnly) {
  Write-Host '下一步：把 zip 传到 GitHub Release，然后把发布地址写进清单的 downloadUrl：'
  Write-Host '  https://github.com/<用户名>/<仓库>/releases/download/<标签>/codex-pet-animations.zip'
}

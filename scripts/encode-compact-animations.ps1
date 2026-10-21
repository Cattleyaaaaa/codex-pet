# Re-encode the WebM animations into a smaller comparison set.
#
# The originals in assets\animations stay untouched; results go to
# assets\animations-compact and can be swapped in with
# scripts\switch-animation-set.ps1 -Set compact.
#
# Both the source and the destination must be decoded/encoded with
# libvpx-vp9: the native VP9 decoder drops the alpha stream, so a plain
# re-encode silently turns the transparent pet into an opaque rectangle.
param(
  [string]$Ffmpeg = '',
  [ValidateRange(64, 4000)][int]$Width = 640,
  [ValidateRange(0, 63)][int]$Crf = 40,
  [string]$OutDir = 'assets\animations-compact',
  [string[]]$Only,
  [switch]$Force
)

$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$animations = Join-Path $projectRoot 'assets\animations'
$target = if ([System.IO.Path]::IsPathRooted($OutDir)) { $OutDir } else { Join-Path $projectRoot $OutDir }

if (-not $Ffmpeg) {
  $bundled = Join-Path $projectRoot '.venv\Lib\site-packages\imageio_ffmpeg\binaries\ffmpeg-win-x86_64-v7.1.exe'
  $Ffmpeg = if (Test-Path -LiteralPath $bundled) { $bundled } else { 'ffmpeg' }
}
if (-not (Test-Path -LiteralPath $Ffmpeg)) {
  throw "找不到 ffmpeg: $Ffmpeg。用 -Ffmpeg 指定路径，或先运行 npm run assets:fetch 之类的准备工作。"
}

$originalStash = Join-Path $projectRoot 'assets\animations-original'
if (Test-Path -LiteralPath $originalStash) {
  throw "当前 live 已经是 compact 素材集（assets\animations-original 存在），原始素材在 $originalStash。先切回 original：npm run assets:switch -- -Set original"
}

$sources = Get-ChildItem -LiteralPath $animations -Filter '*.webm' | Sort-Object Name
if ($Only) {
  $sources = $sources | Where-Object { $Only -contains $_.BaseName }
  if (-not $sources) { throw "没有匹配的源文件：$($Only -join ', ')" }
}
if (-not $sources) { throw "assets\animations 里没有 .webm 文件。" }

New-Item -ItemType Directory -Path $target -Force | Out-Null
Write-Host "Ffmpeg : $Ffmpeg"
Write-Host "Scale  : width $Width (height auto, even), CRF $Crf"
Write-Host "Target : $target"
Write-Host ""

$srcBytes = 0.0
$outBytes = 0.0
$index = 0
$watch = [System.Diagnostics.Stopwatch]::StartNew()

# 缩放必须按预乘 alpha 做：直接 scale 会把透明像素的颜色平均进轮廓，
# 在角色边缘留一圈亮边/灰边。compact-premultiplied.py 就是这么实现的。
$python = Join-Path $projectRoot '.venv\Scripts\python.exe'
if (-not (Test-Path -LiteralPath $python)) { throw "找不到 $python（需要项目自带的 .venv）。" }
$compactScript = Join-Path $PSScriptRoot 'compact-premultiplied.py'

foreach ($source in $sources) {
  $index++
  $destination = Join-Path $target $source.Name
  $srcBytes += $source.Length
  if ((Test-Path -LiteralPath $destination) -and -not $Force) {
    $outBytes += (Get-Item -LiteralPath $destination).Length
    Write-Host ("[{0}/{1}] {2} 已存在，跳过（-Force 可覆盖）" -f $index, $sources.Count, $source.Name)
    continue
  }

  & $python $compactScript $animations $target $source.BaseName --width $Width --crf $Crf --ffmpeg $Ffmpeg 2>&1 | ForEach-Object { Write-Host $_ }
  if ($LASTEXITCODE -ne 0 -or -not (Test-Path -LiteralPath $destination)) {
    throw "转码失败：$($source.Name)"
  }

  $size = (Get-Item -LiteralPath $destination).Length
  $outBytes += $size
  Write-Host ("[{0}/{1}] {2}  {3:N2} MB -> {4:N2} MB ({5:N0}%)" -f $index, $sources.Count, $source.Name, ($source.Length / 1MB), ($size / 1MB), (100 * $size / $source.Length))
}

$watch.Stop()
Write-Host ""
Write-Host ("完成：{0} 个文件，{1:N1} MB -> {2:N1} MB（{3:N0}%），耗时 {4:N1}s" -f $sources.Count, ($srcBytes / 1MB), ($outBytes / 1MB), (100 * $outBytes / $srcBytes), $watch.Elapsed.TotalSeconds)

# 这一套也要有自己的 manifest.json：切换时它会跟着文件夹走，
# 这样 assets:fetch / assets:pack 看到的就是当前这一套的大小和 SHA-256。
& (Join-Path $PSScriptRoot 'package-animations.ps1') -AnimationsDir $target -ManifestOnly

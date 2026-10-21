param(
  [string]$Ffmpeg = 'ffmpeg',
  [string]$Ffprobe = '',
  [ValidateSet('idle-loop', 'thinking-loop', 'working-loop', 'waiting-loop', 'celebrate', 'error-recover', 'hello', 'sleep-loop', 'run-loop', 'idle-lookaround-loop', 'idle-stretch', 'idle-tail-play', 'cheer', 'working-focus-loop', 'waiting-lookaround-loop', 'idle-wing-flutter', 'idle-wing-flutter-alt', 'idle-hair-fix', 'idle-bow', 'idle-hop', 'working-nod-loop', 'waiting-foot-tap-loop')]
  [string[]]$Only,
  [ValidateRange(1, 10000)]
  [int]$MinimumArea = 64
)

$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$animations = Join-Path $projectRoot 'assets\animations'
if (-not $Ffprobe) {
  $bundledProbe = Join-Path $projectRoot 'node_modules\ffprobe-static\bin\win32\x64\ffprobe.exe'
  $Ffprobe = if (Test-Path -LiteralPath $bundledProbe) { $bundledProbe } else { 'ffprobe' }
}

# MP4 and WebM share the same action name.
$clips = @('idle-loop', 'thinking-loop', 'working-loop', 'waiting-loop', 'celebrate', 'error-recover', 'hello', 'sleep-loop')
if (Test-Path -LiteralPath (Join-Path $animations 'run-loop.mp4')) {
  $clips += 'run-loop'
}
foreach ($clip in @('idle-lookaround-loop', 'idle-stretch', 'idle-tail-play', 'cheer', 'working-focus-loop', 'waiting-lookaround-loop', 'idle-wing-flutter', 'idle-wing-flutter-alt', 'idle-hair-fix', 'idle-bow', 'idle-hop', 'working-nod-loop', 'waiting-foot-tap-loop')) {
  if (Test-Path -LiteralPath (Join-Path $animations ($clip + '.mp4'))) { $clips += $clip }
}
if ($Only) { $clips = @($Only) }

# Build the matte separately: opening removes isolated specks, one-pixel
# erosion removes the contaminated rim, then a small blur antialiases it.
$staging = Join-Path $projectRoot 'work\video-conversion'
New-Item -ItemType Directory -Path $staging -Force | Out-Null
Add-Type -Path (Join-Path $PSScriptRoot 'VideoMatte.cs')

foreach ($clip in $clips) {
  $inputPath = Join-Path $animations ($clip + '.mp4')
  $outputPath = Join-Path $animations ($clip + '.webm')
  $stagedPath = Join-Path $staging ($clip + '.webm')
  if (-not (Test-Path -LiteralPath $inputPath)) {
    throw "Missing source video: $inputPath"
  }
  $dimensions = (& $Ffprobe -v error -select_streams v:0 -show_entries stream=width,height -of 'csv=p=0:s=x' $inputPath).Trim()
  if ($LASTEXITCODE -ne 0 -or $dimensions -notmatch '^(1280x720|1920x1080)$') {
    throw "Unsupported video dimensions for ${clip}: $dimensions (expected 1280x720 or 1920x1080)"
  }
  $sourceWidth, $sourceHeight = $dimensions.Split('x') | ForEach-Object { [int]$_ }
  $cropWidth = [int]($sourceWidth * 0.625)
  $cropLeft = [int](($sourceWidth - $cropWidth) / 2)
  $key = "crop=${cropWidth}:${sourceHeight}:${cropLeft}:0,format=rgba,geq=r='r(X,Y)':g='g(X,Y)':b='b(X,Y)':a='255*clip((8-min(g(X,Y)-r(X,Y)\,g(X,Y)-b(X,Y)))/4\,0\,1)',format=rgba"
  $filter = "[0:v]$key,split[rgb][mask];[mask]alphaextract,erosion,dilation,erosion,gblur=sigma=0.5,lut=y='if(lt(val,8),0,if(gt(val,247),255,val))'[alpha];[rgb]despill=type=green:mix=0.5,format=rgb24[color];[color][alpha]alphamerge,fps=24,format=rgba[out]"
  Write-Host "Converting $clip.mp4 -> $clip.webm"
  $clipMinimumArea = if ($clip -eq 'cheer') { [Math]::Max($MinimumArea, 4000) }
    elseif ($clip -in @('working-focus-loop', 'run-loop')) { [Math]::Max($MinimumArea, 256) }
    else { $MinimumArea }
  Write-Host ([VideoMatte]::Convert($Ffmpeg, $inputPath, $stagedPath, $filter, $clipMinimumArea, $cropWidth, $sourceHeight))
  Move-Item -LiteralPath $stagedPath -Destination $outputPath -Force
}

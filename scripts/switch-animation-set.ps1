# Switch which animation set the desktop pet loads.
#
# The app always reads assets\animations. A second set lives in
# assets\animations-compact, and the two folders are swapped by renaming, so
# switching is instant and nothing is copied or re-encoded.
#
# Convention:
#   assets\animations            what the app loads right now
#   assets\animations-compact    640 px re-encode
#   assets\animations-original   created only while the compact set is live,
#                                it holds the 800 px master
#
#   npm run assets:switch -- -Set compact    # use the 640 px re-encode
#   npm run assets:switch -- -Set original   # go back to the 800 px master
#   npm run assets:switch -- -Status         # show which set is live
param(
  [ValidateSet('original', 'compact')][string]$Set = 'original',
  [switch]$Status
)

$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$live = Join-Path $projectRoot 'assets\animations'
$compact = Join-Path $projectRoot 'assets\animations-compact'
$original = Join-Path $projectRoot 'assets\animations-original'

function Get-SetInfo([string]$dir) {
  if (-not (Test-Path -LiteralPath $dir)) { return "$dir（不存在）" }
  $files = Get-ChildItem -LiteralPath $dir -Filter '*.webm'
  $mb = if ($files) { ($files | Measure-Object -Property Length -Sum).Sum / 1MB } else { 0 }
  return ("{0}（{1} 段，{2:N1} MB）" -f $dir, $files.Count, $mb)
}

$compactIsLive = Test-Path -LiteralPath $original

if ($Status) {
  Write-Host ("当前素材集：{0}" -f ($(if ($compactIsLive) { 'compact（640 px）' } else { 'original（800 px）' })))
  Write-Host ("  live    ：{0}" -f (Get-SetInfo $live))
  Write-Host ("  另一套  ：{0}" -f (Get-SetInfo $(if ($compactIsLive) { $original } else { $compact })))
  return
}

if ($Set -eq 'compact' -and -not $compactIsLive) {
  if (-not (Test-Path -LiteralPath $compact)) {
    throw "找不到 $compact。先运行：npm run assets:compact"
  }
  Move-Item -LiteralPath $live -Destination $original
  Move-Item -LiteralPath $compact -Destination $live
  Write-Host "已切换为 compact（640 px）素材集："
} elseif ($Set -eq 'original' -and $compactIsLive) {
  Move-Item -LiteralPath $live -Destination $compact
  Move-Item -LiteralPath $original -Destination $live
  Write-Host "已切回 original（800 px）素材集："
} else {
  Write-Host "已经是 $Set 素材集，不需要切换。"
}

Write-Host (Get-SetInfo $live)
if (-not (Test-Path -LiteralPath (Join-Path $live 'manifest.json'))) {
  & (Join-Path $PSScriptRoot 'package-animations.ps1') -AnimationsDir $live -ManifestOnly | Out-Null
  Write-Host '（已为这一套重新生成 manifest.json）'
}
Write-Host "重启桌宠后生效。"

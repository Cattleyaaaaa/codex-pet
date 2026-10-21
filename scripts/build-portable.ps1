param([string]$OutputName = 'dist-portable')
$ErrorActionPreference = 'Stop'
$projectRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$runtime = Join-Path $projectRoot 'node_modules\electron\dist'
if ($OutputName -notmatch '^dist-portable(?:-[A-Za-z0-9-]+)?$') { throw "Invalid output name: $OutputName" }
$outputRoot = Join-Path $projectRoot $OutputName
$target = Join-Path $outputRoot 'CodexPet-win32-x64'

if (-not (Test-Path -LiteralPath (Join-Path $runtime 'electron.exe'))) {
  throw 'Electron runtime is missing. Run npm install first.'
}

# Check the resolved path before replacing an earlier portable build.
if (Test-Path -LiteralPath $target) {
  $resolved = (Resolve-Path -LiteralPath $target).Path
  $expected = [System.IO.Path]::GetFullPath($target)
  if ($resolved -ne $expected -or (Get-Item -LiteralPath $target).Attributes.HasFlag([System.IO.FileAttributes]::ReparsePoint)) {
    throw "Refusing to replace a redirected output directory: $resolved"
  }
  Remove-Item -LiteralPath $target -Recurse -Force
}

New-Item -ItemType Directory -Force $target | Out-Null
Copy-Item -Path (Join-Path $runtime '*') -Destination $target -Recurse -Force
Copy-Item -LiteralPath (Join-Path $target 'electron.exe') -Destination (Join-Path $target 'CodexPet.exe') -Force

$appDir = Join-Path $target 'resources\app'
New-Item -ItemType Directory -Force $appDir | Out-Null
foreach ($folder in @('src', 'scripts', 'plugins')) {
  Copy-Item -LiteralPath (Join-Path $projectRoot $folder) -Destination $appDir -Recurse -Force
}
Copy-Item -LiteralPath (Join-Path $projectRoot 'package.json') -Destination $appDir -Force
# Ship the end-user guide next to the EXE so a shared portable folder is self-explanatory.
Copy-Item -LiteralPath (Join-Path $projectRoot 'README-portable.md') -Destination (Join-Path $target 'README.md') -Force

$assetsDir = Join-Path $appDir 'assets'
$animationsDir = Join-Path $assetsDir 'animations'
New-Item -ItemType Directory -Force $animationsDir | Out-Null
Copy-Item -Path (Join-Path $projectRoot 'assets\*.png') -Destination $assetsDir -Force
Copy-Item -Path (Join-Path $projectRoot 'assets\animations\*.webm') -Destination $animationsDir -Force
# Animations are not in Git; refuse to ship a silent no-animation build.
$webmCount = @(Get-ChildItem -LiteralPath $animationsDir -Filter '*.webm').Count
if ($webmCount -eq 0) { throw 'No WebM animations in assets\animations. Run "npm run assets:fetch" first, then rebuild.' }
Write-Host "Bundled animations: $webmCount clips"

# Electron's sandbox needs read access to the portable folder on Windows.
& icacls.exe $target /grant '*S-1-15-2-1:(OI)(CI)(RX)' /T | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'Could not grant Electron sandbox read access.' }
Write-Host "Portable app: $(Join-Path $target 'CodexPet.exe')"

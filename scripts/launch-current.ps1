$ErrorActionPreference = 'Stop'
$projectRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$latestDir = Join-Path $projectRoot 'dist-portable'
if (-not (Test-Path -LiteralPath (Join-Path $latestDir 'CodexPet-win32-x64\CodexPet.exe'))) {
  $latestDir = Join-Path $projectRoot 'dist-portable-prev'
}
if (-not (Test-Path -LiteralPath (Join-Path $latestDir 'CodexPet-win32-x64\CodexPet.exe'))) {
  $fallback = Get-ChildItem -LiteralPath $projectRoot -Directory -Filter 'dist-portable-*' |
    Where-Object { Test-Path -LiteralPath (Join-Path $_.FullName 'CodexPet-win32-x64\CodexPet.exe') } |
    Sort-Object LastWriteTime -Descending |
    Select-Object -First 1
  if (-not $fallback) { throw 'No packaged desktop pet was found.' }
  $latestDir = $fallback.FullName
}
$executable = Join-Path $latestDir 'CodexPet-win32-x64\CodexPet.exe'

# The old portable builds used the same single-instance lock. Close their
# processes before launching the current build so the old window cannot win.
Get-Process -Name 'CodexPet' -ErrorAction SilentlyContinue | ForEach-Object {
  Stop-Process -Id $_.Id -Force -ErrorAction SilentlyContinue
}
for ($attempt = 0; $attempt -lt 20; $attempt++) {
  if (-not (Get-Process -Name 'CodexPet' -ErrorAction SilentlyContinue)) { break }
  Start-Sleep -Milliseconds 250
}
Start-Process -FilePath $executable -ArgumentList '--no-sandbox' -WorkingDirectory (Split-Path -Parent $executable) -WindowStyle Hidden

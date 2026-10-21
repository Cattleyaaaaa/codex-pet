param(
  [string]$CurrentName = 'dist-portable',
  [string]$PreviousName = 'dist-portable-prev',
  [string]$StagingName = 'dist-portable-next'
)
$ErrorActionPreference = 'Stop'
$projectRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$namePattern = '^dist-portable(?:-[A-Za-z0-9-]+)?$'
foreach ($name in @($CurrentName, $PreviousName, $StagingName)) {
  if ($name -notmatch $namePattern) { throw "Invalid build folder name: $name" }
}

function Get-BuildPath([string]$name) {
  return [System.IO.Path]::GetFullPath((Join-Path $projectRoot $name))
}

function Remove-BuildFolder([string]$path) {
  if (-not (Test-Path -LiteralPath $path)) { return }
  $expected = [System.IO.Path]::GetFullPath($path)
  $item = Get-Item -LiteralPath $path -Force
  $resolved = (Resolve-Path -LiteralPath $path).Path
  $rootPrefix = $projectRoot + [System.IO.Path]::DirectorySeparatorChar
  if (-not $resolved.StartsWith($rootPrefix, [System.StringComparison]::OrdinalIgnoreCase)) {
    throw "Refusing to remove a folder outside the project: $resolved"
  }
  if ($resolved -ne $expected -or $item.Attributes.HasFlag([System.IO.FileAttributes]::ReparsePoint)) {
    throw "Refusing to remove a redirected build folder: $resolved"
  }
  Remove-Item -LiteralPath $path -Recurse -Force
}

$current = Get-BuildPath $CurrentName
$previous = Get-BuildPath $PreviousName
$staging = Get-BuildPath $StagingName

# Refuse before touching either build if the pet is running from one of them.
# Moving a directory that contains an open exe can leave a half-moved build.
function Get-PetProcessesUnder([string]$path) {
  $prefix = $path.TrimEnd([System.IO.Path]::DirectorySeparatorChar) + [System.IO.Path]::DirectorySeparatorChar
  return @(Get-CimInstance Win32_Process -Filter "Name='CodexPet.exe'" -ErrorAction SilentlyContinue |
    Where-Object { $_.ExecutablePath -and $_.ExecutablePath.StartsWith($prefix, [System.StringComparison]::OrdinalIgnoreCase) })
}
if ((Get-PetProcessesUnder $current).Count -gt 0) {
  throw "The desktop pet is running from '$CurrentName'. Close it from the tray menu and retry."
}
if ((Get-PetProcessesUnder $previous).Count -gt 0) {
  throw "The desktop pet is running from '$PreviousName'. Close it from the tray menu and retry."
}

Write-Host "Building $StagingName..."
Remove-BuildFolder $staging
& (Join-Path $PSScriptRoot 'build-portable.ps1') -OutputName $StagingName
$exe = Join-Path $staging 'CodexPet-win32-x64\CodexPet.exe'
if (-not (Test-Path -LiteralPath $exe)) { throw "Build output missing: $exe" }

Write-Host "Rotating builds..."
Remove-BuildFolder $previous
if (Test-Path -LiteralPath $current) {
  $currentExe = Join-Path $current 'CodexPet-win32-x64\CodexPet.exe'
  if (-not (Test-Path -LiteralPath $currentExe)) {
    # A previous failed rotation may have left an empty shell; do not keep it.
    Remove-BuildFolder $current
  } else {
    try {
      Rename-Item -LiteralPath $current -NewName $PreviousName
    } catch {
      throw "Could not rename '$CurrentName' to '$PreviousName'. Close any running pet launched from it and retry. $($_.Exception.Message)"
    }
  }
}
try {
  Rename-Item -LiteralPath $staging -NewName $CurrentName
} catch {
  if ((Test-Path -LiteralPath $previous) -and -not (Test-Path -LiteralPath $current)) {
    Rename-Item -LiteralPath $previous -NewName $CurrentName
  }
  throw
}

# Keep the latest build and the one before it; remove older experiments.
$keep = @($CurrentName, $PreviousName)
Get-ChildItem -LiteralPath $projectRoot -Directory -Filter 'dist-portable-*' |
  Where-Object { $keep -notcontains $_.Name } |
  ForEach-Object {
    try {
      Remove-BuildFolder $_.FullName
      Write-Host "Removed old build: $($_.Name)"
    } catch {
      Write-Warning "Could not remove old build '$($_.Name)': $($_.Exception.Message)"
    }
  }

Write-Host "Latest:   $(Join-Path $current 'CodexPet-win32-x64\CodexPet.exe')"
Write-Host "Previous: $previous"

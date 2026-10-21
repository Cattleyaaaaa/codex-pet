const fs = require('node:fs');
const path = require('node:path');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');

const execFileAsync = promisify(execFile);

// Resolve the installed Codex desktop app on Windows without assuming a user
// path or a hard-coded package-family hash:
//   1. Start-menu registered app whose AUMID/package name is OpenAI.Codex...
//   2. The OpenAI.Codex AppX manifest (if the app is not listed in Start)
//   3. A Start-menu .lnk (when PowerShell is unavailable)
// The returned appId is used with shell:AppsFolder.
const RESOLVE_SCRIPT = `
$ErrorActionPreference = 'SilentlyContinue'
$appId = $null
try {
  $apps = @(Get-StartApps)
  $match = $apps | Where-Object { $_.AppID -like 'OpenAI.Codex*' } | Select-Object -First 1
  if (-not $match) { $match = $apps | Where-Object { $_.Name -match 'Codex' } | Select-Object -First 1 }
  if ($match) { $appId = [string]$match.AppID }
} catch {}
if (-not $appId) {
  try {
    $pkg = Get-AppxPackage -Name 'OpenAI.Codex*' | Select-Object -First 1
    if ($pkg) {
      $manifest = Get-AppxPackageManifest $pkg
      $apps = @($manifest.Package.Applications.Application)
      $match = $apps | Where-Object { $_.Id -eq 'App' } | Select-Object -First 1
      if (-not $match) { $match = $apps | Where-Object { $_.VisualElements.AppListEntry -ne 'none' } | Select-Object -First 1 }
      if (-not $match) { $match = $apps | Select-Object -First 1 }
      if ($match) { $appId = [string]$pkg.PackageFamilyName + '!' + [string]$match.Id }
    }
  } catch {}
}
[pscustomobject]@{ appId = $appId } | ConvertTo-Json -Compress
`;

let cached = null;

function findStartMenuShortcut() {
  const roots = [
    process.env.APPDATA && path.join(process.env.APPDATA, 'Microsoft', 'Windows', 'Start Menu', 'Programs'),
    process.env.PROGRAMDATA && path.join(process.env.PROGRAMDATA, 'Microsoft', 'Windows', 'Start Menu', 'Programs')
  ].filter(Boolean);
  const hits = [];
  const walk = directory => {
    let entries;
    try {
      entries = fs.readdirSync(directory, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const fullPath = path.join(directory, entry.name);
      if (entry.isDirectory()) walk(fullPath);
      else if (entry.isFile() && entry.name.toLowerCase().endsWith('.lnk') && /codex/i.test(entry.name)) hits.push(fullPath);
    }
  };
  for (const root of roots) walk(root);
  return hits[0] || null;
}

async function findCodexApp() {
  if (process.platform !== 'win32') return null;
  if (cached) return cached;

  let appId = null;
  try {
    const { stdout } = await execFileAsync(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-Command', RESOLVE_SCRIPT],
      { windowsHide: true, timeout: 8000, maxBuffer: 64 * 1024 }
    );
    const parsed = JSON.parse((stdout || '').trim() || '{}');
    if (typeof parsed.appId === 'string' && parsed.appId.trim()) appId = parsed.appId.trim();
  } catch {
    // PowerShell missing/blocked: the Start-menu shortcut fallback below is
    // still enough for installs that create a normal shortcut.
  }

  const shortcut = findStartMenuShortcut();
  if (appId || shortcut) {
    cached = { appId, shortcut };
    return cached;
  }
  return null;
}

module.exports = { findCodexApp };

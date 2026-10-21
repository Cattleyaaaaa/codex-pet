# 小龙娘桌宠 · 一键安装（Windows / PowerShell）
#   irm https://raw.githubusercontent.com/OWNER/REPO/main/install.ps1 | iex
#
# 可选环境变量（大多数情况不用管）：
#   CODEXPET_REPO=owner/repo   源码与素材的仓库地址
#   CODEXPET_DIR=D:\CodexPet   安装目录，默认 %LOCALAPPDATA%\CodexPet\source
#   CODEXPET_LAUNCH=0          只安装、不启动
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'

$Repo = 'Cattleyaaaaa/codex-pet'
if ($env:CODEXPET_REPO) { $Repo = $env:CODEXPET_REPO }
if ($Repo -eq 'OWNER/REPO') {
  throw '请先把 install.ps1 里的 OWNER/REPO 换成你自己的仓库，或设置 $env:CODEXPET_REPO="owner/repo"'
}

$Dest = if ($env:CODEXPET_DIR) { $env:CODEXPET_DIR } else { Join-Path $env:LOCALAPPDATA 'CodexPet\source' }
$Launch = if ($env:CODEXPET_LAUNCH -eq '0') { $false } else { $true }
$ExePath = Join-Path $Dest 'dist-portable\CodexPet-win32-x64\CodexPet.exe'

function Need($name, $hint) {
  if (-not (Get-Command $name -ErrorAction SilentlyContinue)) {
    throw ("缺少 {0}。{1}" -f $name, $hint)
  }
}

Need git  '先装 Git for Windows：https://git-scm.com/download/win'
Need node '先装 Node.js 20+：https://nodejs.org/'
Need npm  'Node.js 自带 npm，重装一下 Node.js 即可'

Write-Host ''
Write-Host '=== 小龙娘桌宠 · 安装 ===' -ForegroundColor Cyan
Write-Host ("仓库：{0}" -f $Repo)
Write-Host ("目录：{0}" -f $Dest)

if (Test-Path -LiteralPath (Join-Path $Dest '.git')) {
  Write-Host '[1/4] 更新源码 ...' -ForegroundColor Green
  git -C $Dest pull --ff-only
  if ($LASTEXITCODE -ne 0) { throw '拉取更新失败，检查网络或先手动处理该目录的本地改动' }
} else {
  Write-Host '[1/4] 克隆源码 ...' -ForegroundColor Green
  New-Item -ItemType Directory -Force (Split-Path -Parent $Dest) | Out-Null
  git clone --depth 1 "https://github.com/$Repo.git" $Dest
  if ($LASTEXITCODE -ne 0) { throw "克隆失败：$Repo 是否存在、是否公开？" }
}

Push-Location $Dest
try {
  Write-Host '[2/4] 安装依赖（Electron 约 100 MB，慢一点）...' -ForegroundColor Green
  if (Test-Path -LiteralPath (Join-Path $Dest 'package-lock.json')) {
    npm ci --no-audit --no-fund
    if ($LASTEXITCODE -ne 0) { npm install --no-audit --no-fund }
  } else {
    npm install --no-audit --no-fund
  }
  if ($LASTEXITCODE -ne 0) { throw 'npm 安装失败' }

  Write-Host '[3/4] 下载动画素材（约 93 MB，逐文件校验 SHA-256）...' -ForegroundColor Green
  npm run assets:fetch
  if ($LASTEXITCODE -ne 0) { throw '素材下载失败' }

  Write-Host '[4/4] 打包便携版 ...' -ForegroundColor Green
  npm run dist:win
  if ($LASTEXITCODE -ne 0) { throw '打包失败' }
} finally {
  Pop-Location
}

if ($Launch) {
  Write-Host '启动中 ...' -ForegroundColor Green
  Start-Process -FilePath $ExePath
  Write-Host ''
  Write-Host ("装好了：{0}" -f $ExePath) -ForegroundColor Cyan
  Write-Host '以后双击这个 exe 就能开；要开机自启，右键托盘 → 设置 → 开机启动。'
} else {
  Write-Host ("装好了：{0}" -f $ExePath) -ForegroundColor Cyan
}
param(
  [Parameter(Mandatory = $true)][string]$Repo,
  [string]$Tag = 'assets-v1',
  [string]$Branch = 'main',
  [switch]$SkipPack,
  [switch]$SkipPush,
  [switch]$NoRelease
)
# 把项目发布到 GitHub：重新生成素材包 -> 把 downloadUrl 固定成 latest 直链 -> 建库提交推送 -> 传 Release。
# 用法：powershell -NoProfile -ExecutionPolicy Bypass -File scripts\publish-github.ps1 -Repo your-name/codex-white-pet
$ErrorActionPreference = 'Stop'
$projectRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$zipPath = Join-Path $projectRoot 'dist-assets\codex-pet-animations.zip'

if ($Repo -notmatch '^[A-Za-z0-9._-]+/[A-Za-z0-9._-]+$') {
  throw '仓库名要写成 owner/name，例如 your-name/codex-white-pet'
}
$assetUrl = "https://github.com/$Repo/releases/latest/download/codex-pet-animations.zip"

Write-Host ("仓库：{0}" -f $Repo)
Write-Host ("素材直链：{0}" -f $assetUrl)
Write-Host ''

# 1) 重新生成清单 + 素材包，并把 downloadUrl 写成 latest 直链（这个地址以后都不变）
if (-not $SkipPack) {
  & (Join-Path $PSScriptRoot 'package-animations.ps1') -DownloadUrl $assetUrl
  if ($LASTEXITCODE -ne 0) { throw '打包素材失败' }
}
if (-not (Test-Path -LiteralPath $zipPath)) { throw "找不到素材包：$zipPath" }

# 顺手把 install.ps1 里的占位仓库名换成真实仓库，保证一键安装命令能直接复制
$installerPath = Join-Path $projectRoot 'install.ps1'
if (Test-Path -LiteralPath $installerPath) {
  $text = [System.IO.File]::ReadAllText($installerPath, [System.Text.Encoding]::UTF8)
  $lines = $text -split "`r?`n"
  $quoted = "'" + $Repo + "'"
  $patched = $text
  for ($i = 0; $i -lt $lines.Count; $i++) {
    if ($lines[$i].StartsWith('$Repo = ')) { $lines[$i] = '$Repo = ' + $quoted }
  }
  $patched = $lines -join "`n"
  if ($patched -ne $text) {
    [System.IO.File]::WriteAllText($installerPath, $patched, (New-Object System.Text.UTF8Encoding($true)))
    Write-Host ("已把 install.ps1 的仓库名改成 {0}" -f $Repo)
  }
}

# 2) 建库、提交、推送
Push-Location $projectRoot
try {
  if (-not (Test-Path -LiteralPath (Join-Path $projectRoot '.git'))) {
    git init | Out-Null
    git symbolic-ref HEAD "refs/heads/$Branch"
    Write-Host ("已初始化 git 仓库（分支 {0}）" -f $Branch)
  }

  $identity = git config user.email
  if (-not $identity) {
    git config user.name 'CodexPet'
    git config user.email 'codexpet@users.noreply.github.com'
    Write-Host '提示：提交身份是临时占位，建议改成你自己的 git config user.name / user.email'
  }

  git add -A
  $staged = @(git diff --cached --name-only)
  if ($staged.Count -gt 0) {
    git commit -m 'chore: 动画素材清单与源码快照' | Out-Null
    Write-Host ("已提交 {0} 个文件" -f $staged.Count)
  } else {
    Write-Host '工作区没有新改动，跳过提交'
  }

  $originState = ''
  if (Test-Path -LiteralPath (Join-Path $projectRoot '.git')) {
    $originState = (git remote) -join "`n"
  }
  if ($originState -notmatch '(?m)^origin$') {
    git remote add origin "https://github.com/$Repo.git"
  } else {
    git remote set-url origin "https://github.com/$Repo.git"
  }
  Write-Host ("remote origin -> https://github.com/{0}.git" -f $Repo)

  if (-not $SkipPush) {
    git push -u origin $Branch
    if ($LASTEXITCODE -ne 0) { throw '推送失败：先在 GitHub 建好空仓库，或检查凭据（gh auth login / Git Credential Manager）' }
    Write-Host '推送完成'
  }
} finally {
  Pop-Location
}

# 3) 把素材包传成 Release 资产（latest 直链指向的就是它）
$gh = Get-Command gh -ErrorAction SilentlyContinue
if ($NoRelease) {
  Write-Host '按要求跳过 Release 上传'
  exit 0
}
if (-not $gh) {
  Write-Host ''
  Write-Host '没有找到 gh CLI，手动传一次就好：'
  Write-Host ("  1. 打开 https://github.com/{0}/releases/new" -f $Repo)
  Write-Host ("  2. Tag 填 {0}，标题随意" -f $Tag)
  Write-Host ("  3. 上传 {0}" -f $zipPath)
  Write-Host '  4. Publish release（不要勾 Pre-release，latest 直链只认正式版）'
  Write-Host ''
  Write-Host '装 gh 后可一条命令搞定：winget install GitHub.cli'
  exit 0
}

Push-Location $projectRoot
try {
  gh release view $Tag --repo $Repo 2>$null | Out-Null
  if ($LASTEXITCODE -ne 0) {
    gh release create $Tag $zipPath --repo $Repo --title ("动画素材 {0}" -f $Tag) --notes '小龙娘桌宠的 640x576 VP9 alpha 动画素材包，由 scripts\package-animations.ps1 生成。'
  } else {
    gh release upload $Tag $zipPath --repo $Repo --clobber
  }
  if ($LASTEXITCODE -ne 0) { throw 'Release 上传失败（先 gh auth login）' }
  Write-Host ''
  Write-Host ("Release {0} 已就绪：{1}" -f $Tag, $assetUrl)
} finally {
  Pop-Location
}
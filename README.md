# 小龙娘 🐉

<p align="center">
  <img alt="platform" src="https://img.shields.io/badge/platform-Windows%2010%2F11-0078D6">
  <img alt="version" src="https://img.shields.io/badge/version-0.1.0-blue">
  <img alt="runtime" src="https://img.shields.io/badge/runtime-Electron-47848F">
  <img alt="status" src="https://img.shields.io/badge/status-prototype-orange">
</p>

<p align="center">
  <img src="assets/pet.png" width="220" alt="小龙娘">
</p>

> 一只住在 Windows 桌面上的白发小龙少女桌宠：透明置顶、拖动投掷、自动漫游、右键点播动作，并通过 Codex hooks 显示工作、等待、完成、报错状态和本轮 Token 用量。

## 系统要求

- Windows 10/11（64 位）。
- 运行打包版不需要 Node.js；从源码运行或自行构建需要 Node.js 20+。
- “打开 Codex 应用”需要本机安装 **Codex 桌面应用**；只安装 Codex CLI 时只会提示安装应用。
- “剩余额度”需要本机安装并登录 Codex CLI。
- 目前只提供 Windows 版本，不提供 macOS/Linux 版本。

## ⚡ 一条命令装好（源码用户）

素材（87 段 WebM，93 MB）不放在 git 里，而是挂在 GitHub Release 上，`assets/animations/manifest.json` 记着每个文件的 SHA-256。所以两个入口都只差一条命令：

```powershell
# ① 完全自动化：克隆 → 装依赖 → 拉素材 → 打包 → 启动
irm https://raw.githubusercontent.com/OWNER/REPO/main/install.ps1 | iex

# ② 已经 clone 过：装依赖 + 拉素材
npm run setup      # = npm install && npm run assets:fetch
```

`assets:fetch` 会先整包下载、逐个校验 SHA-256，全部通过才落盘，中途失败不会留下半新半旧的素材目录。素材地址取自清单里的 `downloadUrl`（指向 `releases/latest/download/codex-pet-animations.zip`），也可以临时用 `-Url` 或环境变量 `CODEXPET_ASSETS_URL` 覆盖。

发布者这边（需要 `gh` CLI 或手动上传）：

```powershell
# 重新打包素材 → 把 downloadUrl 固定成 latest 直链 → 建库推送 → 传 Release
npm run publish:github -- -Repo your-name/codex-white-pet
```

没有 `gh` 时，脚本会打印手动上传步骤；装好 gh（`winget install GitHub.cli`）后同一条命令就能把 93 MB 的素材包传上去。

## 🚀 快速开始（普通用户）

> 只想让桌宠跑起来：**保留整个文件夹 → 双击 `CodexPet.exe` → 右键或托盘使用**。

1. **保留整个程序文件夹**  
   下载或分享时请保留 `CodexPet-win32-x64` 整个目录，不要只拿走 `CodexPet.exe`。同目录的 Electron DLL、`resources` 和素材都是启动必需的。
2. **双击 `CodexPet.exe`**  
   Windows 可能提示“Windows 已保护你的电脑”，点“更多信息”→“仍要运行”即可。
3. **开始使用**  
   小龙娘默认出现在屏幕右下角。左键拖动可移动，快速松手会带出惯性并在屏幕边界反弹；单击会回应；右键打开互动菜单。
4. **退出**  
   从托盘菜单选择“退出”，不要只关闭窗口。窗口隐藏不代表程序已退出。

发布到 GitHub 时，请把整个 `CodexPet-win32-x64` 目录压缩成 zip 作为 Release 附件，不要只上传 EXE。构建脚本会把 `assets/animations/*.webm` 一起放进去，所以便携版用户不用额外下载素材；源码仓库里没有这些视频，见[动画素材](#-动画素材)。

## 🖱️ 右键菜单与托盘

| 菜单项 | 作用 | 前提 |
|---|---|---|
| 打开 Codex 应用 | 自动检测并启动本机 Codex 桌面应用（开始菜单 / MSIX 包；部分版本显示为 ChatGPT） | 已安装 Codex 桌面应用 |
| 剩余额度 | 读取账号额度窗口，显示剩余百分比和重置倒计时 | 已安装并登录 Codex CLI |
| 上次用量 | 显示上一轮读取到的 Token 数 | 已安装 hooks 并成功上报 |
| 桌宠设置 | 调节重力、弹性、地面摩擦、总力度、顶部反弹 | 无 |
| 回到初始位置 | 把桌宠移回屏幕右下角 | 无 |
| 动作 | 按“待机 / 打招呼 / 小动作 / 玩耍 / 移动 / 工作 / 等待 / 完成 / 遇到问题”选播动画 | 无 |
| 自动漫游 | 空闲时在屏幕内走动 | 需要 `run-loop.webm`（包内已带） |
| 隐藏桌宠 | 隐藏窗口，程序继续在托盘运行 | 无 |

托盘菜单另外提供显示、隐藏、自动漫游、工作/等待/完成/出错状态测试和退出。

## ✨ 功能

- **透明置顶小窗**：无边框、置顶、不占任务栏；单实例运行，再次启动会唤回已有桌宠。
- **连续视频动画**：待机、工作、等待、完成、出错各有一组动作，另有打招呼、伸懒腰、玩尾巴、扇翅膀、小跑等扩展动作；由 VP9 Alpha WebM 驱动，双 video 交叉淡入。
- **随机小动作**：待机、工作、等待会轮换不同变体，空闲时自然插入小动作。
- **拖动与投掷**：弹簧跟手；松手按轨迹估速，快速甩出会带惯性、在屏幕边缘反弹并受地面摩擦减速。
- **自动漫游**：空闲一段时间后在屏幕内走动，一次走完 10 秒的完整动作（站立 → 起跑 → 跑 → 收步 → 站立，`run-loop.webm`），向左时整段镜像播放；漫游距离按片长换算，走到终点正好播完。
- **右键互动菜单**：按分类点播动作；可拖动、设置、回到初始位置。
- **Codex 状态联动**：通过 hooks 接收提交、等待确认、完成、中断/会话结束等状态。
- **Token 气泡**：本轮结束后读取本机 Codex 会话记录，用气泡显示本轮 Token 数。
- **剩余额度**：通过本机 Codex app-server 读取账号限额窗口，显示剩余百分比和重置倒计时。
- **物理参数设置**：重力、弹性、地面摩擦、总力度、顶部反弹，保存后用于后续拖动/抛掷。
- **Codex 插件**：`plugins/codex-white-pet` 提供可安装的 hooks 插件，并带本地市场入口。

## 🔗 连接 Codex

当前开发 hook 可以用下面的命令安装：

```powershell
npm run hooks:install
```

它会将桌宠 hook **追加**到 `%USERPROFILE%\.codex\hooks.json`（设置了 `CODEX_HOME` 时使用该目录），并在已有文件旁留下带时间戳的备份；已有 hooks 会保留。

安装后在 Codex CLI 中运行 `/hooks` 审阅并信任这些 hook，必要时重启 Codex。`SessionStart` 会在桌宠未运行时自动启动它。hooks 只向本机 `127.0.0.1` 随机端口发送状态；`Stop` 还会发送本轮标识和本机会话记录路径，供桌宠读取 Token 用量，不发送聊天内容。桌宠启动失败时 hook 会安静退出，不影响 Codex。

事件映射：

| Codex 事件 | 桌宠状态 |
|---|---|
| `UserPromptSubmit` | 工作中 |
| `PermissionRequest` | 等待确认 |
| `Stop` | 完成（本轮响应结束） |
| `Interrupt` / `SessionEnd` | 待机 |

Codex hooks 没有在这里提供完整的多轮目标状态，因此“完成”指**本轮响应结束**，不是整个任务完成。

### Token 用量与剩余额度

- 本轮结束后，小龙娘会用文字气泡显示本轮 Token 数。此数来自本机 Codex 会话记录，不等于账号信用额度或剩余使用比例；Codex 会话记录格式不是稳定接口，无法读取时会明确提示。
- 菜单“剩余额度”通过本机 Codex app-server 读取账号使用限额窗口，显示剩余百分比和重置倒计时，并支持手动刷新；需要本机已安装并登录 Codex CLI。
- 这两项都是可选功能，不影响桌宠本体运行。

### Codex 插件（可选）

面向 Codex 插件的版本在 `plugins/codex-white-pet`，并由 `.agents/plugins/marketplace.json` 提供本地市场入口。插件接收 Codex 生命周期事件；桌宠窗口仍由本机 companion 进程显示，默认安装位置为 `%LOCALAPPDATA%\Programs\CodexPet\CodexPet.exe`。

本插件含生命周期 hooks，需要从 GitHub 或本地插件市场手动安装，不能发布到 Codex 官方公共插件目录；首次使用仍需在 `/hooks` 中审阅并信任。

## 🖥️ Windows 便携版

在项目目录运行：

```powershell
npm run dist:win
```

生成 `dist-portable\CodexPet-win32-x64\CodexPet.exe`。脚本从已安装的 Electron 运行时制作便携版，只复制播放需要的 WebM，不包含原始 MP4；同目录会附带一份面向用户的使用说明。把整个目录一起保留或压缩分享，目标电脑不需要安装 Node.js。

每次改完代码用 `npm run dist:release` 打包：新版本构建到 `dist-portable`，上一版自动改名为 `dist-portable-prev`，其余旧的 `dist-portable-*` 构建会被清理。`npm run dist:win` 只做单次构建，不轮换版本。

打包前请先从托盘退出正在运行的桌宠；脚本会检测并拒绝覆盖正在使用的构建。

## ⚙️ 设置与数据

设置文件位置：

```text
%APPDATA%\codex-white-pet\settings.json
```

主要字段：

| 字段 | 默认值 | 说明 |
|---|---|---|
| `x` / `y` | 屏幕右下角 | 窗口位置 |
| `autoRoam` | `true` | 空闲时自动漫游 |
| `physics.gravity` | `1400` | 重力；设为 0 可无重力漂浮 |
| `physics.restitution` | `0.78` | 碰到屏幕边缘的反弹强度 |
| `physics.groundFriction` | `2.5` | 落地后的横向摩擦 |
| `physics.throwPower` | `1` | 总力度；必须大于 0，越大越跟手、甩得越猛 |
| `physics.ceilingBounce` | `true` | 顶部是否反弹 |

右键“桌宠设置”可以图形化修改物理参数；保存后立即用于之后的拖动和抛掷。

## 🧹 卸载

1. 从托盘菜单选择“退出”。
2. 删除整个 `CodexPet-win32-x64` 程序目录。
3. 如需清除个人数据，删除 `%APPDATA%\codex-white-pet`。
4. 如果安装过 hooks，从 `%USERPROFILE%\.codex\hooks.json` 删除包含 `scripts/codex-hook.cjs` 的条目；如果安装了插件，从 Codex 插件管理中移除。

## ❓ 常见问题

**双击 EXE 没反应或报缺少文件？**  
确认保留的是整个 `CodexPet-win32-x64` 文件夹，而不是单独拷出来的 `CodexPet.exe`。

**Windows 提示“已保护你的电脑”？**  
点“更多信息”→“仍要运行”。这是未签名便携版的 SmartScreen 提示。

**“打开 Codex 应用”没反应？**  
需要安装 Codex 桌面应用；只装 Codex CLI 不够。部分版本的开始菜单显示名为 ChatGPT，程序会按 MSIX/AppUserModelID 自动识别。

**“剩余额度”不可用？**  
需要本机安装并登录 Codex CLI；额度读取依赖本机 app-server。

**Token 气泡不显示？**  
需要先运行 `npm run hooks:install`，并在 Codex CLI 的 `/hooks` 中信任 hooks；仅运行桌宠不会自动产生用量数据。

**透明区域挡住下层窗口点击？**  
不会了。窗口默认整窗穿透，只有角色身上不透明的像素（当前帧的 alpha）才接收鼠标，判定每 50ms 跟着真实光标刷新；光标离开窗口立刻恢复穿透。想点下层窗口，直接点在龙娘轮廓之外即可。

**桌宠跑出屏幕或找不到？**  
从托盘菜单选择“显示桌宠”，或右键菜单“回到初始位置”。

**打包失败说构建正在使用？**  
先从托盘退出正在运行的桌宠，再运行 `npm run dist:release`。

## 🛠️ 从源码开发

```powershell
npm install
npm run assets:fetch   # 拉取动画素材（约 370 MB，只需一次）
npm start
```

常用命令：

| 命令 | 作用 |
|---|---|
| `npm run check` | 语法检查 |
| `npm run test:smoke` | 开发版冒烟测试（启动、hook、点击、拖动、尺寸、跑动） |
| `npm run test:packaged` | 打包版冒烟测试 |
| `npm run assets:fetch` | 下载并校验动画素材（约 370 MB，`-Force` 可重装） |
| `npm run assets:pack` | 打包素材 zip 并更新清单（发布素材时用） |
| `npm run assets:compact` | 生成 640×576 小体积素材集（原版不动） |
| `npm run assets:switch` | 切换素材集：`-- -Set compact` / `-Set original` / `-Status` |
| `npm run hooks:install` | 安装/更新 Codex hooks |
| `npm run hooks:print` | 只打印将安装的 hooks 配置 |
| `npm run dist:win` | 单次构建 Windows 便携版 |
| `npm run dist:release` | 构建并保留最新/上一版 |

## 📦 动画素材

动作动画位于 `assets/animations/`，运行时使用 VP9 Alpha WebM。这批视频一共约 85 MB（800×720 母版约 386 MB，在 `assets/animations-original/`），**不进 Git 仓库**，仓库里只提交 `assets/animations/manifest.json`（每段文件的大小和 SHA-256）。拿到源码后先拉一次素材：

```powershell
npm run assets:fetch
```

脚本按清单里记的地址下载 `codex-pet-animations.zip`，逐个文件核对 SHA-256 后才写入；已经装齐就直接跳过，想重装加 `-Force`。已经手动下载了 zip 的，可以用本地文件：`powershell -File scripts/fetch-animations.ps1 -ZipPath .\codex-pet-animations.zip`。

没有素材时程序照常启动，只是角色退回静态立绘（`assets/pet-reference-sleeves-fixed.png`），托盘菜单里会多一项「动画素材未安装 · 获取方法」。

维护者发布新素材：

```powershell
npm run assets:pack    # 生成 dist-assets\codex-pet-animations.zip，并更新 manifest.json
```

把 zip 传到 GitHub Release，把发布地址填进 `manifest.json` 的 `downloadUrl`（重新打包会保留这个字段，不用重复填），再把 `manifest.json` 提交。`dist-assets/` 已在 `.gitignore` 里。

`assets/animations/` 里的同名 MP4 和 `source-*.mp4` 原片同样不入库，只留在本地方便重新抠像。转换工具：

- `scripts/convert-video-assets.ps1`：批量把绿幕 MP4 转成透明 WebM；
- `scripts/key-green-video.py`：单段视频逐帧抠像，可调参数；
- `scripts/compact-premultiplied.py`：把 800 母版缩成 640 线上版，按预乘 alpha 缩放，避免透明区域的颜色渗进轮廓；
- `scripts/color-match-animations.py`：把某段片段的饱和度/亮度对齐到全库中位数（不同批次生成的原片会有色差）；
- `scripts/build-pet-animations.py`：从 `artifacts/Pets/Codex白龙` 的精灵帧生成备用 WebP。

各批动作的生成提示词和审核记录在 `prompts/`；素材命名和重新制作流程见 [动画素材说明](assets/animations/README.md)。

### 小体积素材集（对比用，可随时退回）

原版 800×720 一共 386.3 MB。`npm run assets:compact` 把每段重编码成 640×576，放进 `assets/animations-compact/`，原版一个字节都不动。实测 87 段，386.3 MB → 85.0 MB（22%），单段最大 2.1 MB。

线上这套是用 `scripts/compact-premultiplied.py --crf 36` 生成的：先把颜色按 alpha 预乘、缩放、再还原，
避免把透明像素的黑色平均进轮廓（直通缩放的 CRF 40 会在轮廓上留下亮边/灰边）。整体流程见
[`work/matte-audit/REPORT.md`](work/matte-audit/REPORT.md)。

```powershell
npm run assets:compact                    # 生成 640 px 版本（约一两百秒）
npm run assets:switch -- -Set compact     # 切换成 640 px，重启桌宠生效
npm run assets:switch -- -Status          # 看当前用的是哪一套
npm run assets:switch -- -Set original    # 退回原版
```

切换是把两个文件夹改名对调（`assets/animations` ↔ `assets/animations-original`），不复制、不重编码，两个方向都是瞬间完成。compact 生效时 `assets:compact` 会拒绝运行，避免把已经压过的文件再压一遍。`manifest.json` 跟着文件夹一起走，要发布哪一套就用哪一套重新 `npm run assets:pack`。

## 🚧 现阶段边界

- 当前生成素材为 1280×720 绿幕原片，抠像后裁成 800×720 的透明 WebM；边缘和画质仍受原片限制。
- 当前没有 dsh-pet 那样的大型动画库、宠物包、聊天记忆或多桌宠实例。
- 窗口目前是 360×410（顶部留出约 50px 透明气泡空间），角色周围的透明区域仍可能挡住下方窗口的点击。
- 目前只支持 Windows；macOS/Linux 没有构建产物。
- 角色图来自本次对话生成的形象，文件在 `assets/pet.png`。

## 🙏 参考

- 交互设计、拖动/抛掷物理和 README 结构参考 [dsh-pet](https://github.com/PC2005-cloud/dsh-pet)。
- Codex 状态接入使用 [Codex hooks](https://learn.chatgpt.com/docs/hooks)。
- 本项目没有包含 dsh-pet 的动画、视频或提示词素材。

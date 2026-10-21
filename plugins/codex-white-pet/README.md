# Codex 白发桌宠插件

此插件把 Codex hooks 与 Windows 桌宠连接起来。插件负责在 Codex 会话开始时启动已安装的桌宠，并把工作、等待、完成等状态发送到本机桌宠进程。

`Stop` 事件还会把本轮标识和本机会话记录路径发送给桌宠，让桌宠用文字气泡显示本轮 Token 数。它不发送聊天内容；Token 数不等于账号额度，准确余额由右键菜单中的官方用量页查看。

桌宠运行时的默认路径是 `%LOCALAPPDATA%\Programs\CodexPet\CodexPet.exe`。开发时可以通过 `PET_EXE` 指定可执行文件路径。

在 Codex CLI 中安装插件后，需要在 `/hooks` 里审阅并信任它的 hooks。之后启动 Codex CLI 时桌宠会自动出现。桌宠可以独立拖动和退出。

本插件含生命周期 hooks，因此需要从 GitHub 或本地插件市场手动安装，不能发布到 Codex 官方公共插件目录。官方文档也要求首次审阅并信任插件 hooks。

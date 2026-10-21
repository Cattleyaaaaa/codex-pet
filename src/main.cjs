const { app, BrowserWindow, ipcMain, Menu, Tray, nativeImage, screen, dialog, shell } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const crypto = require('node:crypto');
const { spawn } = require('node:child_process');
const { readTurnUsage } = require('./turn-usage.cjs');
const { readRateLimits } = require('./rate-limits.cjs');
const { findCodexApp } = require('./codex-app.cjs');
const { estimateReleaseVelocity, springStep, trimTrail } = require('./drag-physics.cjs');

// Keep transparent windows in one physical-pixel coordinate system across mixed-DPI monitors.
app.commandLine.appendSwitch('force-device-scale-factor', '1');
// Avoid Windows DWM glitches that can blank a moving transparent window.
if (process.platform === 'win32') app.disableHardwareAcceleration();
// Keep the storage/application ID stable; the displayed character name is 小龙娘.
app.setName('codex-white-pet');
if (process.env.PET_USER_DATA_DIR) {
  fs.mkdirSync(process.env.PET_USER_DATA_DIR, { recursive: true });
  app.setPath('userData', process.env.PET_USER_DATA_DIR);
}
const hasSingleInstanceLock = app.requestSingleInstanceLock();
if (!hasSingleInstanceLock) app.quit();
else app.on('second-instance', () => revealPet());
const DEFAULT_SIZE = 360;
// Extra transparent headroom above the character so bubbles do not cover the hair.
const WINDOW_HEIGHT = 410;
const DRAG_START_THRESHOLD = 5;
const RUN_VIDEO = path.join(__dirname, '..', 'assets', 'animations', 'run-loop.webm');
const hasRunVideo = fs.existsSync(RUN_VIDEO);
// The roam clip is the full source take: stand → accelerate → run → decelerate → stand.
// One roam lasts exactly as long as the clip so every phase is seen exactly once.
const RUN_CLIP_MS = 10040;
// 漫游位移曲线：拿片段自己的逐帧位移积分出来的（每 4 帧一个采样点，共 61 个）。
// 片段开头约 0.9 秒在站立、结尾约 1.5 秒在收步站定，如果按时间线性推进，
// 就会出现「人站着却横着平移」；用这条曲线把窗口速度和腿部速度对齐。
const ROAM_PROFILE = [
  0.0002, 0.0011, 0.0026, 0.0050, 0.0156, 0.0337, 0.0540, 0.0729, 0.0907, 0.1145,
  0.1365, 0.1590, 0.1796, 0.2028, 0.2226, 0.2451, 0.2653, 0.2881, 0.3074, 0.3297,
  0.3496, 0.3721, 0.3916, 0.4140, 0.4346, 0.4576, 0.4774, 0.5006, 0.5220, 0.5443,
  0.5659, 0.5880, 0.6107, 0.6320, 0.6534, 0.6742, 0.6967, 0.7170, 0.7388, 0.7590,
  0.7814, 0.8011, 0.8224, 0.8420, 0.8639, 0.8840, 0.9070, 0.9297, 0.9513, 0.9683,
  0.9799, 0.9868, 0.9897, 0.9913, 0.9930, 0.9943, 0.9957, 0.9969, 0.9980, 0.9990,
  1.0000
];
function roamDistanceAt(progress) {
  if (progress <= 0) return 0;
  if (progress >= 1) return 1;
  const at = progress * (ROAM_PROFILE.length - 1);
  const index = Math.floor(at);
  const frac = at - index;
  return ROAM_PROFILE[index] + (ROAM_PROFILE[index + 1] - ROAM_PROFILE[index]) * frac;
}
const ANIMATIONS_DIR = path.join(__dirname, '..', 'assets', 'animations');
// 视频不进仓库（见 README「动画素材」），源码直接运行时可能一段都没有。
// 核心几段缺失时桌宠会退回静态立绘，托盘里给一条获取入口。
const CORE_CLIPS = ['idle-loop', 'working-loop', 'waiting-loop', 'cheer', 'error-recover', 'hello', 'thinking-loop', 'sleep-loop', 'run-loop'];
const hasCoreAnimations = CORE_CLIPS.every(name => fs.existsSync(path.join(ANIMATIONS_DIR, `${name}.webm`)));
const EXTRA_CLIPS = [
  'idle-lookaround-loop', 'idle-stretch', 'idle-tail-play', 'cheer', 'working-focus-loop', 'waiting-lookaround-loop',
  'idle-wing-flutter', 'idle-wing-flutter-alt', 'idle-bow', 'idle-hair-fix', 'idle-hop', 'working-nod-loop', 'waiting-foot-tap-loop',
  'idle-wave-long', 'idle-tail-sway', 'done-arms-up-cheer',
  'idle-hum-loop', 'idle-tail-curl-loop', 'idle-gentle-nod-loop',
  'idle-cheek-wave', 'idle-mini-dance', 'idle-shy', 'idle-sneeze', 'idle-sleeve-show', 'idle-wave-smile',
  'idle-curious-lean', 'idle-dragon-roar', 'idle-tiptoe',
  'working-pause-loop', 'working-compare-loop', 'working-idea-loop', 'waiting-hopeful-loop',
  'waiting-question', 'waiting-reassure', 'done-relief', 'done-thankful', 'done-proud', 'error-surprised', 'error-refocus',
  'idle-sparkle-smile', 'working-keyboard-loop',
  'idle-soft-blink', 'idle-headpiece-touch', 'idle-tail-startle', 'idle-laugh', 'idle-pout',
  'idle-step-in-place', 'idle-face-touch', 'idle-wing-open', 'idle-small-bow', 'idle-doze',
  'working-glance', 'working-chin-think', 'working-think-gesture', 'working-trace-idea',
  'done-present-result', 'waiting-calm-breath', 'waiting-small-gesture', 'waiting-reassure-gesture', 'done-small-cheer',
  'done-quiet-cheer', 'done-fist-cheer', 'waiting-open-hands', 'error-oops', 'error-nervous', 'error-try-again',
  'idle-clasp-laugh', 'idle-clasp-hope', 'idle-shy-tilt', 'idle-peace-sign',
  'idle-forehead-touch', 'idle-hair-tuck', 'hello-both-hands', 'hello-small-wave', 'done-thumbs-up', 'done-open-arms',
  'working-organize', 'working-doodle'
];
// Legacy asset keys are kept for compatibility with the existing WebM files.
// Labels below describe the actual motion, even when an old key is imprecise.
const PET_MENU_GROUPS = [
  { id: 'idle', label: '待机', actions: [
    ['idle', '静静待机', '待机循环'], ['idle-hum-loop', '闭眼轻晃', '闭上眼轻轻晃'],
    ['idle-gentle-nod-loop', '轻轻点头', '点点头'], ['idle-sparkle-smile', '闪亮微笑', '开心一笑'],
    ['idle-lookaround-loop', '左右张望', '看看周围'], ['idle-soft-blink', '动动角', '龙角轻轻动一动'],
    ['idle-laugh', '忍不住笑', '悄悄笑起来'], ['idle-pout', '鼓起脸颊', '有点不服气'],
    ['idle-clasp-laugh', '合手开心', '开心地合起手'],
    ['idle-clasp-hope', '合手期待', '期待一下'], ['idle-shy-tilt', '歪头害羞', '有点不好意思'],
    ['idle-doze', '打个盹', '困得点点头'], ['sleep', '休息一下', '小憩片刻']
  ] },
  { id: 'greeting', label: '打招呼', actions: [
    ['hello', '挥手问好', '打个招呼'], ['idle-cheek-wave', '脸旁挥手', '偷偷招呼'],
    ['idle-wave-smile', '笑着挥手', '开心见面'], ['idle-wave-long', '连着挥手', '挥手和你打个招呼'],
    ['hello-both-hands', '双手打招呼', '两只手一起打招呼'], ['hello-small-wave', '轻轻挥手', '抬起手轻轻挥一下'],
    ['idle-bow', '鞠躬致意', '认真道谢']
  ] },
  { id: 'small', label: '小动作', actions: [
    ['idle-stretch', '伸个懒腰', '打个哈欠伸伸懒腰'], ['idle-hair-fix', '整理头发', '理好发丝'],
    ['idle-wing-flutter', '翅膀轻摆', '小翅膀一上一下'], ['idle-wing-flutter-alt', '张开翅膀', '展开后轻轻收起'],
    ['idle-shy', '害羞一下', '有点不好意思'],
    ['idle-sneeze', '袖口遮面', '用袖口掩住口鼻'], ['idle-sleeve-show', '得意叉腰', '叉着腰得意一下'],
    ['idle-curious-lean', '歪头看看', '好奇地歪歪头'], ['idle-tiptoe', '挪挪脚步', '轻轻换个站姿'],
    ['idle-headpiece-touch', '碰一下头饰', '确认头饰还在'], ['idle-face-touch', '摸摸脸侧', '轻轻碰一下脸侧'],
    ['idle-wing-open', '展开小翅膀', '翅膀展开再收起'], ['idle-small-bow', '低头致意', '轻轻低头'],
    ['idle-peace-sign', '比个耶', '比个耶'], ['idle-hair-tuck', '撩一下头发', '把耳边的头发别好'],
    ['idle-forehead-touch', '扶一下额头', '手背贴一下额头'], ['idle-step-in-place', '原地踏步', '慢慢换一下脚']
  ] },
  { id: 'play', label: '玩耍', actions: [
    ['idle-tail-play', '尾巴绕身', '尾巴从身后绕过来'], ['idle-tail-curl-loop', '尾巴绕圈', '尾巴慢慢绕一圈'],
    ['idle-tail-sway', '慢慢摆尾', '尾巴左右轻摇'], ['idle-tail-startle', '被尾巴吓一跳', '尾巴突然动了一下'],
    ['idle-hop', '轻轻跳跃', '跳一下'], ['idle-mini-dance', '左右踏步', '左右小步'],
    ['idle-dragon-roar', '小龙吼', '嗷呜']
  ] },
  { id: 'move', label: '移动', actions: [
    ['run', '原地小跑', '跑两步']
  ] },
  { id: 'working', label: '工作', actions: [
    ['thinking', '想一想', '认真思考'],
    ['working', '认真工作', '工作循环'], ['working-focus-loop', '盯着键盘', '双手扶着键盘'],
    ['working-keyboard-loop', '敲击键盘', '写写代码'],
    ['working-compare-loop', '左右查看', '转头看两边'], ['working-idea-loop', '想到办法', '灵光一闪'],
    ['working-nod-loop', '认真点头', '确认思路'], ['working-pause-loop', '停下来想想', '稍作思考'],
    ['working-glance', '低头看一眼', '目光往下扫一眼'], ['working-chin-think', '托腮思考', '让我想一想'],
    ['working-think-gesture', '边想边比划', '理一理思路'], ['working-trace-idea', '空中理思路', '顺着想法比划一下'],
    ['working-organize', '整理任务', '把卡片分堆拍齐'], ['working-doodle', '画个小星星', '在便签上画颗星']
  ] },
  { id: 'waiting', label: '等待', actions: [
    ['waiting', '安静等待', '等待循环'], ['waiting-foot-tap-loop', '轻点脚尖', '等候时的小动作'],
    ['waiting-hopeful-loop', '合手等待', '双手合在胸前'],
    ['waiting-lookaround-loop', '等待张望', '看看你在不在'],
    ['waiting-question', '摊手询问', '双手摊开看着你'], ['waiting-reassure', '按胸口点头', '手按胸口轻轻点头'],
    ['waiting-calm-breath', '轻轻呼吸', '安静等你'], ['waiting-small-gesture', '轻轻示意', '抬手打个小手势'],
    ['waiting-reassure-gesture', '按胸口安慰', '我在这里陪你'],
    ['waiting-open-hands', '摊开双手', '像是在解释什么']
  ] },
  { id: 'done', label: '完成', actions: [
    ['cheer', '开心庆祝', '张开双手分享好消息'],
    ['done-relief', '松一口气', '完成啦'], ['done-thankful', '合手致谢', '双手收在胸前'],
    ['done-proud', '开心举手', '笑着抬起双手'], ['done-arms-up-cheer', '举手欢呼', '开心地举起双手'],
    ['done-present-result', '侧手示意', '单手向旁边摊开'],
    ['done-small-cheer', '小小加油', '握拳打起精神'], ['done-quiet-cheer', '收手庆祝', '双手收到胸前'],
    ['done-fist-cheer', '举拳欢呼', '耶，完成啦'], ['done-thumbs-up', '竖起大拇指', '干得漂亮'],
    ['done-open-arms', '张开双手', '完成啦，抱一个']
  ] },
  { id: 'error', label: '遇到问题', actions: [
    ['error', '低头缓神', '闭眼低下头'], ['error-surprised', '吃了一惊', '睁大眼睛'],
    ['error-refocus', '重新抬头', '抬头再看一眼'], ['error-oops', '发现小问题', '咦，怎么了？'],
    ['error-nervous', '有点不安', '先缓一缓'], ['error-try-again', '重新振作', '再试一次']
  ] }
];
function availableExtraClips() {
  return EXTRA_CLIPS.filter(name => fs.existsSync(path.join(__dirname, '..', 'assets', 'animations', `${name}.webm`)));
}
let window;
let menuWindow;
let limitsWindow;
let settingsWindow;
let limitsRequest = 0;
const LIMITS_WIDTH = 354;
const LIMITS_HEIGHT = 252;
const SETTINGS_WIDTH = 820;
const SETTINGS_HEIGHT = 700;
const DEFAULT_PHYSICS = Object.freeze({ gravity: 1400, restitution: 0.78, groundFriction: 2.5, throwPower: 1, ceilingBounce: true });
let menuOpensLeft = false;
let menuLevel = 0;
let menuCollapsedBounds = null;
const MENU_WIDTHS = [186, 365, 610];
let tray;
let server;
let settings;
let statusTimer;
let currentStatus = 'idle';
let physicsTimer;
let roamTimer;
let physics = null;
let roam = null;
let lastPosition = null;
let manualDrag = false;
let motionBusy = false;
let saveTimer;
let topmostTimer;
let lastTopmostAssert = 0;
let dragState = null;
let dragTimer;
let syntheticClickProbe = false;
let lastTurnUsage = null;
const reportedTurnIds = new Set();
let usageReportSequence = 0;

function settingsPath() { return path.join(app.getPath('userData'), 'settings.json'); }
function bridgePath() { return path.join(app.getPath('userData'), 'bridge.json'); }
function loadSettings() {
  try { return JSON.parse(fs.readFileSync(settingsPath(), 'utf8')); }
  catch { return {}; }
}
function getPhysicsSettings() {
  const value = settings?.physics || {};
  const number = (key, min, max) => {
    const candidate = Number(value[key]);
    return Number.isFinite(candidate) ? Math.min(max, Math.max(min, candidate)) : DEFAULT_PHYSICS[key];
  };
  return {
    gravity: number('gravity', 0, 3000),
    restitution: number('restitution', 0, 1),
    groundFriction: number('groundFriction', 0, 8),
    throwPower: number('throwPower', 0.05, 2),
    ceilingBounce: value.ceilingBounce !== false
  };
}
function saveSettings() {
  if (!window || window.isDestroyed()) return;
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    if (!window || window.isDestroyed()) return;
    const [x, y] = window.getPosition();
    fs.mkdirSync(app.getPath('userData'), { recursive: true });
    fs.writeFileSync(settingsPath(), JSON.stringify({ x, y, size: getSize(), autoRoam: settings.autoRoam !== false, autoStart: settings.autoStart === true, physics: getPhysicsSettings() }, null, 2));
  }, 450);
}
// Windows 登录启动项：安装版注册 exe 自己；源码运行时 electron.exe 需要带上项目路径，
// 否则开机拉起的是一个没有入口脚本的 Electron。
function loginItemOptions(openAtLogin) {
  if (app.isPackaged) return { openAtLogin };
  return { openAtLogin, path: process.execPath, args: [path.resolve(__dirname, '..')] };
}
function debugLog(message) {
  if (!process.env.PET_DEBUG_LOG) return;
  try {
    fs.appendFileSync(path.join(app.getPath('userData'), 'debug-startup.log'), `${new Date().toISOString()} ${message}\n`);
  } catch {}
}
function applyAutoStart(enabled) {
  const next = Boolean(enabled);
  settings.autoStart = next;
  try {
    app.setLoginItemSettings(loginItemOptions(next));
    debugLog(`applyAutoStart ok next=${next} name=${app.getName()} options=${JSON.stringify(loginItemOptions(next))}`);
  } catch (error) {
    debugLog(`applyAutoStart failed next=${next} error=${error && error.message}`);
    // 写注册表被拒（组策略等）时不要假装成功。
    settings.autoStart = false;
  }
  saveSettings();
  tray?.setContextMenu(buildTrayMenu());
  return settings.autoStart;
}
function getSettingsPayload() {
  return { ...getPhysicsSettings(), autoStart: settings?.autoStart === true };
}
function getSize() {
  return DEFAULT_SIZE;
}
function clampToScreen(x, y) {
  const display = screen.getDisplayNearestPoint({ x, y });
  const area = display.workArea;
  const width = getSize();
  const height = WINDOW_HEIGHT;
  return {
    x: Math.min(Math.max(Math.round(x), area.x), area.x + area.width - width),
    y: Math.min(Math.max(Math.round(y), area.y), area.y + area.height - height)
  };
}
function visibleFraction(bounds) {
  const windowArea = bounds.width * bounds.height;
  if (windowArea <= 0) return 0;
  const visibleArea = screen.getAllDisplays().reduce((sum, display) => {
    const area = display.workArea;
    const width = Math.max(0, Math.min(bounds.x + bounds.width, area.x + area.width) - Math.max(bounds.x, area.x));
    const height = Math.max(0, Math.min(bounds.y + bounds.height, area.y + area.height) - Math.max(bounds.y, area.y));
    return sum + width * height;
  }, 0);
  return Math.min(1, visibleArea / windowArea);
}
function revealPet() {
  if (!window || window.isDestroyed()) return;
  if (visibleFraction(window.getBounds()) < 0.75) {
    const area = screen.getPrimaryDisplay().workArea;
    const width = getSize();
    window.setPosition(Math.round(area.x + (area.width - width) / 2), Math.round(area.y + (area.height - WINDOW_HEIGHT) / 2), false);
  }
  window.show();
  assertTopmost(0);
  window.focus();
}
// ---- 点击命中：窗口默认整窗穿透，只有龙娘身体上的像素把穿透关掉 ----
// Chromium 的 forward 转发在本机不可用（只会在切换瞬间送一个坐标错位的 mousemove），
// 所以判定放在主进程：每 HIT_POLL_MS 取一次真实光标，比对渲染端上传的 1/4 缩略 alpha 蒙版。
// 命中 → 放开窗口收鼠标；落在透明像素 → 恢复穿透。拖拽期间一律不收穿透，避免把输入断掉。
const HIT_POLL_MS = 50;
const HIT_ALPHA_MIN = 32;
let hitMask = null;
let hitBusy = false;
let hitApplied = null;
let hitPollTimer = null;

function applyHitIgnore(ignore) {
  if (!window || window.isDestroyed()) return;
  if (hitApplied === ignore) return;
  hitApplied = ignore;
  window.setIgnoreMouseEvents(ignore, { forward: true });
}

function maskSaysOver(cursor, bounds) {
  if (!hitMask) return true;
  const x = Math.floor(((cursor.x - bounds.x) / Math.max(1, bounds.width)) * hitMask.width);
  const y = Math.floor(((cursor.y - bounds.y) / Math.max(1, bounds.height)) * hitMask.height);
  if (x < 0 || y < 0 || x >= hitMask.width || y >= hitMask.height) return false;
  return hitMask.alpha[y * hitMask.width + x] >= HIT_ALPHA_MIN;
}

function startHitPolling() {
  clearInterval(hitPollTimer);
  hitPollTimer = setInterval(() => {
    if (!window || window.isDestroyed()) return;
    if (hitBusy) {
      applyHitIgnore(false);
      return;
    }
    const bounds = window.getBounds();
    const cursor = screen.getCursorScreenPoint();
    const inside = cursor.x >= bounds.x && cursor.x < bounds.x + bounds.width
      && cursor.y >= bounds.y && cursor.y < bounds.y + bounds.height;
    if (!inside) {
      applyHitIgnore(true);
      return;
    }
    applyHitIgnore(!maskSaysOver(cursor, bounds));
  }, HIT_POLL_MS);
}

function positionLimitsWindow() {
  if (!limitsWindow || limitsWindow.isDestroyed() || !window || window.isDestroyed()) return;
  const pet = window.getBounds();
  const area = screen.getDisplayNearestPoint({ x: pet.x + pet.width / 2, y: pet.y + pet.height / 2 }).workArea;
  const above = pet.y - LIMITS_HEIGHT >= area.y + 8;
  const below = pet.y + pet.height + LIMITS_HEIGHT <= area.y + area.height - 8;
  const side = !above && !below;
  const y = above ? pet.y - LIMITS_HEIGHT + 8
    : below ? pet.y + pet.height - 8
      : Math.max(area.y + 8, Math.min(pet.y + (pet.height - LIMITS_HEIGHT) / 2, area.y + area.height - LIMITS_HEIGHT - 8));
  const preferredX = side && pet.x - LIMITS_WIDTH - 10 >= area.x + 8
    ? pet.x - LIMITS_WIDTH - 10
    : side && pet.x + pet.width + LIMITS_WIDTH + 10 <= area.x + area.width - 8
      ? pet.x + pet.width + 10
      : pet.x + Math.round((pet.width - LIMITS_WIDTH) / 2);
  const x = Math.max(area.x + 8, Math.min(preferredX, area.x + area.width - LIMITS_WIDTH - 8));
  limitsWindow.setBounds({ x: Math.round(x), y: Math.round(y), width: LIMITS_WIDTH, height: LIMITS_HEIGHT });
  limitsWindow.webContents.send('pet-limits:placement', above ? 'above' : below ? 'below' : 'side');
}
function loadLimits() {
  if (!limitsWindow || limitsWindow.isDestroyed()) return;
  const request = ++limitsRequest;
  limitsWindow.webContents.send('pet-limits:report', { loading: true });
  readRateLimits().then(report => {
    if (request === limitsRequest && limitsWindow && !limitsWindow.isDestroyed()) {
      limitsWindow.webContents.send('pet-limits:report', report);
    }
  }).catch(() => {
    if (request === limitsRequest && limitsWindow && !limitsWindow.isDestroyed()) {
      limitsWindow.webContents.send('pet-limits:report', { unavailable: true });
    }
  });
}
async function openCodex() {
  if (process.platform !== 'win32') {
    dialog.showErrorBox('打开 Codex 应用', '当前只支持在 Windows 上打开 Codex 应用。');
    return false;
  }
  let target = null;
  try {
    target = await findCodexApp();
  } catch {}
  if (!target) {
    dialog.showErrorBox('打开 Codex 应用', '未找到 Codex 应用。请先从 Microsoft Store 或 OpenAI 官网安装 Codex 桌面应用，然后重试。');
    return false;
  }
  const reportError = error => {
    dialog.showErrorBox('打开 Codex 应用', `启动 Codex 应用失败：${error?.message || error}`);
  };
  // Windows: prefer the Start-menu AppUserModelID; it is resolved from the
  // installed package, not from a hard-coded path/hash.
  if (target.appId) {
    try {
      const child = spawn('explorer.exe', [`shell:AppsFolder\\${target.appId}`], {
        detached: true,
        stdio: 'ignore',
        windowsHide: true
      });
      child.on('error', reportError);
      child.unref();
      return true;
    } catch {
      // Fall through to the Start-menu shortcut when one was found.
    }
  }
  if (target.shortcut) {
    const error = await shell.openPath(target.shortcut);
    if (!error) return true;
    reportError(new Error(error));
    return false;
  }
  dialog.showErrorBox('打开 Codex 应用', '未找到可启动的 Codex 应用。请确认 Codex 桌面应用已经安装。');
  return false;
}
function showLimitsWindow() {
  if (!window || window.isDestroyed()) return;
  if (limitsWindow && !limitsWindow.isDestroyed()) {
    positionLimitsWindow();
    limitsWindow.showInactive();
    loadLimits();
    return;
  }
  limitsWindow = new BrowserWindow({
    width: LIMITS_WIDTH, height: LIMITS_HEIGHT,
    frame: false, transparent: true, backgroundColor: '#00000000',
    hasShadow: false, show: false, resizable: false,
    minimizable: false, maximizable: false,
    alwaysOnTop: true, skipTaskbar: true, parent: window,
    webPreferences: {
      preload: path.join(__dirname, 'limits-preload.cjs'),
      contextIsolation: true, nodeIntegration: false, sandbox: true
    }
  });
  limitsWindow.setAlwaysOnTop(true, 'screen-saver');
  limitsWindow.on('closed', () => { limitsWindow = null; limitsRequest++; });
  limitsWindow.webContents.once('did-finish-load', () => {
    if (!limitsWindow || limitsWindow.isDestroyed()) return;
    positionLimitsWindow();
    limitsWindow.showInactive();
    loadLimits();
  });
  limitsWindow.loadFile(path.join(__dirname, 'limits.html'));
}
function showSettingsWindow() {
  if (!window || window.isDestroyed()) return;
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    settingsWindow.show();
    settingsWindow.focus();
    settingsWindow.webContents.send('pet-settings:config', getSettingsPayload());
    return;
  }
  const area = screen.getDisplayNearestPoint(window.getBounds()).workArea;
  const x = Math.round(area.x + (area.width - SETTINGS_WIDTH) / 2);
  const y = Math.round(area.y + (area.height - SETTINGS_HEIGHT) / 2);
  settingsWindow = new BrowserWindow({
    x, y, width: SETTINGS_WIDTH, height: SETTINGS_HEIGHT,
    frame: false, transparent: true, backgroundColor: '#00000000',
    hasShadow: false, show: false, resizable: false,
    minimizable: false, maximizable: false,
    alwaysOnTop: true, skipTaskbar: true, parent: window,
    webPreferences: {
      preload: path.join(__dirname, 'settings-preload.cjs'),
      contextIsolation: true, nodeIntegration: false, sandbox: true
    }
  });
  settingsWindow.setAlwaysOnTop(true, 'screen-saver');
  settingsWindow.on('closed', () => { settingsWindow = null; });
  settingsWindow.webContents.once('did-finish-load', () => {
    if (!settingsWindow || settingsWindow.isDestroyed()) return;
    settingsWindow.show();
    settingsWindow.focus();
    settingsWindow.webContents.send('pet-settings:config', getSettingsPayload());
  });
  settingsWindow.loadFile(path.join(__dirname, 'settings.html'));
}
function assertTopmost(minInterval = 5000) {
  if (!window || window.isDestroyed() || !window.isVisible()) return;
  const now = Date.now();
  if (now - lastTopmostAssert < minInterval) return;
  window.setAlwaysOnTop(true, 'screen-saver');
  lastTopmostAssert = now;
}
function stopMotion() {
  physics = null;
  roam = null;
  clearTimeout(roamTimer);
  clearInterval(physicsTimer);
  physicsTimer = null;
  window?.webContents.send('pet:walking', false);
}
function startDrag(cursorX, cursorY) {
  if (!window || window.isDestroyed()) return false;
  clearInterval(dragTimer);
  dragState = null;
  stopMotion();
  const fallback = screen.getCursorScreenPoint();
  const cursor = {
    x: Number.isFinite(cursorX) ? cursorX : fallback.x,
    y: Number.isFinite(cursorY) ? cursorY : fallback.y
  };
  const [windowX, windowY] = window.getPosition();
  dragState = {
    cursorX: cursor.x, cursorY: cursor.y, windowX, windowY,
    targetCursorX: cursor.x, targetCursorY: cursor.y, lastAt: Date.now(),
    vx: 0, vy: 0, trail: [], moved: false
  };
  dragTimer = setInterval(updateDrag, 16);
  return true;
}
function recordDragPoint(cursorX, cursorY, sampledAt = Date.now()) {
  if (!dragState || !Number.isFinite(cursorX) || !Number.isFinite(cursorY)) return false;
  const dx = cursorX - dragState.cursorX;
  const dy = cursorY - dragState.cursorY;
  if (!dragState.moved && Math.hypot(dx, dy) < DRAG_START_THRESHOLD) return false;
  // The renderer sends performance.now() timestamps so the release estimator
  // sees real pointer timing. Fall back to wall time for older callers.
  const stamp = Number.isFinite(sampledAt) ? sampledAt : Date.now();
  dragState.moved = true;
  dragState.targetCursorX = cursorX;
  dragState.targetCursorY = cursorY;
  dragState.trail = trimTrail([...dragState.trail, { t: stamp, x: cursorX, y: cursorY }], stamp);
  return true;
}
function updateDrag() {
  if (!dragState || !window || window.isDestroyed()) return;
  if (syntheticClickProbe) return;
  const now = Date.now();
  if (!dragState.moved) return;
  const targetX = dragState.windowX + dragState.targetCursorX - dragState.cursorX;
  const targetY = dragState.windowY + dragState.targetCursorY - dragState.cursorY;
  const dt = Math.min(1 / 30, Math.max(0.001, (now - dragState.lastAt) / 1000));
  dragState.lastAt = now;
  const power = getPhysicsSettings().throwPower;
  const [currentX, currentY] = window.getPosition();
  dragState.vx = springStep(dragState.vx, currentX, targetX, dt, power);
  dragState.vy = springStep(dragState.vy, currentY, targetY, dt, power);
  const [width, height] = window.getSize();
  let x = Math.round(currentX + dragState.vx * dt);
  let y = Math.round(currentY + dragState.vy * dt);
  // Keep at least 75% of the window on screen, but do not let the spring wind
  // up while an axis is blocked: drop that axis' velocity so pulling back is
  // immediate instead of having to cancel accumulated outward speed.
  if (x !== currentX && visibleFraction({ x, y: currentY, width, height }) < 0.75) {
    x = currentX;
    dragState.vx = 0;
  }
  if (y !== currentY && visibleFraction({ x, y, width, height }) < 0.75) {
    y = currentY;
    dragState.vy = 0;
  }
  if (x !== currentX || y !== currentY) window.setPosition(x, y, false);
}
function endDrag(releaseAt = Date.now()) {
  const ended = dragState;
  const moved = ended?.moved ?? false;
  dragState = null;
  hitBusy = false; // 兜底：指针抬起事件没送到渲染端时，别让窗口一直不穿透
  clearInterval(dragTimer);
  const config = getPhysicsSettings();
  const now = Number.isFinite(releaseAt) ? releaseAt : Date.now();
  const releaseVelocity = moved && config.throwPower > 0 ? estimateReleaseVelocity(ended.trail, now, config.throwPower) : null;
  if (releaseVelocity && window && !window.isDestroyed()) {
    physics = {
      vx: releaseVelocity.vx,
      vy: releaseVelocity.vy,
      lastAt: Date.now(),
      wasGrounded: false
    };
    clearInterval(physicsTimer);
    physicsTimer = setInterval(tickMotion, 16);
  } else if (currentStatus === 'idle') scheduleRoam();
  return moved;
}
function announceTurnUsage(meta) {
  const turnId = meta?.turnId;
  const reportId = `${meta?.sessionId || ''}:${turnId || ''}`;
  if (reportedTurnIds.has(reportId)) return;
  const sequence = ++usageReportSequence;
  if (typeof turnId !== 'string') {
    lastTurnUsage = null;
    window?.webContents.send('pet:turn-usage', { usage: null });
    return;
  }
  reportedTurnIds.add(reportId);
  if (reportedTurnIds.size > 60) reportedTurnIds.delete(reportedTurnIds.values().next().value);
  const deliver = attempt => {
    if (sequence !== usageReportSequence) return;
    const usage = readTurnUsage(meta.transcriptPath, turnId);
    if (!usage && attempt < 12) return setTimeout(() => deliver(attempt + 1), 500);
    lastTurnUsage = usage;
    if (currentStatus === 'done' || currentStatus === 'idle') window?.webContents.send('pet:turn-usage', { usage });
  };
  setTimeout(() => deliver(0), 300);
}
function setStatus(status, meta) {
  const allowed = new Set(['idle', 'working', 'waiting', 'done', 'error']);
  if (!allowed.has(status)) return false;
  if (status === 'working') usageReportSequence++;
  currentStatus = status;
  if (status !== 'idle') { clearTimeout(roamTimer); roam = null; physics = null; clearInterval(physicsTimer); window?.webContents.send('pet:walking', false); }
  clearTimeout(statusTimer);
  window?.webContents.send('pet:status', status);
  if (status === 'done') announceTurnUsage(meta);
  if (menuWindow?.isVisible()) menuWindow.webContents.send('pet-menu:state', petMenuState());
  if (status === 'done' || status === 'error') {
    statusTimer = setTimeout(() => setStatus('idle'), 6000);
  }
  if (status === 'idle') scheduleRoam();
  return true;
}
function createWindow() {
  const defaultPoint = screen.getPrimaryDisplay().workArea;
  const size = getSize();
  const position = clampToScreen(
    Number.isFinite(settings.x) ? settings.x : defaultPoint.x + defaultPoint.width - size - 24,
    Number.isFinite(settings.y) ? settings.y : defaultPoint.y + defaultPoint.height - WINDOW_HEIGHT - 24
  );
  window = new BrowserWindow({
    ...position, width: size, height: WINDOW_HEIGHT,
    frame: false, transparent: true, backgroundColor: '#00000000',
    alwaysOnTop: true, skipTaskbar: true, resizable: false,
    hasShadow: false, show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });
  window.setAlwaysOnTop(true, 'screen-saver');
  window.webContents.setBackgroundThrottling(false);
  window.webContents.setZoomFactor(1);
  window.webContents.setVisualZoomLevelLimits(0, 0).catch(() => {});
  hitMask = null;
  hitBusy = false;
  applyHitIgnore(true);
  startHitPolling();
  window.webContents.once('did-finish-load', () => {
    revealPet();
    window.webContents.send('pet:status', currentStatus);
  });
  if (process.env.PET_SCREENSHOT) {
    window.webContents.on('console-message', (...args) => {
      fs.appendFileSync(path.join(app.getPath('userData'), 'console.log'), JSON.stringify(args.slice(1)) + '\n');
    });
    window.webContents.on('preload-error', (_event, _path, error) => {
      fs.appendFileSync(path.join(app.getPath('userData'), 'console.log'), String(error) + '\n');
    });
    window.webContents.once('did-finish-load', () => {
      setTimeout(async () => {
        try {
          const shot = await window.webContents.capturePage();
          fs.writeFileSync(process.env.PET_SCREENSHOT, shot.toPNG());
          const state = await window.webContents.executeJavaScript('(() => { const image = document.getElementById("character"); const video = document.querySelector("video[data-current=true]") || document.getElementById("motion"); return {petClass: document.getElementById("pet").className, animation: image.dataset.animation, characterSrc: image.currentSrc, characterWidth: image.naturalWidth, characterHeight: image.naturalHeight, videoSrc: video.currentSrc, videoVisible: video.classList.contains("visible"), videoReadyState: video.readyState, videoPaused: video.paused, videoError: video.error?.code ?? null, videoFit: getComputedStyle(video).objectFit, petAppRegion: getComputedStyle(document.getElementById("pet")).webkitAppRegion, indicatorAppRegion: getComputedStyle(document.getElementById("indicator")).webkitAppRegion, bridgeType: typeof window.pet, bridgeKeys: Object.keys(window.pet || {}), bubble: document.getElementById("bubble").textContent}; })()');
          state.zoomFactor = window.webContents.getZoomFactor();
          state.windowSize = window.getSize();
          state.visible = window.isVisible();
          state.movable = window.isMovable();
          state.alwaysOnTop = window.isAlwaysOnTop();
          state.displayScale = screen.getPrimaryDisplay().scaleFactor;
          state.hardwareAccelerationEnabled = app.isHardwareAccelerationEnabled();
          state.bounds = window.getBounds();
          state.visibleFraction = visibleFraction(state.bounds);
          state.displays = screen.getAllDisplays().map(display => ({ bounds: display.bounds, workArea: display.workArea }));
          state.resizable = window.isResizable();
          fs.writeFileSync(path.join(app.getPath('userData'), 'renderer-state.json'), JSON.stringify(state));
          if (process.env.PET_CLICK_PROBE) {
            const before = window.getPosition();
            physics = { vx: 420, vy: -360, lastAt: Date.now(), wasGrounded: false };
            clearInterval(physicsTimer);
            physicsTimer = setInterval(tickMotion, 16);
            syntheticClickProbe = true;
            window.webContents.sendInputEvent({ type: 'mouseMove', x: 150, y: 150 });
            window.webContents.sendInputEvent({ type: 'mouseDown', x: 150, y: 150, button: 'left', clickCount: 1 });
            window.webContents.sendInputEvent({ type: 'mouseUp', x: 150, y: 150, button: 'left', clickCount: 1 });
            await new Promise(resolve => setTimeout(resolve, 250));
            syntheticClickProbe = false;
            const physicsStopped = physics === null && physicsTimer === null;
            const interaction = await window.webContents.executeJavaScript('(() => ({ animation: document.getElementById("character").dataset.animation, video: (document.querySelector("video[data-current=true]") || document.getElementById("motion")).currentSrc, bubble: document.getElementById("bubble").textContent, dragging: document.getElementById("pet").classList.contains("dragging") }))()');
            interaction.before = before;
            interaction.after = window.getPosition();
            interaction.physicsStopped = physicsStopped;
            fs.writeFileSync(path.join(app.getPath('userData'), 'interaction-state.json'), JSON.stringify(interaction));
          }
          if (process.env.PET_DRAG_PROBE) {
            const dragProbe = async (dx, dy, durationMs) => {
              const before = window.getPosition();
              const [windowX, windowY] = before;
              const startX = windowX + 180;
              const startY = windowY + 180;
              await window.webContents.executeJavaScript(`(async () => {
                const pet = document.getElementById('pet');
                const pointerId = 41;
                pet.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0, buttons: 1, pointerId, screenX: ${startX}, screenY: ${startY} }));
                for (let index = 1; index <= 6; index += 1) {
                  await new Promise(resolve => setTimeout(resolve, ${durationMs} / 6));
                  const progress = index / 6;
                  pet.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, button: -1, buttons: 1, pointerId,
                    screenX: ${startX} + ${dx} * progress, screenY: ${startY} + ${dy} * progress }));
                }
                window.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, button: 0, buttons: 0, pointerId,
                  screenX: ${startX + dx}, screenY: ${startY + dy} }));
              })()`);
              await new Promise(resolve => setTimeout(resolve, 35));
              const afterUpdate = window.getPosition();
              const thrown = physics !== null;
              const moved = before.some((value, index) => value !== afterUpdate[index]);
              await new Promise(resolve => setTimeout(resolve, 115));
              return { before, afterUpdate, after: window.getPosition(), started: true, moved, thrown,
                visibleFraction: visibleFraction(window.getBounds()), active: !!dragState };
            };
            const small = await dragProbe(3, 0, 50);
            const gentle = await dragProbe(48, 32, 150);
            const beforeSource = await window.webContents.executeJavaScript('document.getElementById("character").src');
            const large = await dragProbe(120, 60, 80);
            const afterSource = await window.webContents.executeJavaScript('document.getElementById("character").src');
            fs.writeFileSync(path.join(app.getPath('userData'), 'drag-probe.json'), JSON.stringify({ small, gentle, large, beforeSource, afterSource }));
          }
          if (process.env.PET_SIZE_PROBE) {
            const sizes = [];
            for (const requested of [180, 440]) {
              resizePet(requested);
              await new Promise(resolve => setTimeout(resolve, 120));
              const visual = await window.webContents.executeJavaScript('(() => ({ innerWidth: innerWidth, innerHeight: innerHeight, characterWidth: document.getElementById("character").offsetWidth, videoWidth: document.getElementById("motion").offsetWidth }))()');
              sizes.push({ requested, windowSize: window.getSize(), contentSize: window.getContentSize(), visual });
            }
            fs.writeFileSync(path.join(app.getPath('userData'), 'size-probe.json'), JSON.stringify(sizes));
          }
          if (process.env.PET_RUN_PROBE && hasRunVideo) {
            setStatus('idle');
            clearTimeout(roamTimer);
            const area = screen.getPrimaryDisplay().workArea;
            window.setPosition(Math.round(area.x + (area.width - getSize()) / 2), Math.round(area.y + (area.height - WINDOW_HEIGHT) / 2));
            const runs = [];
            for (const direction of [-1, 1]) {
              const [startX, startY] = window.getPosition();
              beginRoam(startX + direction * 120, startY, 2);
              await new Promise(resolve => setTimeout(resolve, 450));
              clearInterval(physicsTimer);
              const runState = await window.webContents.executeJavaScript('(() => { const video = document.querySelector("video[data-current=true]") || document.getElementById("motion"); const rect = video.getBoundingClientRect(); const transform = getComputedStyle(video).transform; let mirror = 1; if (transform && transform !== "none") { try { mirror = new DOMMatrix(transform).a; } catch {} } return { source: video.currentSrc, visible: video.classList.contains("visible"), readyState: video.readyState, paused: video.paused, mirror, left: rect.left, right: rect.right, center: rect.left + rect.width / 2, viewport: innerWidth, animation: document.getElementById("character").dataset.animation }; })()');
              runs.push({ ...runState, direction, startX, endX: window.getPosition()[0] });
              const frame = await window.webContents.capturePage();
              fs.writeFileSync(path.join(app.getPath('userData'), direction < 0 ? 'run-left.png' : 'run-right.png'), frame.toPNG());
            }
            roam = null;
            fs.writeFileSync(path.join(app.getPath('userData'), 'run-probe.json'), JSON.stringify(runs));
            window.webContents.send('pet:walking', false);
          }
          if (process.env.PET_EXTRA_PROBE) {
            const results = [];
            for (const key of availableExtraClips()) {
              let state;
              if (key === 'working-focus-loop' || key === 'waiting-lookaround-loop') {
                const status = key === 'working-focus-loop' ? 'working' : 'waiting';
                for (let attempt = 0; attempt < 3; attempt++) {
                  setStatus(status);
                  await new Promise(resolve => setTimeout(resolve, 300));
                  state = await window.webContents.executeJavaScript('(() => { const video = document.querySelector("video[data-current=true]") || document.getElementById("motion"); return { source: video.currentSrc, visible: video.classList.contains("visible"), readyState: video.readyState, paused: video.paused }; })()');
                  if (state.source.includes(`${key}.webm`)) break;
                }
              } else {
                setStatus('idle');
                window.webContents.send('pet:action', key);
                await new Promise(resolve => setTimeout(resolve, 350));
                state = await window.webContents.executeJavaScript('(() => { const video = document.querySelector("video[data-current=true]") || document.getElementById("motion"); return { source: video.currentSrc, visible: video.classList.contains("visible"), readyState: video.readyState, paused: video.paused }; })()');
              }
              results.push({ key, ...state });
            }
            fs.writeFileSync(path.join(app.getPath('userData'), 'extra-probe.json'), JSON.stringify(results));
          }
        } catch {}
      }, 1800);
    });
  }
  window.loadFile(path.join(__dirname, 'index.html'));
  window.on('moved', saveSettings);
  window.on('moved', positionLimitsWindow);
  window.on('hide', () => limitsWindow?.hide());
  window.on('moved', () => {
    const [x, y] = window.getPosition();
    if (!roam && lastPosition && x !== lastPosition.x) window.webContents.send('pet:direction', x > lastPosition.x ? 1 : -1);
    lastPosition = { x, y };
    if (manualDrag) { manualDrag = false; scheduleRoam(); }
  });
  window.on('will-move', (event, newBounds) => {
    if (visibleFraction(newBounds) < 0.75) { event.preventDefault(); return; }
    menuWindow?.hide();
    assertTopmost(750);
    manualDrag = true;
    roam = null;
    physics = null;
    clearInterval(physicsTimer);
    clearTimeout(roamTimer);
    window.webContents.send('pet:walking', false);
  });
  topmostTimer = setInterval(() => assertTopmost(), 1000);
  window.on('hide', () => menuWindow?.hide());
  window.on('closed', () => { limitsWindow?.close(); menuWindow?.close(); settingsWindow?.close(); clearInterval(topmostTimer); clearInterval(dragTimer); clearInterval(hitPollTimer); hitPollTimer = null; hitApplied = null; hitMask = null; hitBusy = false; dragState = null; window = null; });
}
function createTray() {
  const icon = nativeImage.createFromPath(path.join(__dirname, '..', 'assets', 'pet.png')).resize({ width: 24, height: 24 });
  tray = new Tray(icon);
  tray.setToolTip('小龙娘');
  tray.setContextMenu(buildTrayMenu());
  tray.on('double-click', revealPet);
}
function buildTrayMenu() {
  return Menu.buildFromTemplate([
    { label: '显示桌宠', click: revealPet },
    { label: '隐藏桌宠', click: () => window?.hide() },
    { label: hasRunVideo ? '自动漫游' : '自动漫游（缺少侧身跑动视频）', type: 'checkbox', checked: hasRunVideo && settings.autoRoam !== false, enabled: hasRunVideo, click: item => setAutoRoam(item.checked) },
    { label: '开机自动启动', type: 'checkbox', checked: settings.autoStart === true, click: item => applyAutoStart(item.checked) },
    ...(hasCoreAnimations ? [] : [{ label: '动画素材未安装 · 获取方法', click: showAssetsHelp }]),
    { type: 'separator' },
    { label: '测试：工作中', click: () => setStatus('working') },
    { label: '测试：等待确认', click: () => setStatus('waiting') },
    { label: '测试：完成', click: () => setStatus('done') },
    { label: '测试：出错', click: () => setStatus('error') },
    { type: 'separator' },
    { label: '退出', click: () => app.quit() }
  ]);
}
async function showAssetsHelp() {
  // 便携版自带素材，这条只会出现在源码运行、或者用户手动删掉了视频的情况。
  const detail = app.isPackaged
    ? '视频素材缺失时桌宠只能显示静态立绘。请重新下载完整的便携版压缩包，或者把 codex-pet-animations.zip 解压到 assets/animations/，然后重启桌宠。'
    : '视频素材没有放进仓库。在项目目录运行 npm run assets:fetch 会自动下载并校验（约 370 MB）；'
      + '也可以从 GitHub Releases 下载 codex-pet-animations.zip 解压到 assets/animations/。装好后重启桌宠。';
  const { response } = await dialog.showMessageBox({
    type: 'info',
    title: '动画素材未安装',
    message: '桌宠现在只能显示静态立绘',
    detail,
    buttons: ['打开素材文件夹', '关闭'],
    defaultId: 1,
    cancelId: 1
  });
  if (response === 0) shell.openPath(ANIMATIONS_DIR);
}
function resizePet(size) {
  if (!window) return;
  settings.size = DEFAULT_SIZE;
  window.setSize(DEFAULT_SIZE, WINDOW_HEIGHT);
  window.setResizable(false);
  window.webContents.send('pet:size', window.getContentSize()[0]);
  tray?.setContextMenu(buildTrayMenu());
  const [x, y] = window.getPosition();
  const pos = clampToScreen(x, y);
  window.setPosition(pos.x, pos.y);
  saveSettings();
}
function setAutoRoam(enabled) {
  settings.autoRoam = enabled && hasRunVideo;
  if (!enabled) {
    clearTimeout(roamTimer); roam = null;
    if (!physics) { clearInterval(physicsTimer); window?.webContents.send('pet:walking', false); }
  } else scheduleRoam();
  tray?.setContextMenu(buildTrayMenu());
  saveSettings();
}
function showPetMenu() {
  if (!window || window.isDestroyed()) return;
  limitsWindow?.hide();
  const width = MENU_WIDTHS[0];
  const expandedWidth = MENU_WIDTHS[2];
  const cursor = screen.getCursorScreenPoint();
  const area = screen.getDisplayNearestPoint(cursor).workArea;
  const height = Math.min(470, area.height - 16);
  menuOpensLeft = cursor.x + expandedWidth + 12 > area.x + area.width;
  const x = menuOpensLeft ? cursor.x - width - 12 : cursor.x + 12;
  const position = {
    x: Math.round(Math.min(Math.max(x, area.x + 8), area.x + area.width - width - 8)),
    y: Math.round(Math.min(Math.max(cursor.y - 30, area.y + 8), area.y + area.height - height - 8))
  };
  menuLevel = 0;
  menuCollapsedBounds = { ...position, width, height };
  if (!menuWindow || menuWindow.isDestroyed()) {
    menuWindow = new BrowserWindow({
      ...position, width, height, frame: false, transparent: true,
      backgroundColor: '#00000000', hasShadow: false,
      alwaysOnTop: true, skipTaskbar: true, resizable: false,
      minimizable: false, maximizable: false, show: false,
      parent: window,
      webPreferences: {
        preload: path.join(__dirname, 'menu-preload.cjs'),
        contextIsolation: true, nodeIntegration: false, sandbox: true
      }
    });
    menuWindow.setAlwaysOnTop(true, 'screen-saver');
    menuWindow.on('blur', () => menuWindow?.hide());
    menuWindow.on('closed', () => { menuWindow = null; });
    menuWindow.webContents.once('did-finish-load', () => {
      if (menuWindow && !menuWindow.isDestroyed()) { menuWindow.show(); menuWindow.focus(); }
    });
    menuWindow.loadFile(path.join(__dirname, 'menu.html'));
  } else {
    menuWindow.setBounds({ ...position, width, height });
    menuWindow.webContents.send('pet-menu:state', petMenuState());
    menuWindow.show();
    menuWindow.focus();
  }
}
function setMenuLevel(level) {
  if (!menuWindow || menuWindow.isDestroyed() || !menuCollapsedBounds || menuLevel === level) return;
  menuLevel = level;
  const area = screen.getDisplayNearestPoint(menuCollapsedBounds).workArea;
  const width = Math.min(MENU_WIDTHS[level], area.width - 16);
  const preferredX = level > 0 && menuOpensLeft
    ? menuCollapsedBounds.x - (width - menuCollapsedBounds.width)
    : menuCollapsedBounds.x;
  const x = Math.round(Math.min(Math.max(preferredX, area.x + 8), area.x + area.width - width - 8));
  menuWindow.setBounds({ x, y: menuCollapsedBounds.y, width, height: menuCollapsedBounds.height });
}
function petMenuState() {
  const available = new Set(availableExtraClips());
  const actionGroups = PET_MENU_GROUPS.map(group => ({
    id: group.id, label: group.label,
    actions: group.actions.filter(([key]) => !key.includes('-') || available.has(key))
      .map(([key, label, hint]) => ({ key, label, hint }))
  })).filter(group => group.actions.length);
  const commands = [
    { key: 'open-codex', label: '打开 Codex 应用', command: 'open-codex' },
    { key: 'remaining-limits', label: '剩余额度', command: 'remaining-limits' },
    { key: 'last-usage', label: '上次用量', command: 'last-usage' },
    { key: 'settings', label: '桌宠设置', command: 'settings' },
    { key: 'reset-position', label: '回到初始位置', command: 'reset-position' }
  ];
  return {
    status: currentStatus,
    roamAvailable: hasRunVideo,
    roamEnabled: hasRunVideo && settings.autoRoam !== false,
    openLeft: menuOpensLeft,
    level: menuLevel,
    commands,
    groups: actionGroups
  };
}
function resetPetPosition() {
  if (!window || window.isDestroyed()) return;
  const area = screen.getPrimaryDisplay().workArea;
  const width = getSize();
  window.setPosition(area.x + area.width - width - 24, area.y + area.height - WINDOW_HEIGHT - 24, false);
  saveSettings();
}
function scheduleRoam(delay = 12000 + Math.random() * 6000) {
  clearTimeout(roamTimer);
  if (!window || !hasRunVideo || settings.autoRoam === false || currentStatus !== 'idle' || physics) return;
  roamTimer = setTimeout(() => {
    if (!window || currentStatus !== 'idle' || settings.autoRoam === false || physics) return;
    // Idle actions can run more often than the roam delay. Keep the pending
    // roam alive and retry briefly until the action finishes instead of
    // restarting the full 12–18 second delay each time.
    if (motionBusy) return scheduleRoam(1200);
    const display = screen.getDisplayNearestPoint({ x: window.getPosition()[0], y: window.getPosition()[1] });
    const area = display.workArea;
    const width = getSize();
    const [x, y] = window.getPosition();
    const stride = (260 + Math.random() * 340) * (Math.random() < 0.5 ? -1 : 1);
    let targetX = Math.round(Math.min(area.x + area.width - width, Math.max(area.x, x + stride)));
    // Near a screen edge the stride gets clipped; walk the other way instead of
    // creeping so the character always covers a visible distance.
    if (Math.abs(targetX - x) < 180) {
      targetX = Math.round(Math.min(area.x + area.width - width, Math.max(area.x, x - stride)));
    }
    const targetY = Math.round(Math.min(area.y + area.height - WINDOW_HEIGHT, Math.max(area.y, y + (Math.random() - 0.5) * 90)));
    beginRoam(targetX, targetY);
  }, 18000 + Math.random() * 15000);
}
function beginRoam(targetX, targetY) {
  const [startX, startY] = window.getPosition();
  roam = { targetX, targetY, startX, startY, startAt: Date.now(), synced: false };
  const dx = targetX - window.getPosition()[0];
  if (dx !== 0) window.webContents.send('pet:direction', dx < 0 ? -1 : 1);
  window.webContents.send('pet:walking', true);
  clearInterval(physicsTimer);
  physicsTimer = setInterval(tickMotion, 16);
}
function tickMotion() {
  if (!window) { clearInterval(physicsTimer); return; }
  let [x, y] = window.getPosition();
  if (physics) {
    const display = screen.getDisplayNearestPoint({ x, y });
    const area = display.workArea;
    const width = getSize();
    const config = getPhysicsSettings();
    const now = Date.now();
    // Semi-implicit Euler, like dsh-pet: integrate gravity, then position.
    // Cap a delayed frame so resuming after a stall does not teleport the pet.
    const dt = Math.min(0.05, Math.max(0.001, (now - physics.lastAt) / 1000));
    physics.lastAt = now;
    const impactSpeed = Math.max(0, physics.vy);
    physics.vy += config.gravity * dt;
    x += physics.vx * dt;
    y += physics.vy * dt;
    let bounced = false;
    const minX = area.x;
    const maxX = area.x + area.width - width;
    const minY = area.y;
    const maxY = area.y + area.height - WINDOW_HEIGHT;
    if (x < minX) {
      x = minX;
      physics.vx = Math.abs(physics.vx) * config.restitution;
      bounced = true;
    } else if (x > maxX) {
      x = maxX;
      physics.vx = -Math.abs(physics.vx) * config.restitution;
      bounced = true;
    }
    if (y < minY) {
      // Match dsh-pet: when ceiling bounce is off, the top is open; gravity
      // brings the pet back into view instead of clamping it at the edge.
      if (config.ceilingBounce) {
        y = minY;
        physics.vy = Math.abs(physics.vy) * config.restitution;
        bounced = true;
      }
    } else if (y >= maxY) {
      y = maxY;
      physics.vx *= Math.max(0, 1 - config.groundFriction * dt);
      if (Math.abs(physics.vy) < 40) physics.vy = 0;
      else physics.vy = -Math.abs(physics.vy) * config.restitution;
      bounced = true;
    }
    const grounded = y >= maxY - 1;
    // Fire the landing response only on the air -> ground transition. While the
    // pet keeps sliding on the floor, wasGrounded stays true, so the renderer's
    // jelly animation is not restarted on every physics tick.
    if (grounded && !physics.wasGrounded && impactSpeed > 0) {
      window.webContents.send('pet:landed', impactSpeed);
    }
    physics.wasGrounded = grounded;
    const speed = Math.hypot(physics.vx, physics.vy);
    const atRest = (grounded && Math.abs(physics.vy) < 1 && Math.abs(physics.vx) < 15) ||
      (bounced && speed < 40 && Math.abs(physics.vy) < 1);
    if (atRest) {
      if (grounded) y = maxY;
      physics = null;
      clearInterval(physicsTimer);
      physicsTimer = null;
      if (currentStatus === 'idle') scheduleRoam();
    }
    window.setPosition(Math.round(x), Math.round(y), false);
  } else if (roam) {
    // 等渲染端确认漫游片段真的开始播了再起算：视频要 decode 首帧再淡入，
    // 如果按 pet:walking 的发出时间计时，窗口会比腿早走 200–400ms。
    if (!roam.synced) {
      if (Date.now() - roam.startAt < 2500) {
        window.setPosition(roam.startX, roam.startY, false);
        return;
      }
      // 片段没起来（缺素材/解码失败）也别把桌宠卡在这儿。
      roam.synced = true;
      roam.startAt = Date.now();
    }
    // Pace by wall clock, not by tick count: setInterval(16) drifts under load and
    // would make the walk outlast the clip.
    const progress = Math.min(1, (Date.now() - roam.startAt) / RUN_CLIP_MS);
    if (progress >= 1) {
      window.setPosition(roam.targetX, roam.targetY, false);
      roam = null;
      window.webContents.send('pet:walking', false);
      clearInterval(physicsTimer);
      scheduleRoam();
    } else {
      const distance = roamDistanceAt(progress);
      const x2 = roam.startX + (roam.targetX - roam.startX) * distance;
      const y2 = roam.startY + (roam.targetY - roam.startY) * distance;
      window.setPosition(Math.round(x2), Math.round(y2), false);
    }
  } else { clearInterval(physicsTimer); window.webContents.send('pet:walking', false); }
}
function startBridge() {
  const token = crypto.randomBytes(24).toString('hex');
  server = http.createServer((req, res) => {
    if (req.method !== 'POST' || req.url !== '/status' || req.headers.authorization !== `Bearer ${token}`) {
      res.writeHead(404).end(); return;
    }
    let body = '';
    req.on('data', chunk => {
      body += chunk;
      if (body.length > 1024) req.destroy();
    });
    req.on('end', () => {
      try {
        const message = JSON.parse(body);
        const ok = setStatus(message.status, message);
        res.writeHead(ok ? 204 : 400).end();
      } catch { res.writeHead(400).end(); }
    });
  });
  server.listen(0, '127.0.0.1', () => {
    const data = { port: server.address().port, token };
    fs.mkdirSync(app.getPath('userData'), { recursive: true });
    fs.writeFileSync(bridgePath(), JSON.stringify(data), { mode: 0o600 });
  });
}

app.whenReady().then(() => {
  if (!hasSingleInstanceLock) return;
  settings = loadSettings();
  debugLog(`whenReady autoStart=${settings.autoStart} packaged=${app.isPackaged} userData=${app.getPath('userData')}`);
  createWindow();
  createTray();
  // 启动时按存储的偏好重放一次注册表写入：安装目录换过、杀软清过启动项都能自愈。
  if (settings.autoStart) applyAutoStart(true);
  startBridge();
  ipcMain.handle('pet:get-content-size', () => window?.getContentSize()[0] ?? DEFAULT_SIZE);
  ipcMain.on('pet:drag-start', (_event, x, y) => startDrag(x, y));
  ipcMain.on('pet:drag-move', (_event, x, y, t) => recordDragPoint(x, y, t));
  ipcMain.handle('pet:drag-end', (_event, x, y, t) => endDrag(t));
  ipcMain.on('pet:motion-busy', (_event, busy) => {
    motionBusy = Boolean(busy);
    if (motionBusy) {
      if (roam) {
        roam = null;
        clearInterval(physicsTimer);
        window?.webContents.send('pet:walking', false);
        scheduleRoam(1200);
      }
    } else if (currentStatus === 'idle' && !roamTimer) scheduleRoam(1200);
  });
  ipcMain.on('pet:run-started', () => {
    if (!roam || roam.synced) return;
    roam.synced = true;
    roam.startAt = Date.now();
  });
  ipcMain.handle('pet:get-status', () => currentStatus);
  ipcMain.on('pet:hit-mask', (event, mask) => {
    if (event.sender !== window?.webContents) return;
    if (!mask || !(mask.width > 0) || !(mask.height > 0) || !mask.alpha || mask.alpha.length < mask.width * mask.height) {
      hitMask = null;
      return;
    }
    hitMask = { width: mask.width, height: mask.height, alpha: mask.alpha, source: mask.source || '' };
  });
  ipcMain.on('pet:hit-busy', (event, busy) => {
    if (event.sender !== window?.webContents) return;
    hitBusy = Boolean(busy);
  });
  ipcMain.handle('pet:get-extra-clips', availableExtraClips);
  ipcMain.on('pet:context-menu', showPetMenu);
  ipcMain.handle('pet-menu:get-state', event => {
    if (event.sender !== menuWindow?.webContents) return null;
    return petMenuState();
  });
  ipcMain.on('pet-menu:level', (event, level) => {
    if (event.sender !== menuWindow?.webContents) return;
    if (Number.isInteger(level) && level >= 0 && level < MENU_WIDTHS.length) setMenuLevel(level);
  });
  ipcMain.on('pet-menu:command', (event, command, key) => {
    if (event.sender !== menuWindow?.webContents) return;
    menuWindow.hide();
    if (command === 'action') {
      const allowed = petMenuState().groups.some(group => group.actions.some(action => !action.command && action.key === key));
      if (allowed) window?.webContents.send('pet:action', key);
    } else if (command === 'roam' && hasRunVideo) setAutoRoam(settings.autoRoam === false);
    else if (command === 'open-codex') openCodex().catch(() => {});
    else if (command === 'remaining-limits') showLimitsWindow();
    else if (command === 'last-usage') window?.webContents.send('pet:turn-usage', { usage: lastTurnUsage, voice: false, history: true });
    else if (command === 'settings') showSettingsWindow();
    else if (command === 'reset-position') resetPetPosition();
    else if (command === 'hide') window?.hide();
  });
  ipcMain.handle('pet-settings:get', event => event.sender === settingsWindow?.webContents ? getSettingsPayload() : null);
  ipcMain.handle('pet-settings:save', (event, input) => {
    if (event.sender !== settingsWindow?.webContents || !input || typeof input !== 'object') return null;
    const number = (key, min, max) => {
      const value = Number(input[key]);
      return Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : DEFAULT_PHYSICS[key];
    };
    settings.physics = {
      gravity: number('gravity', 0, 3000),
      restitution: number('restitution', 0, 1),
      groundFriction: number('groundFriction', 0, 8),
      throwPower: number('throwPower', 0.05, 2),
      ceilingBounce: input.ceilingBounce !== false
    };
    applyAutoStart(input.autoStart === true);
    saveSettings();
    return getSettingsPayload();
  });
  ipcMain.on('pet-settings:test', event => {
    if (event.sender !== settingsWindow?.webContents || !window || window.isDestroyed()) return;
    const config = getPhysicsSettings();
    physics = { vx: 375 * config.throwPower, vy: -937.5 * config.throwPower, lastAt: Date.now(), wasGrounded: false };
    clearTimeout(roamTimer);
    roam = null;
    clearInterval(physicsTimer);
    physicsTimer = setInterval(tickMotion, 16);
  });
  ipcMain.on('pet-settings:close', event => {
    if (event.sender === settingsWindow?.webContents) settingsWindow?.close();
  });
  ipcMain.on('pet-limits:refresh', event => {
    if (event.sender === limitsWindow?.webContents) loadLimits();
  });
  ipcMain.on('pet-limits:close', event => {
    if (event.sender === limitsWindow?.webContents) limitsWindow.hide();
  });
  screen.on('display-metrics-changed', () => {
    if (!window) return;
    const [x, y] = window.getPosition();
    const next = clampToScreen(x, y);
    window.setPosition(next.x, next.y);
  });
  scheduleRoam();
});
app.on('before-quit', () => {
  if (!hasSingleInstanceLock) return;
  saveSettings();
  clearTimeout(statusTimer);
  clearTimeout(roamTimer);
  clearInterval(physicsTimer);
  clearInterval(topmostTimer);
  clearInterval(dragTimer);
  clearTimeout(saveTimer);
  server?.close();
  try { fs.unlinkSync(bridgePath()); } catch {}
});
app.on('window-all-closed', event => event.preventDefault());

const fs = require('node:fs');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');

const projectRoot = path.join(__dirname, '..');
const packaged = process.argv.includes('--packaged');
const userData = path.join(__dirname, '..', '.smoke-user-data');
const packagedDir = process.env.PET_PACKAGED_DIR || path.join(projectRoot, 'dist-portable', 'CodexPet-win32-x64');
const bridgeFile = path.join(userData, 'bridge.json');
const screenshot = path.join(userData, 'screenshot.png');
try { fs.unlinkSync(bridgeFile); } catch {}
try { fs.unlinkSync(screenshot); } catch {}
try { fs.unlinkSync(path.join(userData, 'renderer-state.json')); } catch {}
try { fs.unlinkSync(path.join(userData, 'interaction-state.json')); } catch {}
try { fs.unlinkSync(path.join(userData, 'drag-probe.json')); } catch {}
try { fs.unlinkSync(path.join(userData, 'size-probe.json')); } catch {}
try { fs.unlinkSync(path.join(userData, 'run-probe.json')); } catch {}
const executable = packaged
  ? path.join(packagedDir, 'CodexPet.exe')
  : require('electron');
const args = packaged ? ['--no-sandbox', '--disable-gpu'] : ['.', '--no-sandbox', '--disable-gpu'];
const child = spawn(executable, args, {
  cwd: projectRoot,
  env: { ...process.env, PET_USER_DATA_DIR: userData, PET_SCREENSHOT: screenshot, PET_CLICK_PROBE: '1', PET_DRAG_PROBE: '1', PET_SIZE_PROBE: '1', PET_RUN_PROBE: '1' },
  windowsHide: true,
  stdio: ['ignore', 'pipe', 'pipe']
});
const started = Date.now();
let finished = false;
let diagnostics = '';
child.stdout.on('data', data => { diagnostics += data.toString(); });
child.stderr.on('data', data => { diagnostics += data.toString(); });
function finish(error) {
  if (finished) return;
  finished = true;
  if (process.platform === 'win32') spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
  else child.kill();
  if (error) { console.error(error, diagnostics.slice(-1500)); process.exitCode = 1; }
  else console.log(`${packaged ? 'Packaged app' : 'Electron'} started; Codex hook reached the pet and rendered its working state.`);
  setTimeout(() => process.exit(error ? 1 : 0), 500);
}
child.on('exit', code => { if (!finished) finish(`Electron exited early (${code}).`); });
const poll = setInterval(() => {
  if (finished) { clearInterval(poll); return; }
  if (Date.now() - started > 15000) { clearInterval(poll); finish('Timed out waiting for the Electron bridge.'); return; }
  if (!fs.existsSync(bridgeFile)) return;
  clearInterval(poll);
  const hook = spawnSync(process.execPath, [path.join(__dirname, 'codex-hook.cjs')], {
    input: JSON.stringify({ hook_event_name: 'UserPromptSubmit' }),
    env: { ...process.env, PET_BRIDGE_FILE: bridgeFile },
    timeout: 3000
  });
  if (hook.status !== 0) { finish(`Hook failed (${hook.status}).`); return; }
  const pluginHook = spawnSync(process.execPath, [path.join(projectRoot, 'plugins', 'codex-white-pet', 'hooks', 'codex-hook.cjs')], {
    input: JSON.stringify({ hook_event_name: 'UserPromptSubmit' }),
    env: { ...process.env, PET_BRIDGE_FILE: bridgeFile },
    timeout: 3000
  });
  if (pluginHook.status !== 0) { finish(`Plugin hook failed (${pluginHook.status}).`); return; }
  setTimeout(() => {
    try {
      const state = JSON.parse(fs.readFileSync(path.join(userData, 'renderer-state.json'), 'utf8'));
      const interaction = JSON.parse(fs.readFileSync(path.join(userData, 'interaction-state.json'), 'utf8'));
      const drag = JSON.parse(fs.readFileSync(path.join(userData, 'drag-probe.json'), 'utf8'));
      const sizes = JSON.parse(fs.readFileSync(path.join(userData, 'size-probe.json'), 'utf8'));
      const run = JSON.parse(fs.readFileSync(path.join(userData, 'run-probe.json'), 'utf8'));
      const dragValid = interaction.physicsStopped
        && drag.small.started
        && !drag.small.moved
        && !drag.small.thrown
        && drag.small.before.every((value, index) => value === drag.small.afterUpdate[index]
          && value === drag.small.after[index])
        && drag.gentle.started
        && drag.gentle.moved
        && !drag.gentle.thrown
        && drag.large.started
        && drag.large.moved
        && drag.large.thrown
        && drag.large.after.some((value, index) => value !== drag.large.afterUpdate[index])
        && drag.large.visibleFraction >= 0.75
        && drag.beforeSource.split('?')[0] === drag.afterSource.split('?')[0]
        && !drag.small.active && !drag.gentle.active && !drag.large.active;
      const valid = process.env.PET_DRAG_ONLY === '1' ? dragValid : fs.existsSync(screenshot)
        && state.petClass.split(' ').includes('working')
        && ['working', 'hello'].includes(state.animation)
        && state.characterSrc.includes('/assets/pet-reference-sleeves-fixed.png')
        && state.characterWidth > 0
        && state.characterHeight > 0
        && state.zoomFactor === 1
        && state.visible === true
        && state.visibleFraction >= 0.75
        && state.movable === true
        && state.alwaysOnTop === true
        && state.displayScale === 1
        && state.hardwareAccelerationEnabled === false
        && state.windowSize[0] === 360 && state.windowSize[1] === 410
        && state.resizable === false
        && state.videoVisible
        && state.videoReadyState >= 2
        && !state.videoPaused
        && state.videoError === null
        && state.videoFit === 'contain'
        && state.petAppRegion !== 'drag'
        && interaction.animation === 'hello'
        && interaction.video.includes('/assets/animations/hello.webm')
        && interaction.bubble.length > 0
        && !interaction.dragging
        && interaction.before.every((value, index) => value === interaction.after[index])
        && dragValid
        && sizes.every(entry => entry.windowSize[0] === 360 && entry.windowSize[1] === 410
          && entry.contentSize[0] === 360 && entry.contentSize[1] === 410
          && Math.abs(entry.visual.characterWidth - 360 * 0.94) < 2
          && Math.abs(entry.visual.videoWidth - 360 * 0.94) < 2)
        && run.length === 2 && run.every(entry => entry.source.includes('/assets/animations/run-loop.webm')
          && entry.visible && entry.readyState >= 2 && !entry.paused
          && entry.mirror === entry.direction && (entry.endX - entry.startX) * entry.direction > 0
          && entry.animation === (entry.direction < 0 ? 'run-left' : 'run-right')
          && entry.left >= 0 && entry.right <= entry.viewport
          && Math.abs(entry.center - entry.viewport / 2) < 1);
      finish(valid ? null : `Renderer video, click, drag, size, or run interaction failed: ${JSON.stringify({ state, interaction, drag, sizes, run })}`);
    } catch (error) { finish(error); }
  }, 4500);
}, 200);

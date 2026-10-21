// Receives a Codex hook event on stdin and forwards only its state to the local pet.
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { spawn } = require('node:child_process');

const appRoot = path.resolve(__dirname, '..');

function findPetApp() {
  const candidates = [];
  if (process.env.PET_EXE) candidates.push(process.env.PET_EXE);
  candidates.push(
    path.join(appRoot, 'dist-portable', 'CodexPet-win32-x64', 'CodexPet.exe'),
    path.join(appRoot, 'dist', 'CodexPet-win32-x64', 'CodexPet.exe'),
    path.join(process.env.LOCALAPPDATA || '', 'Programs', 'CodexPet', 'CodexPet.exe')
  );
  return candidates.find(candidate => candidate && fs.existsSync(candidate)) || null;
}

function launchPet() {
  const target = findPetApp();
  if (target) {
    const child = spawn(target, [], {
      cwd: path.dirname(target), detached: true, stdio: 'ignore', windowsHide: true
    });
    child.unref();
    return;
  }
  // Development fallback: launch the Electron app from the project directory.
  try {
    const electron = require('electron');
    if (typeof electron === 'string') {
      const child = spawn(electron, [appRoot], {
        cwd: appRoot, detached: true, stdio: 'ignore', windowsHide: true
      });
      child.unref();
    }
  } catch {}
}

let input = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', chunk => { input += chunk; });
process.stdin.on('end', () => {
  try {
    const hook = JSON.parse(input);
    const event = hook.hook_event_name;
    const states = {
      SessionStart: 'idle', UserPromptSubmit: 'working',
      PermissionRequest: 'waiting', Stop: 'done',
      Interrupt: 'idle', SessionEnd: 'idle'
    };
    const status = states[event];
    if (!status) return;
    const bridgeFile = process.env.PET_BRIDGE_FILE || path.join(process.env.APPDATA || '', 'codex-white-pet', 'bridge.json');
    let launchAttempted = false;
    const launchOnce = () => {
      if (launchAttempted) return;
      launchAttempted = true;
      launchPet();
    };

    if (event === 'SessionStart' && !fs.existsSync(bridgeFile)) launchOnce();
    if (!fs.existsSync(bridgeFile)) return;

    const bridge = JSON.parse(fs.readFileSync(bridgeFile, 'utf8'));
    const request = http.request({
      host: '127.0.0.1', port: bridge.port, path: '/status', method: 'POST',
      headers: { Authorization: `Bearer ${bridge.token}`, 'Content-Type': 'application/json' },
      timeout: 700
    }, response => response.resume());
    request.on('error', () => {
      if (event === 'SessionStart') launchOnce();
    });
    request.on('timeout', () => request.destroy());
    request.end(JSON.stringify({
      status,
      ...(event === 'Stop' ? { sessionId: hook.session_id, turnId: hook.turn_id, transcriptPath: hook.transcript_path } : {})
    }));
    if (event === 'Stop') process.stdout.write('{}\n');
  } catch { /* The desktop pet is optional; hook must never affect Codex. */ }
});

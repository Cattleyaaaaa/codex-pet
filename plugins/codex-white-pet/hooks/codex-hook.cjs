// Receives Codex lifecycle events and forwards only the status to the local pet.
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { spawn } = require('node:child_process');

function launchPet() {
  const candidates = [];
  if (process.env.PET_EXE) candidates.push(process.env.PET_EXE);
  candidates.push(path.join(process.env.LOCALAPPDATA || '', 'Programs', 'CodexPet', 'CodexPet.exe'));
  const target = candidates.find(candidate => candidate && fs.existsSync(candidate));
  if (!target) return;
  const child = spawn(target, [], {
    cwd: path.dirname(target), detached: true, stdio: 'ignore', windowsHide: true
  });
  child.unref();
}

let input = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', chunk => { input += chunk; });
process.stdin.on('end', () => {
  try {
    const hook = JSON.parse(input);
    const event = hook.hook_event_name;
    const statuses = {
      SessionStart: 'idle', UserPromptSubmit: 'working',
      PermissionRequest: 'waiting', Stop: 'done',
      Interrupt: 'idle', SessionEnd: 'idle'
    };
    const status = statuses[event];
    if (!status) return;

    const bridgeFile = process.env.PET_BRIDGE_FILE || path.join(
      process.env.APPDATA || '', 'codex-white-pet', 'bridge.json'
    );
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
  } catch { /* Pet failures must never interrupt Codex. */ }
});

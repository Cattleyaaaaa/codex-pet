const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const readline = require('node:readline');

function findCodexExecutable() {
  if (process.platform !== 'win32') return 'codex';
  for (const directory of (process.env.PATH || '').split(path.delimiter)) {
    if (!directory) continue;
    const executable = path.join(directory.replace(/^"|"$/g, ''), 'codex.exe');
    if (fs.existsSync(executable)) return executable;
  }
  const codexBin = path.join(process.env.LOCALAPPDATA || '', 'OpenAI', 'Codex', 'bin');
  try {
    for (const directory of fs.readdirSync(codexBin, { withFileTypes: true })) {
      if (!directory.isDirectory()) continue;
      const executable = path.join(codexBin, directory.name, 'codex.exe');
      if (fs.existsSync(executable)) return executable;
    }
  } catch {}
  return null;
}

function quotaWindows(result) {
  const buckets = result?.rateLimitsByLimitId;
  const selected = buckets?.codex || result?.rateLimits;
  if (!selected) return [];
  return [selected.primary, selected.secondary]
    .filter(window => window && Number.isFinite(window.usedPercent) && Number.isFinite(window.windowDurationMins))
    .map(window => ({
      remainingPercent: Math.max(0, Math.min(100, Math.round((100 - window.usedPercent) * 10) / 10)),
      windowDurationMins: window.windowDurationMins,
      resetsAt: Number.isFinite(window.resetsAt) ? window.resetsAt : null
    }));
}

function readRateLimits() {
  return new Promise((resolve, reject) => {
    const executable = findCodexExecutable();
    if (!executable) return reject(new Error('Codex CLI is unavailable'));
    const child = spawn(executable, ['app-server'], { windowsHide: true, stdio: ['pipe', 'pipe', 'ignore'] });
    let finished = false;
    const finish = (error, value) => {
      if (finished) return;
      finished = true;
      clearTimeout(timeout);
      lines.close();
      child.kill();
      if (error) reject(error);
      else resolve(value);
    };
    const send = message => child.stdin.write(`${JSON.stringify(message)}\n`);
    const lines = readline.createInterface({ input: child.stdout });
    const timeout = setTimeout(() => finish(new Error('Rate limit request timed out')), 12000);
    child.on('error', error => finish(error));
    child.on('exit', () => finish(new Error('Codex app-server exited before responding')));
    lines.on('line', line => {
      let message;
      try { message = JSON.parse(line); } catch { return; }
      if (message.id === 1) {
        if (message.error) return finish(new Error('Codex app-server initialization failed'));
        send({ method: 'initialized', params: {} });
        send({ method: 'account/rateLimits/read', id: 2 });
      } else if (message.id === 2) {
        if (message.error) return finish(new Error('Rate limits are unavailable'));
        const windows = quotaWindows(message.result);
        if (!windows.length) return finish(new Error('No ChatGPT rate limit windows were returned'));
        finish(null, { windows, fetchedAt: Date.now() });
      }
    });
    send({
      method: 'initialize', id: 1,
      params: { clientInfo: { name: 'codex_white_pet', title: '小龙娘', version: '0.1.0' } }
    });
  });
}

module.exports = { readRateLimits };

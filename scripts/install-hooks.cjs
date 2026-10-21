// Adds only this pet's hook entries to the user's existing Codex hooks.json.
const fs = require('node:fs');
const path = require('node:path');
const codexHome = process.env.CODEX_HOME || path.join(process.env.USERPROFILE || '', '.codex');
const destination = path.join(codexHome, 'hooks.json');
const command = `node "${path.join(__dirname, 'codex-hook.cjs')}"`;
const events = ['SessionStart', 'UserPromptSubmit', 'PermissionRequest', 'Stop', 'Interrupt', 'SessionEnd'];
let data = {};
if (fs.existsSync(destination)) {
  data = JSON.parse(fs.readFileSync(destination, 'utf8'));
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('Existing hooks.json must contain an object.');
  fs.copyFileSync(destination, `${destination}.bak-${Date.now()}`);
}
data.hooks ||= {};
for (const event of events) {
  data.hooks[event] ||= [];
  if (!Array.isArray(data.hooks[event])) throw new Error(`${event} must be an array.`);
  const alreadyInstalled = data.hooks[event].some(group =>
    group?.hooks?.some(hook => typeof hook.command === 'string' && hook.command.includes(path.join(__dirname, 'codex-hook.cjs'))));
  if (!alreadyInstalled) data.hooks[event].push({ hooks: [{ type: 'command', command, timeout: 2 }] });
}
fs.mkdirSync(codexHome, { recursive: true });
fs.writeFileSync(destination, JSON.stringify(data, null, 2) + '\n');
console.log(`Codex hooks installed in ${destination}`);
console.log('Review and trust them with /hooks in the Codex CLI.');

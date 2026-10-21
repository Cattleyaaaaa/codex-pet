const path = require('node:path');
const hook = path.join(__dirname, 'codex-hook.cjs');
const command = `node "${hook}"`;
const events = ['SessionStart', 'UserPromptSubmit', 'PermissionRequest', 'Stop', 'Interrupt', 'SessionEnd'];
const config = {
  description: 'Send Codex lifecycle states to the local white-haired desktop pet.',
  hooks: Object.fromEntries(events.map(event => [event, [{ hooks: [{ type: 'command', command, timeout: 2 }] }]]))
};
console.log(JSON.stringify(config, null, 2));

const fs = require('node:fs');
const path = require('node:path');

// Codex transcript records are an optional local source, not a stable public API.
function readTurnUsage(transcriptPath, turnId) {
  if (typeof transcriptPath !== 'string' || !path.isAbsolute(transcriptPath) || path.extname(transcriptPath) !== '.jsonl') return null;
  if (typeof turnId !== 'string' || !/^[\w-]{8,100}$/.test(turnId)) return null;
  let handle;
  try {
    const stat = fs.statSync(transcriptPath);
    if (!stat.isFile() || stat.size === 0) return null;
    handle = fs.openSync(transcriptPath, 'r');
    const length = Math.min(stat.size, 16 * 1024 * 1024);
    const buffer = Buffer.alloc(length);
    fs.readSync(handle, buffer, 0, length, stat.size - length);
    const lines = buffer.toString('utf8').split(/\r?\n/);
    if (length < stat.size) lines.shift();
    for (let index = lines.length - 1; index >= 0; index--) {
      let record;
      try { record = JSON.parse(lines[index]); } catch { continue; }
      if (record.type !== 'token_usage_record' || record.payload?.turn_id !== turnId) continue;
      const usage = record.payload.turn_token_usage;
      if (!usage) return null;
      const fields = ['input_tokens', 'cached_input_tokens', 'output_tokens', 'total_tokens'];
      if (fields.some(field => !Number.isSafeInteger(usage[field]) || usage[field] < 0)) return null;
      return {
        inputTokens: usage.input_tokens,
        cachedInputTokens: usage.cached_input_tokens,
        outputTokens: usage.output_tokens,
        totalTokens: usage.total_tokens
      };
    }
  } catch { return null; }
  finally { if (handle !== undefined) try { fs.closeSync(handle); } catch {} }
  return null;
}

module.exports = { readTurnUsage };

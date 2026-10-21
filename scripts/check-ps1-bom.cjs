#!/usr/bin/env node
// 检查 .ps1 是否带 UTF-8 BOM。
// Windows PowerShell 5.1 读无 BOM 的 .ps1 时会按 ANSI 解码，
// 里面的中文注释/字符串会变成乱码，往往直接报「意外的标记」解析失败。
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const roots = [root, path.join(root, 'scripts')];

const files = [];
for (const dir of roots) {
  if (!fs.existsSync(dir)) continue;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isFile() && entry.name.toLowerCase().endsWith('.ps1')) {
      files.push(path.join(dir, entry.name));
    }
  }
}

const bad = [];
for (const file of files) {
  const buf = fs.readFileSync(file);
  const hasBom = buf.length >= 3 && buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf;
  if (!hasBom) bad.push(path.relative(root, file));
}

if (bad.length > 0) {
  console.error('以下 .ps1 缺少 UTF-8 BOM，PowerShell 5.1 会把中文读成乱码：');
  for (const file of bad) console.error(`  ${file}`);
  console.error('修法（PowerShell）：');
  console.error('  $p = "<文件>"; $t = [System.IO.File]::ReadAllText($p, [System.Text.Encoding]::UTF8)');
  console.error('  [System.IO.File]::WriteAllText($p, $t, (New-Object System.Text.UTF8Encoding($true)))');
  process.exit(1);
}

console.log(`PowerShell 编码检查通过（${files.length} 个 .ps1 均带 BOM）`);

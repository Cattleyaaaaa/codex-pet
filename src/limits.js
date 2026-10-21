const content = document.getElementById('content');
const refresh = document.getElementById('refresh');
let windows = [];

function periodLabel(minutes) {
  if (minutes === 10080) return '每周';
  if (minutes % 1440 === 0) return `${minutes / 1440} 天`;
  if (minutes % 60 === 0) return `${minutes / 60} 小时`;
  return `${minutes} 分钟`;
}
function resetLabel(resetsAt) {
  if (!Number.isFinite(resetsAt)) return '重置时间暂不可读';
  const remaining = Math.max(0, Math.ceil((resetsAt * 1000 - Date.now()) / 60000));
  if (remaining === 0) return '即将重置';
  const days = Math.floor(remaining / 1440);
  const hours = Math.floor((remaining % 1440) / 60);
  const minutes = remaining % 60;
  const parts = [];
  if (days) parts.push(`${days} 天`);
  if (hours) parts.push(`${hours} 小时`);
  if (minutes && !days) parts.push(`${minutes} 分`);
  return `${parts.join(' ')}后重置`;
}
function render() {
  content.replaceChildren();
  for (const window of windows) {
    const percent = Math.max(0, Math.min(100, Number(window.remainingPercent)));
    const value = Number.isInteger(percent) ? String(percent) : percent.toFixed(1);
    const row = document.createElement('section');
    row.className = 'quota';
    const top = document.createElement('div');
    top.className = 'quota-top';
    const label = document.createElement('span');
    label.className = 'quota-label';
    label.textContent = periodLabel(window.windowDurationMins);
    const amount = document.createElement('strong');
    amount.className = 'quota-percent';
    amount.textContent = `${value}%`;
    const bar = document.createElement('div');
    bar.className = 'bar';
    bar.setAttribute('role', 'progressbar');
    bar.setAttribute('aria-label', `${label.textContent}剩余额度`);
    bar.setAttribute('aria-valuemin', '0');
    bar.setAttribute('aria-valuemax', '100');
    bar.setAttribute('aria-valuenow', value);
    const fill = document.createElement('div');
    fill.className = 'bar-fill';
    fill.style.width = `${percent}%`;
    const reset = document.createElement('div');
    reset.className = 'reset';
    reset.textContent = resetLabel(window.resetsAt);
    top.append(label, amount);
    bar.append(fill);
    row.append(top, bar, reset);
    content.append(row);
  }
}
function message(text) {
  windows = [];
  content.replaceChildren();
  const node = document.createElement('div');
  node.className = 'message';
  node.textContent = text;
  content.append(node);
}

window.petLimits.onReport(report => {
  if (report?.loading) return message('正在读取剩余额度…');
  if (!Array.isArray(report?.windows) || !report.windows.length) return message('暂时无法读取额度，请稍后刷新');
  windows = report.windows.filter(item => Number.isFinite(item.remainingPercent) && Number.isFinite(item.windowDurationMins));
  if (!windows.length) return message('暂时无法读取额度，请稍后刷新');
  render();
});
window.petLimits.onPlacement(placement => {
  document.body.className = ['above', 'below', 'side'].includes(placement) ? placement : 'side';
});
refresh.addEventListener('click', () => window.petLimits.refresh());
document.getElementById('close').addEventListener('click', () => window.petLimits.close());
window.addEventListener('keydown', event => { if (event.key === 'Escape') window.petLimits.close(); });
setInterval(() => { if (windows.length) render(); }, 30000);

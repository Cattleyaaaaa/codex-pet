const fields = ['gravity', 'restitution', 'groundFriction', 'throwPower'];
const message = document.getElementById('message');

function readForm() {
  return {
    gravity: Number(document.getElementById('gravity').value),
    restitution: Number(document.getElementById('restitution').value),
    groundFriction: Number(document.getElementById('groundFriction').value),
    throwPower: Number(document.getElementById('throwPower').value),
    ceilingBounce: document.getElementById('ceilingBounce').checked,
    autoStart: document.getElementById('autoStart').checked
  };
}
function applyForm(config) {
  if (!config) return;
  for (const key of fields) document.getElementById(key).value = config[key];
  document.getElementById('ceilingBounce').checked = config.ceilingBounce;
  document.getElementById('autoStart').checked = config.autoStart === true;
}
async function save() {
  const config = await window.petSettings.save(readForm());
  if (!config) return;
  applyForm(config);
  message.textContent = '已保存';
  setTimeout(() => { message.textContent = ''; }, 1800);
}

document.getElementById('save').addEventListener('click', () => save().catch(() => { message.textContent = '保存失败'; }));
document.getElementById('test').addEventListener('click', async () => {
  await save();
  window.petSettings.test();
});
document.getElementById('close').addEventListener('click', () => window.petSettings.close());
window.petSettings.onConfig(applyForm);
window.petSettings.get().then(applyForm).catch(() => {});

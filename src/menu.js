const menuShell = document.getElementById('menu-shell');
const groupList = document.getElementById('group-list');
const categoryList = document.getElementById('category-list');
const actionList = document.getElementById('action-list');
const roamButton = document.getElementById('roam');
const roamCheck = document.getElementById('roam-check');
const statusChip = document.getElementById('status-chip');
const STATUS_LABELS = { idle: '待机', working: '工作', waiting: '等待', done: '完成', error: '出错' };
let state;
let menuLevel = 0;
let selectedGroup = 'idle';
let actionEntry;

function setLevel(level) {
  if (menuLevel === level) return;
  menuLevel = level;
  menuShell.classList.toggle('level-1', level === 1);
  menuShell.classList.toggle('level-2', level === 2);
  actionEntry?.classList.toggle('active', level > 0);
  actionEntry?.setAttribute('aria-expanded', String(level > 0));
  if (level < 2) {
    for (const button of categoryList.children) {
      button.classList.remove('active');
      button.setAttribute('aria-expanded', 'false');
    }
  }
  window.petMenu.level(level);
}

function selectCategory(id) {
  const group = state?.groups.find(item => item.id === id);
  if (!group) return;
  selectedGroup = id;
  for (const button of categoryList.children) {
    const active = button.dataset.group === id;
    button.classList.toggle('active', active);
    button.setAttribute('aria-expanded', String(active));
  }
  actionList.replaceChildren();
  const head = document.createElement('div');
  head.className = 'action-head';
  const headTitle = document.createElement('span');
  headTitle.className = 'action-head-title';
  headTitle.textContent = group.label;
  const headCount = document.createElement('span');
  headCount.className = 'action-head-count';
  headCount.textContent = `${group.actions.length} 个动作`;
  head.append(headTitle, headCount);
  actionList.append(head);
  for (const action of group.actions) {
    const button = document.createElement('button');
    button.className = 'menu-row';
    button.type = 'button';
    button.textContent = action.label;
    button.addEventListener('click', () => window.petMenu.command('action', action.key));
    actionList.append(button);
  }
  actionList.scrollTop = 0;
}

function render(nextState) {
  if (!nextState) return;
  state = nextState;
  statusChip.textContent = STATUS_LABELS[state.status] || '待机';
  statusChip.dataset.status = state.status || 'idle';
  menuLevel = state.level || 0;
  menuShell.classList.toggle('open-left', Boolean(state.openLeft));
  menuShell.classList.toggle('level-1', menuLevel === 1);
  menuShell.classList.toggle('level-2', menuLevel === 2);
  roamButton.disabled = !state.roamAvailable;
  roamButton.title = state.roamAvailable ? '' : '缺少跑动视频';
  roamCheck.classList.toggle('on', state.roamEnabled);
  if (!state.groups.some(group => group.id === selectedGroup)) selectedGroup = state.groups[0]?.id;
  groupList.replaceChildren();
  categoryList.replaceChildren();
  actionList.replaceChildren();

  for (const item of state.commands || []) {
    const button = document.createElement('button');
    button.className = 'menu-row command-row';
    button.type = 'button';
    button.textContent = item.label;
    button.addEventListener('mouseenter', () => setLevel(0));
    button.addEventListener('focus', () => setLevel(0));
    button.addEventListener('click', () => window.petMenu.command(item.command, item.key));
    groupList.append(button);
  }

  actionEntry = document.createElement('button');
  actionEntry.className = `menu-row action-entry${menuLevel > 0 ? ' active' : ''}`;
  actionEntry.type = 'button';
  actionEntry.setAttribute('aria-haspopup', 'true');
  actionEntry.setAttribute('aria-expanded', String(menuLevel > 0));
  const label = document.createElement('span');
  label.className = 'row-label';
  label.textContent = '动作';
  const chevron = document.createElement('span');
  chevron.className = 'chevron';
  chevron.textContent = state.openLeft ? '‹' : '›';
  chevron.setAttribute('aria-hidden', 'true');
  actionEntry.append(label, chevron);
  actionEntry.addEventListener('mouseenter', () => setLevel(1));
  actionEntry.addEventListener('focus', () => setLevel(1));
  actionEntry.addEventListener('click', () => setLevel(1));
  groupList.append(actionEntry);

  for (const group of state.groups) {
    const button = document.createElement('button');
    button.className = 'menu-row';
    button.type = 'button';
    button.dataset.group = group.id;
    button.setAttribute('aria-haspopup', 'true');
    button.setAttribute('aria-expanded', 'false');
    const categoryName = document.createElement('span');
    categoryName.className = 'row-label';
    categoryName.textContent = group.label;
    const count = document.createElement('span');
    count.className = 'row-count';
    count.textContent = String(group.actions.length);
    const arrow = document.createElement('span');
    arrow.className = 'chevron';
    arrow.textContent = state.openLeft ? '‹' : '›';
    arrow.setAttribute('aria-hidden', 'true');
    button.append(categoryName, count, arrow);
    button.addEventListener('mouseenter', () => { setLevel(2); selectCategory(group.id); });
    button.addEventListener('focus', () => { setLevel(2); selectCategory(group.id); });
    button.addEventListener('click', () => { setLevel(2); selectCategory(group.id); });
    categoryList.append(button);
  }
  if (selectedGroup) selectCategory(selectedGroup);
  if (menuLevel < 2) {
    for (const button of categoryList.children) {
      button.classList.remove('active');
      button.setAttribute('aria-expanded', 'false');
    }
  }
}

document.getElementById('hide').addEventListener('click', () => window.petMenu.command('hide'));
roamButton.addEventListener('click', () => window.petMenu.command('roam'));
document.querySelector('.primary-footer').addEventListener('mouseenter', () => setLevel(0));
menuShell.addEventListener('mouseleave', () => setLevel(0));
document.addEventListener('keydown', event => {
  if (event.key === 'Escape') window.petMenu.command('close');
});
window.petMenu.onState(render);
window.petMenu.getState().then(render);

const petElement = document.getElementById('pet');
const figure = document.getElementById('figure');
const bubble = document.getElementById('bubble');
const character = document.getElementById('character');
const motion = document.getElementById('motion');
const motionNext = document.getElementById('motion-next');
// This transparent reference matches the approved hands-at-sides design.
// Video failures must not switch back to the old crossed-sleeves illustrations.
const animationFiles = Object.fromEntries([
  'idle', 'working', 'waiting', 'done', 'error', 'hello', 'thinking',
  'celebrate', 'cheer', 'sleep', 'run-left', 'run-right'
].map(key => [key, '../assets/pet-reference-sleeves-fixed.png']));
const statuses = new Set(['idle', 'working', 'waiting', 'done', 'error']);
let pointerId = null;
let dragLastX = 0;
let dragLastY = 0;
let dragStartX = 0;
let dragStartY = 0;
let dragMoved = false;
// Keep in sync with DRAG_START_THRESHOLD in main.cjs.
const DRAG_START_THRESHOLD = 5;
let bubbleTimer;
let jellyTimer;
let usageVisibleUntil = 0;
let actionTimer;
let idleActionTimer;
let statusVariantTimer;
let motionFallbackTimer;
let transitionCleanupTimer;
const MOTION_FADE_MS = 320;
let activeMotion = null;
let currentVideo = null;
let motionRequest = 0;
let extraClips = new Set();
const statusVariantIndex = { idle: 0, working: 0, waiting: 0 };
const randomClipBags = { idle: [], working: [], waiting: [] };
let clickActionIndex = 0;
let statusNow = 'idle';
let walkingNow = false;
let motionBusy = false;
let directionNow = 1;
// 漫游直接播完整源片：站立 → 起跑 → 跑 → 收步 → 站立，一次走完 ~10 秒。
const RUN_KEYS = new Set(['run', 'run-loop']);
let animationSequence = 0;
function lockVisualSize(contentSize) {
  if (Number.isFinite(contentSize) && contentSize > 0) {
    petElement.style.setProperty('--pet-visual-size', `${contentSize * 0.94}px`);
  }
}
// Legacy asset keys are kept so the existing WebM files keep playing; several
// are imprecise (idle-soft-blink is a horn wiggle, idle-sleeve-show is hands-on-hips).
const motionClips = {
  // Legacy celebrate.webm has extra generated hands; use cheer until replaced.
  idle: 'idle-loop.webm', working: 'working-loop.webm', waiting: 'waiting-loop.webm', done: 'cheer.webm', error: 'error-recover.webm',
  hello: 'hello.webm', thinking: 'thinking-loop.webm', celebrate: 'cheer.webm', cheer: 'cheer.webm', sleep: 'sleep-loop.webm', run: 'run-loop.webm',
  'run-loop': 'run-loop.webm',
  'idle-lookaround-loop': 'idle-lookaround-loop.webm', 'idle-stretch': 'idle-stretch.webm', 'idle-tail-play': 'idle-tail-play.webm',
  'idle-wing-flutter': 'idle-wing-flutter.webm', 'idle-hair-fix': 'idle-hair-fix.webm',
  'idle-wing-flutter-alt': 'idle-wing-flutter-alt.webm',
  'idle-bow': 'idle-bow.webm', 'idle-hop': 'idle-hop.webm',
  'working-focus-loop': 'working-focus-loop.webm', 'working-nod-loop': 'working-nod-loop.webm',
  'waiting-lookaround-loop': 'waiting-lookaround-loop.webm', 'waiting-foot-tap-loop': 'waiting-foot-tap-loop.webm',
  'idle-hum-loop': 'idle-hum-loop.webm', 'idle-tail-curl-loop': 'idle-tail-curl-loop.webm',
  'idle-gentle-nod-loop': 'idle-gentle-nod-loop.webm', 'idle-sparkle-smile': 'idle-sparkle-smile.webm',
  'idle-cheek-wave': 'idle-cheek-wave.webm', 'idle-mini-dance': 'idle-mini-dance.webm',
  'idle-shy': 'idle-shy.webm', 'idle-sneeze': 'idle-sneeze.webm',
  'idle-sleeve-show': 'idle-sleeve-show.webm', 'idle-wave-smile': 'idle-wave-smile.webm',
  'idle-curious-lean': 'idle-curious-lean.webm', 'idle-dragon-roar': 'idle-dragon-roar.webm',
  'idle-tiptoe': 'idle-tiptoe.webm',
  'working-pause-loop': 'working-pause-loop.webm', 'working-compare-loop': 'working-compare-loop.webm',
  'working-keyboard-loop': 'working-keyboard-loop.webm',
  'working-idea-loop': 'working-idea-loop.webm', 'waiting-hopeful-loop': 'waiting-hopeful-loop.webm',
  'waiting-question': 'waiting-question.webm', 'waiting-reassure': 'waiting-reassure.webm',
  'done-relief': 'done-relief.webm', 'done-thankful': 'done-thankful.webm',
  'done-proud': 'done-proud.webm', 'error-surprised': 'error-surprised.webm',
  'error-refocus': 'error-refocus.webm',
  'idle-soft-blink': 'idle-soft-blink.webm', 'idle-headpiece-touch': 'idle-headpiece-touch.webm',
  'idle-tail-startle': 'idle-tail-startle.webm', 'idle-laugh': 'idle-laugh.webm',
  'idle-pout': 'idle-pout.webm', 'idle-step-in-place': 'idle-step-in-place.webm',
  'idle-wave-long': 'idle-wave-long.webm', 'idle-tail-sway': 'idle-tail-sway.webm',
  'done-arms-up-cheer': 'done-arms-up-cheer.webm',
  'idle-face-touch': 'idle-face-touch.webm', 'idle-wing-open': 'idle-wing-open.webm',
  'idle-small-bow': 'idle-small-bow.webm', 'idle-doze': 'idle-doze.webm',
  'working-glance': 'working-glance.webm', 'working-chin-think': 'working-chin-think.webm',
  'working-think-gesture': 'working-think-gesture.webm', 'working-trace-idea': 'working-trace-idea.webm',
  'done-present-result': 'done-present-result.webm', 'waiting-calm-breath': 'waiting-calm-breath.webm',
  'waiting-small-gesture': 'waiting-small-gesture.webm', 'waiting-reassure-gesture': 'waiting-reassure-gesture.webm',
  'done-small-cheer': 'done-small-cheer.webm',
  'done-quiet-cheer': 'done-quiet-cheer.webm', 'done-fist-cheer': 'done-fist-cheer.webm',
  'waiting-open-hands': 'waiting-open-hands.webm', 'error-oops': 'error-oops.webm',
  'error-nervous': 'error-nervous.webm', 'error-try-again': 'error-try-again.webm',
  'idle-clasp-laugh': 'idle-clasp-laugh.webm',
  'idle-clasp-hope': 'idle-clasp-hope.webm', 'idle-shy-tilt': 'idle-shy-tilt.webm',
  'idle-peace-sign': 'idle-peace-sign.webm', 'idle-forehead-touch': 'idle-forehead-touch.webm',
  'idle-hair-tuck': 'idle-hair-tuck.webm', 'hello-both-hands': 'hello-both-hands.webm',
  'hello-small-wave': 'hello-small-wave.webm', 'done-thumbs-up': 'done-thumbs-up.webm',
  'done-open-arms': 'done-open-arms.webm',
  'working-organize': 'working-organize.webm', 'working-doodle': 'working-doodle.webm'
};
const statusLoopKeys = {
  idle: ['idle', 'idle-hum-loop', 'idle-gentle-nod-loop'],
  working: ['working', 'thinking', 'working-focus-loop', 'working-nod-loop', 'working-pause-loop', 'working-idea-loop', 'working-keyboard-loop'],
  waiting: ['waiting', 'waiting-foot-tap-loop', 'waiting-hopeful-loop']
};

function resetVideo(video) {
  video.oncanplay = null;
  video.onerror = null;
  video.onended = null;
  video.pause();
  video.classList.remove('visible');
  video.classList.remove('facing-left');
  video.removeAttribute('src');
  video.load();
}
function playMotion(key, { loop = false, fallbackMs = 7000, restoreStatus = false, onEnd = null } = {}) {
  const filename = motionClips[key];
  if (!filename) return false;
  const request = ++motionRequest;
  motionBusy = restoreStatus;
  window.pet.setMotionBusy(motionBusy);
  clearTimeout(motionFallbackTimer);
  clearTimeout(transitionCleanupTimer);
  const incoming = currentVideo === motion ? motionNext : motion;
  resetVideo(incoming);
  incoming.classList.toggle('facing-left', RUN_KEYS.has(key) && directionNow < 0);
  activeMotion = key;
  const source = `../assets/animations/${filename}`;
  incoming.loop = loop;
  incoming.src = source;
  let started = false;
  const finish = () => {
    if (request !== motionRequest) return;
    clearTimeout(motionFallbackTimer);
    motionBusy = false;
    window.pet.setMotionBusy(false);
    if (restoreStatus) playStatusMotion();
    else activeMotion = null;
    if (onEnd) onEnd();
  };
  const fail = () => {
    if (request !== motionRequest) return;
    clearTimeout(motionFallbackTimer);
    motionBusy = false;
    window.pet.setMotionBusy(false);
    resetVideo(incoming);
    if (!currentVideo) character.classList.remove('video-hidden');
    if (extraClips.delete(key)) {
      if (key === 'cheer') playMotion('cheer', { fallbackMs, restoreStatus });
      else playStatusMotion();
    } else if (restoreStatus) playStatusMotion();
    else {
      activeMotion = null;
      if (!currentVideo) character.classList.remove('video-hidden');
    }
  };
  incoming.oncanplay = () => {
    if (request !== motionRequest || started) return;
    started = true;
    const startIncoming = () => {
      if (request !== motionRequest) return;
      incoming.play().then(() => {
        if (request !== motionRequest) return;
        let committed = false;
        const reveal = () => {
          if (committed || request !== motionRequest) return;
          committed = true;
          clearTimeout(motionFallbackTimer);
          const outgoing = currentVideo;
          incoming.classList.add('visible');
          incoming.dataset.current = 'true';
          character.classList.add('video-hidden');
          currentVideo = incoming;
          if (outgoing && outgoing !== incoming) {
            outgoing.classList.remove('visible');
            delete outgoing.dataset.current;
            transitionCleanupTimer = setTimeout(() => resetVideo(outgoing), MOTION_FADE_MS + 40);
          }
        };
        if (incoming.requestVideoFrameCallback) incoming.requestVideoFrameCallback(reveal);
        setTimeout(reveal, 350);
      }).catch(fail);
    };
    // Keep the current clip visible until the incoming clip has decoded its
    // first frame. reveal() then cross-fades both clips together.
    startIncoming();
  };
  incoming.onerror = fail;
  incoming.onended = () => { if (!loop) finish(); };
  incoming.load();
  motionFallbackTimer = setTimeout(fail, fallbackMs);
  return true;
}
// 完整漫游片段约 10.04 秒，漫游距离由主进程按片长换算，所以这里只播一次；
// 万一漫游还没结束片段就播完了，就从头再来一遍。
function playRun() {
  return playMotion('run', {
    loop: false,
    fallbackMs: 11000,
    onEnd: () => {
      if (walkingNow && statusNow === 'idle') playRun();
      else playStatusMotion();
    }
  });
}
function playStatusMotion() {
  clearTimeout(statusVariantTimer);
  if (walkingNow && statusNow === 'idle') {
    if (!(activeMotion && RUN_KEYS.has(activeMotion))) playRun();
    return;
  }
  if (statusNow === 'idle' || statusNow === 'working' || statusNow === 'waiting') {
    const variants = statusLoopKeys[statusNow].filter(key => !key.includes('-') || extraClips.has(key));
    const key = variants.length > 1
      ? statusNow === 'idle'
        ? variants[Math.floor(Math.random() * variants.length)]
        : variants[statusVariantIndex[statusNow]++ % variants.length]
      : statusNow;
    playMotion(key, { loop: true, fallbackMs: 3000 });
    if (variants.length > 1) {
      const status = statusNow;
      statusVariantTimer = setTimeout(() => {
        if (statusNow === status && activeMotion === key) playStatusMotion();
      }, 8100);
    }
  } else {
    const variants = statusNow === 'done'
      ? ['done', ...['done-relief', 'done-thankful', 'done-proud', 'done-arms-up-cheer', 'done-present-result', 'done-small-cheer', 'done-quiet-cheer', 'done-fist-cheer', 'done-thumbs-up'].filter(key => extraClips.has(key))]
      : statusNow === 'error'
        ? ['error', ...['error-surprised', 'error-refocus', 'error-oops', 'error-nervous', 'error-try-again'].filter(key => extraClips.has(key))]
        : [statusNow];
    playMotion(variants[Math.floor(Math.random() * variants.length)], { fallbackMs: 3000 });
  }
}

function showAnimation(key) {
  const filename = animationFiles[key] || animationFiles.idle;
  const source = `${filename}?state=${++animationSequence}`;
  character.classList.toggle('directional', key === 'run-left' || key === 'run-right');
  character.classList.toggle('facing-left', key === 'run-left');
  character.src = source;
  character.dataset.animation = key;
}
function showCurrentAnimation() {
  if (walkingNow && statusNow === 'idle') showAnimation(directionNow < 0 ? 'run-left' : 'run-right');
  else showAnimation(statusNow);
}

let lastBubbleText = '';
const statusLines = {
  working: ['正在认真处理…', '让我理一下思路。', '这一段快好了。'],
  waiting: ['这里需要你确认一下。', '我在等你的许可。', '不急，你慢慢来。'],
  done: ['这一轮完成啦！', '搞定，辛苦啦！', '写完啦，看看结果？'],
  error: ['遇到一点问题…', '这里卡住了。', '我先缓一缓。']
};
function pickLine(lines) {
  if (!Array.isArray(lines) || !lines.length) return '';
  const candidates = lines.length > 1 ? lines.filter(line => line !== lastBubbleText) : lines;
  const line = candidates[Math.floor(Math.random() * candidates.length)] || lines[0];
  lastBubbleText = line;
  return line;
}
function say(message, duration = 5000, tone = 'idle') {
  if (!message) return;
  bubble.textContent = message;
  bubble.dataset.tone = tone;
  bubble.classList.add('visible');
  bubble.classList.remove('bump');
  void bubble.offsetWidth;
  bubble.classList.add('bump');
  clearTimeout(bubbleTimer);
  bubbleTimer = setTimeout(() => bubble.classList.remove('visible'), duration);
}
function announceTurnUsage(report) {
  const total = report?.usage?.totalTokens;
  const message = Number.isSafeInteger(total)
    ? `本轮用了 ${total.toLocaleString('zh-CN')} Token`
    : report?.history ? '暂无用量记录' : '本轮完成，用量暂不可读';
  usageVisibleUntil = Date.now() + 10000;
  say(message, 10000, 'usage');
}
function setStatus(status) {
  statusNow = status;
  if (status === 'working') usageVisibleUntil = 0;
  clearTimeout(actionTimer);
  petElement.classList.remove('poked', 'thinking', 'celebrating', 'cheering', 'sleeping', 'idle-action');
  petElement.classList.remove('idle', 'working', 'waiting', 'done', 'error');
  petElement.classList.add(status);
  const pose = statuses.has(status) ? status : 'idle';
  showAnimation(pose);
  const lines = statusLines[status];
  if (lines) say(pickLine(lines), status === 'waiting' ? 8000 : 5500, status);
  else if (status !== 'idle' || Date.now() >= usageVisibleUntil) bubble.classList.remove('visible');
  playStatusMotion();
}
function jelly(impactSpeed = 1200) {
  const strength = Math.min(1, Math.max(0.2, Math.abs(Number(impactSpeed) || 0) / 1400));
  figure.style.setProperty('--jelly-wide', (1 + 0.08 * strength).toFixed(3));
  figure.style.setProperty('--jelly-flat', (1 - 0.15 * strength).toFixed(3));
  figure.style.setProperty('--jelly-narrow', (1 - 0.07 * strength).toFixed(3));
  figure.style.setProperty('--jelly-tall', (1 + 0.12 * strength).toFixed(3));
  figure.style.setProperty('--jelly-tilt-a', `${(-1.6 * strength).toFixed(2)}deg`);
  figure.style.setProperty('--jelly-tilt-b', `${(1.3 * strength).toFixed(2)}deg`);
  clearTimeout(jellyTimer);
  figure.classList.remove('jelly');
  void figure.offsetWidth;
  figure.classList.add('jelly');
  jellyTimer = setTimeout(() => figure.classList.remove('jelly'), 800);
}
function poke() {
  jelly();
  const choices = statusNow === 'working'
    ? ['hello', 'thinking', 'cheer', 'working-idea-loop']
    : statusNow === 'waiting'
      ? ['hello', 'cheer', 'idle-stretch', 'waiting-question', 'waiting-reassure']
      : ['hello', 'cheer', 'idle-stretch', 'idle-tail-play', 'thinking', 'idle-wing-flutter', 'idle-wing-flutter-alt', 'idle-hair-fix', 'idle-bow', 'idle-hop', 'idle-cheek-wave', 'idle-mini-dance', 'idle-shy', 'idle-sneeze', 'idle-sleeve-show', 'idle-wave-smile', 'idle-curious-lean', 'idle-dragon-roar', 'idle-tiptoe', 'hello-both-hands', 'idle-peace-sign'];
  const available = choices.filter(key => !key.includes('-') || extraClips.has(key));
  playAction(available[clickActionIndex++ % available.length]);
}
const actions = {
  idle: ['陪你待一会儿。', '我就安静待着。', '需要我时叫我。'],
  hello: ['我在这里。', '有什么新任务？', '一起写点代码吧。', '今天也一起加油。'],
  thinking: ['让我想想……', '这个得琢磨一下。', '嗯……有思路了。'],
  celebrate: ['完成啦！', '这次很顺利。', '收工，辛苦啦。'],
  cheer: ['做得不错！', '再往前一点。', '我陪你一起。'],
  sleep: ['我眯一小会儿……', '呼……休息一下。'],
  run: ['跑两步！', '出发！'],
  working: ['认真写代码中。', '这一段快好了。', '别催，正在想。'],
  waiting: ['我在等你。', '不急，你慢慢来。', '需要你确认一下。'],
  error: ['先缓一缓。', '这里有点不对。', '我再看一眼。'],
  'idle-lookaround-loop': ['看看周围。', '好像有人在叫我？'],
  'idle-hum-loop': ['闭上眼，轻轻晃。', '这样晃一晃。'],
  'idle-gentle-nod-loop': ['嗯嗯。', '我在听。'],
  'idle-sparkle-smile': ['今天也要开心。', '笑一笑。'],
  'idle-stretch': ['困得打个哈欠……', '伸个懒腰清醒一下。'],
  'idle-tail-play': ['尾巴绕到前面来了。', '抓住尾巴啦。'],
  'idle-wing-flutter': ['翅膀轻轻扇一扇。', '风有点大。'],
  'idle-wing-flutter-alt': ['张开小翅膀。', '扑棱扑棱。'],
  'idle-hair-fix': ['整理一下头发。', '发丝有点乱。'],
  'idle-bow': ['谢谢你陪我。', '请多关照。'],
  'idle-hop': ['跳一下！', '嘿！'],
  'idle-cheek-wave': ['偷偷打个招呼。', '嘿，看到你啦。'],
  'idle-mini-dance': ['左右踏两步。', '一起动一动？'],
  'idle-shy': ['嘿嘿，有点害羞。', '别一直看啦。'],
  'idle-sneeze': ['用袖口遮一下。', '别看我……'],
  'idle-sleeve-show': ['叉腰，得意一下。', '哼，我很厉害吧？'],
  'idle-wave-smile': ['看到你啦！', '今天过得怎么样？'],
  'idle-curious-lean': ['歪头看看。', '这是什么？'],
  'idle-dragon-roar': ['嗷呜！', '我超凶的。'],
  'idle-tiptoe': ['轻轻挪一步。', '站稳一点。'],
  'idle-tail-curl-loop': ['尾巴慢慢绕个圈。', '看，尾巴会画圈。'],
  'working-idea-loop': ['我想到一个办法！', '有思路了。'],
  'working-focus-loop': ['这一段得盯紧。', '不能分心。'],
  'working-compare-loop': ['左右看看。', '对比一下。'],
  'working-keyboard-loop': ['键盘敲起来。', '写起来写起来。'],
  'working-nod-loop': ['嗯，就这样。', '确认过了。'],
  'working-pause-loop': ['先停一下，想想。', '让我缓一缓。'],
  'waiting-lookaround-loop': ['看看你回来没有。', '应该快了吧？'],
  'waiting-foot-tap-loop': ['等等你。', '脚都等酸了。'],
  'waiting-hopeful-loop': ['合起手，等你回来。', '快回来呀。'],
  'waiting-question': ['要继续吗？', '你来决定。'],
  'waiting-reassure': ['我在这里，别急。', '慢慢来。'],
  'done-relief': ['完成啦，松口气。', '终于好了。'],
  'done-thankful': ['谢谢你一起努力。', '辛苦啦。'],
  'done-proud': ['我做到了！', '夸夸我。'],
  'error-surprised': ['咦，怎么了？', '吓我一跳。'],
  'error-refocus': ['抬头再看一眼。', '重新来。'],
  'idle-soft-blink': ['动动角。', '龙角有点痒。'],
  'idle-headpiece-touch': ['确认一下头饰。', '没歪吧？'],
  'idle-tail-startle': ['尾巴突然动了一下！', '谁碰我尾巴？'],
  'idle-laugh': ['忍不住笑了。', '太好笑了。'],
  'idle-pout': ['哼，我才没有生气。', '不理你了……才怪。'],
  'idle-wave-long': ['挥挥手，和你打个招呼！', '在这里在这里。'],
  'idle-tail-sway': ['尾巴轻轻晃起来了。', '尾巴有自己的想法。'],
  'done-arms-up-cheer': ['开心地举起双手！', '耶！'],
  'idle-step-in-place': ['原地换换脚。', '站一会儿。'],
  'idle-face-touch': ['摸摸脸侧。', '脸有点热。'],
  'idle-wing-open': ['展开小翅膀。', '其实我翅膀不小。'],
  'idle-small-bow': ['向你轻轻点头。', '失礼啦。'],
  'idle-doze': ['差点睡着了……', '我没有困……'],
  'working-glance': ['低头看一眼。', '这里应该没问题。'],
  'working-chin-think': ['让我想一想。', '嗯……'],
  'working-think-gesture': ['我来理一下思路。', '先这样，再这样。'],
  'working-trace-idea': ['顺着这个想法试试。', '应该是这个方向。'],
  'done-present-result': ['往这边看。', '大概就是这样。'],
  'waiting-calm-breath': ['我安静等你。', '呼吸……'],
  'waiting-small-gesture': ['嗯，我在听。', '你说。'],
  'waiting-reassure-gesture': ['我在这里陪你。', '不用一个人扛。'],
  'done-small-cheer': ['握拳打起精神！', '加把劲。'],
  'done-quiet-cheer': ['收手，偷偷开心。', '低调庆祝一下。'],
  'done-fist-cheer': ['耶，完成啦！', '干得漂亮！'],
  'waiting-open-hands': ['我来解释一下。', '听我说。'],
  'error-oops': ['咦，好像有个小问题。', '这里不太对。'],
  'error-nervous': ['有点不安……', '不会出问题吧。'],
  'error-try-again': ['调整一下，再试一次。', '再来。'],
  'idle-clasp-laugh': ['嘿嘿，好开心。', '忍不住笑出来。'],
  'idle-clasp-hope': ['期待一下。', '会顺利的吧。'],
  'idle-shy-tilt': ['有、有点不好意思。', '别一直看我啦。'],
  'idle-peace-sign': ['耶！', '比个耶。'],
  'idle-forehead-touch': ['头有点晕……', '敷一下额头。'],
  'idle-hair-tuck': ['把耳边的头发别好。', '整理一下。'],
  'hello-both-hands': ['嗨，两只手一起打招呼！', '在这里在这里。'],
  'hello-small-wave': ['嗨。', '轻轻挥一下手。'],
  'done-thumbs-up': ['干得漂亮！', '这次稳了。'],
  'done-open-arms': ['完成啦，抱一个！', '来，庆祝一下。'],
  'working-organize': ['把任务分分类。', '这样清楚多了。'],
  'working-doodle': ['画完继续。', '给今天加颗星。']
};
function currentBubbleTone() {
  return ['working', 'waiting', 'done', 'error'].includes(statusNow) ? statusNow : 'idle';
}
const longActionKeys = new Set([
  'idle-stretch', 'idle-clasp-laugh', 'idle-clasp-hope', 'idle-shy-tilt',
  'idle-peace-sign', 'idle-forehead-touch', 'idle-hair-tuck',
  'hello-both-hands', 'hello-small-wave', 'done-thumbs-up', 'done-open-arms',
  'working-organize', 'working-doodle'
]);
function playAction(action) {
  if (action.startsWith('idle-') && !extraClips.has(action)) return;
  clearTimeout(statusVariantTimer);
  clearTimeout(idleActionTimer);
  const className = ({ hello: 'poked', thinking: 'thinking', celebrate: 'celebrating', cheer: 'cheering', sleep: 'sleeping' })[action] || 'poked';
  petElement.classList.remove('poked', 'thinking', 'celebrating', 'cheering', 'sleeping', 'idle-action');
  void petElement.offsetWidth;
  petElement.classList.add(className);
  showAnimation(animationFiles[action] ? action : 'hello');
  const lines = actions[action] || actions.hello;
  say(pickLine(lines), 5000, currentBubbleTone());
  playMotion(action, { fallbackMs: 9000, restoreStatus: true });
  clearTimeout(actionTimer);
  const actionDuration = longActionKeys.has(action) ? 10000 : action === 'sleep' || action === 'thinking' || action.startsWith('idle-') ? 4000 : action === 'celebrate' ? 1750 : 1450;
  actionTimer = setTimeout(() => {
    petElement.classList.remove(className);
    showCurrentAnimation();
  }, actionDuration);
  scheduleRandomAction(8000);
}
function nextRandomClip(status) {
  const pool = status === 'working'
    ? ['working-compare-loop', 'working-idea-loop', 'working-keyboard-loop', 'working-glance', 'working-chin-think', 'working-think-gesture', 'working-trace-idea']
    : status === 'waiting'
      ? ['waiting-lookaround-loop', 'waiting-question', 'waiting-reassure', 'waiting-calm-breath', 'waiting-small-gesture', 'waiting-reassure-gesture', 'waiting-open-hands']
      : ['idle-lookaround-loop', 'idle-stretch', 'idle-tail-play', 'idle-wing-flutter', 'idle-wing-flutter-alt', 'idle-bow', 'idle-hair-fix', 'idle-hop', 'idle-tail-curl-loop', 'idle-cheek-wave', 'idle-mini-dance', 'idle-shy', 'idle-sneeze', 'idle-sleeve-show', 'idle-wave-smile', 'idle-wave-long', 'idle-tail-sway', 'idle-curious-lean', 'idle-dragon-roar', 'idle-tiptoe', 'idle-sparkle-smile', 'idle-soft-blink', 'idle-headpiece-touch', 'idle-tail-startle', 'idle-laugh', 'idle-pout', 'idle-step-in-place', 'idle-face-touch', 'idle-wing-open', 'idle-small-bow', 'idle-doze', 'idle-clasp-laugh', 'idle-peace-sign', 'idle-forehead-touch', 'idle-hair-tuck'];
  const available = pool
    .filter(key => extraClips.has(key));
  if (status === 'idle') available.push('cheer', 'hello', 'thinking', 'sleep');
  if (!available.length) return null;
  randomClipBags[status] = randomClipBags[status].filter(key => available.includes(key));
  if (!randomClipBags[status].length) randomClipBags[status] = available.sort(() => Math.random() - 0.5);
  return randomClipBags[status].shift();
}
function scheduleRandomAction(delay = 6000 + Math.random() * 3500) {
  clearTimeout(idleActionTimer);
  idleActionTimer = setTimeout(() => {
    const status = statusNow;
    if (document.hidden || walkingNow || motionBusy || !statusLoopKeys[status]?.includes(activeMotion)) {
      scheduleRandomAction(3500);
      return;
    }
    const clip = nextRandomClip(status);
    if (!clip) return scheduleRandomAction();
    clearTimeout(statusVariantTimer);
    petElement.classList.remove('idle-action');
    void petElement.offsetWidth;
    petElement.classList.add('idle-action');
    const lines = actions[clip];
    if (lines && Date.now() >= usageVisibleUntil) {
      say(pickLine(lines), 5000, currentBubbleTone());
    }
    playMotion(clip, { fallbackMs: 7000, restoreStatus: true });
    setTimeout(() => petElement.classList.remove('idle-action'), 1800);
    scheduleRandomAction(status === 'idle' ? 6000 + Math.random() * 4000 : 12000 + Math.random() * 6000);
  }, delay);
}
petElement.addEventListener('pointerdown', event => {
  if (event.button !== 0 || pointerId !== null) return;
  pointerId = event.pointerId;
  dragLastX = event.screenX;
  dragLastY = event.screenY;
  dragStartX = event.screenX;
  dragStartY = event.screenY;
  dragMoved = false;
  figure.style.setProperty('--drag-rotation', '0deg');
  figure.style.setProperty('--drag-lift', '-3px');
  petElement.classList.add('dragging');
  // Timestamps come from the renderer (same clock as performance.now) so the
  // release estimator sees real pointer timing instead of IPC arrival timing.
  window.pet.dragStart(event.screenX, event.screenY, performance.now());
  try { petElement.setPointerCapture(event.pointerId); } catch {}
});
function finishPointer(event, allowPoke) {
  if (pointerId !== event.pointerId) return;
  pointerId = null;
  petElement.classList.remove('dragging');
  figure.style.setProperty('--drag-rotation', '0deg');
  figure.style.setProperty('--drag-lift', '0px');
  // A real drag never becomes a click, even if the main process already ended
  // the drag (e.g. lost pointer capture) and reports moved=false.
  const pokeAllowed = allowPoke && !dragMoved;
  window.pet.dragEnd(event.screenX, event.screenY, performance.now())
    .then(moved => { if (pokeAllowed && !moved) poke(); })
    .catch(() => {});
}
window.addEventListener('pointerup', event => finishPointer(event, true));
window.addEventListener('pointercancel', event => finishPointer(event, false));
petElement.addEventListener('lostpointercapture', event => finishPointer(event, false));
petElement.addEventListener('pointermove', event => {
  if (pointerId !== event.pointerId) return;
  if (event.buttons === 0) { finishPointer(event, false); return; }
  const dx = event.screenX - dragLastX;
  const dy = event.screenY - dragLastY;
  dragLastX = event.screenX;
  dragLastY = event.screenY;
  if (!dragMoved && Math.hypot(event.screenX - dragStartX, event.screenY - dragStartY) >= DRAG_START_THRESHOLD) {
    dragMoved = true;
  }
  window.pet.dragMove(event.screenX, event.screenY, performance.now());
  const rotation = Math.max(-5, Math.min(5, dx * 0.28 + dy * 0.08));
  figure.style.setProperty('--drag-rotation', `${rotation.toFixed(2)}deg`);
});
petElement.addEventListener('contextmenu', event => { event.preventDefault(); window.pet.menu(); });
petElement.addEventListener('keydown', event => {
  if ((event.key === 'Enter' || event.key === ' ') && !event.repeat) { event.preventDefault(); poke(); }
});
window.pet.onStatus(setStatus);
window.pet.onDirection(direction => {
  const changed = directionNow !== direction;
  directionNow = direction;
  if (changed && walkingNow && statusNow === 'idle') {
    showCurrentAnimation();
    // The roam clip is one looping video; turning around only needs the mirror flipped.
    if (activeMotion && RUN_KEYS.has(activeMotion) && currentVideo) currentVideo.classList.toggle('facing-left', direction < 0);
  }
});
window.pet.onWalking(walking => {
  if (walkingNow === walking) return;
  walkingNow = walking;
  petElement.classList.toggle('moving', walking);
  showCurrentAnimation();
  if (statusNow === 'idle' && !motionBusy) {
    if (walking) playRun();
    else playStatusMotion();
  }
  if (!walking) scheduleRandomAction(2500 + Math.random() * 2000);
});
window.pet.onLanded(impactSpeed => jelly(impactSpeed));
window.pet.onAction(playAction);
window.pet.onTurnUsage(announceTurnUsage);
window.pet.onSize(lockVisualSize);
lockVisualSize(Math.min(window.innerWidth, window.innerHeight));
window.pet.getStatus().then(setStatus);
window.pet.getExtraClips().then(clips => {
  extraClips = new Set(clips);
  if ((statusNow === 'idle' || statusNow === 'working' || statusNow === 'waiting') && activeMotion === statusNow) playStatusMotion();
}).catch(() => {});
scheduleRandomAction();

// ---- 点击命中：窗口默认整窗穿透，主进程拿真实光标比对这里上传的缩略 alpha 蒙版 ----
// Chromium 的 forward 转发在本机不工作（切换瞬间只送一个坐标错位的 mousemove），所以判定放在
// 主进程；渲染端只负责把当前帧的 alpha 缩到 1/4 上传，并用同一张蒙版切换光标样式。
const HIT_SCALE = 0.25;
const HIT_ALPHA = 32;
const HIT_PUBLISH_MS = 100;
const hitCanvas = document.createElement('canvas');
const hitContext = hitCanvas.getContext('2d', { willReadFrequently: true });
let hitMask = null;
let hitPublished = null;

function hitLayerVisible(element) {
  if (!element || !element.isConnected) return false;
  const style = getComputedStyle(element);
  if (style.visibility === 'hidden' || style.display === 'none') return false;
  // 视频靠 .visible 切 opacity，淡出过程中仍算可见（还在画面上留残影）
  if (element !== character && Number(style.opacity) < 0.05) return false;
  const box = element.getBoundingClientRect();
  return box.width > 0 && box.height > 0;
}

// 交叉淡入时立绘和视频会同时可见，命中区取所有可见图层的并集，避免“看得见却点不到”。
function hitLayers() {
  const layers = [];
  for (const element of [currentVideo, motionNext, motion, character]) {
    if (!element || layers.includes(element) || !hitLayerVisible(element)) continue;
    const naturalWidth = element.videoWidth || element.naturalWidth || 0;
    const naturalHeight = element.videoHeight || element.naturalHeight || 0;
    if (!naturalWidth || !naturalHeight) continue;
    layers.push(element);
  }
  return layers;
}

function hitContentRect(element) {
  const box = element.getBoundingClientRect();
  const naturalWidth = element.videoWidth || element.naturalWidth || 0;
  const naturalHeight = element.videoHeight || element.naturalHeight || 0;
  if (!box.width || !box.height || !naturalWidth || !naturalHeight) return null;
  // object-fit: contain —— 实际画面在元素框里居中、等比缩放，取这一块而不是元素框
  const scale = Math.min(box.width / naturalWidth, box.height / naturalHeight);
  const width = naturalWidth * scale;
  const height = naturalHeight * scale;
  return {
    left: box.left + (box.width - width) / 2,
    top: box.top + (box.height - height) / 2,
    width,
    height
  };
}

function hitFlipped(element) {
  const transform = getComputedStyle(element).transform;
  if (!transform || transform === 'none') return false;
  try {
    return new DOMMatrix(transform).a < 0;
  } catch {
    return false;
  }
}

function measureHitMask() {
  const layers = hitLayers();
  const width = Math.max(1, Math.round(window.innerWidth * HIT_SCALE));
  const height = Math.max(1, Math.round(window.innerHeight * HIT_SCALE));
  if (hitCanvas.width !== width || hitCanvas.height !== height) {
    hitCanvas.width = width;
    hitCanvas.height = height;
  }
  const alpha = new Uint8Array(width * height);
  const names = [];
  for (const element of layers) {
    const content = hitContentRect(element);
    if (!content) continue;
    hitContext.clearRect(0, 0, width, height);
    const dx = content.left * HIT_SCALE;
    const dy = content.top * HIT_SCALE;
    const dw = content.width * HIT_SCALE;
    const dh = content.height * HIT_SCALE;
    try {
      if (hitFlipped(element)) {
        // facing-left 是 CSS 镜像；canvas 不认 transform，这里手动翻一次
        hitContext.save();
        hitContext.translate(dx + dw, dy);
        hitContext.scale(-1, 1);
        hitContext.drawImage(element, 0, 0, dw, dh);
        hitContext.restore();
      } else {
        hitContext.drawImage(element, dx, dy, dw, dh);
      }
    } catch {
      continue;
    }
    const pixels = hitContext.getImageData(0, 0, width, height).data;
    for (let i = 0, j = 3; i < alpha.length; i += 1, j += 4) {
      if (pixels[j] > alpha[i]) alpha[i] = pixels[j];
    }
    names.push(element === character ? 'image' : (element.id || 'video'));
  }
  if (!names.length) {
    hitMask = null;
    return;
  }
  hitMask = { width, height, alpha, source: names.join('+') };
}

function pointOverPet(clientX, clientY) {
  if (!hitMask) return false;
  const x = Math.min(hitMask.width - 1, Math.max(0, Math.floor(clientX * HIT_SCALE)));
  const y = Math.min(hitMask.height - 1, Math.max(0, Math.floor(clientY * HIT_SCALE)));
  return hitMask.alpha[y * hitMask.width + x] >= HIT_ALPHA;
}

function publishHitMask() {
  measureHitMask();
  if (!hitMask) return;
  if (hitPublished && hitPublished.length === hitMask.alpha.length) {
    let same = true;
    for (let i = 0; i < hitPublished.length; i += 1) {
      if (hitPublished[i] !== hitMask.alpha[i]) { same = false; break; }
    }
    if (same) return;
  }
  hitPublished = hitMask.alpha.slice();
  window.pet.setHitMask(hitMask);
}

window.addEventListener('mousemove', event => {
  petElement.classList.toggle('over-body', pointOverPet(event.clientX, event.clientY));
}, { passive: true });

function reportHitBusy(busy) {
  window.pet.setHitBusy(Boolean(busy));
}
petElement.addEventListener('pointerdown', () => reportHitBusy(true));
window.addEventListener('pointerup', () => reportHitBusy(false));
window.addEventListener('pointercancel', () => reportHitBusy(false));

publishHitMask();
setInterval(publishHitMask, HIT_PUBLISH_MS);

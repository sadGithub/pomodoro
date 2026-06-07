// ====== 阶段配置（标签、通知文案、时长字段、是否休息）======
const PHASE = {
  work:       { label: '🍅 工作时间', titleLabel: '🍅 工作中', lenKey: 'workLen',  isBreak: false },
  shortBreak: { label: '☕ 休息时间', titleLabel: '☕ 休息中', lenKey: 'shortLen', isBreak: true  },
  longBreak:  { label: '☕ 长休息',   titleLabel: '☕ 休息中', lenKey: 'longLen',  isBreak: true  },
};

// 设置项默认值（同时充当 keys + defaults 的单一来源）
const DEFAULTS = {
  workLen: 25, shortLen: 5, longLen: 15, maxRounds: 4,
  soundOn: true, notifyOn: true, autoStart: false,
};

// ====== 数据状态 ======
let state = {
  ...DEFAULTS,
  phase: 'work',
  paused: false,
  timeLeft: 25 * 60,
  totalTime: 25 * 60,
  round: 1,
  records: [],          // { date, task, timestamp }
  currentTask: '',
};

let timerId = null;
let titleSuffix = ` - ${PHASE.work.titleLabel}`;   // 缓存窗口标题后缀，避免每秒重算

const isRunning = () => timerId !== null;          // 派生：是否在跑计时

// DOM 引用
const $ = (s) => document.querySelector(s);
const $$ = (s) => document.querySelectorAll(s);

const el = {
  phaseLabel:  $('#phaseLabel'),
  timeDisplay: $('#timeDisplay'),
  ringFg:      $('#ringFg'),
  taskInput:   $('#taskInput'),
  btnStart:    $('#btnStart'),
  btnPause:    $('#btnPause'),
  btnReset:    $('#btnReset'),
  btnSkip:     $('#btnSkip'),
  roundNum:    $('#roundNum'),
  todayCount:  $('#todayCount'),
  // stats
  statToday:   $('#statToday'),
  statWeek:    $('#statWeek'),
  statTotal:   $('#statTotal'),
  historyList: $('#historyList'),
  btnClear:    $('#btnClearHistory'),
  // settings
  setWork:     $('#setWork'),
  setShort:    $('#setShort'),
  setLong:     $('#setLong'),
  setRounds:   $('#setRounds'),
  setSound:    $('#setSound'),
  setNotify:   $('#setNotify'),
  setAuto:     $('#setAuto'),
  btnSave:     $('#btnSaveSettings'),
};

// ====== 工具 ======
const pad2 = (n) => String(n).padStart(2, '0');
const todayKey = () => new Date().toISOString().slice(0, 10);
const CIRC = 2 * Math.PI * 90;   // 进度环周长（r=90）

// ====== 发声（Web Audio API） ======
let audioCtx = null;
function playBeep() {
  if (!state.soundOn) return;
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  const now = audioCtx.currentTime;
  [880, 1100].forEach((freq, i) => {
    const t0 = now + i * 0.15;
    const osc = audioCtx.createOscillator();
    const vol = audioCtx.createGain();
    osc.type = 'sine';
    osc.frequency.value = freq;
    vol.gain.setValueAtTime(0.4, t0);
    vol.gain.exponentialRampToValueAtTime(0.001, t0 + 0.25);
    osc.connect(vol).connect(audioCtx.destination);
    osc.start(t0);
    osc.stop(t0 + 0.25);
  });
}

// ====== 渲染 ======
function updateDisplay() {
  const m = Math.floor(state.timeLeft / 60);
  const s = state.timeLeft % 60;
  const text = `${pad2(m)}:${pad2(s)}`;
  el.timeDisplay.textContent = text;
  el.ringFg.style.strokeDashoffset = CIRC * (1 - state.timeLeft / state.totalTime);
  document.title = text + titleSuffix;
}

function updatePhaseUI() {
  const cfg = PHASE[state.phase];
  el.phaseLabel.textContent = cfg.label;
  el.phaseLabel.classList.toggle('break', cfg.isBreak);
  el.ringFg.classList.toggle('break', cfg.isBreak);
  el.roundNum.textContent = state.round;
  titleSuffix = ` - ${cfg.titleLabel}`;
}

function setButtons({ start, pause, pauseLabel = '暂停' }) {
  el.btnStart.disabled = !start;
  el.btnPause.disabled = !pause;
  el.btnPause.textContent = pauseLabel;
}

// ====== 核心逻辑 ======
function getPhaseTime(phase) {
  return state[PHASE[phase].lenKey] * 60;
}

// 进入指定阶段并开始计时
function goToPhase(nextPhase) {
  state.phase = nextPhase;
  state.totalTime = getPhaseTime(nextPhase);
  state.timeLeft = state.totalTime;
  state.paused = false;
  if (PHASE[nextPhase].isBreak) {
    state.currentTask = '';
    el.taskInput.value = '';
  }
  updatePhaseUI();
  updateDisplay();
  setButtons({ start: false, pause: true });
  startTimer();
}

// 回到工作阶段空闲态（停止、UI 待命）
function goToIdle({ clearTask = false } = {}) {
  stopTimer();
  state.phase = 'work';
  state.totalTime = getPhaseTime('work');
  state.timeLeft = state.totalTime;
  state.paused = false;
  if (clearTask) {
    state.currentTask = '';
    el.taskInput.value = '';
  }
  updatePhaseUI();
  updateDisplay();
  setButtons({ start: true, pause: false });
}

function completePomodoro() {
  const task = state.currentTask.trim();
  state.records.push({
    date: todayKey(),
    task: task || '未命名任务',
    timestamp: Date.now(),
  });
  saveData();
  updateStats();
  playBeep();
  if (state.notifyOn) {
    window.api.notify('🍅 番茄完成！', `太棒了！第 ${state.round} 个番茄完成${task ? '：' + task : ''}`);
  }

  // 决定下一个阶段（达到 maxRounds 则进入长休息并重置轮次）
  const isLong = state.round >= state.maxRounds;
  state.round = isLong ? 1 : state.round + 1;
  goToPhase(isLong ? 'longBreak' : 'shortBreak');
}

function completeBreak() {
  playBeep();
  if (state.notifyOn) {
    window.api.notify('☕ 休息结束', '该开始工作了！');
  }
  if (state.autoStart) goToPhase('work');
  else goToIdle();
}

function startTimer() {
  stopTimer();
  timerId = setInterval(() => {
    state.timeLeft--;
    updateDisplay();
    if (state.timeLeft <= 0) {
      stopTimer();
      if (state.phase === 'work') completePomodoro();
      else completeBreak();
    }
  }, 1000);
}

function stopTimer() {
  if (timerId) { clearInterval(timerId); timerId = null; }
}

// ====== 控制按钮 ======
el.btnStart.addEventListener('click', () => {
  if (state.paused) {
    // 从暂停恢复
    state.paused = false;
    startTimer();
    setButtons({ start: false, pause: true });
    return;
  }
  if (!isRunning()) {
    // 从空闲开始
    state.currentTask = el.taskInput.value.trim();
    goToPhase('work');
  }
});

el.btnPause.addEventListener('click', () => {
  if (!isRunning() || state.paused) return;
  state.paused = true;
  stopTimer();                              // 真正停掉 interval，节能
  setButtons({ start: true, pause: true, pauseLabel: '继续' });
});

el.btnReset.addEventListener('click', () => {
  goToIdle({ clearTask: true });
  document.title = '番茄钟';
});

el.btnSkip.addEventListener('click', () => {
  if (!isRunning() && !state.paused) return;
  stopTimer();
  if (state.phase === 'work') completePomodoro();
  else completeBreak();
});

// ====== Tab 切换 ======
function setOnlyActive(nodes, target) {
  nodes.forEach(n => n.classList.toggle('active', n === target));
}

$$('.tab').forEach(tab => {
  tab.addEventListener('click', () => {
    setOnlyActive($$('.tab'), tab);
    setOnlyActive($$('.page'), document.getElementById('page-' + tab.dataset.tab));
    if (tab.dataset.tab === 'stats') renderHistory();
    if (tab.dataset.tab === 'settings') loadSettingsToUI();
  });
});

// ====== 统计 ======
// 计数（轻量，每次完成番茄都跑）
function updateStats() {
  const today = todayKey();
  const now = new Date();
  const sow = new Date(now);
  sow.setDate(now.getDate() - now.getDay());
  const weekStart = sow.toISOString().slice(0, 10);

  let todayCount = 0, weekCount = 0;
  for (const r of state.records) {
    if (r.date >= weekStart) {
      weekCount++;
      if (r.date === today) todayCount++;
    }
  }
  el.statToday.textContent = todayCount;
  el.statWeek.textContent  = weekCount;
  el.statTotal.textContent = state.records.length;
  el.todayCount.textContent = todayCount;
}

// 历史列表渲染（重，仅在统计 Tab 激活时跑）
function renderHistory() {
  updateStats();
  const recs = state.records;
  if (recs.length === 0) {
    el.historyList.innerHTML = '<div class="empty">还没有记录，加油完成第一个番茄吧！</div>';
    return;
  }
  // 只复制最后 20 条，避免对完整数组 reverse
  const recent = recs.slice(-20).reverse();
  el.historyList.innerHTML = recent.map(r => {
    const d = new Date(r.timestamp);
    const timeStr = `${pad2(d.getMonth()+1)}-${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
    return `<div class="history-item">
      <span class="task-name">🍅 ${r.task}</span>
      <span class="time-tag">${timeStr}</span>
    </div>`;
  }).join('');
}

el.btnClear.addEventListener('click', () => {
  if (state.records.length === 0) return;
  if (confirm('确定要清空所有番茄记录吗？此操作不可恢复。')) {
    state.records = [];
    saveData();
    renderHistory();
  }
});

// ====== 设置 ======
function loadSettingsToUI() {
  el.setWork.value     = state.workLen;
  el.setShort.value    = state.shortLen;
  el.setLong.value     = state.longLen;
  el.setRounds.value   = state.maxRounds;
  el.setSound.checked  = state.soundOn;
  el.setNotify.checked = state.notifyOn;
  el.setAuto.checked   = state.autoStart;
}

const normalizeNum = (val, min, def) => Math.max(min, parseInt(val) || def);

el.btnSave.addEventListener('click', () => {
  state.workLen   = normalizeNum(el.setWork.value,   1, DEFAULTS.workLen);
  state.shortLen  = normalizeNum(el.setShort.value,  1, DEFAULTS.shortLen);
  state.longLen   = normalizeNum(el.setLong.value,   1, DEFAULTS.longLen);
  state.maxRounds = normalizeNum(el.setRounds.value, 2, DEFAULTS.maxRounds);
  state.soundOn   = el.setSound.checked;
  state.notifyOn  = el.setNotify.checked;
  state.autoStart = el.setAuto.checked;

  // 如果定时器不在运行，刷新当前显示
  if (!isRunning()) {
    state.totalTime = getPhaseTime(state.phase);
    state.timeLeft = state.totalTime;
    updateDisplay();
  }

  saveData();
  alert('设置已保存！');
});

// ====== 数据持久化 ======
async function loadData() {
  try {
    const data = await window.api.loadData();
    if (data) {
      // DEFAULTS 提供基线，data.settings 覆盖已存的字段
      Object.assign(state, DEFAULTS, data.settings || {});
      state.records = data.records || [];
    }
  } catch (e) {
    console.warn('加载数据失败，使用默认', e);
  }

  // 初始化 UI
  state.totalTime = getPhaseTime('work');
  state.timeLeft = state.totalTime;
  updatePhaseUI();
  updateDisplay();
  loadSettingsToUI();
  el.taskInput.value = state.currentTask;
  updateStats();
}

function saveData() {
  const settings = {};
  for (const k of Object.keys(DEFAULTS)) settings[k] = state[k];
  window.api.saveData({ records: state.records, settings });
}

// ====== 键盘快捷键 ======
document.addEventListener('keydown', (e) => {
  if (e.target.tagName === 'INPUT') return;
  switch (e.key) {
    case ' ':
      e.preventDefault();
      (isRunning() && !state.paused ? el.btnPause : el.btnStart).click();
      break;
    case 'r': case 'R':
      el.btnReset.click();
      break;
  }
});

// ====== 初始化 ======
loadData();

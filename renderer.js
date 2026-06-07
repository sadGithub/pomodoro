// ====== 数据状态 ======
let state = {
  phase: 'work',        // work | shortBreak | longBreak
  running: false,
  paused: false,
  timeLeft: 25 * 60,
  totalTime: 25 * 60,
  round: 1,
  maxRounds: 4,
  workLen: 25,
  shortLen: 5,
  longLen: 15,
  soundOn: true,
  notifyOn: true,
  autoStart: false,
  records: [],          // { date, task, count: 1, timestamp }
  currentTask: '',
};

let timerId = null;

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

// ====== 发声（Web Audio API） ======
let audioCtx = null;
function playBeep() {
  if (!state.soundOn) return;
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  const now = audioCtx.currentTime;
  [880, 1100].forEach((freq, i) => {
    const osc = audioCtx.createOscillator();
    const vol = audioCtx.createGain();
    osc.type = 'sine';
    osc.frequency.value = freq;
    vol.gain.setValueAtTime(0.4, now + i * 0.15);
    vol.gain.exponentialRampToValueAtTime(0.001, now + i * 0.15 + 0.25);
    osc.connect(vol).connect(audioCtx.destination);
    osc.start(now + i * 0.15);
    osc.stop(now + i * 0.15 + 0.25);
  });
}

// ====== 计时器更新 ======
function updateDisplay() {
  const m = Math.floor(state.timeLeft / 60);
  const s = state.timeLeft % 60;
  el.timeDisplay.textContent = `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;

  // 进度环
  const total = state.totalTime;
  const r = 90, circ = 2 * Math.PI * r;
  const offset = circ * (1 - state.timeLeft / total);
  el.ringFg.style.strokeDashoffset = offset;

  // 窗口标题
  const label = state.phase === 'work' ? '🍅 工作中' : '☕ 休息中';
  document.title = `${el.timeDisplay.textContent} - ${label}`;
}

function updatePhaseUI() {
  const isWork = state.phase === 'work';
  el.phaseLabel.textContent = isWork ? '🍅 工作时间' : '☕ 休息时间';
  el.phaseLabel.classList.toggle('break', !isWork);
  el.ringFg.classList.toggle('break', !isWork);
  el.roundNum.textContent = state.round;
}

// ====== 核心逻辑 ======
function getPhaseTime(phase) {
  if (phase === 'work') return state.workLen * 60;
  if (phase === 'shortBreak') return state.shortLen * 60;
  return state.longLen * 60; // longBreak
}

function switchPhase(nextPhase) {
  state.phase = nextPhase;
  state.totalTime = getPhaseTime(nextPhase);
  state.timeLeft = state.totalTime;
  state.running = true;
  state.paused = false;
  updatePhaseUI();
  updateDisplay();
  el.btnStart.disabled = true;
  el.btnPause.disabled = false;

  if (nextPhase !== 'work') state.currentTask = '';
  el.taskInput.value = state.currentTask;

  startTimer();
}

function completePomodoro() {
  // 记录一个番茄
  const today = new Date().toISOString().slice(0, 10);
  const task = state.currentTask.trim();
  state.records.push({
    date: today,
    task: task || '未命名任务',
    timestamp: Date.now()
  });
  saveData();
  updateStats();
  playBeep();
  if (state.notifyOn) {
    window.api.notify('🍅 番茄完成！', `太棒了！第 ${state.round} 个番茄完成${task ? '：' + task : ''}`);
  }

  // 决定下一个阶段
  if (state.round >= state.maxRounds) {
    // 长休息，然后重置轮次
    state.round = 1;
    switchPhase('longBreak');
  } else {
    state.round++;
    switchPhase('shortBreak');
  }
}

function completeBreak() {
  playBeep();
  if (state.notifyOn) {
    window.api.notify('☕ 休息结束', '该开始工作了！');
  }
  if (state.autoStart) {
    switchPhase('work');
  } else {
    stopTimer();
    state.paused = false;
    state.phase = 'work';
    state.totalTime = state.workLen * 60;
    state.timeLeft = state.totalTime;
    state.running = false;
    updatePhaseUI();
    updateDisplay();
    el.btnStart.disabled = false;
    el.btnPause.disabled = true;
  }
}

function startTimer() {
  if (timerId) clearInterval(timerId);
  timerId = setInterval(() => {
    if (!state.paused) {
      state.timeLeft--;
      updateDisplay();
      if (state.timeLeft <= 0) {
        clearInterval(timerId);
        timerId = null;
        state.running = false;
        if (state.phase === 'work') {
          completePomodoro();
        } else {
          completeBreak();
        }
      }
    }
  }, 1000);
}

function stopTimer() {
  if (timerId) { clearInterval(timerId); timerId = null; }
}

// ====== 控制按钮 ======
el.btnStart.addEventListener('click', () => {
  if (state.paused) {
    state.paused = false;
    state.running = true;
    el.btnPause.textContent = '暂停';
    el.btnStart.disabled = true;
    el.btnPause.disabled = false;
    return;
  }

  // 重置状态
  if (!state.running) {
    state.currentTask = el.taskInput.value.trim();
    state.phase = 'work';
    state.totalTime = state.workLen * 60;
    state.timeLeft = state.totalTime;
    state.running = true;
    state.paused = false;
    updatePhaseUI();
    updateDisplay();
    el.btnStart.disabled = true;
    el.btnPause.disabled = false;
    el.btnPause.textContent = '暂停';
    startTimer();
  }
});

el.btnPause.addEventListener('click', () => {
  if (!state.running || state.paused) return;
  state.paused = true;
  el.btnPause.textContent = '继续';
  el.btnStart.disabled = false;
});

el.btnReset.addEventListener('click', () => {
  const wasRunning = state.running;
  stopTimer();
  state.running = false;
  state.paused = false;
  state.phase = 'work';
  state.totalTime = state.workLen * 60;
  state.timeLeft = state.totalTime;
  updatePhaseUI();
  updateDisplay();
  el.btnStart.disabled = false;
  el.btnPause.disabled = true;
  el.btnPause.textContent = '暂停';
  el.taskInput.value = '';
  state.currentTask = '';
  document.title = '番茄钟';
});

el.btnSkip.addEventListener('click', () => {
  if (!state.running) return;
  stopTimer();
  if (state.phase === 'work') {
    completePomodoro();
  } else {
    completeBreak();
  }
});

// ====== Tab 切换 ======
$$('.tab').forEach(tab => {
  tab.addEventListener('click', () => {
    $$('.tab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    $$('.page').forEach(p => p.classList.remove('active'));
    document.getElementById('page-' + tab.dataset.tab).classList.add('active');

    if (tab.dataset.tab === 'stats') updateStats();
    if (tab.dataset.tab === 'settings') loadSettingsToUI();
  });
});

// ====== 统计 ======
function updateStats() {
  const today = new Date().toISOString().slice(0, 10);
  const recs = state.records;

  // 今日
  const todayRecs = recs.filter(r => r.date === today);
  el.statToday.textContent = todayRecs.length;
  el.todayCount.textContent = todayRecs.length;

  // 本周
  const now = new Date();
  const startOfWeek = new Date(now);
  startOfWeek.setDate(now.getDate() - now.getDay());
  const weekStart = startOfWeek.toISOString().slice(0, 10);
  const weekRecs = recs.filter(r => r.date >= weekStart);
  el.statWeek.textContent = weekRecs.length;

  // 累计
  el.statTotal.textContent = recs.length;

  // 历史列表（最近20条）
  const sorted = [...recs].reverse().slice(0, 20);
  if (sorted.length === 0) {
    el.historyList.innerHTML = '<div class="empty">还没有记录，加油完成第一个番茄吧！</div>';
    return;
  }
  el.historyList.innerHTML = sorted.map(r => {
    const d = new Date(r.timestamp);
    const timeStr = `${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
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
    updateStats();
  }
});

// ====== 设置 ======
function loadSettingsToUI() {
  el.setWork.value   = state.workLen;
  el.setShort.value  = state.shortLen;
  el.setLong.value   = state.longLen;
  el.setRounds.value = state.maxRounds;
  el.setSound.checked  = state.soundOn;
  el.setNotify.checked = state.notifyOn;
  el.setAuto.checked   = state.autoStart;
}

el.btnSave.addEventListener('click', () => {
  state.workLen   = Math.max(1, parseInt(el.setWork.value) || 25);
  state.shortLen  = Math.max(1, parseInt(el.setShort.value) || 5);
  state.longLen   = Math.max(1, parseInt(el.setLong.value) || 15);
  state.maxRounds = Math.max(2, parseInt(el.setRounds.value) || 4);
  state.soundOn   = el.setSound.checked;
  state.notifyOn  = el.setNotify.checked;
  state.autoStart = el.setAuto.checked;

  // 如果定时器不在运行，更新当前时间
  if (!state.running) {
    state.phase = 'work';
    state.totalTime = state.workLen * 60;
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
      if (data.settings) {
        state.workLen   = data.settings.workLen   || 25;
        state.shortLen  = data.settings.shortLen  || 5;
        state.longLen   = data.settings.longLen   || 15;
        state.maxRounds = data.settings.maxRounds || 4;
        state.soundOn   = data.settings.soundOn   !== false;
        state.notifyOn  = data.settings.notifyOn  !== false;
        state.autoStart = data.settings.autoStart || false;
      }
      state.records = data.records || [];
    }
  } catch (e) {
    console.warn('加载数据失败，使用默认', e);
  }

  // 初始化 UI
  state.totalTime = state.workLen * 60;
  state.timeLeft = state.totalTime;
  updatePhaseUI();
  updateDisplay();
  loadSettingsToUI();
  if (el.taskInput) el.taskInput.value = state.currentTask;
  updateStats();
}

function saveData() {
  window.api.saveData({
    records: state.records,
    settings: {
      workLen: state.workLen,
      shortLen: state.shortLen,
      longLen: state.longLen,
      maxRounds: state.maxRounds,
      soundOn: state.soundOn,
      notifyOn: state.notifyOn,
      autoStart: state.autoStart,
    }
  });
}

// ====== 键盘快捷键 ======
document.addEventListener('keydown', (e) => {
  // 忽略输入框内的快捷键
  if (e.target.tagName === 'INPUT') return;
  switch (e.key) {
    case ' ':  e.preventDefault(); state.running && !state.paused ? el.btnPause.click() : (state.paused ? el.btnStart.click() : el.btnStart.click()); break;
    case 'r': case 'R': el.btnReset.click(); break;
  }
});

// ====== 初始化 ======
loadData();
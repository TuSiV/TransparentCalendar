/* 透明日历 - 渲染层逻辑 */
const $ = (id) => document.getElementById(id);

const INTERACTIVE = 'button, input, select, textarea, a, .day, .event, .checkbox, .del-btn, .add-btn, #detailOverlay';

const WEEKDAYS_MON = ['一', '二', '三', '四', '五', '六', '日'];
const WEEKDAYS_SUN = ['日', '一', '二', '三', '四', '五', '六'];

const state = {
  view: new Date(),
  selectedKey: dateKey(new Date()),
  events: new Map(),
  tasks: new Map(),
  authed: false,
  icsMode: false,
  todoEnabled: false,
  todoLists: [],
  todoListId: '',
  weekStart: 1, // 0=周日, 1=周一
  calendarView: 'month',
  showCompleted: false,
};

/* ---------------- 工具 ---------------- */

function dateKey(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate()
  ).padStart(2, '0')}`;
}

function fmtTime(iso) {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function copyText(text) {
  navigator.clipboard.writeText(text);
}

/* ---------------- 月历渲染 ---------------- */

function renderWeekRow() {
  const days = state.weekStart === 0 ? WEEKDAYS_SUN : WEEKDAYS_MON;
  $('weekRow').innerHTML = days.map((w) => `<span class="wk">${w}</span>`).join('');
}

function renderGrid() {
  const y = state.view.getFullYear();
  const m = state.view.getMonth();
  const week = state.calendarView === 'week';
  const range = CalendarView.gridRange(state.view, state.calendarView, state.weekStart);
  const gridStart = range.start;
  const title = week ? CalendarView.weekLabel(range.start, range.end) : `${y} 年 ${m + 1} 月`;
  $('monthTitle').textContent = title;
  $('monthTitle').title = title;
  $('card').classList.toggle('compact', week);
  $('btnViewMode').textContent = week ? '月' : '周';
  $('btnViewMode').title = week ? '展开为整月' : '缩减为当周';
  $('btnViewMode').setAttribute('aria-label', $('btnViewMode').title);
  $('btnViewMode').setAttribute('aria-pressed', String(week));
  $('btnPrev').title = week ? '上一周' : '上一月';
  $('btnNext').title = week ? '下一周' : '下一月';
  const today = dateKey(new Date());

  let html = '';
  for (let i = 0; i < range.count; i++) {
    const d = new Date(gridStart.getFullYear(), gridStart.getMonth(), gridStart.getDate() + i);
    const key = dateKey(d);
    const classes = ['day'];
    if (!week && d.getMonth() !== m) classes.push('dim');
    if (key === today) classes.push('today');
    if (key === state.selectedKey) classes.push('sel');

    const evts = state.events.get(key) || [];
    const tsks = state.tasks.get(key) || [];
    const hasEvt = evts.length > 0;
    const hasTodo = tsks.filter((t) => t.status !== 'completed').length > 0;

    let dots = '';
    if (hasEvt || hasTodo) {
      dots = '<span class="dots">';
      if (hasEvt) dots += '<span class="event-dot"></span>';
      if (hasTodo) dots += '<span class="task-dot"></span>';
      dots += '</span>';
    }

    html += `<div class="${classes.join(' ')}" data-key="${key}"><span class="num">${d.getDate()}</span>${dots}</div>`;
  }
  $('grid').innerHTML = html;

  $('grid')
    .querySelectorAll('.day')
    .forEach((el) =>
      el.addEventListener('click', () => {
        state.selectedKey = el.dataset.key;
        renderGrid();
        renderEvents();
        renderTodoPanel();
      })
    );
}

/* ---------------- 日程与任务列表 ---------------- */

function renderEvents() {
  const evts = state.events.get(state.selectedKey) || [];
  const [y, m, d] = state.selectedKey.split('-').map(Number);
  const days = state.weekStart === 0 ? WEEKDAYS_SUN : WEEKDAYS_MON;
  const wd = days[(new Date(y, m - 1, d).getDay() - state.weekStart + 7) % 7];
  $('dayLabel').textContent = `${m} 月 ${d} 日 · 星期${wd}`;

  const items = [];

  // 仅事件（任务只在待办面板显示）
  for (const e of evts) {
    const time = e.isAllDay
      ? '全天'
      : e.start === e.end
        ? fmtTime(e.start)
        : `${fmtTime(e.start)} - ${fmtTime(e.end)}`;
    const loc = e.location ? `<span class="time location">@ ${esc(e.location)}</span>` : '';
    const typeCls = e.isAllDay ? 'all-day' : '';
    const localCls = e.local ? ' local' : '';
    const delBtn = e.local ? `<span class="del-btn" data-local-event="${e.id}" title="删除">&#x2715;</span>` : '';
    items.push({
      time: e.isAllDay ? 'zzz' : e.start,
      html: `<li class="event ${typeCls}${localCls}" data-local-event="${e.local ? esc(e.id) : ''}" tabindex="0" role="button" data-link="${esc(e.webLink || '')}" title="${esc(e.subject)}">
        <span class="bar"></span>
        <span class="time">${time}</span>
        <span class="subj">${esc(e.subject)}</span>${loc}${delBtn}
      </li>`,
    });
  }

  // 按时间排序
  items.sort((a, b) => (a.time || 'zzz').localeCompare(b.time || 'zzz'));

  if (!items.length) {
    $('eventList').innerHTML = '<li class="empty">暂无日程</li>';
  } else {
    $('eventList').innerHTML = items.map((i) => i.html).join('');
  }

  // 事件点击复制链接
  $('eventList')
    .querySelectorAll('.event[data-link]')
    .forEach((el) => {
      const link = el.dataset.link;
      const event = evts.find((e) => e.local && e.id === el.dataset.localEvent);
      const open = () => event ? openLocalDetail('event', event, el) : link && copyText(link);
      el.addEventListener('click', open);
      el.addEventListener('keydown', (e) => {
        if (e.target !== el) return;
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); }
      });
    });

  // 本地日程删除按钮
  $('eventList')
    .querySelectorAll('.del-btn[data-local-event]')
    .forEach((el) =>
      el.addEventListener('click', async (e) => {
        e.stopPropagation();
        await api.localEventDelete(el.dataset.localEvent);
        await loadMonth();
      })
    );
}

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])
  );
}

/* ---------------- Todo 面板 ---------------- */

function renderTodoPanel() {
  $('todoPanel').classList.remove('hidden');

  const todayKey = state.selectedKey;
  const todayTasks = state.tasks.get(todayKey) || [];
  const incomplete = todayTasks.filter((t) => t.status !== 'completed');
  const completed = todayTasks.filter((t) => t.status === 'completed');

  $('todoLabel').textContent = `待办任务 (${incomplete.length})`;

  const items = [];

  // 未完成任务
  for (const t of incomplete) {
    const due = t.dueDateTime
      ? new Date(t.dueDateTime.dateTime || t.dueDateTime).toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' })
      : '无截止日';
    const localCls = t.local ? ' local' : '';
    const delBtn = t.local ? `<span class="del-btn" data-local-task="${t.id}" title="删除">&#x2715;</span>` : '';
    items.push(`<li class="event task${localCls}" data-task-id="${t.id}" data-local-task="${t.local ? esc(t.id) : ''}" tabindex="0">
      <span class="checkbox" data-action="toggle"></span>
      <span class="bar"></span>
      <span class="subj">${esc(t.subject)}</span>
      <span class="time">${due}</span>${delBtn}
    </li>`);
  }

  // 已完成任务（仅在开启时显示）
  if (state.showCompleted) {
    for (const t of completed) {
      const due = t.dueDateTime
        ? new Date(t.dueDateTime.dateTime || t.dueDateTime).toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' })
        : '无截止日';
      const localCls = t.local ? ' local' : '';
      items.push(`<li class="event task done${localCls}" data-task-id="${t.id}" data-local-task="${t.local ? esc(t.id) : ''}" tabindex="0">
        <span class="checkbox done-box">&#x2713;</span>
        <span class="bar"></span>
        <span class="subj">${esc(t.subject)}</span>
        <span class="time">${due}</span>
      </li>`);
    }
  }

  if (!items.length) {
    $('todoList').innerHTML = '<li class="empty">无任务</li>';
  } else {
    $('todoList').innerHTML = items.join('');
  }

  $('todoList').querySelectorAll('.task').forEach((el) => {
    const task = todayTasks.find((t) => t.local && t.id === el.dataset.localTask);
    if (!task) return;
    el.addEventListener('click', () => openLocalDetail('task', task, el));
    el.addEventListener('keydown', (e) => {
      if (e.target === el && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); openLocalDetail('task', task, el); }
    });
  });
  $('todoList').querySelectorAll('.done-box').forEach((el) => el.addEventListener('click', (e) => e.stopPropagation()));

  // 未完成任务的复选框
  $('todoList')
    .querySelectorAll('.checkbox[data-action="toggle"]')
    .forEach((el) =>
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        const li = el.closest('.event');
        handleToggleTask(li.dataset.taskId, li.dataset.localTask);
      })
    );

  // 删除按钮
  $('todoList')
    .querySelectorAll('.del-btn[data-local-task]')
    .forEach((el) =>
      el.addEventListener('click', async (e) => {
        e.stopPropagation();
        await api.localTaskDelete(el.dataset.localTask);
        await loadMonth();
      })
    );
}

async function handleToggleTask(taskId, localTaskId) {
  // 找到任务
  let task = null;
  let taskDateKey = null;
  for (const [key, list] of state.tasks) {
    const found = list.find((t) => t.id === taskId);
    if (found) {
      task = found;
      taskDateKey = key;
      break;
    }
  }
  if (!task) return;

  try {
    if (task.status === 'completed') {
      return;
    }
    if (localTaskId) {
      await api.localTaskComplete(localTaskId);
    } else {
      if (!state.todoListId) return;
      await api.todoComplete(state.todoListId, taskId);
    }
    await loadMonth();
  } catch (err) {
    console.error('完成任务失败:', err);
  }
}

async function handleAddTodo() {
  const input = $('todoInput');
  const subject = input.value.trim();
  if (!subject) return;

  input.disabled = true;
  try {
    const dueDateEl = $('todoDueDate');
    let due;
    if (dueDateEl.value) {
      due = `${dueDateEl.value}T23:59:00`;
    } else {
      due = `${state.selectedKey}T23:59:00`;
    }

    if (state.todoListId) {
      const created = await api.todoCreate(state.todoListId, {
        subject,
        dueDateTime: { dateTime: due, timeZone: 'UTC' },
      });
      const dueDate = dueDateEl.value || state.selectedKey;
      const key = dueDate;
      if (!state.tasks.has(key)) state.tasks.set(key, []);
      state.tasks.get(key).push({
        id: created.id,
        subject,
        status: 'notStarted',
        importance: 'normal',
        dueDateTime: { dateTime: due, timeZone: 'UTC' },
      });
    } else {
      const created = await api.localTaskAdd({
        subject,
        dueDateTime: due,
      });
      const dueDate = dueDateEl.value || state.selectedKey;
      const key = dueDate;
      if (!state.tasks.has(key)) state.tasks.set(key, []);
      state.tasks.get(key).push(created);
    }

    input.value = '';
    $('todoDueDate').value = '';
    $('addTodoBar').classList.add('hidden');
    renderGrid();
    renderEvents();
    renderTodoPanel();
  } catch (err) {
    console.error('创建任务失败:', err);
  } finally {
    input.disabled = false;
    input.focus();
  }
}

/* ---------------- 数据拉取 ---------------- */

let loadSequence = 0;
async function loadMonth() {
  const sequence = ++loadSequence;
  const { start, end } = CalendarView.gridRange(state.view, state.calendarView, state.weekStart);
  const startISO = start.toISOString();
  const endISO = end.toISOString();

  // Keep requests independent so stale results cannot overwrite a new view.
  const nextEvents = new Map();
  const nextTasks = new Map();
  const syncErrors = [];

  try {
    // 拉 Outlook 日历事件（需要登录）
    if (state.authed) {
      setStatus('正在同步…');
      const events = await api.getEvents(startISO, endISO).catch((err) => { syncErrors.push('日历同步失败：' + err.message); return []; });
      for (const e of events) {
        const key = dateKey(new Date(e.start));
        if (!nextEvents.has(key)) nextEvents.set(key, []);
        nextEvents.get(key).push(e);
      }
    }

    // 拉本地日程（无需登录）
    const localEvts = await api.localEvents(startISO, endISO);
    for (const e of localEvts) {
      const first = new Date(Math.max(new Date(e.start), start));
      const last = new Date(Math.min(new Date(e.end || e.start).getTime() - (e.isAllDay ? 1 : 0), end.getTime()));
      const day = new Date(first.getFullYear(), first.getMonth(), first.getDate());
      while (dateKey(day) <= dateKey(last)) {
        const key = dateKey(day);
        if (!nextEvents.has(key)) nextEvents.set(key, []);
        nextEvents.get(key).push(e);
        day.setDate(day.getDate() + 1);
      }
    }

    // 拉 Outlook Todo 任务（需要登录）
    if (state.authed && state.todoEnabled && state.todoListId) {
      const tasks = await api.todoTasksDueRange(state.todoListId, startISO, endISO).catch((err) => { syncErrors.push('任务同步失败：' + err.message); return []; });
      for (const t of tasks) {
        if (!t.dueDateTime) {
          const key = dateKey(new Date());
          if (!nextTasks.has(key)) nextTasks.set(key, []);
          nextTasks.get(key).push(t);
          continue;
        }
        const dt = new Date(t.dueDateTime.dateTime + 'Z');
        const key = dateKey(dt);
        if (!nextTasks.has(key)) nextTasks.set(key, []);
        nextTasks.get(key).push(t);
      }
    }

    // 拉本地任务（无需登录）
    const localTasks = await api.localTasks(startISO, endISO);
    for (const t of localTasks) {
      if (!t.dueDateTime) {
        const key = dateKey(new Date());
        if (!nextTasks.has(key)) nextTasks.set(key, []);
        nextTasks.get(key).push(t);
        continue;
      }
      const dt = new Date(t.dueDateTime);
      const key = dateKey(dt);
      if (!nextTasks.has(key)) nextTasks.set(key, []);
      nextTasks.get(key).push(t);
    }

    if (sequence !== loadSequence) return;
    state.events = nextEvents;
    state.tasks = nextTasks;
    setStatus(syncErrors.length ? '本地数据已加载；' + syncErrors.join('；') : state.authed ? `已同步 · ${new Date().toLocaleTimeString('zh-CN')}` : '本地模式');
  } catch (err) {
    if (sequence !== loadSequence) return;
    setStatus('同步失败：' + err.message.replace('Error invoking remote method', '').slice(0, 60));
    if (/未登录|token|401|403/i.test(err.message)) await refreshAuth();
  }

  renderGrid();
  renderEvents();
  renderTodoPanel();
}

function setStatus(t) {
  $('statusText').textContent = t;
}

/* ---------------- 认证 ---------------- */

async function refreshAuth() {
  const s = await api.getStatus();
  state.authed = s.authed;
  state.icsMode = !!s.ics;
  state.todoEnabled = !s.ics && s.authed; // Todo 仅 Graph 模式
  $('authDot').classList.toggle('on', s.authed);
  $('authDot').title = s.authed ? '已连接 Outlook' : s.needClientId ? '未配置 Client ID' : '未连接 Outlook';

  if (!s.needClientId) $('loginOverlay').classList.toggle('hidden', s.authed);
  $('loginHint').classList.toggle('hidden', !!state.authed);

  // Todo 列表
  if (state.todoEnabled) {
    try {
      state.todoLists = await api.todoLists();
      // 使用第一个列表，或名为 "Tasks" 的
      const def = state.todoLists.find((l) => l.wellknownName === 'tasks') || state.todoLists[0];
      if (def) state.todoListId = def.id;
    } catch {
      state.todoEnabled = false;
    }
  }

  return s;
}

function setupLogin() {
  api.onDeviceCode((info) => {
    $('loginHint').classList.add('hidden');
    $('deviceMsg').classList.remove('hidden');
    $('deviceUrl').textContent = info.verificationUri;
    $('deviceCode').textContent = info.userCode;
  });

  $('btnLogin').addEventListener('click', async () => {
    $('btnLogin').disabled = true;
    $('loginErr').classList.add('hidden');
    try {
      await api.login();
      await refreshAuth();
      await loadMonth();
    } catch (err) {
      $('loginErr').textContent = err.message.replace(/Error invoking remote method[^:]*: Error: /, '');
      $('loginErr').classList.remove('hidden');
    } finally {
      $('btnLogin').disabled = false;
    }
  });

  $('deviceUrl').addEventListener('click', (e) => {
    copyText(e.target.textContent);
    e.target.textContent = '已复制 ✓';
  });
}

/* ---------------- 设置 ---------------- */

async function setupSettings() {
  const saved = await api.getSettings();
  $('clientIdInput').value = saved.clientId || '';
  $('icsUrlInput').value = saved.icsUrl || '';
  $('startOnLoginInput').checked = !!saved.startOnLogin;
  $('startOnLoginInput').disabled = !saved.startupSupported;
  $('opacityInput').value = saved.opacity ?? 100;
  $('opacityVal').textContent = $('opacityInput').value;
  $('weekStartSelect').value = saved.weekStart ?? 1;
  state.weekStart = Number(saved.weekStart ?? 1);
  state.calendarView = CalendarView.normalizeMode(saved.calendarView);

  $('btnSettings').addEventListener('click', () => {
    $('settingsOverlay').classList.remove('hidden');
  });

  $('opacityInput').addEventListener('input', (e) => {
    $('opacityVal').textContent = e.target.value;
    api.setWindowOpacity(e.target.value / 100);
  });

  $('btnSettingsCancel').addEventListener('click', () => {
    $('settingsOverlay').classList.add('hidden');
    $('clientIdInput').value = saved.clientId || '';
    $('icsUrlInput').value = saved.icsUrl || '';
    $('startOnLoginInput').checked = !!saved.startOnLogin;
    const op = saved.opacity ?? 100;
    $('opacityInput').value = op;
    $('opacityVal').textContent = op;
    $('weekStartSelect').value = saved.weekStart ?? 1;
    api.setWindowOpacity(op / 100);
  });

  $('btnSettingsSave').addEventListener('click', async () => {
    const clientId = $('clientIdInput').value.trim();
    const icsUrl = $('icsUrlInput').value.trim();
    const opacity = Number($('opacityInput').value);
    const weekStart = Number($('weekStartSelect').value);
    try {
      const patch = { clientId, icsUrl, opacity, weekStart };
      if (saved.startupSupported) patch.startOnLogin = $('startOnLoginInput').checked;
      Object.assign(saved, await api.saveSettings(patch));
    } catch (err) {
      $('settingsError').textContent = '保存失败：' + err.message;
      $('settingsError').classList.remove('hidden');
      return;
    }
    $('settingsError').classList.add('hidden');
    state.weekStart = weekStart;
    $('settingsOverlay').classList.add('hidden');
    renderWeekRow();
    renderGrid();
    renderEvents();
    const st = await refreshAuth();
    await loadMonth();
    if (!st.authed && !st.needClientId) $('loginOverlay').classList.remove('hidden');
  });

  $('btnLogout').addEventListener('click', async () => {
    await api.logout();
    state.events = new Map();
    state.tasks = new Map();
    state.authed = false;
    state.todoEnabled = false;
    state.todoListId = '';
    $('authDot').classList.remove('on');
    renderGrid();
    renderEvents();
    renderTodoPanel();
    $('settingsOverlay').classList.add('hidden');
    $('loginOverlay').classList.remove('hidden');
    $('loginHint').classList.remove('hidden');
    $('deviceMsg').classList.add('hidden');
    setStatus('已退出登录');
  });

  $('azurePortalLink').addEventListener('click', (e) => {
    copyText('https://portal.azure.com/#blade/Microsoft_AAD_RegisteredApps/ApplicationsListBlade');
    e.target.textContent = '已复制 ✓';
  });
}

/* ---------------- Todo 面板交互 ---------------- */

function setupTodoPanel() {
  $('btnToggleDone').addEventListener('click', () => {
    state.showCompleted = !state.showCompleted;
    $('btnToggleDone').classList.toggle('active', state.showCompleted);
    renderTodoPanel();
  });

  $('btnAddTodo').addEventListener('click', () => {
    $('addTodoBar').classList.toggle('hidden');
    if (!$('addTodoBar').classList.contains('hidden')) {
      $('todoInput').focus();
    }
  });

  $('btnAddTodoCancel').addEventListener('click', () => {
    $('addTodoBar').classList.add('hidden');
    $('todoInput').value = '';
  });

  $('btnAddTodoConfirm').addEventListener('click', handleAddTodo);
  $('todoInput').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') handleAddTodo();
  });
}

/* ---------------- 添加日程 ---------------- */

function setupAddEvent() {
  $('btnAddEvent').addEventListener('click', () => {
    $('addEventBar').classList.toggle('hidden');
    if (!$('addEventBar').classList.contains('hidden')) {
      $('addEventInput').focus();
    }
  });

  $('btnAddEventCancel').addEventListener('click', () => {
    $('addEventBar').classList.add('hidden');
    $('addEventInput').value = '';
  });

  $('btnAddEventConfirm').addEventListener('click', handleAddEvent);
  $('addEventInput').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') handleAddEvent();
  });
}

async function handleAddEvent() {
  const input = $('addEventInput');
  const subject = input.value.trim();
  if (!subject) return;

  const startEl = $('addEventStart');
  const endEl = $('addEventEnd');
  let start = startEl.value;
  let end = endEl.value;

  if (!start) {
    const [y, m, d] = state.selectedKey.split('-').map(Number);
    const pad = (n) => String(n).padStart(2, '0');
    start = `${state.selectedKey}T09:00`;
    end = `${state.selectedKey}T10:00`;
  }

  try {
    await api.localEventAdd({
      subject,
      start: start ? new Date(start).toISOString() : new Date(start).toISOString(),
      end: end ? new Date(end).toISOString() : new Date(start).toISOString(),
      isAllDay: false,
    });
    input.value = '';
    startEl.value = '';
    endEl.value = '';
    $('addEventBar').classList.add('hidden');
    await loadMonth();
  } catch (err) {
    setStatus('添加失败：' + err.message);
  }
}

/* ---------------- 本地详情与编辑 ---------------- */
let detail = null;

function localInputTime(value) {
  const d = new Date(value);
  if (!Number.isFinite(d.getTime())) return '';
  const pad = (n) => String(n).padStart(2, '0');
  return `${dateKey(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function configureEventDateInputs() {
  const allDay = $('detailAllDay').checked;
  for (const id of ['detailStart', 'detailEnd']) {
    const input = $(id);
    const value = input.value;
    input.type = allDay ? 'date' : 'datetime-local';
    input.value = allDay ? value.slice(0, 10) : value.length === 10 ? `${value}T00:00` : value;
  }
  $('detailEndLabel').textContent = allDay ? '结束日期（不包含当天）' : '结束';
}

function openLocalDetail(kind, item, trigger) {
  detail = { kind, id: item.id, trigger, saving: false };
  $('detailHeading').textContent = kind === 'event' ? '本地日程详情' : '本地任务详情';
  $('detailSubject').value = item.subject || '';
  $('detailNotes').value = item.notes || '';
  const event = kind === 'event';
  $('detailEventFields').classList.toggle('hidden', !event);
  $('detailTaskFields').classList.toggle('hidden', event);
  $('detailStart').required = event;
  $('detailEnd').required = event;
  $('detailAllDay').checked = !!item.isAllDay;
  $('detailStart').type = 'datetime-local';
  $('detailEnd').type = 'datetime-local';
  $('detailStart').value = event ? localInputTime(item.start) : '';
  $('detailEnd').value = event ? localInputTime(item.end || item.start) : '';
  $('detailLocation').value = item.location || '';
  $('detailDue').value = item.dueDateTime ? dateKey(new Date(item.dueDateTime)) : '';
  $('detailImportance').value = item.importance || 'normal';
  $('detailStatus').value = item.status || 'notStarted';
  configureEventDateInputs();
  $('detailFields').disabled = true;
  $('detailError').classList.add('hidden');
  $('btnDetailEdit').classList.remove('hidden');
  $('btnDetailSave').classList.add('hidden');
  $('btnDetailSave').disabled = false;
  $('btnDetailClose').textContent = '关闭';
  $('detailOverlay').classList.remove('hidden');
  $('detailOverlay').scrollTop = 0;
  api.setIgnoreMouseEvents(false);
  $('btnDetailEdit').focus();
}

function closeLocalDetail() {
  if (detail?.saving) return;
  const trigger = detail?.trigger;
  detail = null;
  $('detailOverlay').classList.add('hidden');
  if (trigger?.isConnected) trigger.focus();
}

async function saveLocalDetail(e) {
  e.preventDefault();
  if (!detail || detail.saving) return;
  const subject = $('detailSubject').value.trim();
  const notes = $('detailNotes').value;
  try {
    if (!subject) throw new Error('标题不能为空');
    let patch;
    let targetKey;
    if (detail.kind === 'event') {
      const start = new Date($('detailStart').value + ($('detailAllDay').checked ? 'T00:00:00' : ''));
      const end = new Date($('detailEnd').value + ($('detailAllDay').checked ? 'T00:00:00' : ''));
      if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime())) throw new Error('请填写有效的开始和结束时间');
      if (end < start || ($('detailAllDay').checked && end <= start)) throw new Error('结束时间不能早于开始时间，全天日程至少一天');
      patch = { subject, notes, start: start.toISOString(), end: end.toISOString(), isAllDay: $('detailAllDay').checked, location: $('detailLocation').value.trim() };
      targetKey = dateKey(start);
    } else {
      const due = $('detailDue').value;
      patch = { subject, notes, dueDateTime: due ? `${due}T23:59:00` : null, importance: $('detailImportance').value, status: $('detailStatus').value };
      targetKey = due || dateKey(new Date());
    }
    detail.saving = true;
    $('btnDetailSave').disabled = true;
    const saved = detail.kind === 'event' ? await api.localEventUpdate(detail.id, patch) : await api.localTaskUpdate(detail.id, patch);
    if (!saved) throw new Error('记录已被删除，请关闭详情后刷新');
    state.selectedKey = targetKey;
    const [y, m, d] = targetKey.split('-').map(Number);
    state.view = new Date(y, m - 1, state.calendarView === 'week' ? d : 1);
    detail.saving = false;
    closeLocalDetail();
    await loadMonth();
    setStatus('已保存');
  } catch (err) {
    $('detailError').textContent = err.message;
    $('detailError').classList.remove('hidden');
  } finally {
    if (detail) detail.saving = false;
    $('btnDetailSave').disabled = false;
  }
}

function setupLocalDetail() {
  $('btnDetailClose').addEventListener('click', closeLocalDetail);
  $('btnDetailEdit').addEventListener('click', () => {
    $('detailFields').disabled = false;
    $('btnDetailEdit').classList.add('hidden');
    $('btnDetailSave').classList.remove('hidden');
    $('btnDetailClose').textContent = '取消';
    $('detailSubject').focus();
  });
  $('detailAllDay').addEventListener('change', configureEventDateInputs);
  $('detailForm').addEventListener('submit', saveLocalDetail);
  document.addEventListener('keydown', (e) => {
    if (!detail) return;
    if (e.key === 'Escape') { e.preventDefault(); closeLocalDetail(); }
    if (e.key === 'Tab') {
      const controls = Array.from($('detailOverlay').querySelectorAll('button, input, select, textarea')).filter((el) => !el.matches(':disabled') && el.getClientRects().length);
      const first = controls[0], last = controls[controls.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  });
}

/* ---------------- 导航 ---------------- */

function setupNav() {
  $('btnViewMode').addEventListener('click', async () => {
    const mode = state.calendarView === 'week' ? 'month' : 'week';
    $('btnViewMode').disabled = true;
    try {
      await api.setCalendarView(mode);
      state.calendarView = mode;
      if (mode === 'week') {
        state.view = new Date();
        state.selectedKey = dateKey(state.view);
      }
      renderGrid();
      await loadMonth();
    } catch (err) {
      setStatus('切换失败：' + err.message);
    } finally {
      $('btnViewMode').disabled = false;
    }
  });
  $('btnPrev').addEventListener('click', () => {
    state.view = CalendarView.move(state.view, state.calendarView, -1);
    state.selectedKey = dateKey(state.view);
    renderGrid();
    renderEvents();
    loadMonth();
  });
  $('btnNext').addEventListener('click', () => {
    state.view = CalendarView.move(state.view, state.calendarView, 1);
    state.selectedKey = dateKey(state.view);
    renderGrid();
    renderEvents();
    loadMonth();
  });
  $('btnToday').addEventListener('click', () => {
    state.view = new Date();
    state.selectedKey = dateKey(new Date());
    renderGrid();
    renderEvents();
    loadMonth();
  });
  $('btnRefresh').addEventListener('click', loadMonth);
  $('btnHide').addEventListener('click', () => api.hideWindow());
}

/* ---------------- 启动 ---------------- */

async function init() {
  await setupSettings();
  renderWeekRow();
  renderGrid();
  renderEvents();
  renderTodoPanel();
  setupNav();
  setupLogin();
  setupTodoPanel();
  setupAddEvent();
  setupLocalDetail();
  setupClickThrough();
  const s = await refreshAuth();
  await loadMonth();
  setInterval(() => loadMonth(), 10 * 60 * 1000);
}

function setupClickThrough() {
  let lastInteractive = false;
  document.addEventListener('mousemove', async (e) => {
    const isInteractive = !!e.target.closest(INTERACTIVE);
    if (isInteractive !== lastInteractive) {
      lastInteractive = isInteractive;
      const ct = await api.getClickThrough();
      if (ct) api.setIgnoreMouseEvents(!isInteractive);
    }
  });
}

init();

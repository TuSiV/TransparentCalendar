/* 透明日历 - 渲染层逻辑 */
const $ = (id) => document.getElementById(id);

const WEEKDAYS_MON = ["一", "二", "三", "四", "五", "六", "日"];
const WEEKDAYS_SUN = ["日", "一", "二", "三", "四", "五", "六"];

const state = {
  view: new Date(),
  selectedKey: dateKey(new Date()),
  events: new Map(),
  tasks: new Map(),
  authed: false,
  icsMode: false,
  todoEnabled: false,
  todoLists: [],
  todoListId: "",
  weekStart: 1, // 0=周日, 1=周一
  calendarView: "month",
  showCompleted: false,
};

/* ---------------- 工具 ---------------- */

function dateKey(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;
}

function fmtTime(iso) {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function copyText(text) {
  navigator.clipboard.writeText(text);
}

/* ---------------- 月历渲染 ---------------- */

let userSettings = {};
let syncTimer;
let sourceStatuses = [];

function renderWeekRow() {
  const days = state.weekStart === 0 ? WEEKDAYS_SUN : WEEKDAYS_MON;
  $("weekRow").innerHTML = days
    .map(
      (w) =>
        `<span class="wk${w === "六" || w === "日" ? " weekend" : ""}">${w}</span>`,
    )
    .join("");
}

function renderGrid() {
  const y = state.view.getFullYear();
  const m = state.view.getMonth();
  const week = state.calendarView === "week";
  const range = CalendarView.gridRange(
    state.view,
    state.calendarView,
    state.weekStart,
  );
  const gridStart = range.start;
  const title = week
    ? CalendarView.weekLabel(range.start, range.end)
    : `${y} 年 ${m + 1} 月`;
  $("monthTitle").textContent = title;
  $("monthTitle").title = title;
  $("card").classList.toggle("compact", week);
  $("btnViewMode").textContent = week ? "月" : "周";
  $("btnViewMode").title = week ? "展开为整月" : "缩减为当周";
  $("btnViewMode").setAttribute("aria-label", $("btnViewMode").title);
  $("btnViewMode").setAttribute("aria-pressed", String(week));
  $("btnPrev").title = week ? "上一周" : "上一月";
  $("btnNext").title = week ? "下一周" : "下一月";
  const today = dateKey(new Date());

  let html = "";
  for (let i = 0; i < range.count; i++) {
    const d = new Date(
      gridStart.getFullYear(),
      gridStart.getMonth(),
      gridStart.getDate() + i,
    );
    const key = dateKey(d);
    const classes = ["day"];
    if ([0, 6].includes(d.getDay())) classes.push("weekend");
    if (!week && d.getMonth() !== m) classes.push("dim");
    if (key === today) classes.push("today");
    if (key === state.selectedKey) classes.push("sel");

    const evts = state.events.get(key) || [];
    const tsks = state.tasks.get(key) || [];
    const hasEvt = evts.length > 0;
    const hasTodo = tsks.filter((t) => t.status !== "completed").length > 0;

    let dots = "";
    if (hasEvt || hasTodo) {
      dots = '<span class="dots">';
      if (hasEvt) {
        const colors = [
          ...new Set(evts.map((e) => e.sourceColor || "#34d399")),
        ].filter((c) => /^#[0-9a-f]{6}$/i.test(c));
        dots += colors
          .slice(0, 3)
          .map((c) => `<span class="event-dot" data-color="${c}"></span>`)
          .join("");
      }
      if (hasTodo) dots += '<span class="task-dot"></span>';
      dots += "</span>";
    }

    html += `<button type="button" class="${classes.join(" ")}" data-key="${key}" aria-label="${key}" aria-pressed="${key === state.selectedKey}"><span class="num">${d.getDate()}</span>${dots}</button>`;
  }
  $("grid").innerHTML = html;
  $("grid")
    .querySelectorAll("[data-color]")
    .forEach((el) => (el.style.backgroundColor = el.dataset.color));

  $("grid")
    .querySelectorAll(".day")
    .forEach((el) =>
      el.addEventListener("dblclick", () => {
        openNewEntry('event', el.dataset.key);
      }),
    );
  $("grid")
    .querySelectorAll(".day")
    .forEach((el) =>
      el.addEventListener("click", () => {
        state.selectedKey = el.dataset.key;
        renderGrid();
        renderEvents();
        renderTodoPanel();
      }),
    );
}

/* ---------------- 日程与任务列表 ---------------- */

function renderEvents() {
  const evts = state.events.get(state.selectedKey) || [];
  const [y, m, d] = state.selectedKey.split("-").map(Number);
  const days = state.weekStart === 0 ? WEEKDAYS_SUN : WEEKDAYS_MON;
  const wd = days[(new Date(y, m - 1, d).getDay() - state.weekStart + 7) % 7];
  $("dayLabel").textContent = `${m} 月 ${d} 日 · 星期${wd}`;

  const items = [];

  // 仅事件（任务只在待办面板显示）
  for (const e of evts) {
    const time = e.isAllDay
      ? "全天"
      : e.start === e.end
        ? fmtTime(e.start)
        : `${fmtTime(e.start)} - ${fmtTime(e.end)}`;
    const loc = e.location
      ? `<span class="time location">@ ${esc(e.location)}</span>`
      : "";
    const typeCls = e.isAllDay ? "all-day" : "";
    const localCls = e.local ? " local" : "";
    const delBtn = e.local
      ? `<button type="button" class="del-btn" data-local-event="${e.id}" title="删除" aria-label="删除">&#x2715;</button>`
      : "";
    items.push({
      time: e.isAllDay ? "" : e.start,
      html: `<li class="event ${typeCls}${localCls}" data-event-id="${esc(e.id)}" data-local-event="${e.local ? esc(e.id) : ""}" tabindex="0" role="button" data-link="${esc(e.webLink || "")}" title="${esc(e.subject)}">
        <span class="bar"></span>
        <span class="time">${time}</span>
        <span class="subj">${esc(e.subject)}${e.sourceName ? `<small class="source-label">${esc(e.sourceName)}</small>` : ""}</span>${loc}${delBtn}
      </li>`,
    });
  }

  // 按时间排序
  items.sort((a, b) => a.time.localeCompare(b.time));

  if (!items.length) {
    $("eventList").innerHTML = '<li class="empty">暂无日程</li>';
  } else {
    $("eventList").innerHTML = items.map((i) => i.html).join("");
  }

  // 事件点击复制链接
  $("eventList")
    .querySelectorAll(".event[data-link]")
    .forEach((el) => {
      const link = el.dataset.link;
      const event = evts.find((e) => e.id === el.dataset.eventId);
      if (event?.sourceColor && /^#[0-9a-f]{6}$/i.test(event.sourceColor))
        el.querySelector(".bar").style.background = event.sourceColor;
      const open = () => event && openLocalDetail("event", event, el);
      el.addEventListener("click", open);
      el.addEventListener("keydown", (e) => {
        if (e.target !== el) return;
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          open();
        }
      });
    });

  // 本地日程删除按钮
  $("eventList")
    .querySelectorAll(".del-btn[data-local-event]")
    .forEach((el) =>
      el.addEventListener("click", async (e) => {
        e.stopPropagation();
        if (!confirm("删除此本地日程？")) return;
        await api.localEventDelete(el.dataset.localEvent);
        await loadMonth();
      }),
    );
}

function esc(s) {
  return String(s ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
}

/* ---------------- Todo 面板 ---------------- */

function renderTodoPanel() {
  $("todoPanel").classList.remove("hidden");

  const todayKey = state.selectedKey;
  const todayTasks = state.tasks.get(todayKey) || [];
  const incomplete = todayTasks.filter((t) => t.status !== "completed");
  const completed = todayTasks.filter((t) => t.status === "completed");

  $("todoLabel").textContent = `待办任务 (${incomplete.length})`;

  const items = [];

  // 未完成任务
  for (const t of incomplete) {
    const due = t.dueDateTime
      ? new Date(t.dueDateTime.dateTime || t.dueDateTime).toLocaleDateString(
          "zh-CN",
          { month: "numeric", day: "numeric" },
        )
      : "无截止日";
    const localCls = t.local ? " local" : "";
    const delBtn = t.local
      ? `<button type="button" class="del-btn" data-local-task="${t.id}" title="删除" aria-label="删除">&#x2715;</button>`
      : "";
    items.push(`<li class="event task${localCls}" data-task-id="${t.id}" data-local-task="${t.local ? esc(t.id) : ""}" tabindex="0">
      <button type="button" class="checkbox" data-action="toggle" aria-label="完成任务"></button>
      <span class="bar"></span>
      <span class="subj">${esc(t.subject)}</span>
      <span class="time">${due}</span>${delBtn}
    </li>`);
  }

  // 已完成任务（仅在开启时显示）
  if (state.showCompleted) {
    for (const t of completed) {
      const due = t.dueDateTime
        ? new Date(t.dueDateTime.dateTime || t.dueDateTime).toLocaleDateString(
            "zh-CN",
            { month: "numeric", day: "numeric" },
          )
        : "无截止日";
      const localCls = t.local ? " local" : "";
      items.push(`<li class="event task done${localCls}" data-task-id="${t.id}" data-local-task="${t.local ? esc(t.id) : ""}" tabindex="0">
        <button type="button" class="checkbox done-box" aria-label="恢复未完成" ${t.local ? "" : "disabled"}>&#x2713;</button>
        <span class="bar"></span>
        <span class="subj">${esc(t.subject)}</span>
        <span class="time">${due}</span>
      </li>`);
    }
  }

  if (!items.length) {
    $("todoList").innerHTML = '<li class="empty">无任务</li>';
  } else {
    $("todoList").innerHTML = items.join("");
  }

  $("todoList")
    .querySelectorAll(".task")
    .forEach((el) => {
      const task = todayTasks.find((t) => t.id === el.dataset.taskId);
      if (!task) return;
      el.addEventListener("click", () => openLocalDetail("task", task, el));
      el.addEventListener("keydown", (e) => {
        if (e.target === el && (e.key === "Enter" || e.key === " ")) {
          e.preventDefault();
          openLocalDetail("task", task, el);
        }
      });
    });
  $("todoList")
    .querySelectorAll(".done-box")
    .forEach((el) =>
      el.addEventListener("click", async (e) => {
        e.stopPropagation();
        const id = el.closest(".task").dataset.localTask;
        if (id) {
          await api.localTaskUpdate(id, { status: "notStarted" });
          await loadMonth();
        }
      }),
    );

  // 未完成任务的复选框
  $("todoList")
    .querySelectorAll('.checkbox[data-action="toggle"]')
    .forEach((el) =>
      el.addEventListener("click", (e) => {
        e.stopPropagation();
        const li = el.closest(".event");
        handleToggleTask(li.dataset.taskId, li.dataset.localTask);
      }),
    );

  // 删除按钮
  $("todoList")
    .querySelectorAll(".del-btn[data-local-task]")
    .forEach((el) =>
      el.addEventListener("click", async (e) => {
        e.stopPropagation();
        if (!confirm("删除此本地任务？")) return;
        await api.localTaskDelete(el.dataset.localTask);
        await loadMonth();
      }),
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
    if (task.status === "completed") {
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
    setStatus("完成任务失败，请重试");
  }
}

/* ---------------- 数据拉取 ---------------- */

let loadSequence = 0;
async function loadMonth(force = false) {
  const sequence = ++loadSequence;
  const { start, end } = CalendarView.gridRange(
    state.view,
    state.calendarView,
    state.weekStart,
  );
  const startISO = start.toISOString();
  const endISO = end.toISOString();

  // Keep requests independent so stale results cannot overwrite a new view.
  const nextEvents = new Map();
  const nextTasks = new Map();
  const syncErrors = [];

  try {
    // 拉 Outlook 日历事件（需要登录）
    if (state.authed) {
      setStatus("正在同步…");
      const result = await api
        .getEvents(startISO, endISO, force === true)
        .catch(() => {
          syncErrors.push("日历同步失败");
          return { events: [], statuses: [] };
        });
      sourceStatuses = result.statuses;
      syncErrors.push(
        ...result.statuses
          .filter((s) => s.error)
          .map((s) => s.name + "：" + s.error),
      );
      const events = result.events;
      for (const e of events) addEventDays(nextEvents, e, start, end);
    }

    // 拉本地日程（无需登录）
    const localEvts =
      userSettings.showLocalEvents === false
        ? []
        : await api.localEvents(startISO, endISO);
    for (const e of localEvts) addEventDays(nextEvents, e, start, end);

    // 拉 Outlook Todo 任务（需要登录）
    if (state.todoEnabled && state.todoListId) {
      const tasks = await api
        .todoTasksDueRange(state.todoListId, startISO, endISO)
        .catch((err) => {
          syncErrors.push("任务同步失败：" + err.message);
          return [];
        });
      for (const t of tasks) {
        if (!t.dueDateTime) {
          const key = dateKey(new Date());
          if (!nextTasks.has(key)) nextTasks.set(key, []);
          nextTasks.get(key).push(t);
          continue;
        }
        const dt = new Date(t.dueDateTime.dateTime + "Z");
        const key = dateKey(dt);
        if (!nextTasks.has(key)) nextTasks.set(key, []);
        nextTasks.get(key).push(t);
      }
    }

    // 拉本地任务（无需登录）
    const localTasks =
      userSettings.showLocalTasks === false
        ? []
        : await api.localTasks(startISO, endISO);
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
    $("statusText").title = sourceStatuses
      .map(
        (s) =>
          s.name +
          " · " +
          (s.updated ? new Date(s.updated).toLocaleString() : "尚无缓存") +
          (s.error ? " · " + s.error : s.paused ? " · 已暂停" : ""),
      )
      .join("\n");
    setStatus(
      syncErrors.length
        ? "本地数据已加载；" + syncErrors.join("；")
        : state.authed
          ? sourceStatuses.some((s) => s.paused) || !userSettings.autoSync
            ? "缓存已加载 · 自动更新已暂停"
            : "日历已加载"
          : "本地模式",
    );
  } catch (err) {
    if (sequence !== loadSequence) return;
    setStatus(
      "同步失败：" +
        err.message.replace("Error invoking remote method", "").slice(0, 60),
    );
    if (/未登录|token|401|403/i.test(err.message)) await refreshAuth();
  }

  renderGrid();
  renderEvents();
  renderTodoPanel();
}

function setStatus(t) {
  $("statusText").textContent = t;
}

/* ---------------- 认证 ---------------- */

async function refreshAuth() {
  const s = await api.getStatus();
  state.authed = s.authed;
  state.todoEnabled = !!s.graph && userSettings.todoEnabled !== false;
  state.todoListId = "";
  $("authDot").classList.toggle("on", s.authed);
  $("authDot").title = s.authed ? "已配置外部日历" : "本地模式";
  if (state.todoEnabled) {
    try {
      state.todoLists = await api.todoLists();
      const def =
        state.todoLists.find((l) => l.wellknownName === "tasks") ||
        state.todoLists[0];
      state.todoListId = def?.id || "";
    } catch {
      state.todoEnabled = false;
    }
  }
  return s;
}
function addEventDays(map, event, start, end) {
  const first = new Date(Math.max(new Date(event.start), start));
  const last = new Date(
    Math.min(
      new Date(event.end || event.start).getTime() -
        (new Date(event.end) > new Date(event.start) ? 1 : 0),
      end.getTime() - 1,
    ),
  );
  const day = new Date(first.getFullYear(), first.getMonth(), first.getDate());
  while (day <= last) {
    const key = dateKey(day);
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(event);
    day.setDate(day.getDate() + 1);
  }
}
async function setupSettings() {
  userSettings = await api.getSettings();
  applyAppearance(userSettings);
  state.weekStart = userSettings.weekStart;
  state.calendarView = CalendarView.normalizeMode(userSettings.calendarView);
  $("btnSettings").onclick = () => api.openSettings();
  let changeTimer;
  api.onSettingsChanged((value) => {
    const old = userSettings;
    userSettings = { ...userSettings, ...value };
    applyAppearance(userSettings);
    const dataChanged = [
      "sources",
      "clientId",
      "weekStart",
      "showLocalEvents",
      "showLocalTasks",
      "todoEnabled",
      "autoSync",
      "syncMinutes",
    ].some((k) => JSON.stringify(old[k]) !== JSON.stringify(value[k]));
    state.weekStart = userSettings.weekStart;
    renderWeekRow();
    if (dataChanged) {
      clearTimeout(changeTimer);
      changeTimer = setTimeout(async () => {
        await refreshAuth();
        await loadMonth();
        configureSyncTimer();
      }, 100);
    }
  });
  api.onRefresh(() => loadMonth(true));
}
function configureSyncTimer() {
  clearInterval(syncTimer);
  if (userSettings.autoSync)
    syncTimer = setInterval(
      () => loadMonth(),
      userSettings.syncMinutes * 60000,
    );
}

/* ---------------- 独立记录窗口 ---------------- */
function openNewEntry(kind, date = state.selectedKey) {
  api.openEntry({ kind, mode: 'create', date }).catch((error) => setStatus(error.message));
}
function openLocalDetail(kind, item) {
  api.openEntry({ kind, mode: 'view', ...(item.local ? { id: item.id } : { item }) }).catch((error) => setStatus(error.message));
}
function setupTodoPanel() {
  $('btnToggleDone').addEventListener('click', () => {
    state.showCompleted = !state.showCompleted;
    $('btnToggleDone').classList.toggle('active', state.showCompleted);
    renderTodoPanel();
  });
  $('btnAddTodo').addEventListener('click', () => openNewEntry('task'));
}
function setupAddEvent() {
  $('btnAddEvent').addEventListener('click', () => openNewEntry('event'));
  api.onEntriesChanged(async ({ kind, item }) => {
    const value = kind === 'event' ? item.start : item.dueDateTime?.dateTime || item.dueDateTime;
    if (value) {
      const date = new Date(value);
      state.selectedKey = dateKey(date);
      state.view = new Date(date.getFullYear(), date.getMonth(), state.calendarView === 'week' ? date.getDate() : 1);
    }
    await loadMonth(true);
    setStatus('已保存');
  });
}

/* ---------------- 导航 ---------------- */

function setupNav() {
  $("btnViewMode").addEventListener("click", async () => {
    const mode = state.calendarView === "week" ? "month" : "week";
    $("btnViewMode").disabled = true;
    try {
      await api.setCalendarView(mode);
      state.calendarView = mode;
      if (mode === "week") {
        state.view = new Date();
        state.selectedKey = dateKey(state.view);
      }
      renderGrid();
      await loadMonth();
    } catch (err) {
      setStatus("切换失败：" + err.message);
    } finally {
      $("btnViewMode").disabled = false;
    }
  });
  $("btnPrev").addEventListener("click", () => {
    state.view = CalendarView.move(state.view, state.calendarView, -1);
    state.selectedKey = dateKey(state.view);
    renderGrid();
    renderEvents();
    loadMonth();
  });
  $("btnNext").addEventListener("click", () => {
    state.view = CalendarView.move(state.view, state.calendarView, 1);
    state.selectedKey = dateKey(state.view);
    renderGrid();
    renderEvents();
    loadMonth();
  });
  $("btnToday").addEventListener("click", () => {
    state.view = new Date();
    state.selectedKey = dateKey(new Date());
    renderGrid();
    renderEvents();
    loadMonth();
  });
  $("btnRefresh").addEventListener("click", async () => {
    $("btnRefresh").disabled = true;
    try {
      await loadMonth(true);
    } finally {
      $("btnRefresh").disabled = false;
    }
  });
  $("btnHide").addEventListener("click", () => api.hideWindow());
}

/* ---------------- 启动 ---------------- */

async function init() {
  await setupSettings();
  renderWeekRow();
  renderGrid();
  renderEvents();
  renderTodoPanel();
  setupNav();
  setupTodoPanel();
  setupAddEvent();
  setupResize();
  MouseInteraction.setup({ document, window, api });
  const s = await refreshAuth();
  await loadMonth();
  configureSyncTimer();
}

function setupResize() {
  for (const edge of ["n", "s", "e", "w", "ne", "nw", "se", "sw"]) {
    const grip = document.createElement("div");
    grip.className = "resize-grip grip-" + edge;
    grip.addEventListener("pointerdown", (e) => {
      if (e.button !== 0) return;
      e.preventDefault();
      grip.setPointerCapture(e.pointerId);
      api.resizeStart(edge);
    });
    const stop = () => api.resizeEnd();
    grip.addEventListener("pointerup", stop);
    grip.addEventListener("pointercancel", stop);
    grip.addEventListener("lostpointercapture", stop);
    $("resizeGrips").append(grip);
  }
  window.addEventListener("blur", () => api.resizeEnd());
}

init().catch((err) => setStatus("加载失败：" + err.message));

const {
  app,
  BrowserWindow,
  Tray,
  Menu,
  ipcMain,
  nativeImage,
  screen,
  globalShortcut,
  shell,
} = require("electron");
const path = require("path");
const fs = require("fs");
const auth = require("./auth");
const graph = require("./graph");
const ics = require("./ics");
const todo = require("./todo");
const store = require("./store");
const startup = require("./startup");
const preferences = require("./preferences");
const sources = require("./sources");
const crypto = require("node:crypto");
const { createClickThrough } = require("./click-through");
const { setupEntryWindows } = require("./entry-windows");
let settingsWin = null;
let resizeTimer = null;
let changingView = false;

let win = null;
let tray = null;
app.isQuitting = false;

function interactionState(enabled = mousePolicy.enabled) {
  const cursor = screen.getCursorScreenPoint();
  const bounds = win?.getBounds();
  return {
    enabled,
    point: bounds ? { x: cursor.x - bounds.x, y: cursor.y - bounds.y } : null,
  };
}
const mousePolicy = createClickThrough({
  apply(ignore) {
    if (win && !win.isDestroyed())
      win.setIgnoreMouseEvents(ignore, { forward: true });
  },
  notify(enabled) {
    for (const window of [win, settingsWin]) {
      if (window && !window.isDestroyed())
        window.webContents.send(
          "win:clickThroughChanged",
          interactionState(enabled),
        );
    }
  },
});

const settingsPath = () => path.join(app.getPath("userData"), "settings.json");

function loadSettings() {
  try {
    return preferences.normalize(
      JSON.parse(fs.readFileSync(settingsPath(), "utf-8")),
    );
  } catch {
    return preferences.normalize();
  }
}

function saveSettings(patch) {
  const s = Object.assign(loadSettings(), patch);
  delete s.opacity;
  delete s.icsUrl;
  fs.mkdirSync(path.dirname(settingsPath()), { recursive: true });
  fs.writeFileSync(settingsPath(), JSON.stringify(s, null, 2));
  entryWindows.broadcastSettings(s);
  for (const window of [win, settingsWin])
    if (window && !window.isDestroyed())
      window.webContents.send("settings:changed", s);
  return s;
}

function createWindow() {
  const s = loadSettings();
  const mode = s.calendarView;
  const saved = s.windowBounds?.[mode];
  const area = saved
    ? screen.getDisplayMatching(saved).workArea
    : screen.getPrimaryDisplay().workArea;
  const bounds = preferences.boundsFor(mode, s, area);

  win = new BrowserWindow({
    ...bounds,
    backgroundColor: "#00000000",
    transparent: true,
    frame: false,
    resizable: false,
    alwaysOnTop: s.alwaysOnTop,
    skipTaskbar: true,
    hasShadow: false,
    icon: path.join(__dirname, "..", "assets", "tray.png"),
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  win.setAlwaysOnTop(s.alwaysOnTop);
  mousePolicy.refresh();
  try {
    registerShortcut(s.shortcut);
  } catch {
    /* Recover through tray if unavailable. */
  }
  win.loadFile(path.join(__dirname, "renderer", "index.html"));

  const savePos = () => {
    if (win && !win.isDestroyed()) {
      const b = win.getBounds();
      if (!changingView) {
        const current = loadSettings();
        saveSettings({
          windowBounds: { ...current.windowBounds, [current.calendarView]: b },
        });
      }
    }
  };
  let saveTimer;
  const scheduleSave = () => {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(savePos, 180);
  };
  win.on("moved", scheduleSave);
  win.on("resize", scheduleSave);
  win.on("closed", () => {
    clearTimeout(saveTimer);
    win = null;
  });

  win.on("close", (e) => {
    if (app.isQuitting) return;
    if (loadSettings().closeBehavior !== "quit") {
      e.preventDefault();
      win.hide();
    } else {
      app.isQuitting = true;
      app.quit();
    }
  });
}

function setClickThrough(v) {
  mousePolicy.setEnabled(v);
  if (tray) tray.setContextMenu(buildTrayMenu());
}

function buildTrayMenu() {
  return Menu.buildFromTemplate([
    { label: "显示 / 隐藏", click: toggleWin },
    { label: "设置", click: openSettings },
    {
      label: "立即同步",
      click: () => win?.webContents.send("calendar:refresh"),
    },
    {
      label: "始终置顶",
      type: "checkbox",
      checked: loadSettings().alwaysOnTop,
      click: (item) => {
        saveSettings({ alwaysOnTop: item.checked });
        win?.setAlwaysOnTop(item.checked);
        tray.setContextMenu(buildTrayMenu());
      },
    },
    { type: "separator" },
    {
      label: "鼠标穿透（空白处穿透，控件可操作）",
      type: "checkbox",
      checked: mousePolicy.enabled,
      click: (item) => setClickThrough(item.checked),
    },
    { type: "separator" },
    {
      label: "退出",
      click: () => {
        app.isQuitting = true;
        app.quit();
      },
    },
  ]);
}

function toggleWin() {
  if (!win) return;
  if (win.isVisible()) {
    win.hide();
  } else {
    win.show();
    win.focus();
  }
}

function createTray() {
  const icon = nativeImage.createFromPath(
    path.join(__dirname, "..", "assets", "tray.png"),
  );
  tray = new Tray(icon);
  tray.setToolTip("透明日历 · Outlook");
  tray.setContextMenu(buildTrayMenu());
  tray.on("click", toggleWin);
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (win) {
      win.show();
      win.focus();
    }
  });

  app.whenReady().then(() => {
    createWindow();
    createTray();
  });
}

app.on("before-quit", (event) => {
  if (!entryWindows.requestQuit(event)) return;
  app.isQuitting = true;
  clearInterval(resizeTimer);
  globalShortcut.unregisterAll();
});

app.on("window-all-closed", () => {
  // 常驻托盘，不退出
});

/* ---------------- IPC ---------------- */

ipcMain.handle("settings:get", () => ({
  ...loadSettings(),
  ...startup.getStartupSettings(),
}));

function registerShortcut(accelerator) {
  if (!accelerator) {
    globalShortcut.unregisterAll();
    return;
  }
  const previous = loadSettings().shortcut;
  globalShortcut.unregisterAll();
  try {
    if (
      !globalShortcut.register(accelerator, () => {
        setClickThrough(false);
        win?.show();
        win?.focus();
      })
    )
      throw new Error("快捷键已被占用");
  } catch (err) {
    if (previous && previous !== accelerator)
      globalShortcut.register(previous, () => {
        setClickThrough(false);
        win?.show();
      });
    throw new Error("无法注册快捷键，请更换组合");
  }
}
function openSettings() {
  if (settingsWin && !settingsWin.isDestroyed()) {
    settingsWin.show();
    settingsWin.focus();
    return;
  }
  settingsWin = new BrowserWindow({
    width: 760,
    height: 640,
    minWidth: 580,
    minHeight: 460,
    title: "TransparentCalendar · 设置",
    backgroundColor: "#151923",
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });
  settingsWin.loadFile(path.join(__dirname, "renderer", "settings.html"));
  settingsWin.on("closed", () => {
    settingsWin = null;
  });
}
ipcMain.handle("settings:open", openSettings);
ipcMain.handle("settings:save", (_e, patch) => {
  const valid = preferences.validatePatch(patch);
  if (
    Object.hasOwn(valid, "clientId") &&
    valid.clientId !== loadSettings().clientId &&
    loadSettings().sources.some((x) => x.type === "graph")
  )
    throw new Error("更换 Client ID 前请先断开 Microsoft 账户");
  if (Object.hasOwn(valid, "shortcut")) registerShortcut(valid.shortcut);
  if (Object.hasOwn(valid, "startOnLogin"))
    startup.setStartupEnabled(valid.startOnLogin);
  const saved = saveSettings(valid);
  win?.setAlwaysOnTop(saved.alwaysOnTop);
  if (tray) tray.setContextMenu(buildTrayMenu());
  return { ...saved, ...startup.getStartupSettings() };
});
ipcMain.handle("win:hide", () => win && win.hide());
ipcMain.handle("win:setClickThrough", (_e, enabled) =>
  setClickThrough(!!enabled),
);
ipcMain.handle("win:getClickThrough", () => mousePolicy.enabled);
ipcMain.handle("win:getInteractionState", () => interactionState());
ipcMain.on("win:interactive", (event, interactive) => {
  if (event.sender === win?.webContents && typeof interactive === "boolean")
    mousePolicy.setInteractive(interactive);
});
ipcMain.handle("win:resetBounds", () => {
  const s = loadSettings();
  const area = screen.getPrimaryDisplay().workArea;
  win.setBounds(preferences.boundsFor(s.calendarView, {}, area));
});
// Transparent windows use explicit edge grips: no native-resize transparency dependency.
ipcMain.handle("win:resizeStart", (_e, edge) => {
  if (!win || !/^(n|s|e|w|ne|nw|se|sw)$/.test(edge)) return;
  clearInterval(resizeTimer);
  const origin = screen.getCursorScreenPoint(),
    bounds = win.getBounds();
  const area = screen.getDisplayMatching(bounds).workArea;
  resizeTimer = setInterval(() => {
    if (!win || win.isDestroyed()) return clearInterval(resizeTimer);
    const point = screen.getCursorScreenPoint();
    const dx = point.x - origin.x,
      dy = point.y - origin.y;
    const b = { ...bounds };
    if (edge.includes("e"))
      b.width = Math.max(
        300,
        Math.min(area.x + area.width - b.x, bounds.width + dx),
      );
    if (edge.includes("s"))
      b.height = Math.max(
        320,
        Math.min(area.y + area.height - b.y, bounds.height + dy),
      );
    if (edge.includes("w")) {
      b.x = Math.max(
        area.x,
        Math.min(bounds.x + dx, bounds.x + bounds.width - 300),
      );
      b.width = bounds.x + bounds.width - b.x;
    }
    if (edge.includes("n")) {
      b.y = Math.max(
        area.y,
        Math.min(bounds.y + dy, bounds.y + bounds.height - 320),
      );
      b.height = bounds.y + bounds.height - b.y;
    }
    win.setBounds(b);
  }, 16);
});
ipcMain.handle("win:resizeEnd", () => {
  clearInterval(resizeTimer);
  resizeTimer = null;
});
ipcMain.handle("calendar:setView", (_e, mode) => {
  if (!["week", "month"].includes(mode)) throw new Error("日历视图无效");
  const s = loadSettings();
  const windowBounds = { ...s.windowBounds, [s.calendarView]: win.getBounds() };
  changingView = true;
  saveSettings({ calendarView: mode, windowBounds });
  const area = screen.getDisplayMatching(
    windowBounds[mode] || win.getBounds(),
  ).workArea;
  win.setBounds(preferences.boundsFor(mode, { ...s, windowBounds }, area));
  changingView = false;
  return { calendarView: mode };
});

let loginPending = false;
ipcMain.handle("auth:login", async (e) => {
  if (loginPending) throw new Error("已有授权请求，请完成或等待其过期");
  const clientId = loadSettings().clientId;
  if (!clientId) throw new Error("请先填写 Azure 公共客户端应用的 Client ID");
  loginPending = true;
  try {
    const result = await auth.login(clientId, (info) => {
      if (!e.sender.isDestroyed())
        e.sender.send("auth:devicecode", {
          verificationUri: info.verificationUri,
          userCode: info.userCode,
        });
    });
    return { accountId: result.account.homeAccountId };
  } finally {
    loginPending = false;
  }
});
ipcMain.handle("auth:accounts", async () => {
  const s = loadSettings();
  return (await auth.listAccounts(s.clientId)).map((a) => ({
    id: a.homeAccountId,
    name: a.username,
  }));
});
ipcMain.handle("auth:logout", async (_e, accountId) => {
  const s = loadSettings();
  if (s.clientId) await auth.logout(s.clientId, accountId);
  const ids = s.sources
    .filter(
      (x) => x.type === "graph" && (!accountId || x.accountId === accountId),
    )
    .map((x) => x.id);
  removeSources(ids);
  return { ok: true };
});
ipcMain.handle("auth:status", async () => {
  const s = loadSettings();
  const account = await auth.getSignedInAccount(s.clientId);
  return {
    authed: s.sources.length > 0 || !!account,
    graph: !!account,
    needClientId: !s.clientId,
  };
});
const cachePath = () =>
  path.join(app.getPath("userData"), "calendar-cache.json");
function readCache() {
  try {
    return JSON.parse(fs.readFileSync(cachePath(), "utf8"));
  } catch {
    return {};
  }
}
function writeCache(data) {
  fs.mkdirSync(path.dirname(cachePath()), { recursive: true });
  fs.writeFileSync(cachePath(), JSON.stringify(data));
}
async function tokenFor(accountId) {
  const s = loadSettings();
  const account = await auth.getSignedInAccount(s.clientId, accountId);
  if (!account) throw new Error("未登录");
  return auth.getToken(s.clientId, account);
}
const syncSources = sources.createSync({
  read: readCache,
  write: writeCache,
  fetchSource: async (source, start, end) =>
    source.type === "ics"
      ? ics.getEvents(source.url, start, end)
      : graph.getCalendarView(
          await tokenFor(source.accountId),
          start,
          end,
          source.calendarId,
        ),
});
async function configuredSources() {
  const s = loadSettings();
  // Migrate existing Graph users without discarding the previous default calendar.
  if (
    !s.sources.some((x) => x.type === "graph") &&
    !s.graphMigrated &&
    s.clientId
  ) {
    const account = await auth.getSignedInAccount(s.clientId);
    if (account)
      return saveSettings({
        graphMigrated: true,
        sources: [
          ...s.sources,
          {
            id: "legacy-graph",
            type: "graph",
            accountId: account.homeAccountId,
            name: "Outlook 默认日历",
            color: "#60a5fa",
            visible: true,
            sync: true,
          },
        ],
      }).sources;
  }
  return s.sources;
}
ipcMain.handle("calendar:getEvents", async (_e, start, end, force = false) => {
  if (
    !Number.isFinite(Date.parse(start)) ||
    !Number.isFinite(Date.parse(end)) ||
    new Date(end) <= new Date(start) ||
    new Date(end) - new Date(start) > 100 * 86400000
  )
    throw new Error("日期范围无效");
  const s = loadSettings();
  const result = await syncSources(await configuredSources(), start, end, {
    force: !!force,
    interval: s.autoSync ? s.syncMinutes * 60000 : Infinity,
  });
  // A removed source must not recreate its cached data from an in-flight fetch.
  const ids = new Set(loadSettings().sources.map((x) => x.id));
  const cache = readCache();
  writeCache(
    Object.fromEntries(
      Object.entries(cache).filter(([key]) =>
        [...ids].some((id) => key.startsWith(id + ":")),
      ),
    ),
  );
  return result;
});
ipcMain.handle("calendar:discover", async (_e, accountId) =>
  graph.getCalendars(await tokenFor(accountId)),
);
ipcMain.handle("sources:list", configuredSources);
ipcMain.handle("sources:status", () => {
  const cache = readCache();
  return loadSettings().sources.map((source) => {
    const matches = Object.entries(cache)
      .filter(([k]) => k.startsWith(source.id + ":"))
      .map(([, v]) => v)
      .sort((a, b) => (b.attempted || b.updated) - (a.attempted || a.updated));
    const value = matches[0] || {};
    return { id: source.id, updated: value.updated, error: value.error };
  });
});
ipcMain.handle("sources:save", async (_e, raw) => {
  const source = sources.validateSource(raw);
  const s = loadSettings();
  const id = source.id || crypto.randomUUID();
  if (source.type === "ics") {
    if (source.id) {
      if (!s.sources.some((x) => x.id === source.id && x.type === "ics"))
        throw new Error("订阅不存在");
    }
  } else {
    if (!(await auth.getSignedInAccount(s.clientId, source.accountId)))
      throw new Error("账户无效");
    const calendars = await graph.getCalendars(
      await tokenFor(source.accountId),
    );
    if (!calendars.some((x) => x.id === source.calendarId))
      throw new Error("日历无效");
  }
  const existing = s.sources.find((x) => x.id === id);
  const clean = {
    id,
    type: source.type,
    name: source.name,
    color: source.color,
    visible: source.visible,
    sync: source.sync,
    ...(source.type === "ics"
      ? { url: source.url }
      : { accountId: source.accountId, calendarId: source.calendarId }),
  };
  if (existing?.url !== clean.url) removeCache([id]);
  saveSettings({
    sources: [...s.sources.filter((x) => x.id !== id), clean],
    graphMigrated: true,
  });
  return clean;
});
ipcMain.handle("sources:patch", (_e, id, patch) => {
  if (
    Object.keys(patch).some(
      (k) => !["visible", "sync", "color", "name"].includes(k),
    )
  )
    throw new Error("修改无效");
  const s = loadSettings();
  if (!s.sources.some((x) => x.id === id)) throw new Error("日历不存在");
  saveSettings({
    sources: s.sources.map((x) =>
      x.id === id ? sources.validateSource({ ...x, ...patch }) : x,
    ),
  });
});
function removeCache(ids) {
  writeCache(
    Object.fromEntries(
      Object.entries(readCache()).filter(
        ([key]) => !ids.some((id) => key.startsWith(id + ":")),
      ),
    ),
  );
}
function removeSources(ids) {
  const s = loadSettings();
  removeCache(ids);
  saveSettings({
    sources: s.sources.filter((x) => !ids.includes(x.id)),
    graphMigrated: true,
  });
}
ipcMain.handle("sources:remove", (_e, id) => removeSources([id]));
ipcMain.handle("sources:test", async (_e, url) => {
  try {
    const start = new Date(),
      end = new Date(Date.now() + 90 * 86400000);
    const events = await ics.getEvents(sources.safeUrl(url), start, end);
    return {
      count: events.length,
      examples: events
        .slice(0, 3)
        .map((x) => ({ subject: x.subject, start: x.start })),
    };
  } catch (err) {
    throw new Error(
      /下载失败/.test(err.message)
        ? err.message
        : "连接失败或内容无法解析为日历，请检查地址和网络",
    );
  }
});
ipcMain.handle("calendar:openEventLink", (_e, value) => {
  const url = new URL(value);
  if (
    url.protocol !== "https:" ||
    ![
      "outlook.live.com",
      "outlook.office.com",
      "outlook.office365.com",
    ].includes(url.hostname)
  )
    throw new Error("日历链接无效");
  return shell.openExternal(url.href);
});
ipcMain.handle("app:info", () => ({ version: app.getVersion() }));
ipcMain.handle("app:openLink", (_e, url) => {
  if (
    [
      "https://github.com/TuSiV/TransparentCalendar",
      "https://github.com/TuSiV/TransparentCalendar/releases",
      "https://github.com/TuSiV/TransparentCalendar/blob/main/LICENSE",
      "https://microsoft.com/devicelogin",
      "https://portal.azure.com/",
    ].includes(url)
  )
    return shell.openExternal(url);
  throw new Error("链接无效");
});

/* ---------------- Todo IPC ---------------- */

async function getTodoToken() {
  const s = loadSettings();
  if (!s.clientId) throw new Error("未配置 Client ID");
  const acc = await auth.getSignedInAccount(s.clientId);
  if (!acc) throw new Error("未登录");
  return auth.getToken(s.clientId, acc);
}

ipcMain.handle("todo:lists", async () => {
  const token = await getTodoToken();
  return todo.getLists(token);
});

ipcMain.handle("todo:tasks", async (_e, listId, dateISO) => {
  const token = await getTodoToken();
  const date = dateISO ? new Date(dateISO) : null;
  return todo.getTasks(token, listId, date);
});

ipcMain.handle("todo:tasksDueRange", async (_e, listId, startISO, endISO) => {
  const token = await getTodoToken();
  return todo.getTasksDueInRange(
    token,
    listId,
    new Date(startISO),
    new Date(endISO),
  );
});

ipcMain.handle("todo:create", async (_e, listId, opts) => {
  const token = await getTodoToken();
  return todo.createTask(token, listId, opts);
});

ipcMain.handle("todo:complete", async (_e, listId, taskId) => {
  const token = await getTodoToken();
  return todo.completeTask(token, listId, taskId);
});

ipcMain.handle("todo:delete", async (_e, listId, taskId) => {
  const token = await getTodoToken();
  return todo.deleteTask(token, listId, taskId);
});

/* ---------------- Local Store IPC ---------------- */

ipcMain.handle("local:events", (_e, startISO, endISO) =>
  store.getLocalEvents(startISO, endISO),
);
ipcMain.handle("local:event:add", (_e, opts) => store.addLocalEvent(opts));
ipcMain.handle("local:event:delete", (_e, id) => store.deleteLocalEvent(id));
ipcMain.handle("local:event:update", (_e, id, patch) =>
  store.updateLocalEvent(id, patch),
);

ipcMain.handle("local:tasks", (_e, startISO, endISO) =>
  store.getLocalTasks(startISO, endISO),
);
ipcMain.handle("local:task:add", (_e, opts) => store.addLocalTask(opts));
ipcMain.handle("local:task:update", (_e, id, patch) =>
  store.updateLocalTask(id, patch),
);
ipcMain.handle("local:task:complete", (_e, id) => store.completeLocalTask(id));
ipcMain.handle("local:task:delete", (_e, id) => store.deleteLocalTask(id));

const entryWindows = setupEntryWindows({
  getParent: () => win,
  getSettings: loadSettings,
  async createOutlookTask(values) {
    const token = await getTodoToken();
    const lists = await todo.getLists(token);
    const list = lists.find((item) => item.wellknownName === 'tasks') || lists[0];
    if (!list) throw new Error('请先在 Microsoft To Do 中创建任务列表');
    return todo.createTask(token, list.id, {
      subject: values.subject,
      dueDateTime: values.dueDateTime ? { dateTime: new Date(values.dueDateTime).toISOString().replace(/Z$/, ''), timeZone: 'UTC' } : null,
    });
  },
  changed(value) {
    if (win && !win.isDestroyed()) win.webContents.send('entry:changed', value);
  },
});

const { app, BrowserWindow, Tray, Menu, ipcMain, nativeImage, screen } = require('electron');
const path = require('path');
const fs = require('fs');
const auth = require('./auth');
const graph = require('./graph');
const ics = require('./ics');
const todo = require('./todo');
const store = require('./store');

let win = null;
let tray = null;
let clickThrough = false;
app.isQuitting = false;

const settingsPath = () => path.join(app.getPath('userData'), 'settings.json');

function loadSettings() {
  try {
    return JSON.parse(fs.readFileSync(settingsPath(), 'utf-8'));
  } catch {
    return {};
  }
}

function saveSettings(patch) {
  const s = Object.assign(loadSettings(), patch);
  fs.mkdirSync(path.dirname(settingsPath()), { recursive: true });
  fs.writeFileSync(settingsPath(), JSON.stringify(s, null, 2));
  return s;
}

function createWindow() {
  const s = loadSettings();
  const { width: sw } = screen.getPrimaryDisplay().workAreaSize;
  const w = 340;
  const h = 580;
  const x = Number.isInteger(s.x) ? s.x : sw - w - 40;
  const y = Number.isInteger(s.y) ? s.y : 40;

  win = new BrowserWindow({
    width: w,
    height: h,
    x,
    y,
    transparent: true,
    frame: false,
    resizable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    hasShadow: false,
    icon: path.join(__dirname, '..', 'assets', 'tray.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  win.setAlwaysOnTop(true, 'screen-saver');
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));

  const savePos = () => {
    if (win && !win.isDestroyed()) {
      const b = win.getBounds();
      saveSettings({ x: b.x, y: b.y });
    }
  };
  win.on('moved', savePos);

  win.on('close', (e) => {
    if (!app.isQuitting) {
      e.preventDefault();
      win.hide();
    }
  });
}

function setClickThrough(v) {
  clickThrough = v;
  if (win && !win.isDestroyed()) win.setIgnoreMouseEvents(v, { forward: true });
  if (tray) tray.setContextMenu(buildTrayMenu());
}

function buildTrayMenu() {
  return Menu.buildFromTemplate([
    { label: '显示 / 隐藏', click: toggleWin },
    { type: 'separator' },
    {
      label: '鼠标穿透（点击穿透到桌面）',
      type: 'checkbox',
      checked: clickThrough,
      click: (item) => setClickThrough(item.checked),
    },
    { type: 'separator' },
    {
      label: '退出',
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
  const icon = nativeImage.createFromPath(path.join(__dirname, '..', 'assets', 'tray.png'));
  tray = new Tray(icon);
  tray.setToolTip('透明日历 · Outlook');
  tray.setContextMenu(buildTrayMenu());
  tray.on('click', toggleWin);
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
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

app.on('before-quit', () => {
  app.isQuitting = true;
});

app.on('window-all-closed', () => {
  // 常驻托盘，不退出
});

/* ---------------- IPC ---------------- */

ipcMain.handle('settings:get', () => loadSettings());

ipcMain.handle('settings:save', (_e, patch) => saveSettings(patch));

ipcMain.handle('win:hide', () => win && win.hide());

ipcMain.handle('win:setOpacity', (_e, v) => {
  if (win && !win.isDestroyed()) win.setOpacity(Math.min(1, Math.max(0.2, v)));
});

ipcMain.handle('win:setIgnoreMouseEvents', (_e, ignore) => {
  if (win && !win.isDestroyed()) win.setIgnoreMouseEvents(ignore, { forward: true });
});

ipcMain.handle('win:getClickThrough', () => clickThrough);

ipcMain.handle('auth:login', async (e) => {
  const clientId = loadSettings().clientId;
  if (!clientId) throw new Error('请先在设置中填写 Azure 应用的 Client ID');
  try {
    await auth.login(clientId, (info) => {
      if (!e.sender.isDestroyed()) e.sender.send('auth:devicecode', info);
    });
    return { ok: true };
  } catch (err) {
    throw new Error(err.message || '登录失败');
  }
});

ipcMain.handle('auth:logout', async () => {
  const s = loadSettings();
  if (s.clientId) await auth.logout(s.clientId);
  if (s.icsUrl) saveSettings({ icsUrl: '' });
  return { ok: true };
});

ipcMain.handle('auth:status', async () => {
  const s = loadSettings();
  if (s.icsUrl) return { authed: true, ics: true, needClientId: false };
  if (!s.clientId) return { authed: false, needClientId: true };
  const acc = await auth.getSignedInAccount(s.clientId);
  return { authed: !!acc, needClientId: false };
});

ipcMain.handle('calendar:getEvents', async (_e, startISO, endISO) => {
  const s = loadSettings();
  if (s.icsUrl) return ics.getEvents(s.icsUrl, startISO, endISO);
  if (!s.clientId) throw new Error('未配置');
  const acc = await auth.getSignedInAccount(s.clientId);
  if (!acc) throw new Error('未登录');
  const token = await auth.getToken(s.clientId, acc);
  return graph.getCalendarView(token, startISO, endISO);
});

/* ---------------- Todo IPC ---------------- */

async function getTodoToken() {
  const s = loadSettings();
  if (!s.clientId) throw new Error('未配置 Client ID');
  const acc = await auth.getSignedInAccount(s.clientId);
  if (!acc) throw new Error('未登录');
  return auth.getToken(s.clientId, acc);
}

ipcMain.handle('todo:lists', async () => {
  const token = await getTodoToken();
  return todo.getLists(token);
});

ipcMain.handle('todo:tasks', async (_e, listId, dateISO) => {
  const token = await getTodoToken();
  const date = dateISO ? new Date(dateISO) : null;
  return todo.getTasks(token, listId, date);
});

ipcMain.handle('todo:tasksDueRange', async (_e, listId, startISO, endISO) => {
  const token = await getTodoToken();
  return todo.getTasksDueInRange(token, listId, new Date(startISO), new Date(endISO));
});

ipcMain.handle('todo:create', async (_e, listId, opts) => {
  const token = await getTodoToken();
  return todo.createTask(token, listId, opts);
});

ipcMain.handle('todo:complete', async (_e, listId, taskId) => {
  const token = await getTodoToken();
  return todo.completeTask(token, listId, taskId);
});

ipcMain.handle('todo:delete', async (_e, listId, taskId) => {
  const token = await getTodoToken();
  return todo.deleteTask(token, listId, taskId);
});

/* ---------------- Local Store IPC ---------------- */

ipcMain.handle('local:events', (_e, startISO, endISO) => store.getLocalEvents(startISO, endISO));
ipcMain.handle('local:event:add', (_e, opts) => store.addLocalEvent(opts));
ipcMain.handle('local:event:delete', (_e, id) => store.deleteLocalEvent(id));
ipcMain.handle('local:event:update', (_e, id, patch) => store.updateLocalEvent(id, patch));

ipcMain.handle('local:tasks', (_e, startISO, endISO) => store.getLocalTasks(startISO, endISO));
ipcMain.handle('local:task:add', (_e, opts) => store.addLocalTask(opts));
ipcMain.handle('local:task:complete', (_e, id) => store.completeLocalTask(id));
ipcMain.handle('local:task:delete', (_e, id) => store.deleteLocalTask(id));

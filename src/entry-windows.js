const path = require('node:path');
const { app, BrowserWindow, ipcMain, dialog, screen } = require('electron');
const store = require('./store');
const { centeredEntryBounds } = require('./entry-bounds');

// Each editor owns its record and write permissions in the main process.
function setupEntryWindows({ getParent, getSettings, createOutlookTask, changed }) {
  const sessions = new Map();
  let quitting = false;
  const desktopArea = () => screen.getDisplayMatching(getParent().getBounds()).workArea;
  const lookup = (kind, id) => kind === 'event' ? store.getLocalEvent(id) : store.getLocalTask(id);
  function sessionFor(event) {
    const session = sessions.get(event.sender.id);
    if (!session) throw new Error('请从日历打开记录窗口');
    return session;
  }
  ipcMain.handle('entry:open', (event, request) => {
    if (event.sender !== getParent()?.webContents) throw new Error('请从主日历打开记录');
    if (!request || !['event', 'task'].includes(request.kind) || !['create', 'view'].includes(request.mode))
      throw new Error('记录类型无效');
    const { kind, mode } = request;
    let item = null;
    const id = mode === 'view' ? request.id : null;
    if (id) {
      item = lookup(kind, id);
      if (!item) throw new Error('记录已被删除，请刷新日历');
      for (const session of sessions.values()) {
        if (session.kind === kind && session.id === id) {
          if (session.window.isMinimized()) session.window.restore();
          const { x, y, width, height, minWidth, minHeight } = centeredEntryBounds(desktopArea(), session.window.getBounds());
          session.window.setMinimumSize(minWidth, minHeight);
          session.window.setBounds({ x, y, width, height });
          session.window.show();
          session.window.focus();
          return;
        }
      }
    } else if (mode === 'view') {
      if (!request.item || typeof request.item.subject !== 'string') throw new Error('记录无效');
      item = request.item;
    }
    const settings = getSettings();
    const target = mode === 'create' && kind === 'task' && settings.defaultTaskTarget === 'outlook' ? 'outlook' : 'local';
    const readonly = mode === 'view' && !id;
    const popup = new BrowserWindow({
      ...centeredEntryBounds(desktopArea()),
      parent: getParent(), modal: false, show: false,
      backgroundColor: settings.theme === 'light' ? '#f8fafc' : '#171c26',
      transparent: false, resizable: true, alwaysOnTop: settings.alwaysOnTop,
      autoHideMenuBar: true,
      title: mode === 'create' ? (kind === 'event' ? '新增日程' : '新增任务') : '记录详情',
      webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: false },
    });
    const session = { window: popup, kind, mode, id, item, target, readonly, date: /^\d{4}-\d{2}-\d{2}$/.test(request.date) ? request.date : null, dirty: false, saving: false, prompting: false };
    const senderId = popup.webContents.id;
    sessions.set(senderId, session);
    popup.once('ready-to-show', () => { popup.show(); popup.focus(); });
    popup.on('close', (event) => {
      if (session.saving || session.prompting) { event.preventDefault(); return; }
      if (!session.dirty) return;
      event.preventDefault();
      session.prompting = true;
      dialog.showMessageBox(popup, {
        type: 'question', title: '未保存的修改', message: '是否保存修改？',
        buttons: ['保存', '放弃修改', '取消'], defaultId: 0, cancelId: 2, noLink: true,
      }).then(({ response }) => {
        session.prompting = false;
        if (popup.isDestroyed()) return;
        if (response === 0) popup.webContents.send('entry:requestSave');
        if (response === 1) { session.dirty = false; popup.close(); }
        if (response === 2) quitting = false;
      }).catch(() => { session.prompting = false; quitting = false; });
    });
    popup.on('closed', () => {
      sessions.delete(senderId);
      if (quitting) setImmediate(() => app.quit());
    });
    popup.loadFile(path.join(__dirname, 'renderer', 'entry.html'));
  });
  ipcMain.handle('entry:get', (event) => {
    const { kind, mode, item, readonly, target, date } = sessionFor(event);
    return { kind, mode, item, readonly, target, date };
  });
  ipcMain.on('entry:dirty', (event, dirty) => {
    const session = sessions.get(event.sender.id);
    if (session && !session.readonly) session.dirty = dirty === true;
  });
  ipcMain.handle('entry:close', (event) => sessionFor(event).window.close());
  ipcMain.handle('entry:save', async (event, values) => {
    const session = sessionFor(event);
    if (session.readonly) throw new Error('外部记录为只读，请在原日历中修改');
    if (session.saving) throw new Error('正在保存，请稍候');
    if (!values || typeof values.subject !== 'string' || !values.subject.trim()) throw new Error('标题不能为空');
    if (values.subject.length > 500 || typeof values.notes !== 'string' || values.notes.length > 10000) throw new Error('标题或备注过长');
    const fields = session.kind === 'event' ? ['subject', 'notes', 'start', 'end', 'isAllDay', 'location'] : ['subject', 'notes', 'dueDateTime', 'importance', 'status'];
    const patch = Object.fromEntries(fields.map((key) => [key, values[key]]));
    if (session.id && JSON.stringify(lookup(session.kind, session.id)) !== JSON.stringify(session.item))
      throw new Error('记录已被修改或删除，请关闭窗口并重新打开');
    session.saving = true;
    try {
      let saved;
      if (session.target === 'outlook') {
        if (patch.dueDateTime !== null && !Number.isFinite(Date.parse(patch.dueDateTime))) throw new Error('截止日期无效');
        saved = await createOutlookTask(patch);
      } else if (session.kind === 'event') {
        saved = session.id ? store.updateLocalEvent(session.id, patch) : store.addLocalEvent(patch);
      } else {
        saved = session.id ? store.updateLocalTask(session.id, patch) : store.addLocalTask(patch);
      }
      session.dirty = false;
      changed({ kind: session.kind, item: saved });
      // Finish the invoke response before destroying its sender.
      setImmediate(() => { if (!session.window.isDestroyed()) session.window.close(); });
      return saved;
    } catch (error) {
      quitting = false;
      throw error;
    } finally { session.saving = false; }
  });
  return { requestQuit(event) {
    const pending = Array.from(sessions.values()).find((session) => session.dirty || session.saving);
    if (!pending) { quitting = false; return true; }
    event.preventDefault();
    quitting = true;
    pending.window.show();
    pending.window.focus();
    if (!pending.saving) pending.window.close();
    return false;
  }, broadcastSettings(settings) {
    for (const session of sessions.values()) {
      session.window.setAlwaysOnTop(!!settings.alwaysOnTop);
      session.window.webContents.send('settings:changed', settings);
    }
  } };
}
module.exports = { setupEntryWindows };

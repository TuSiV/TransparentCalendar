// Windows integration check: actual BrowserWindow, preload IPC, JSON persistence,
// and login-item registration. Uses an isolated temporary userData directory.
const { app, BrowserWindow } = require('electron');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'calendar-electron-'));
app.setPath('userData', dir);
fs.writeFileSync(path.join(dir, 'settings.json'), JSON.stringify({ calendarView: 'week' }));
const timeout = setTimeout(() => { console.error('Electron smoke test timed out'); app.exit(1); }, 45000);
require('../src/main');
app.whenReady().then(async () => {
  const startup = require('../src/startup');
  const originalStartup = startup.getStartupSettings().startOnLogin;
  try {
    const win = BrowserWindow.getAllWindows()[0];
    assert.ok(win, 'Calendar window created');
    if (win.webContents.isLoading()) await new Promise(resolve => win.webContents.once('did-finish-load', resolve));
    assert.equal(win.getBounds().height, 400, 'Saved week preference restores compact window');
    await win.webContents.executeJavaScript(`(async () => {
      for (let n = 0; n < 100 && document.querySelectorAll('#grid .day').length !== 7; n++) await new Promise(r => setTimeout(r, 50));
      if (document.querySelectorAll('#grid .day').length !== 7) throw new Error('Saved week preference not restored');
      document.getElementById('btnViewMode').click();
      for (let n = 0; n < 100 && (document.querySelectorAll('#grid .day').length !== 42 || document.getElementById('btnViewMode').disabled); n++) await new Promise(r => setTimeout(r, 50));
      if (document.querySelectorAll('#grid .day').length !== 42) throw new Error('Month toggle failed');
    })()`);
    assert.equal(win.getBounds().height, 580, 'Month toggle expands the native window');
    await win.webContents.executeJavaScript(`(async () => {
      document.getElementById('btnViewMode').click();
      for (let n = 0; n < 100 && (document.querySelectorAll('#grid .day').length !== 7 || document.getElementById('btnViewMode').disabled); n++) await new Promise(r => setTimeout(r, 50));
      if (document.querySelectorAll('#grid .day').length !== 7) throw new Error('Week toggle failed');
    })()`);
    assert.equal(win.getBounds().height, 400, 'Week toggle shrinks the native window');
    const result = await win.webContents.executeJavaScript(`(async () => {
      const wait = async (fn) => { for (let n = 0; n < 100; n++) { if (fn()) return; await new Promise(r => setTimeout(r, 50)); } throw new Error('UI did not settle'); };
      await wait(() => document.getElementById('statusText').textContent === '本地模式');
      state.view = new Date(2026, 11, 31); state.selectedKey = '2026-12-31'; await loadMonth();
      document.getElementById('btnNext').click();
      await wait(() => document.querySelector('#grid .day').dataset.key === '2027-01-04' && state.selectedKey === '2027-01-07');
      document.getElementById('btnPrev').click();
      await wait(() => document.querySelector('#grid .day').dataset.key === '2026-12-28');
      document.getElementById('btnToday').click();
      await wait(() => state.selectedKey === dateKey(new Date()));
      state.weekStart = 0; await api.saveSettings({ weekStart: 0 }); renderWeekRow(); await loadMonth();
      if (new Date(document.querySelector('#grid .day').dataset.key + 'T00:00:00').getDay() !== 0) throw new Error('Sunday week start failed');
      const event = await api.localEventAdd({ subject: 'IPC event', start: '2026-10-09T09:00:00Z', end: '2026-10-09T10:00:00Z' });
      const task = await api.localTaskAdd({ subject: 'IPC task', dueDateTime: '2026-10-09T23:59:00' });
      state.selectedKey = dateKey(new Date(event.start)); state.view = new Date(event.start); await loadMonth();
      document.querySelector('#eventList .subj').click();
      if (document.getElementById('detailSubject').value !== 'IPC event') throw new Error('Event detail failed');
      document.getElementById('btnDetailEdit').click();
      document.getElementById('detailSubject').value = 'Edited IPC event';
      document.getElementById('detailNotes').value = 'Saved by actual preload';
      document.getElementById('detailForm').requestSubmit();
      await wait(() => document.getElementById('detailOverlay').classList.contains('hidden') && document.getElementById('statusText').textContent === '已保存');
      state.selectedKey = '2026-10-09'; await loadMonth();
      document.querySelector('#todoList .subj').click();
      document.getElementById('btnDetailEdit').click();
      document.getElementById('detailSubject').value = 'Edited IPC task';
      document.getElementById('detailImportance').value = 'high';
      document.getElementById('detailStatus').value = 'completed';
      document.getElementById('detailForm').requestSubmit();
      await wait(() => document.getElementById('detailOverlay').classList.contains('hidden') && document.getElementById('statusText').textContent === '已保存');
      const settings = await api.getSettings();
      if (!settings.startupSupported) throw new Error('Windows startup support missing');
      await api.saveSettings({ startOnLogin: true });
      if (!(await api.getSettings()).startOnLogin) throw new Error('Startup enable failed');
      await api.saveSettings({ startOnLogin: false });
      if ((await api.getSettings()).startOnLogin) throw new Error('Startup disable failed');
      return { eventId: event.id, taskId: task.id };
    })()`);
    const events = JSON.parse(fs.readFileSync(path.join(dir, 'local-events.json'), 'utf8'));
    const tasks = JSON.parse(fs.readFileSync(path.join(dir, 'local-tasks.json'), 'utf8'));
    assert.equal(events.find(e => e.id === result.eventId).subject, 'Edited IPC event');
    assert.equal(events[0].notes, 'Saved by actual preload');
    assert.equal(tasks.find(t => t.id === result.taskId).status, 'completed');
    assert.equal(tasks[0].importance, 'high');
    assert.equal(JSON.parse(fs.readFileSync(path.join(dir, 'settings.json'), 'utf8')).calendarView, 'week');
    const loaded = new Promise(resolve => win.webContents.once('did-finish-load', resolve));
    win.webContents.reload();
    await loaded;
    await win.webContents.executeJavaScript(`(async () => {
      for (let n = 0; n < 100 && document.querySelectorAll('#grid .day').length !== 7; n++) await new Promise(r => setTimeout(r, 50));
      if (document.querySelectorAll('#grid .day').length !== 7) throw new Error('Week mode lost after reload');
    })()`);
    console.log('PASS: week/month native resize, persisted view, cross-year navigation, Sunday start, detail/edit IPC, startup enable/disable');
  } finally {
    startup.setStartupEnabled(originalStartup);
    clearTimeout(timeout);
    // Chromium keeps profile files open on Windows until process exit.
    // The isolated CI temporary directory is removed with the runner.
  }
  app.quit();
}).catch(err => { console.error(err); clearTimeout(timeout); app.exit(1); });

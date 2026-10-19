// Windows integration check: actual BrowserWindow, preload IPC, JSON persistence,
// and login-item registration. Uses an isolated temporary userData directory.
const { app, BrowserWindow, dialog, screen } = require("electron");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const assert = require("node:assert/strict");
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "calendar-electron-"));
app.setPath("userData", dir);
fs.writeFileSync(
  path.join(dir, "settings.json"),
  JSON.stringify({ calendarView: "week" }),
);
const timeout = setTimeout(() => {
  console.error("Electron smoke test timed out");
  app.exit(1);
}, 90000);
require("../src/main");
app
  .whenReady()
  .then(async () => {
    const startup = require("../src/startup");
    const originalStartup = startup.getStartupSettings().startOnLogin;
    try {
      const win = BrowserWindow.getAllWindows()[0];
      assert.ok(win, "Calendar window created");
      if (win.webContents.isLoading())
        await new Promise((resolve) =>
          win.webContents.once("did-finish-load", resolve),
        );
      assert.equal(
        win.getBounds().height,
        400,
        "Saved week preference restores compact window",
      );
      await win.webContents.executeJavaScript(`(async () => {
      for (let n = 0; n < 100 && document.querySelectorAll('#grid .day').length !== 7; n++) await new Promise(r => setTimeout(r, 50));
      if (document.querySelectorAll('#grid .day').length !== 7) throw new Error('Saved week preference not restored');
      document.getElementById('btnViewMode').click();
      for (let n = 0; n < 100 && (document.querySelectorAll('#grid .day').length !== 42 || document.getElementById('btnViewMode').disabled); n++) await new Promise(r => setTimeout(r, 50));
      if (document.querySelectorAll('#grid .day').length !== 42) throw new Error('Month toggle failed');
    })()`);
      assert.equal(
        win.getBounds().height,
        580,
        "Month toggle expands the native window",
      );
      await win.webContents.executeJavaScript(`(async () => {
      document.getElementById('btnViewMode').click();
      for (let n = 0; n < 100 && (document.querySelectorAll('#grid .day').length !== 7 || document.getElementById('btnViewMode').disabled); n++) await new Promise(r => setTimeout(r, 50));
      if (document.querySelectorAll('#grid .day').length !== 7) throw new Error('Week toggle failed');
    })()`);
      assert.equal(
        win.getBounds().height,
        400,
        "Week toggle shrinks the native window",
      );
      const settle = async (predicate, label) => {
        for (let i = 0; i < 180; i++) {
          if (await predicate()) return;
          await new Promise((resolve) => setTimeout(resolve, 30));
        }
        throw new Error('Popup did not settle: ' + label);
      };
      const popupWindow = async () => {
        let popup;
        await settle(() => {
          popup = BrowserWindow.getAllWindows().find((w) => w.webContents.getURL().endsWith('/entry.html'));
          return popup && !popup.webContents.isLoading();
        }, 'window loaded');
        await settle(() => popup.webContents.executeJavaScript("!!document.getElementById('entrySource').textContent"), 'form ready');
        assert.equal(popup.getOpacity(), 1);
        assert.equal(popup.isResizable(), true);
        assert.equal(popup.isModal(), false);
        const area = screen.getDisplayMatching(win.getBounds()).workArea;
        const bounds = popup.getBounds();
        assert.ok(Math.abs(bounds.x + bounds.width / 2 - area.x - area.width / 2) <= 1, 'Popup is horizontally centered on the desktop');
        assert.ok(Math.abs(bounds.y + bounds.height / 2 - area.y - area.height / 2) <= 1, 'Popup is vertically centered on the desktop');
        return popup;
      };
      const result = await win.webContents.executeJavaScript(`(async () => {
      const wait = async (fn, label) => { for (let n = 0; n < 150; n++) { if (fn()) return; await new Promise(r => setTimeout(r, 50)); } throw new Error('UI did not settle: ' + label + ' / ' + JSON.stringify({ status: document.getElementById('statusText').textContent, selected: state.selectedKey, first: document.querySelector('#grid .day')?.dataset.key })); };
      await wait(() => document.getElementById('statusText').textContent === '本地模式', 'local mode');
      state.view = new Date(2026, 11, 31); state.selectedKey = '2026-12-31'; await loadMonth();
      document.getElementById('btnNext').click();
      await wait(() => document.querySelector('#grid .day').dataset.key === '2027-01-04' && state.selectedKey === '2027-01-07', 'next week');
      document.getElementById('btnPrev').click();
      await wait(() => document.querySelector('#grid .day').dataset.key === '2026-12-28', 'previous week');
      document.getElementById('btnToday').click();
      await wait(() => state.selectedKey === dateKey(new Date()), 'today');
      state.weekStart = 0; await api.saveSettings({ weekStart: 0 }); renderWeekRow(); await loadMonth();
      if (new Date(document.querySelector('#grid .day').dataset.key + 'T00:00:00').getDay() !== 0) throw new Error('Sunday week start failed');
      const event = await api.localEventAdd({ subject: 'IPC event', start: '2026-10-09T09:00:00Z', end: '2026-10-09T10:00:00Z' });
      const task = await api.localTaskAdd({ subject: 'IPC task', dueDateTime: '2026-10-09T23:59:00' });
      state.selectedKey = dateKey(new Date(event.start)); state.view = new Date(event.start); await loadMonth();
      const settings = await api.getSettings();
      if (settings.startupSupported) {
      await api.saveSettings({ startOnLogin: true });
      if (!(await api.getSettings()).startOnLogin) throw new Error('Startup enable failed');
      await api.saveSettings({ startOnLogin: false });
      if ((await api.getSettings()).startOnLogin) throw new Error('Startup disable failed');
      }
      return { eventId: event.id, taskId: task.id };
    })()`);
      await win.webContents.executeJavaScript("document.querySelector('#eventList .subj').click()");
      let popup = await popupWindow();
      assert.equal(await popup.webContents.executeJavaScript("document.getElementById('detailSubject').value"), 'IPC event');
      await popup.webContents.executeJavaScript(`
        document.getElementById('btnDetailEdit').click();
        document.getElementById('detailSubject').value = 'Edited IPC event';
        document.getElementById('detailNotes').value = 'Saved by actual preload';
        document.getElementById('detailForm').requestSubmit();
      `);
      await settle(() => popup.isDestroyed(), 'event saved');
      await settle(() => win.webContents.executeJavaScript("document.getElementById('eventList').textContent.includes('Edited IPC event')"), 'main event refreshed');
      await win.webContents.executeJavaScript("document.querySelector('#todoList .subj').click()");
      popup = await popupWindow();
      await popup.webContents.executeJavaScript(`
        document.getElementById('btnDetailEdit').click();
        document.getElementById('detailSubject').value = 'Edited IPC task';
        document.getElementById('detailImportance').value = 'high';
        document.getElementById('detailStatus').value = 'completed';
        document.getElementById('detailForm').requestSubmit();
      `);
      await settle(() => popup.isDestroyed(), 'task saved');
      // The main process rejects writes from both a read-only popup and the calendar.
      await win.webContents.executeJavaScript("api.openEntry({kind:'event',mode:'view',item:{subject:'Remote event',local:true,start:'2026-10-09T09:00:00Z',end:'2026-10-09T10:00:00Z'}})");
      popup = await popupWindow();
      assert.equal(await popup.webContents.executeJavaScript("document.getElementById('btnDetailEdit').classList.contains('hidden')"), true);
      assert.equal(await popup.webContents.executeJavaScript("api.saveEntry({subject:'forged',notes:''}).then(()=>false,()=>true)"), true);
      popup.close();
      await settle(() => popup.isDestroyed(), 'readonly closed');
      assert.equal(await win.webContents.executeJavaScript("api.saveEntry({subject:'forged',notes:''}).then(()=>false,()=>true)"), true);
      // Unsaved edits support Cancel, Discard, and Save via the native close prompt.
      const originalDialog = dialog.showMessageBox;
      try {
        await win.webContents.executeJavaScript("api.openEntry({kind:'task',mode:'create',date:'2026-10-09'})");
        popup = await popupWindow();
        await popup.webContents.executeJavaScript("document.getElementById('detailSubject').value='Discard draft';document.getElementById('detailSubject').dispatchEvent(new Event('input',{bubbles:true}))");
        let prompts = 0;
        dialog.showMessageBox = async () => { prompts++; return {response:2}; };
        popup.close();
        await settle(() => prompts === 1, 'cancel prompt');
        assert.equal(popup.isDestroyed(), false);
        dialog.showMessageBox = async () => ({response:1});
        popup.close();
        await settle(() => popup.isDestroyed(), 'discard draft');
        assert.equal(require('../src/store').getLocalTasks().some((t)=>t.subject==='Discard draft'), false);
        await win.webContents.executeJavaScript("api.openEntry({kind:'task',mode:'create',date:'2026-10-09'})");
        popup = await popupWindow();
        await popup.webContents.executeJavaScript("document.getElementById('detailSubject').value='Save on close';document.getElementById('detailSubject').dispatchEvent(new Event('input',{bubbles:true}))");
        dialog.showMessageBox = async () => ({response:0});
        popup.close();
        await settle(() => popup.isDestroyed(), 'save on close');
        assert.ok(require('../src/store').getLocalTasks().some((t)=>t.subject==='Save on close'));
      } finally { dialog.showMessageBox = originalDialog; }
      const events = JSON.parse(
        fs.readFileSync(path.join(dir, "local-events.json"), "utf8"),
      );
      const tasks = JSON.parse(
        fs.readFileSync(path.join(dir, "local-tasks.json"), "utf8"),
      );
      assert.equal(
        events.find((e) => e.id === result.eventId).subject,
        "Edited IPC event",
      );
      assert.equal(events[0].notes, "Saved by actual preload");
      assert.equal(
        tasks.find((t) => t.id === result.taskId).status,
        "completed",
      );
      assert.equal(tasks[0].importance, "high");
      assert.equal(
        JSON.parse(fs.readFileSync(path.join(dir, "settings.json"), "utf8"))
          .calendarView,
        "week",
      );
      const loaded = new Promise((resolve) =>
        win.webContents.once("did-finish-load", resolve),
      );
      win.webContents.reload();
      await loaded;
      await win.webContents.executeJavaScript(`(async () => {
      for (let n = 0; n < 100 && document.querySelectorAll('#grid .day').length !== 7; n++) await new Promise(r => setTimeout(r, 50));
      if (document.querySelectorAll('#grid .day').length !== 7) throw new Error('Week mode lost after reload');
    })()`);
      // New window behavior: per-view size persistence, true background alpha,
      // settings isolation and safe return from click-through.
      assert.equal(
        win.getOpacity(),
        1,
        "Text and controls never fade with background",
      );
      win.setBounds({ ...win.getBounds(), width: 520, height: 450 });
      await new Promise((r) => setTimeout(r, 250));
      await win.webContents.executeJavaScript(`api.setCalendarView('month')`);
      await win.webContents.executeJavaScript(`api.setCalendarView('week')`);
      assert.equal(win.getBounds().width, 520);
      assert.equal(win.getBounds().height, 450);
      await win.webContents.executeJavaScript(
        `api.saveSettings({ backgroundOpacity: 0 })`,
      );
      const appearance = await win.webContents.executeJavaScript(
        `({ alpha: getComputedStyle(document.getElementById('card')).backgroundColor, textOpacity: getComputedStyle(document.getElementById('monthTitle')).opacity })`,
      );
      assert.match(appearance.alpha, /rgba\(.*?, 0\)/);
      assert.equal(appearance.textOpacity, "1");
      await win.webContents.executeJavaScript(`api.openSettings()`);
      const settingsWindow = BrowserWindow.getAllWindows().find(
        (w) => w !== win,
      );
      assert.ok(settingsWindow, "Separate settings BrowserWindow");
      if (settingsWindow.webContents.isLoading())
        await new Promise((r) =>
          settingsWindow.webContents.once("did-finish-load", r),
        );
      await settingsWindow.webContents.executeJavaScript(`(async () => {
      for (let n = 0; n < 100 && !document.getElementById('appVersion').textContent; n++) await new Promise(r=>setTimeout(r, 30));
      if (document.querySelectorAll('[data-page]').length !== 5) throw new Error('Settings navigation missing');
      await api.saveSettings({ theme: 'light', backgroundOpacity: 25 });
      await api.setClickThrough(true);
      if (!(await api.getClickThrough())) throw new Error('Click-through not enabled');
      await api.setClickThrough(false);
    })()`);
      assert.equal(
        await win.webContents.executeJavaScript(
          `document.documentElement.dataset.theme`,
        ),
        "light",
      );
      assert.equal(win.getOpacity(), 1);
      settingsWindow.destroy();
      await win.webContents.executeJavaScript('api.saveSettings({ backgroundOpacity: 0 })');

      // Check the actual native ignore calls while real DOM input and preload
      // messages move between controls and the blank calendar background.
      const nativeMouseCalls = [];
      const nativeIgnore = win.setIgnoreMouseEvents.bind(win);
      win.setIgnoreMouseEvents = (ignore, options) => {
        nativeMouseCalls.push(ignore);
        return nativeIgnore(ignore, options);
      };
      const waitFor = async (predicate, label) => {
        for (let i = 0; i < 100; i++) {
          if (await predicate()) return;
          await new Promise((resolve) => setTimeout(resolve, 30));
        }
        throw new Error("Interactive click-through failed: " + label);
      };
      const moveTo = async (selector, interactive) => {
        const point = await win.webContents.executeJavaScript(`(() => {
          const r = document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();
          return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) };
        })()`);
        win.webContents.sendInputEvent({ type: "mouseMove", ...point });
        await waitFor(() => nativeMouseCalls.at(-1) === !interactive, selector);
        assert.equal(
          await win.webContents.executeJavaScript("api.getClickThrough()"),
          true,
          "Hover must preserve mode",
        );
        return point;
      };
      const clickControl = async (selector) => {
        const point = await moveTo(selector, true);
        win.webContents.sendInputEvent({
          type: "mouseDown",
          button: "left",
          clickCount: 1,
          ...point,
        });
        win.webContents.sendInputEvent({
          type: "mouseUp",
          button: "left",
          clickCount: 1,
          ...point,
        });
      };
      win.show();
      win.focus();
      await win.webContents.executeJavaScript("api.setClickThrough(true)");
      await moveTo("#weekRow .wk", false);
      await clickControl("#btnNext");
      await waitFor(
        () =>
          win.webContents.executeJavaScript(
            '!document.getElementById("btnViewMode").disabled',
          ),
        "navigation",
      );
      await clickControl("#grid .day:nth-child(4)");
      await waitFor(
        () =>
          win.webContents.executeJavaScript(
            'state.selectedKey === document.querySelector("#grid .day:nth-child(4)").dataset.key',
          ),
        "date selection",
      );
      await clickControl("#btnAddEvent");
      popup = await popupWindow();
      const selectedDate = await win.webContents.executeJavaScript('state.selectedKey');
      assert.equal(await popup.webContents.executeJavaScript("document.getElementById('detailStart').value.slice(0,10)"), selectedDate);
      assert.equal(await popup.webContents.executeJavaScript("getComputedStyle(document.body).backgroundColor"), 'rgb(248, 250, 252)');
      await popup.webContents.executeJavaScript("document.getElementById('detailSubject').value='Click-through event';document.getElementById('detailForm').requestSubmit()");
      await settle(() => popup.isDestroyed(), 'new event saved');
      await settle(() => win.webContents.executeJavaScript('document.getElementById("eventList").textContent.includes("Click-through event")'), 'event creation');
      assert.equal(await win.webContents.executeJavaScript('api.getClickThrough()'), true);
      win.focus();
      await clickControl("#btnAddTodo");
      popup = await popupWindow();
      assert.equal(await popup.webContents.executeJavaScript("document.getElementById('detailDue').value"), selectedDate);
      await popup.webContents.executeJavaScript("document.getElementById('detailSubject').value='Click-through task';document.getElementById('detailForm').requestSubmit()");
      await settle(() => popup.isDestroyed(), 'new task saved');
      await settle(() => win.webContents.executeJavaScript('document.getElementById("todoList").textContent.includes("Click-through task")'), 'task creation');
      assert.equal(await win.webContents.executeJavaScript('api.getClickThrough()'), true);
      win.focus();
      await moveTo(".grip-se", true);
      await moveTo("#weekRow .wk", false);
      await win.webContents.executeJavaScript("api.setClickThrough(false)");
      assert.equal(
        nativeMouseCalls.at(-1),
        false,
        "Disabling restores full interaction",
      );
      win.setIgnoreMouseEvents = nativeIgnore;
      const before = win.getBounds();
      await win.webContents.executeJavaScript(`api.resizeStart('se')`);
      await new Promise((r) => setTimeout(r, 50));
      await win.webContents.executeJavaScript(`api.resizeEnd()`);
      assert.deepEqual(
        win.getBounds(),
        before,
        "Resize grip without pointer delta keeps bounds",
      );
      console.log(
        "PASS: local CRUD, startup, per-view bounds, appearance, settings, and interactive click-through date navigation/event creation/task creation/resize grips/background",
      );
    } finally {
      if (process.platform === "win32")
        startup.setStartupEnabled(originalStartup);
      clearTimeout(timeout);
      // Chromium keeps profile files open on Windows until process exit.
      // The isolated CI temporary directory is removed with the runner.
    }
    app.quit();
  })
  .catch((err) => {
    console.error(err);
    clearTimeout(timeout);
    app.exit(1);
  });

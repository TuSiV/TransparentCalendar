const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("api", {
  openEntry: (request) => ipcRenderer.invoke('entry:open', request),
  getEntry: () => ipcRenderer.invoke('entry:get'),
  saveEntry: (values) => ipcRenderer.invoke('entry:save', values),
  setEntryDirty: (dirty) => ipcRenderer.send('entry:dirty', dirty),
  closeEntry: () => ipcRenderer.invoke('entry:close'),
  onEntrySaveRequested: (cb) => ipcRenderer.on('entry:requestSave', cb),
  onEntriesChanged: (cb) => ipcRenderer.on('entry:changed', (_e, value) => cb(value)),
  getSettings: () => ipcRenderer.invoke("settings:get"),
  saveSettings: (patch) => ipcRenderer.invoke("settings:save", patch),
  hideWindow: () => ipcRenderer.invoke("win:hide"),
  openSettings: () => ipcRenderer.invoke("settings:open"),
  resetBounds: () => ipcRenderer.invoke("win:resetBounds"),
  resizeStart: (edge) => ipcRenderer.invoke("win:resizeStart", edge),
  resizeEnd: () => ipcRenderer.invoke("win:resizeEnd"),
  onSettingsChanged: (cb) =>
    ipcRenderer.on("settings:changed", (_e, value) => cb(value)),
  onRefresh: (cb) => ipcRenderer.on("calendar:refresh", cb),
  listAccounts: () => ipcRenderer.invoke("auth:accounts"),
  discoverCalendars: (accountId) =>
    ipcRenderer.invoke("calendar:discover", accountId),
  sourceStatus: () => ipcRenderer.invoke("sources:status"),
  listSources: () => ipcRenderer.invoke("sources:list"),
  saveSource: (source) => ipcRenderer.invoke("sources:save", source),
  patchSource: (id, patch) => ipcRenderer.invoke("sources:patch", id, patch),
  removeSource: (id) => ipcRenderer.invoke("sources:remove", id),
  testSource: (url) => ipcRenderer.invoke("sources:test", url),
  openEventLink: (url) => ipcRenderer.invoke("calendar:openEventLink", url),
  appInfo: () => ipcRenderer.invoke("app:info"),
  openLink: (url) => ipcRenderer.invoke("app:openLink", url),
  setClickThrough: (enabled) =>
    ipcRenderer.invoke("win:setClickThrough", enabled),
  getClickThrough: () => ipcRenderer.invoke("win:getClickThrough"),
  getInteractionState: () => ipcRenderer.invoke("win:getInteractionState"),
  reportInteractive: (interactive) =>
    ipcRenderer.send("win:interactive", interactive),
  onClickThroughChanged: (cb) =>
    ipcRenderer.on("win:clickThroughChanged", (_event, state) => cb(state)),

  login: () => ipcRenderer.invoke("auth:login"),
  logout: (accountId) => ipcRenderer.invoke("auth:logout", accountId),
  getStatus: () => ipcRenderer.invoke("auth:status"),
  getEvents: (startISO, endISO, force) =>
    ipcRenderer.invoke("calendar:getEvents", startISO, endISO, force),
  setCalendarView: (mode) => ipcRenderer.invoke("calendar:setView", mode),

  todoLists: () => ipcRenderer.invoke("todo:lists"),
  todoTasks: (listId, dateISO) =>
    ipcRenderer.invoke("todo:tasks", listId, dateISO),
  todoTasksDueRange: (listId, startISO, endISO) =>
    ipcRenderer.invoke("todo:tasksDueRange", listId, startISO, endISO),
  todoCreate: (listId, opts) => ipcRenderer.invoke("todo:create", listId, opts),
  todoComplete: (listId, taskId) =>
    ipcRenderer.invoke("todo:complete", listId, taskId),
  todoDelete: (listId, taskId) =>
    ipcRenderer.invoke("todo:delete", listId, taskId),

  localEvents: (startISO, endISO) =>
    ipcRenderer.invoke("local:events", startISO, endISO),
  localEventAdd: (opts) => ipcRenderer.invoke("local:event:add", opts),
  localEventDelete: (id) => ipcRenderer.invoke("local:event:delete", id),
  localEventUpdate: (id, patch) =>
    ipcRenderer.invoke("local:event:update", id, patch),
  localTasks: (startISO, endISO) =>
    ipcRenderer.invoke("local:tasks", startISO, endISO),
  localTaskAdd: (opts) => ipcRenderer.invoke("local:task:add", opts),
  localTaskUpdate: (id, patch) =>
    ipcRenderer.invoke("local:task:update", id, patch),
  localTaskComplete: (id) => ipcRenderer.invoke("local:task:complete", id),
  localTaskDelete: (id) => ipcRenderer.invoke("local:task:delete", id),

  onDeviceCode: (cb) =>
    ipcRenderer.on("auth:devicecode", (_e, info) => cb(info)),
});

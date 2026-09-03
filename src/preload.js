const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  getSettings: () => ipcRenderer.invoke('settings:get'),
  saveSettings: (patch) => ipcRenderer.invoke('settings:save', patch),
  hideWindow: () => ipcRenderer.invoke('win:hide'),
  setWindowOpacity: (v) => ipcRenderer.invoke('win:setOpacity', v),
  setIgnoreMouseEvents: (ignore) => ipcRenderer.invoke('win:setIgnoreMouseEvents', ignore),
  getClickThrough: () => ipcRenderer.invoke('win:getClickThrough'),

  login: () => ipcRenderer.invoke('auth:login'),
  logout: () => ipcRenderer.invoke('auth:logout'),
  getStatus: () => ipcRenderer.invoke('auth:status'),
  getEvents: (startISO, endISO) => ipcRenderer.invoke('calendar:getEvents', startISO, endISO),

  todoLists: () => ipcRenderer.invoke('todo:lists'),
  todoTasks: (listId, dateISO) => ipcRenderer.invoke('todo:tasks', listId, dateISO),
  todoTasksDueRange: (listId, startISO, endISO) => ipcRenderer.invoke('todo:tasksDueRange', listId, startISO, endISO),
  todoCreate: (listId, opts) => ipcRenderer.invoke('todo:create', listId, opts),
  todoComplete: (listId, taskId) => ipcRenderer.invoke('todo:complete', listId, taskId),
  todoDelete: (listId, taskId) => ipcRenderer.invoke('todo:delete', listId, taskId),

  localEvents: (startISO, endISO) => ipcRenderer.invoke('local:events', startISO, endISO),
  localEventAdd: (opts) => ipcRenderer.invoke('local:event:add', opts),
  localEventDelete: (id) => ipcRenderer.invoke('local:event:delete', id),
  localEventUpdate: (id, patch) => ipcRenderer.invoke('local:event:update', id, patch),
  localTasks: (startISO, endISO) => ipcRenderer.invoke('local:tasks', startISO, endISO),
  localTaskAdd: (opts) => ipcRenderer.invoke('local:task:add', opts),
  localTaskComplete: (id) => ipcRenderer.invoke('local:task:complete', id),
  localTaskDelete: (id) => ipcRenderer.invoke('local:task:delete', id),

  onDeviceCode: (cb) => ipcRenderer.on('auth:devicecode', (_e, info) => cb(info)),
});

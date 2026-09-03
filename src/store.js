const fs = require('fs');
const path = require('path');
const { app } = require('electron');

function dataPath(name) {
  return path.join(app.getPath('userData'), name);
}

function readJSON(name) {
  try {
    return JSON.parse(fs.readFileSync(dataPath(name), 'utf-8'));
  } catch {
    return [];
  }
}

function writeJSON(name, data) {
  fs.mkdirSync(path.dirname(dataPath(name)), { recursive: true });
  fs.writeFileSync(dataPath(name), JSON.stringify(data, null, 2));
}

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

/* -------- Local Events -------- */

function getLocalEvents(startISO, endISO) {
  const all = readJSON('local-events.json');
  const start = new Date(startISO);
  const end = new Date(endISO);
  return all.filter((e) => {
    const d = new Date(e.start);
    return d >= start && d <= end;
  });
}

function addLocalEvent({ subject, start, end, isAllDay, location }) {
  const all = readJSON('local-events.json');
  const ev = {
    id: uid(),
    subject: subject || '(无标题)',
    start,
    end: end || start,
    isAllDay: !!isAllDay,
    location: location || '',
    local: true,
  };
  all.push(ev);
  writeJSON('local-events.json', all);
  return ev;
}

function deleteLocalEvent(id) {
  const all = readJSON('local-events.json');
  const idx = all.findIndex((e) => e.id === id);
  if (idx < 0) return false;
  all.splice(idx, 1);
  writeJSON('local-events.json', all);
  return true;
}

function updateLocalEvent(id, patch) {
  const all = readJSON('local-events.json');
  const ev = all.find((e) => e.id === id);
  if (!ev) return null;
  Object.assign(ev, patch);
  writeJSON('local-events.json', all);
  return ev;
}

/* -------- Local Tasks -------- */

function getLocalTasks(startISO, endISO) {
  const all = readJSON('local-tasks.json');
  if (!startISO) return all;
  const start = new Date(startISO);
  const end = new Date(endISO);
  return all.filter((t) => {
    if (!t.dueDateTime) return false;
    const d = new Date(t.dueDateTime);
    return d >= start && d <= end;
  });
}

function addLocalTask({ subject, dueDateTime }) {
  const all = readJSON('local-tasks.json');
  const task = {
    id: uid(),
    subject: subject || '(无标题)',
    status: 'notStarted',
    importance: 'normal',
    dueDateTime: dueDateTime || null,
    local: true,
  };
  all.push(task);
  writeJSON('local-tasks.json', all);
  return task;
}

function completeLocalTask(id) {
  const all = readJSON('local-tasks.json');
  const t = all.find((t) => t.id === id);
  if (!t) return false;
  t.status = 'completed';
  writeJSON('local-tasks.json', all);
  return true;
}

function deleteLocalTask(id) {
  const all = readJSON('local-tasks.json');
  const idx = all.findIndex((t) => t.id === id);
  if (idx < 0) return false;
  all.splice(idx, 1);
  writeJSON('local-tasks.json', all);
  return true;
}

module.exports = {
  getLocalEvents,
  addLocalEvent,
  deleteLocalEvent,
  updateLocalEvent,
  getLocalTasks,
  addLocalTask,
  completeLocalTask,
  deleteLocalTask,
};

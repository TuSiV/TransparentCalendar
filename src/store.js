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
    const finish = new Date(e.end || e.start);
    return d <= end && finish >= start;
  });
}

function addLocalEvent({ subject, start, end, isAllDay, location, notes }) {
  const all = readJSON('local-events.json');
  const ev = {
    id: uid(),
    subject: subject || '(无标题)',
    start,
    end: end || start,
    isAllDay: !!isAllDay,
    location: location || '',
    notes: notes || '',
    local: true,
  };
  validateEvent(ev);
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
  const changes = pickFields(patch, ['subject', 'start', 'end', 'isAllDay', 'location', 'notes']);
  validateEvent({ ...ev, ...changes });
  Object.assign(ev, changes);
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
    if (!t.dueDateTime) return true;
    const d = new Date(t.dueDateTime);
    return d >= start && d <= end;
  });
}

function addLocalTask({ subject, dueDateTime, notes }) {
  const all = readJSON('local-tasks.json');
  const task = {
    id: uid(),
    subject: subject || '(无标题)',
    status: 'notStarted',
    importance: 'normal',
    dueDateTime: dueDateTime || null,
    notes: notes || '',
    local: true,
  };
  validateTask(task);
  all.push(task);
  writeJSON('local-tasks.json', all);
  return task;
}

function pickFields(patch, fields) {
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) throw new Error('修改内容无效');
  return Object.fromEntries(fields.filter((key) => Object.hasOwn(patch, key)).map((key) => [key, patch[key]]));
}

function validateText(item) {
  if (typeof item.subject !== 'string' || !item.subject.trim()) throw new Error('标题不能为空');
  if (item.notes !== undefined && typeof item.notes !== 'string') throw new Error('备注无效');
}

function validateEvent(item) {
  validateText(item);
  if (typeof item.start !== 'string' || typeof item.end !== 'string' ||
      !Number.isFinite(Date.parse(item.start)) || !Number.isFinite(Date.parse(item.end))) throw new Error('日期时间无效');
  if (new Date(item.end) < new Date(item.start) || (item.isAllDay && new Date(item.end) <= new Date(item.start))) throw new Error('结束时间不能早于开始时间，全天日程至少一天');
  if (typeof item.isAllDay !== 'boolean' || typeof item.location !== 'string') throw new Error('日程内容无效');
}

function validateTask(item) {
  validateText(item);
  if (item.dueDateTime !== null && (typeof item.dueDateTime !== 'string' || !Number.isFinite(Date.parse(item.dueDateTime)))) throw new Error('截止日期无效');
  if (!['notStarted', 'inProgress', 'completed', 'waitingOnOthers', 'deferred'].includes(item.status)) throw new Error('任务状态无效');
  if (!['low', 'normal', 'high'].includes(item.importance)) throw new Error('优先级无效');
}

function updateLocalTask(id, patch) {
  const all = readJSON('local-tasks.json');
  const task = all.find((t) => t.id === id);
  if (!task) return null;
  const changes = pickFields(patch, ['subject', 'dueDateTime', 'status', 'importance', 'notes']);
  validateTask({ ...task, ...changes });
  Object.assign(task, changes);
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
  updateLocalTask,
  deleteLocalTask,
};

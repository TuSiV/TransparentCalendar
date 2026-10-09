const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');

function loadStore(dir) {
  const context = { require: (name) => name === 'electron' ? { app: { getPath: () => dir } } : require(name), module: { exports: {} } };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../src/store.js'), 'utf8'), context);
  return context.module.exports;
}
function fixture(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'calendar-test-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return { dir, store: loadStore(dir) };
}

test('event edits persist across reload while preserving record identity', (t) => {
  const { dir, store } = fixture(t);
  const event = store.addLocalEvent({ subject: 'Meeting', start: '2026-10-09T09:00:00+08:00', end: '2026-10-09T10:00:00+08:00', location: '' });
  store.updateLocalEvent(event.id, { subject: 'Changed', start: '2026-11-01T01:00:00Z', end: '2026-11-01T02:00:00Z', location: '<room>', notes: 'Line 1\nLine 2', id: 'overwrite', local: false });
  assert.equal(store.getLocalEvents('2026-10-01', '2026-10-31').length, 0);
  const saved = loadStore(dir).getLocalEvents('2026-11-01', '2026-11-02')[0];
  assert.equal(saved.id, event.id);
  assert.equal(saved.local, true);
  assert.equal(saved.subject, 'Changed');
  assert.equal(saved.notes, 'Line 1\nLine 2');
  assert.equal(saved.location, '<room>');
});

test('invalid event edits never change persisted data', (t) => {
  const { dir, store } = fixture(t);
  const event = store.addLocalEvent({ subject: 'Meeting', start: '2026-10-09T09:00:00Z', end: '2026-10-09T10:00:00Z' });
  const before = fs.readFileSync(path.join(dir, 'local-events.json'), 'utf8');
  for (const patch of [{ subject: ' ' }, { end: '2026-10-08T10:00:00Z' }, { start: 'bad' }, { isAllDay: true, end: event.start }]) {
    assert.throws(() => store.updateLocalEvent(event.id, patch));
    assert.equal(fs.readFileSync(path.join(dir, 'local-events.json'), 'utf8'), before);
  }
  assert.equal(store.updateLocalEvent('missing', { subject: 'x' }), null);
});

test('tasks support rescheduling, completion, reopening, no due date and durable notes', (t) => {
  const { dir, store } = fixture(t);
  const task = store.addLocalTask({ subject: 'Work', dueDateTime: '2026-10-09T23:59:00' });
  store.completeLocalTask(task.id);
  const saved = store.updateLocalTask(task.id, { subject: 'Reopened', status: 'notStarted', importance: 'high', dueDateTime: null, notes: 'Keep this', id: 'bad', local: false });
  assert.equal(saved.id, task.id);
  assert.equal(saved.local, true);
  const reloaded = loadStore(dir).getLocalTasks('2026-11-01', '2026-11-30')[0];
  assert.equal(reloaded.status, 'notStarted');
  assert.equal(reloaded.importance, 'high');
  assert.equal(reloaded.dueDateTime, null);
  assert.equal(reloaded.notes, 'Keep this');
  store.updateLocalTask(task.id, { dueDateTime: '2026-12-01T23:59:00' });
  assert.equal(store.getLocalTasks('2026-11-01', '2026-11-30').length, 0);
  assert.equal(store.getLocalTasks('2026-12-01', '2026-12-31').length, 1);
});

test('invalid task edits and deleted records do not create or corrupt data', (t) => {
  const { dir, store } = fixture(t);
  const task = store.addLocalTask({ subject: 'Work' });
  const before = fs.readFileSync(path.join(dir, 'local-tasks.json'), 'utf8');
  for (const patch of [{ subject: '' }, { status: 'broken' }, { importance: 'urgent' }, { dueDateTime: 'bad' }]) {
    assert.throws(() => store.updateLocalTask(task.id, patch));
    assert.equal(fs.readFileSync(path.join(dir, 'local-tasks.json'), 'utf8'), before);
  }
  store.deleteLocalTask(task.id);
  assert.equal(store.updateLocalTask(task.id, { subject: 'x' }), null);
});

test('legacy 1.0.0 records remain editable; overlapping events are returned', (t) => {
  const { dir, store } = fixture(t);
  fs.writeFileSync(path.join(dir, 'local-events.json'), JSON.stringify([{ id: 'old', subject: 'Legacy', start: '2026-09-30T16:00:00Z', end: '2026-10-03T16:00:00Z', isAllDay: true, location: '', local: true }]));
  fs.writeFileSync(path.join(dir, 'local-tasks.json'), JSON.stringify([{ id: 'task', subject: 'Old task', dueDateTime: null, status: 'completed', importance: 'normal', local: true }]));
  assert.equal(store.getLocalEvents('2026-10-01', '2026-10-02').length, 1);
  assert.equal(store.updateLocalEvent('old', { subject: 'Updated' }).subject, 'Updated');
  assert.equal(store.updateLocalTask('task', { status: 'notStarted', notes: 'Added later' }).notes, 'Added later');
});

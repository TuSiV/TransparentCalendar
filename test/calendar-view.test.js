const { test } = require('node:test');
const assert = require('node:assert/strict');
const view = require('../src/renderer/calendar-view');
const key = (d) => `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;

test('week shows seven days with Monday or Sunday start', () => {
  const anchor = new Date(2026, 9, 10, 12);
  const monday = view.gridRange(anchor, 'week', 1);
  assert.equal(key(monday.start), '2026-10-5');
  assert.equal(key(monday.end), '2026-10-11');
  assert.equal(monday.count, 7);
  const sunday = view.gridRange(anchor, 'week', 0);
  assert.equal(key(sunday.start), '2026-10-4');
  assert.equal(key(sunday.end), '2026-10-10');
});

test('cross-month and cross-year weeks have correct range and navigation', () => {
  const range = view.gridRange(new Date(2027, 0, 1), 'week', 1);
  assert.equal(key(range.start), '2026-12-28');
  assert.equal(key(range.end), '2027-1-3');
  assert.equal(view.weekLabel(range.start, range.end), '2026/12/28–2027/1/3');
  assert.equal(key(view.move(new Date(2026, 11, 31), 'week', 1)), '2027-1-7');
  assert.equal(key(view.move(new Date(2027, 0, 1), 'week', -1)), '2026-12-25');
});

test('month retains 42 cells and week reduces window height', () => {
  const range = view.gridRange(new Date(2026, 9, 10), 'month', 1);
  assert.equal(range.count, 42);
  assert.equal(key(range.start), '2026-9-28');
  assert.equal(key(range.end), '2026-11-8');
  assert.equal(range.end.getHours(), 23);
  assert.equal(range.end.getMilliseconds(), 999);
  assert.equal(view.heightForMode('week'), 400);
  assert.equal(view.heightForMode('month'), 580);
  assert.equal(view.normalizeMode(undefined), 'month');
  assert.equal(key(view.move(new Date(2026, 11, 31), 'month', 1)), '2027-1-1');
});

test('week navigation uses calendar dates across daylight-saving changes', () => {
  const before = new Date(2026, 2, 6, 12);
  assert.equal(key(view.move(before, 'week', 1)), '2026-3-13');
  const range = view.gridRange(before, 'week', 1);
  assert.equal(key(range.start), '2026-3-2');
  assert.equal(key(range.end), '2026-3-8');
});

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { centeredEntryBounds } = require('../src/entry-bounds');

test('entry windows center within the desktop work area, including secondary monitors', () => {
  for (const area of [
    { x: 0, y: 0, width: 1920, height: 1040 },
    { x: -1920, y: -240, width: 1920, height: 1040 },
    { x: 1920, y: 40, width: 1280, height: 760 },
  ]) {
    const bounds = centeredEntryBounds(area);
    assert.equal(bounds.x + bounds.width / 2, area.x + area.width / 2);
    assert.equal(bounds.y + bounds.height / 2, area.y + area.height / 2);
  }
});

test('small work areas keep the whole popup visible and permit smaller minimum sizes', () => {
  const area = { x: -800, y: 24, width: 390, height: 440 };
  assert.deepEqual(centeredEntryBounds(area), {
    ...area, minWidth: 390, minHeight: 440,
  });
});

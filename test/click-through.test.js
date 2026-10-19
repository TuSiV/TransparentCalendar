const test = require("node:test");
const assert = require("node:assert/strict");
const { createClickThrough } = require("../src/click-through");

test("controls receive input without turning off click-through mode", () => {
  const calls = [],
    changes = [];
  const policy = createClickThrough({
    apply: (value) => calls.push(value),
    notify: (value) => changes.push(value),
  });
  policy.setEnabled(true);
  policy.setInteractive(true);
  assert.equal(policy.enabled, true);
  assert.equal(calls.at(-1), false);
  policy.setInteractive(false);
  assert.equal(policy.enabled, true);
  assert.equal(calls.at(-1), true);
  assert.deepEqual(changes, [true]);
});

test("late hover reports cannot re-enable native ignoring after disabling the mode", () => {
  const calls = [];
  const policy = createClickThrough({ apply: (value) => calls.push(value) });
  policy.setEnabled(true);
  policy.setInteractive(true);
  policy.setEnabled(false);
  policy.setInteractive(false);
  assert.equal(policy.enabled, false);
  assert.equal(calls.at(-1), false);
});

test("repeated hit-tests avoid redundant native calls; a new window reapplies policy", () => {
  const calls = [];
  const policy = createClickThrough({ apply: (value) => calls.push(value) });
  policy.setEnabled(true);
  policy.setInteractive(true);
  policy.setInteractive(true);
  assert.deepEqual(calls, [true, false]);
  policy.refresh();
  assert.deepEqual(calls, [true, false, false]);
});

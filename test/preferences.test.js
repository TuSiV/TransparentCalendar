const test = require("node:test");
const assert = require("node:assert/strict");
const { normalize, validatePatch, boundsFor } = require("../src/preferences");
test("legacy opacity and ICS migrate without losing local or window preferences", () => {
  const s = normalize({
    opacity: 50,
    icsUrl: "https://example.com/secret.ics",
    weekStart: 0,
    x: 12,
  });
  assert.equal(s.backgroundOpacity, 31);
  assert.equal(s.sources[0].url, "https://example.com/secret.ics");
  assert.equal(s.weekStart, 0);
  assert.equal(s.x, 12);
  assert.equal(normalize({ sources: [], icsUrl: "old" }).sources.length, 0);
  assert.equal(
    normalize({ backgroundOpacity: 0, opacity: 100 }).backgroundOpacity,
    0,
  );
});
test("window bounds survive separate modes and recover from missing monitors", () => {
  const area = { x: -1200, y: 100, width: 1200, height: 800 };
  const s = {
    windowBounds: {
      week: { x: 8000, y: -2000, width: 500, height: 350 },
      month: { x: -1000, y: 200, width: 600, height: 700 },
    },
  };
  assert.deepEqual(boundsFor("week", s, area), {
    x: -500,
    y: 100,
    width: 500,
    height: 350,
  });
  assert.deepEqual(boundsFor("month", s, area), s.windowBounds.month);
  assert.equal(boundsFor("week", {}, area).height, 400);
});
test("settings reject invalid values, unknown properties and unsafe styling", () => {
  assert.deepEqual(
    validatePatch({ backgroundOpacity: 0, autoSync: false, fontScale: 1.3 }),
    { backgroundOpacity: 0, autoSync: false, fontScale: 1.3 },
  );
  for (const patch of [
    { backgroundOpacity: NaN },
    { backgroundOpacity: 101 },
    { theme: "evil" },
    { fontScale: 0 },
    { sources: [] },
    { accent: "red;opacity:0" },
    { clientId: "invalid" },
  ])
    assert.throws(() => validatePatch(patch));
});

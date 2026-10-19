const test = require("node:test");
const assert = require("node:assert/strict");
const { createSync, safeUrl, validateSource } = require("../src/sources");
const start = "2026-10-01T00:00:00Z",
  end = "2026-11-01T00:00:00Z";
const a = { id: "a", name: "Work", visible: true, sync: true },
  b = { id: "b", name: "Personal", visible: true, sync: true };
function setup(fetchSource) {
  let cache = {};
  let now = 100000;
  return {
    sync: createSync({
      read: () => structuredClone(cache),
      write: (data) => (cache = data),
      fetchSource,
      now: () => now,
    }),
    advance: () => (now += 600000),
    cache: () => cache,
  };
}
test("sources aggregate independently and namespace matching event IDs", async () => {
  const env = setup(async (s) => [{ id: "same", subject: s.name }]);
  const r = await env.sync([a, b], start, end, { interval: 100 });
  assert.deepEqual(
    r.events.map((e) => e.id),
    ["a:same", "b:same"],
  );
});
test("offline source keeps successful range cache while other source updates", async () => {
  let fail = false;
  const env = setup(async (s) => {
    if (fail && s.id === "a") throw new Error("token https://secret");
    return [{ id: s.id, subject: fail ? "new" : "old" }];
  });
  await env.sync([a, b], start, end);
  fail = true;
  env.advance();
  const r = await env.sync([a, b], start, end, { force: true });
  assert.equal(r.events[0].subject, "old");
  assert.equal(r.events[1].subject, "new");
  assert.equal(r.statuses[0].updated, 100000);
  assert.ok(r.statuses[0].error);
  assert.ok(!JSON.stringify(r).includes("secret"));
});
test("hidden sources still sync, paused sources use cache without fetching", async () => {
  let calls = 0;
  const env = setup(async () => {
    calls++;
    return [{ id: "1" }];
  });
  await env.sync([a], start, end);
  const paused = await env.sync([{ ...a, sync: false }], start, end, {
    force: true,
  });
  assert.equal(calls, 1);
  assert.equal(paused.events.length, 1);
  assert.equal(paused.statuses[0].paused, true);
  const hidden = await env.sync([{ ...a, visible: false }], start, end, {
    force: true,
  });
  assert.equal(calls, 2);
  assert.equal(hidden.events.length, 0);
});
test("overlapping requests share each source fetch and range caches never leak", async () => {
  let calls = 0,
    finish;
  const env = setup(() => {
    calls++;
    return new Promise((resolve) => (finish = resolve));
  });
  const first = env.sync([a], start, end),
    second = env.sync([a], start, end);
  finish([{ id: "1" }]);
  await Promise.all([first, second]);
  assert.equal(calls, 1);
  const other = await env.sync(
    [{ ...a, sync: false }],
    "2027-01-01",
    "2027-02-01",
  );
  assert.equal(other.events.length, 0);
});
test("subscription validation accepts webcal and rejects executable URLs", () => {
  assert.equal(
    safeUrl("webcal://example.com/a.ics"),
    "https://example.com/a.ics",
  );
  for (const value of [
    "file:///etc/passwd",
    "javascript:alert(1)",
    "https://user:secret@example.com",
  ])
    assert.throws(() => safeUrl(value));
  assert.throws(() =>
    validateSource({
      type: "ics",
      name: "",
      color: "#60a5fa",
      url: "https://example.com",
    }),
  );
});
test("disabled automatic sync does not fetch uncached ranges; changing URL cannot reuse old data", async () => {
  let calls = 0;
  const env = setup(async (s) => {
    calls++;
    return [{ id: "1", subject: s.url }];
  });
  const first = await env.sync(
    [{ ...a, type: "ics", url: "https://example.com/old" }],
    start,
    end,
    { interval: Infinity },
  );
  assert.equal(calls, 0);
  assert.equal(first.events.length, 0);
  await env.sync(
    [{ ...a, type: "ics", url: "https://example.com/old" }],
    start,
    end,
    { force: true },
  );
  const changed = await env.sync(
    [{ ...a, type: "ics", url: "https://example.com/new" }],
    start,
    end,
    { interval: Infinity },
  );
  assert.equal(changed.events.length, 0);
  assert.equal(calls, 1);
});

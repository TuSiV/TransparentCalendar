const test = require("node:test");
const assert = require("node:assert/strict");
const { getEvents } = require("../src/ics");
const sample = `BEGIN:VCALENDAR\r\nVERSION:2.0\r\nBEGIN:VEVENT\r\nUID:meeting\r\nDTSTART:20261019T090000Z\r\nDTEND:20261019T100000Z\r\nSUMMARY:Meeting\r\nEND:VEVENT\r\nEND:VCALENDAR`;
test("ICS accepts IPC ISO strings, validates calendars and stable occurrence IDs", async () => {
  const original = global.fetch;
  try {
    global.fetch = async (url) => {
      assert.equal(url, "https://example.com/a.ics");
      return { ok: true, text: async () => sample };
    };
    const first = await getEvents(
      "webcal://example.com/a.ics",
      "2026-10-01T00:00:00Z",
      "2026-11-01T00:00:00Z",
    );
    const second = await getEvents(
      "webcal://example.com/a.ics",
      new Date("2026-10-01"),
      new Date("2026-11-01"),
    );
    assert.equal(first.length, 1);
    assert.equal(first[0].subject, "Meeting");
    assert.equal(first[0].id, second[0].id);
    global.fetch = async () => ({
      ok: true,
      text: async () => "<html>login</html>",
    });
    await assert.rejects(
      () => getEvents("https://example.com/a.ics", new Date(), new Date()),
      /./,
    );
  } finally {
    global.fetch = original;
  }
});
test("recurrence COUNT remains anchored to original DTSTART and exceptions replace originals", async () => {
  const original = global.fetch;
  try {
    const recurring = sample.replace(
      "SUMMARY:Meeting",
      "RRULE:FREQ=DAILY;COUNT=2\r\nSUMMARY:Meeting",
    );
    global.fetch = async () => ({ ok: true, text: async () => recurring });
    assert.equal(
      (await getEvents("https://example.com", "2026-10-22", "2026-11-01"))
        .length,
      0,
    );
    const moved = recurring.replace(
      "END:VCALENDAR",
      `BEGIN:VEVENT\r\nUID:meeting\r\nRECURRENCE-ID:20261020T090000Z\r\nDTSTART:20261022T110000Z\r\nDTEND:20261022T120000Z\r\nSUMMARY:Moved\r\nEND:VEVENT\r\nEND:VCALENDAR`,
    );
    global.fetch = async () => ({ ok: true, text: async () => moved });
    const events = await getEvents(
      "https://example.com",
      "2026-10-19",
      "2026-10-25",
    );
    assert.deepEqual(
      events.map((e) => e.subject),
      ["Meeting", "Moved"],
    );
    assert.equal(events[1].start, "2026-10-22T11:00:00.000Z");
  } finally {
    global.fetch = original;
  }
});

const ICAL = require("ical.js");
const { safeUrl } = require("./sources");

async function fetchText(url) {
  const res = await fetch(url, {
    headers: { "User-Agent": "TransparentCalendar/1.1" },
    signal: AbortSignal.timeout(30000),
  });
  if (!res.ok) throw new Error(`ICS 下载失败 (${res.status})`);
  return res.text();
}

function pad(n) {
  return String(n).padStart(2, "0");
}

function toISO(t) {
  return t.toJSDate().toISOString();
}

function allDayISO(t) {
  return `${t.year}-${pad(t.month)}-${pad(t.day)}T00:00:00`;
}

async function getEvents(rawUrl, start, end) {
  const url = safeUrl(rawUrl);
  const text = await fetchText(url);

  const comp = new ICAL.Component(ICAL.parse(text));
  if (comp.name !== "vcalendar") throw new Error("内容不是有效的日历");
  const winStart = ICAL.Time.fromJSDate(new Date(start), true);
  const winEnd = ICAL.Time.fromJSDate(new Date(end), true);
  for (const zone of comp.getAllSubcomponents("vtimezone")) {
    const id = zone.getFirstPropertyValue("tzid");
    if (id) ICAL.TimezoneService.register(id, new ICAL.Timezone(zone));
  }
  const out = [];
  const seen = new Set();
  const components = comp.getAllSubcomponents("vevent");
  const exceptions = components.filter((c) => c.hasProperty("recurrence-id"));
  function append(master, occurrence, details) {
    const item = details.item;
    if (item.component.getFirstPropertyValue("status") === "CANCELLED") return;
    const occStart = details.startDate,
      occEnd = details.endDate;
    if (
      occStart.compare(winEnd) >= 0 ||
      (occEnd.compare(winStart) <= 0 &&
        !(occStart.compare(occEnd) === 0 && occStart.compare(winStart) >= 0))
    )
      return;
    const uid =
      master.uid ||
      require("node:crypto")
        .createHash("sha256")
        .update(master.component.toString())
        .digest("hex");
    const id = `${uid}-${toISO(occurrence)}`;
    if (seen.has(id)) return;
    seen.add(id);
    const isAllDay = occStart.isDate;
    out.push({
      id,
      subject: item.summary || "(无标题)",
      start: isAllDay ? allDayISO(occStart) : toISO(occStart),
      end: isAllDay ? allDayISO(occEnd) : toISO(occEnd),
      isAllDay,
      location: item.location || "",
      notes: item.description || "",
      webLink: "",
    });
  }
  for (const vsub of components.filter(
    (c) => !c.hasProperty("recurrence-id"),
  )) {
    const ev = new ICAL.Event(vsub);
    if (!ev.startDate || vsub.getFirstPropertyValue("status") === "CANCELLED")
      continue;
    const related = exceptions
      .filter((c) => c.getFirstPropertyValue("uid") === ev.uid)
      .map((c) => new ICAL.Event(c));
    for (const exception of related) ev.relateException(exception);
    if (ev.isRecurring()) {
      // Expand from DTSTART: using the view start changes COUNT and BYDAY semantics.
      const iterator = ev.iterator();
      let occurrence,
        guard = 0;
      while ((occurrence = iterator.next())) {
        if (++guard > 100000) throw new Error("重复日程数量超出处理范围");
        if (occurrence.compare(winEnd) >= 0) break;
        append(ev, occurrence, ev.getOccurrenceDetails(occurrence));
      }
      // Include exceptions moved into this view from an occurrence outside it.
      for (const exception of related)
        append(ev, exception.recurrenceId, {
          item: exception,
          startDate: exception.startDate,
          endDate: exception.endDate,
        });
    } else
      append(ev, ev.startDate, {
        item: ev,
        startDate: ev.startDate,
        endDate: ev.endDate,
      });
  }

  out.sort((a, b) => a.start.localeCompare(b.start));
  return out;
}

module.exports = { getEvents };

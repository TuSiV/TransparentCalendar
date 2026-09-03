const ICAL = require('ical.js');

async function fetchText(url) {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'TransparentCalendar/1.0' },
  });
  if (!res.ok) throw new Error(`ICS 下载失败 (${res.status})`);
  return res.text();
}

function pad(n) {
  return String(n).padStart(2, '0');
}

function toISO(t) {
  return t.toJSDate().toISOString();
}

function allDayISO(t) {
  return `${t.year}-${pad(t.month)}-${pad(t.day)}T00:00:00`;
}

async function getEvents(rawUrl, start, end) {
  const url = rawUrl.replace(/^webcal:\/\//i, 'https://');
  const text = await fetchText(url);

  const comp = new ICAL.Component(ICAL.parse(text));
  const winStart = ICAL.Time.fromJSDate(start, true);
  const winEnd = ICAL.Time.fromJSDate(end, true);
  const out = [];

  for (const vsub of comp.getAllSubcomponents('vevent')) {
    const ev = new ICAL.Event(vsub);
    if (!ev.startDate) continue;

    const isAllDay = ev.startDate.isDate;
    const duration = ev.duration || new ICAL.Duration({ seconds: 0 });

    let occurrences;
    if (ev.isRecurring()) {
      occurrences = [];
      const it = ev.iterator(winStart);
      let t;
      let guard = 0;
      while ((t = it.next()) && guard++ < 500) {
        if (t.compare(winEnd) > 0) break;
        occurrences.push(t);
      }
    } else {
      occurrences = [ev.startDate];
    }

    for (const occStart of occurrences) {
      const occEnd = occStart.clone();
      occEnd.addDuration(duration);
      if (occEnd.compare(winStart) <= 0) continue;
      if (occStart.compare(winEnd) >= 0) continue;

      out.push({
        id: `${ev.uid || Math.random()}-${toISO(occStart)}`,
        subject: ev.summary || '(无标题)',
        start: isAllDay ? allDayISO(occStart) : toISO(occStart),
        end: isAllDay ? allDayISO(occEnd) : toISO(occEnd),
        isAllDay,
        location: ev.location || '',
        webLink: '',
      });
    }
  }

  out.sort((a, b) => a.start.localeCompare(b.start));
  return out;
}

module.exports = { getEvents };

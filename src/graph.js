const GRAPH = 'https://graph.microsoft.com/v1.0';

function normalizeDateTime(s) {
  // Graph 在 Prefer: outlook.timezone="UTC" 下返回不带时区的时间串，需要补 Z
  if (/[Zz]$|[+-]\d{2}:\d{2}$/.test(s)) return s;
  return s + 'Z';
}

async function getCalendarView(accessToken, startISO, endISO) {
  const url = new URL(GRAPH + '/me/calendarview');
  url.searchParams.set('startDateTime', startISO);
  url.searchParams.set('endDateTime', endISO);
  url.searchParams.set('$select', 'subject,start,end,location,isAllDay,webLink');
  url.searchParams.set('$orderby', 'start/dateTime');
  url.searchParams.set('$top', '200');

  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Prefer: 'outlook.timezone="UTC"',
    },
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Graph API ${res.status}: ${body.slice(0, 200)}`);
  }

  const data = await res.json();
  return data.value.map((e) => ({
    id: e.id,
    subject: e.subject || '(无标题)',
    start: normalizeDateTime(e.start.dateTime),
    end: normalizeDateTime(e.end.dateTime),
    isAllDay: !!e.isAllDay,
    location: (e.location && e.location.displayName) || '',
    webLink: e.webLink || '',
  }));
}

module.exports = { getCalendarView };

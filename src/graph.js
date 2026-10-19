const GRAPH = "https://graph.microsoft.com/v1.0";

function normalizeDateTime(s) {
  // Graph 在 Prefer: outlook.timezone="UTC" 下返回不带时区的时间串，需要补 Z
  if (/[Zz]$|[+-]\d{2}:\d{2}$/.test(s)) return s;
  return s + "Z";
}

async function getCalendarView(accessToken, startISO, endISO, calendarId) {
  const url = new URL(
    GRAPH +
      (calendarId
        ? "/me/calendars/" + encodeURIComponent(calendarId) + "/calendarView"
        : "/me/calendarview"),
  );
  url.searchParams.set("startDateTime", startISO);
  url.searchParams.set("endDateTime", endISO);
  url.searchParams.set(
    "$select",
    "subject,start,end,location,isAllDay,webLink,bodyPreview",
  );
  url.searchParams.set("$orderby", "start/dateTime");
  url.searchParams.set("$top", "200");

  let next = url.href;
  const values = [];
  while (next) {
    if (!next.startsWith(GRAPH + "/")) throw new Error("Graph 分页地址无效");
    const res = await fetch(next, {
      signal: AbortSignal.timeout(30000),
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
    values.push(...data.value);
    next = data["@odata.nextLink"];
  }
  return values.map((e) => ({
    id: e.id,
    subject: e.subject || "(无标题)",
    start: normalizeDateTime(e.start.dateTime),
    end: normalizeDateTime(e.end.dateTime),
    isAllDay: !!e.isAllDay,
    location: (e.location && e.location.displayName) || "",
    webLink: e.webLink || "",
    notes: e.bodyPreview || "",
  }));
}

async function getCalendars(token) {
  const values = [];
  let url = GRAPH + "/me/calendars?$select=id,name,color&$top=100";
  while (url) {
    if (!url.startsWith(GRAPH + "/")) throw new Error("Graph 分页地址无效");
    const res = await fetch(url, {
      headers: { Authorization: "Bearer " + token },
      signal: AbortSignal.timeout(30000),
    });
    if (!res.ok) throw new Error("获取日历失败 (" + res.status + ")");
    const data = await res.json();
    values.push(...data.value);
    url = data["@odata.nextLink"];
  }
  return values;
}
module.exports = { getCalendarView, getCalendars };

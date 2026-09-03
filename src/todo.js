const GRAPH = 'https://graph.microsoft.com/v1.0';

function norm(s) {
  if (!s) return s;
  return s.replace(/^webcal:\/\//i, 'https://');
}

async function headers(token) {
  return {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  };
}

/* -------- Task Lists -------- */

async function getLists(token) {
  const res = await fetch(`${GRAPH}/me/todo/lists?$orderby=displayName`, {
    headers: await headers(token),
  });
  if (!res.ok) throw new Error(`Todo Lists ${res.status}`);
  const data = await res.json();
  return data.value.map((l) => ({
    id: l.id,
    name: l.displayName,
    wellknownName: l.wellknownName || '',
  }));
}

/* -------- Tasks -------- */

function dueFilter(date) {
  const iso = date.toISOString().slice(0, 10);
  return `dueDateTime/dateTime ge '${iso}T00:00:00Z' and dueDateTime/dateTime lt '${iso}T23:59:59Z'`;
}

async function getTasks(token, listId, date) {
  let url = `${GRAPH}/me/todo/lists/${listId}/tasks?$orderby=dueDateTime/dateTime`;
  if (date) {
    url += `&$filter=${dueFilter(date)}`;
  } else {
    url += `&$filter=status ne 'completed'`;
  }
  const res = await fetch(url, { headers: await headers(token) });
  if (!res.ok) throw new Error(`Todo Tasks ${res.status}`);
  const data = await res.json();
  return data.value.map((t) => ({
    id: t.id,
    subject: t.subject,
    status: t.status,
    importance: t.importance,
    dueDateTime: t.dueDateTime
      ? { dateTime: t.dueDateTime.dateTime, timeZone: t.dueDateTime.timeZone }
      : null,
    isReminderOn: !!t.isReminderOn,
    createdDateTime: t.createdDateTime,
  }));
}

async function getTasksDueInRange(token, listId, start, end) {
  const s = start.toISOString().slice(0, 10);
  const e = end.toISOString().slice(0, 10);
  const url = `${GRAPH}/me/todo/lists/${listId}/tasks?$filter=dueDateTime/dateTime ge '${s}T00:00:00Z' and dueDateTime/dateTime lt '${e}T23:59:59Z'&$orderby=dueDateTime/dateTime`;
  const res = await fetch(url, { headers: await headers(token) });
  if (!res.ok) throw new Error(`Todo Tasks ${res.status}`);
  const data = await res.json();
  return data.value.map((t) => ({
    id: t.id,
    subject: t.subject,
    status: t.status,
    importance: t.importance,
    dueDateTime: t.dueDateTime
      ? { dateTime: t.dueDateTime.dateTime, timeZone: t.dueDateTime.timeZone }
      : null,
    isReminderOn: !!t.isReminderOn,
    createdDateTime: t.createdDateTime,
  }));
}

/* -------- Create / Update / Delete -------- */

async function createTask(token, listId, { subject, dueDateTime }) {
  const body = {
    subject,
    status: 'notStarted',
    importance: 'normal',
  };
  if (dueDateTime) {
    body.dueDateTime = dueDateTime;
  }
  const res = await fetch(`${GRAPH}/me/todo/lists/${listId}/tasks`, {
    method: 'POST',
    headers: await headers(token),
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Create Task ${res.status}`);
  const t = await res.json();
  return { id: t.id, subject: t.subject, status: t.status, dueDateTime: t.dueDateTime };
}

async function completeTask(token, listId, taskId) {
  const res = await fetch(`${GRAPH}/me/todo/lists/${listId}/tasks/${taskId}`, {
    method: 'PATCH',
    headers: await headers(token),
    body: JSON.stringify({ status: 'completed' }),
  });
  if (!res.ok) throw new Error(`Complete Task ${res.status}`);
  return { ok: true };
}

async function deleteTask(token, listId, taskId) {
  const res = await fetch(`${GRAPH}/me/todo/lists/${listId}/tasks/${taskId}`, {
    method: 'DELETE',
    headers: await headers(token),
  });
  if (!res.ok) throw new Error(`Delete Task ${res.status}`);
  return { ok: true };
}

module.exports = {
  getLists,
  getTasks,
  getTasksDueInRange,
  createTask,
  completeTask,
  deleteTask,
};

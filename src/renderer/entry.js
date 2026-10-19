const $ = (id) => document.getElementById(id);
let entry;
let editing = false;
let saving = false;
let baseline;
function localDate(value) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return '';
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}
function localTime(value) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return '';
  return `${localDate(value)}T${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}
function configureDates() {
  const allDay = $('detailAllDay').checked;
  for (const id of ['detailStart', 'detailEnd']) {
    const input = $(id), value = input.value;
    input.type = allDay ? 'date' : 'datetime-local';
    input.value = allDay ? value.slice(0, 10) : value.length === 10 ? `${value}T00:00` : value;
  }
  // An all-day event must include at least the selected date.
  if (allDay && $('detailEnd').value <= $('detailStart').value) {
    const next = new Date($('detailStart').value + 'T12:00:00');
    next.setDate(next.getDate() + 1);
    $('detailEnd').value = localDate(next);
  }
  $('detailEndLabel').textContent = allDay ? '结束日期（不包含当天）' : '结束';
}
function snapshot() {
  return JSON.stringify(Array.from($('detailFields').querySelectorAll('input, select, textarea')).map((input) => input.type === 'checkbox' ? input.checked : input.value));
}
function trackDirty() { api.setEntryDirty(editing && snapshot() !== baseline); }
function setEditing(value) {
  editing = value;
  $('detailFields').disabled = !value;
  $('btnDetailEdit').classList.toggle('hidden', value || entry.readonly);
  $('btnDetailSave').classList.toggle('hidden', !value);
  $('btnDetailClose').textContent = value ? '取消' : '关闭';
  document.title = $('detailHeading').textContent = value ? (entry.mode === 'create' ? '新增' : '编辑') + (entry.kind === 'event' ? '日程' : '任务') : (entry.kind === 'event' ? '日程详情' : '任务详情');
  if (value) $('detailSubject').focus();
}
function showError(error) {
  $('detailError').textContent = error.message || String(error);
  $('detailError').classList.remove('hidden');
}
async function save(event) {
  event.preventDefault();
  if (!editing || saving || entry.readonly) return;
  try {
    const values = { subject: $('detailSubject').value.trim(), notes: $('detailNotes').value };
    if (!values.subject) throw new Error('标题不能为空');
    if (entry.kind === 'event') {
      const allDay = $('detailAllDay').checked;
      const start = new Date($('detailStart').value + (allDay ? 'T00:00:00' : ''));
      const end = new Date($('detailEnd').value + (allDay ? 'T00:00:00' : ''));
      if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime())) throw new Error('请填写有效的开始和结束时间');
      if (end < start || (allDay && end <= start)) throw new Error('结束时间不能早于开始时间，全天日程至少一天');
      Object.assign(values, { start: start.toISOString(), end: end.toISOString(), isAllDay: allDay, location: $('detailLocation').value.trim() });
    } else {
      Object.assign(values, { dueDateTime: $('detailDue').value ? `${$('detailDue').value}T23:59:00` : null, importance: $('detailImportance').value, status: $('detailStatus').value });
    }
    saving = true;
    $('btnDetailSave').disabled = true;
    $('btnDetailClose').disabled = true;
    await api.saveEntry(values);
  } catch (error) { showError(error); }
  finally {
    saving = false;
    $('btnDetailSave').disabled = false;
    $('btnDetailClose').disabled = false;
  }
}
async function init() {
  entry = await api.getEntry();
  applyAppearance(await api.getSettings());
  api.onSettingsChanged(applyAppearance);
  const item = entry.item || {};
  const date = entry.date || localDate(new Date());
  const isEvent = entry.kind === 'event';
  $('detailSubject').value = item.subject || '';
  $('detailNotes').value = item.notes || '';
  $('detailEventFields').classList.toggle('hidden', !isEvent);
  $('detailTaskFields').classList.toggle('hidden', isEvent);
  $('detailStart').required = $('detailEnd').required = isEvent;
  $('detailStart').value = item.start ? localTime(item.start) : `${date}T09:00`;
  $('detailEnd').value = item.end ? localTime(item.end) : `${date}T10:00`;
  $('detailAllDay').checked = !!item.isAllDay;
  $('detailLocation').value = item.location || '';
  $('detailDue').value = entry.mode === 'create' ? date : item.dueDateTime ? localDate(item.dueDateTime.dateTime || item.dueDateTime) : '';
  $('detailImportance').value = item.importance || 'normal';
  $('detailStatus').value = item.status || 'notStarted';
  configureDates();
  const remoteCreate = entry.mode === 'create' && entry.target === 'outlook';
  $('entrySource').textContent = entry.readonly ? `${item.sourceName || '外部记录'} · 只读，请在原应用中修改` : remoteCreate ? '保存到 Microsoft To Do · 标题与截止日期' : '保存到本机 · 无需登录';
  for (const id of ['detailImportance', 'detailStatus', 'detailNotes']) $(id).closest('label').classList.toggle('hidden', remoteCreate);
  $('btnDetailExternal').classList.toggle('hidden', !item.webLink);
  $('btnDetailExternal').onclick = () => api.openEventLink(item.webLink).catch(showError);
  $('btnDetailEdit').onclick = () => setEditing(true);
  $('btnDetailClose').onclick = () => api.closeEntry().catch(showError);
  $('detailAllDay').addEventListener('change', configureDates);
  $('detailForm').addEventListener('input', trackDirty);
  $('detailForm').addEventListener('change', trackDirty);
  $('detailForm').addEventListener('submit', save);
  api.onEntrySaveRequested(() => $('detailForm').requestSubmit());
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') { event.preventDefault(); if (!saving) api.closeEntry().catch(showError); }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') { event.preventDefault(); if (editing) $('detailForm').requestSubmit(); }
  });
  baseline = snapshot();
  setEditing(entry.mode === 'create');
  if (!editing) (entry.readonly ? $('btnDetailClose') : $('btnDetailEdit')).focus();
}
init().catch(showError);

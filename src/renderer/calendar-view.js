(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.CalendarView = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  function normalizeMode(mode) { return mode === 'week' ? 'week' : 'month'; }
  function heightForMode(mode) { return normalizeMode(mode) === 'week' ? 400 : 580; }

  function gridRange(view, mode, weekStart) {
    const week = normalizeMode(mode) === 'week';
    const first = new Date(view.getFullYear(), view.getMonth(), week ? view.getDate() : 1);
    const offset = (first.getDay() - (weekStart === 0 ? 0 : 1) + 7) % 7;
    const start = new Date(first.getFullYear(), first.getMonth(), first.getDate() - offset);
    const count = week ? 7 : 42;
    const end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + count - 1, 23, 59, 59, 999);
    return { start, end, count };
  }

  function move(view, mode, direction) {
    return normalizeMode(mode) === 'week'
      ? new Date(view.getFullYear(), view.getMonth(), view.getDate() + direction * 7)
      : new Date(view.getFullYear(), view.getMonth() + direction, 1);
  }

  function weekLabel(start, end) {
    const date = (d) => `${d.getMonth() + 1}/${d.getDate()}`;
    return start.getFullYear() === end.getFullYear()
      ? `${date(start)}–${date(end)}`
      : `${start.getFullYear()}/${date(start)}–${end.getFullYear()}/${date(end)}`;
  }

  return { normalizeMode, heightForMode, gridRange, move, weekLabel };
});

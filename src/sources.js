const COLORS = ["#60a5fa", "#34d399", "#c084fc", "#fb923c"];
function safeUrl(value) {
  const url = new URL(String(value).replace(/^webcal:\/\//i, "https://"));
  if (
    !["https:", "http:"].includes(url.protocol) ||
    url.username ||
    url.password
  )
    throw new Error("请输入有效的 HTTP(S) 或 webcal 日历地址");
  return url.href;
}
function validateSource(source) {
  if (!source || !["ics", "graph"].includes(source.type))
    throw new Error("日历来源无效");
  if (
    typeof source.name !== "string" ||
    !source.name.trim() ||
    source.name.length > 200
  )
    throw new Error("请填写日历名称");
  if (!/^#[0-9a-f]{6}$/i.test(source.color)) throw new Error("颜色无效");
  return {
    ...source,
    name: source.name.trim(),
    ...(source.type === "ics" ? { url: safeUrl(source.url) } : {}),
    visible: source.visible !== false,
    sync: source.sync !== false,
  };
}
// Cache each source and exact requested range independently. Failures never erase successes.
function createSync({ read, write, fetchSource, now = Date.now }) {
  const pending = new Map();
  return async function sync(sources, start, end, options = {}) {
    const result = await Promise.all(
      sources.map(async (source) => {
        const identity = require("node:crypto")
          .createHash("sha256")
          .update(
            JSON.stringify([
              source.type,
              source.url,
              source.accountId,
              source.calendarId,
            ]),
          )
          .digest("hex")
          .slice(0, 16);
        const key = source.id + ":" + identity + ":" + start + ":" + end;
        const cache = read();
        const old = cache[key];
        if (
          source.sync === false ||
          (!options.force && options.interval === Infinity) ||
          (!options.force && old && now() - old.updated < options.interval)
        )
          return {
            source,
            ...(old || { events: [] }),
            paused: source.sync === false || options.interval === Infinity,
          };
        if (!pending.has(key)) {
          const task = (async () => {
            try {
              const events = await fetchSource(source, start, end);
              const value = { events, updated: now() };
              const latest = read();
              latest[key] = value;
              const keys = Object.keys(latest).sort(
                (a, b) => latest[b].updated - latest[a].updated,
              );
              write(
                Object.fromEntries(
                  keys.slice(0, 120).map((k) => [k, latest[k]]),
                ),
              );
              return value;
            } catch (err) {
              // Do not surface provider messages containing subscription URLs or tokens.
              const status = /401|403|未登录|interaction_required/i.test(
                err.message,
              )
                ? "授权失效，请重新连接"
                : "连接或日历解析失败，请检查网络与来源";
              const value = {
                ...(old || { events: [], updated: 0 }),
                error: status,
                attempted: now(),
              };
              const latest = read();
              latest[key] = value;
              write(latest);
              return value;
            }
          })();
          pending.set(key, task);
          task.finally(() => pending.delete(key));
        }
        return { source, ...(await pending.get(key)) };
      }),
    );
    return {
      events: result.flatMap((r) =>
        r.source.visible
          ? r.events.map((e) => ({
              ...e,
              id: r.source.id + ":" + e.id,
              sourceId: r.source.id,
              sourceName: r.source.name,
              sourceColor: r.source.color,
            }))
          : [],
      ),
      statuses: result.map(({ source, events, ...status }) => ({
        id: source.id,
        name: source.name,
        ...status,
        count: events.length,
      })),
    };
  };
}
module.exports = { safeUrl, validateSource, createSync, COLORS };

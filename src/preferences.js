const DEFAULTS = {
  theme: "system",
  backgroundMode: "transparent",
  backgroundOpacity: 50,
  fontScale: 1,
  textEnhance: false,
  accent: "#60a5fa",
  weekStart: 1,
  calendarView: "month",
  alwaysOnTop: true,
  autoSync: true,
  syncMinutes: 10,
  showLocalEvents: true,
  showLocalTasks: true,
  todoEnabled: true,
  shortcut: "CommandOrControl+Alt+C",
  closeBehavior: "hide",
  defaultTaskTarget: "local",
};
function normalize(raw = {}) {
  const s = { ...DEFAULTS, ...raw };
  // Preserve the old perceived background alpha without fading text.
  if (raw.backgroundOpacity === undefined && raw.opacity !== undefined)
    s.backgroundOpacity = Math.round(
      Math.max(0, Math.min(100, Number(raw.opacity) || 0)) * 0.62,
    );
  s.sources = Array.isArray(raw.sources)
    ? raw.sources
    : raw.icsUrl
      ? [
          {
            id: "legacy-ics",
            type: "ics",
            name: "ICS 订阅",
            url: raw.icsUrl,
            color: "#60a5fa",
            visible: true,
            sync: true,
          },
        ]
      : [];
  return s;
}
function validatePatch(patch) {
  if (!patch || typeof patch !== "object" || Array.isArray(patch))
    throw new Error("设置无效");
  const out = {};
  const choices = {
    theme: ["system", "dark", "light"],
    backgroundMode: ["transparent", "solid"],
    weekStart: [0, 1],
    calendarView: ["month", "week"],
    fontScale: [1, 1.15, 1.3],
    syncMinutes: [5, 10, 15, 30, 60],
    closeBehavior: ["hide", "quit"],
    defaultTaskTarget: ["local", "outlook"],
  };
  for (const [k, v] of Object.entries(patch)) {
    if (k in choices) {
      if (!choices[k].includes(v)) throw new Error("设置值无效：" + k);
    } else if (
      [
        "textEnhance",
        "alwaysOnTop",
        "autoSync",
        "showLocalEvents",
        "showLocalTasks",
        "todoEnabled",
        "startOnLogin",
      ].includes(k)
    ) {
      if (typeof v !== "boolean") throw new Error("设置值无效：" + k);
    } else if (k === "backgroundOpacity") {
      if (!Number.isFinite(v) || v < 0 || v > 100)
        throw new Error("不透明度必须为 0—100");
    } else if (k === "accent") {
      if (!/^#[0-9a-f]{6}$/i.test(v)) throw new Error("颜色无效");
    } else if (k === "clientId") {
      if (typeof v !== "string" || (v && !/^[0-9a-f-]{36}$/i.test(v)))
        throw new Error("Client ID 格式无效");
    } else if (k === "shortcut") {
      if (typeof v !== "string" || v.length > 100)
        throw new Error("快捷键无效");
    } else throw new Error("不支持的设置：" + k);
    out[k] = v;
  }
  return out;
}
function boundsFor(mode, settings, area) {
  const b = settings.windowBounds?.[mode] || {
    x: settings.x,
    y: settings.y,
    width: 360,
    height: mode === "week" ? 400 : 580,
  };
  const width = Math.min(area.width, Math.max(300, Number(b.width) || 360));
  const height = Math.min(area.height, Math.max(320, Number(b.height) || 580));
  return {
    width,
    height,
    x: Math.max(
      area.x,
      Math.min(
        Number.isFinite(b.x) ? b.x : area.x + area.width - width - 40,
        area.x + area.width - width,
      ),
    ),
    y: Math.max(
      area.y,
      Math.min(
        Number.isFinite(b.y) ? b.y : area.y + 40,
        area.y + area.height - height,
      ),
    ),
  };
}
module.exports = { DEFAULTS, normalize, validatePatch, boundsFor };

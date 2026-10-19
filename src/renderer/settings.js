const $ = (id) => document.getElementById(id);
let settings = {},
  currentSources = [],
  accounts = [],
  sourceStatuses = [];
let editingId,
  testedUrl = "",
  connectionGeneration = 0,
  selectedAccountId,
  discovered = [];
let saveQueue = Promise.resolve();
function feedback(text, error = false) {
  $("feedback").textContent = text;
  $("feedback").classList.toggle("source-error", error);
}
function errorText(err) {
  return err.message.replace(
    /^Error invoking remote method '[^']+': Error: /,
    "",
  );
}
function syncInputs() {
  applyAppearance(settings);
  document.querySelectorAll("[data-setting]").forEach((el) => {
    if (document.activeElement === el) return;
    const value = settings[el.dataset.setting];
    if (el.type === "checkbox") el.checked = !!value;
    else el.value = value ?? "";
  });
  $("opacityNumber").value = settings.backgroundOpacity;
  document.querySelector("[data-setting=startOnLogin]").disabled =
    !settings.startupSupported;
  $("backgroundOpacity").disabled = $("opacityNumber").disabled =
    settings.backgroundMode === "solid";
  document
    .querySelectorAll("[data-opacity]")
    .forEach((el) => (el.disabled = settings.backgroundMode === "solid"));
}
function save(patch) {
  saveQueue = saveQueue
    .catch(() => {})
    .then(async () => {
      feedback("正在保存…");
      try {
        settings = await api.saveSettings(patch);
        syncInputs();
        feedback("已保存");
      } catch (err) {
        syncInputs();
        feedback(errorText(err), true);
      }
    });
  return saveQueue;
}
function button(text, action, cls = "text-btn") {
  const el = document.createElement("button");
  el.type = "button";
  el.className = cls;
  el.textContent = text;
  el.onclick = async () => {
    el.disabled = true;
    try {
      await action();
    } catch (err) {
      feedback(errorText(err), true);
    } finally {
      el.disabled = false;
    }
  };
  return el;
}
function text(tag, value, cls) {
  const el = document.createElement(tag);
  el.textContent = value;
  if (cls) el.className = cls;
  return el;
}
async function refreshSources() {
  [currentSources, accounts, sourceStatuses] = await Promise.all([
    api.listSources(),
    api.listAccounts(),
    api.sourceStatus(),
  ]);
  const root = $("accountList");
  root.replaceChildren();
  if (!currentSources.length && !accounts.length)
    root.append(text("p", "尚未连接外部日历。本地日历可以直接使用。", "hint"));
  for (const account of accounts) {
    const block = text("div", "", "setting-card");
    block.append(
      text("h2", account.name),
      button("选择日历", () => discover(account.id)),
      button("断开账户", async () => {
        if (!confirm("断开此 Microsoft 账户并移除其日历缓存？本地数据将保留。"))
          return;
        await api.logout(account.id);
        await refreshSources();
      }),
    );
    currentSources
      .filter((s) => s.type === "graph" && s.accountId === account.id)
      .forEach((s) => block.append(sourceCard(s)));
    root.append(block);
  }
  for (const source of currentSources.filter(
    (s) => s.type === "ics" || !accounts.some((a) => a.id === s.accountId),
  ))
    root.append(sourceCard(source));
}
function sourceCard(source) {
  const card = text("div", "", "source-card");
  const title = text("div", "", "source-title");
  const color = document.createElement("input");
  color.type = "color";
  color.value = source.color;
  color.setAttribute("aria-label", source.name + "颜色");
  color.onchange = async () => {
    try {
      await api.patchSource(source.id, { color: color.value });
    } catch (e) {
      feedback(errorText(e), true);
    }
  };
  title.append(color, text("span", source.name), text("small", "只读", "hint"));
  card.append(title);
  const status = sourceStatuses.find((s) => s.id === source.id);
  const message =
    source.sync === false
      ? "已暂停同步 · 保留缓存"
      : status?.error
        ? status.error + (status.updated ? " · 缓存保留" : "")
        : status?.updated
          ? "上次成功：" + new Date(status.updated).toLocaleString()
          : "尚未同步";
  card.append(
    text(
      "div",
      message,
      "source-meta" + (status?.error ? " source-error" : ""),
    ),
  );
  const actions = text("div", "", "source-actions");
  for (const [key, label] of [
    ["visible", "显示"],
    ["sync", "自动更新"],
  ]) {
    const field = text("label", label);
    const input = document.createElement("input");
    input.type = "checkbox";
    input.checked = source[key] !== false;
    input.onchange = async () => {
      try {
        await api.patchSource(source.id, { [key]: input.checked });
        await refreshSources();
      } catch (e) {
        feedback(errorText(e), true);
      }
    };
    field.prepend(input);
    actions.append(field);
  }
  if (source.type === "ics")
    actions.append(button("编辑", () => openIcs(source)));
  actions.append(
    button("移除", async () => {
      if (!confirm("移除此日历及其缓存？本地记录将保留。")) return;
      await api.removeSource(source.id);
      await refreshSources();
    }),
  );
  card.append(actions);
  return card;
}
let icsGeneration = 0;
function openIcs(source) {
  icsGeneration++;
  editingId = source?.id;
  testedUrl = "";
  $("icsHeading").textContent = source ? "编辑 ICS 订阅" : "添加 ICS 订阅";
  $("icsName").value = source?.name || "";
  $("icsAddress").value = source?.url || "";
  $("icsColor").value = source?.color || "#60a5fa";
  $("icsAddress").type = "password";
  $("revealUrl").checked = false;
  $("icsResult").textContent = "";
  $("saveIcs").disabled = true;
  $("saveIcs").textContent = source ? "保存订阅" : "添加日历";
  $("icsDialog").showModal();
}
$("addIcs").onclick = () => openIcs();
$("revealUrl").onchange = () =>
  ($("icsAddress").type = $("revealUrl").checked ? "text" : "password");
$("icsAddress").oninput = () => {
  testedUrl = "";
  $("saveIcs").disabled = true;
};
$("cancelIcs").onclick = () => {
  testedUrl = "";
  $("icsDialog").close();
};
$("testIcs").onclick = async () => {
  const generation = icsGeneration;
  const url = $("icsAddress").value.trim();
  $("testIcs").disabled = true;
  $("icsResult").textContent = "正在获取并解析日历…";
  try {
    const result = await api.testSource(url);
    if (
      generation !== icsGeneration ||
      !$("icsDialog").open ||
      $("icsAddress").value.trim() !== url
    )
      return;
    testedUrl = url;
    $("icsResult").textContent =
      `连接成功，未来 90 天内有 ${result.count} 条日程。` +
      (result.count
        ? "\n" + result.examples.map((e) => e.subject).join("\n")
        : "\n该范围暂无日程，可以添加。");
    $("saveIcs").disabled = false;
  } catch (err) {
    testedUrl = "";
    $("saveIcs").disabled = true;
    $("icsResult").textContent = errorText(err);
  } finally {
    $("testIcs").disabled = false;
  }
};
$("icsForm").onsubmit = async (e) => {
  e.preventDefault();
  if (testedUrl !== $("icsAddress").value.trim()) return;
  $("saveIcs").disabled = true;
  try {
    const old = currentSources.find((x) => x.id === editingId);
    await api.saveSource({
      id: editingId,
      type: "ics",
      name: $("icsName").value.trim(),
      url: testedUrl,
      color: $("icsColor").value,
      visible: old?.visible !== false,
      sync: old?.sync !== false,
    });
    $("icsDialog").close();
    await refreshSources();
    feedback("订阅已保存");
  } catch (err) {
    $("icsResult").textContent = errorText(err);
  } finally {
    $("saveIcs").disabled = false;
  }
};
api.onDeviceCode((info) => {
  if (!$("microsoftDialog").open) return;
  $("microsoftMessage").textContent =
    "在 Microsoft 授权页面输入代码：\n" +
    info.userCode +
    "\n完成后会自动显示可用日历。";
});
async function discover(accountId, generation) {
  const gen = generation ?? ++connectionGeneration;
  if (!$("microsoftDialog").open) $("microsoftDialog").showModal();
  selectedAccountId = accountId;
  $("calendarChoices").replaceChildren();
  $("saveCalendars").classList.add("hidden");
  $("microsoftMessage").textContent = "正在获取日历…";
  const list = await api.discoverCalendars(accountId);
  if (gen !== connectionGeneration || !$("microsoftDialog").open) return;
  discovered = list;
  $("microsoftMessage").textContent = list.length
    ? "选择需要添加的日历。已添加的日历会保留。"
    : "该账户没有可用日历。";
  for (const c of list) {
    const label = text("label", c.name);
    const check = document.createElement("input");
    check.type = "checkbox";
    check.value = c.id;
    const exists = currentSources.some(
      (s) => s.accountId === accountId && s.calendarId === c.id,
    );
    check.checked = true;
    check.disabled = exists;
    label.prepend(check);
    $("calendarChoices").append(label);
  }
  $("saveCalendars").classList.toggle("hidden", !list.length);
}
$("connectMicrosoft").onclick = async () => {
  await saveQueue;
  if (!settings.clientId) {
    feedback("请先在 Microsoft 接入配置中填写 Client ID。", true);
    return;
  }
  const gen = ++connectionGeneration;
  $("microsoftDialog").showModal();
  $("microsoftMessage").textContent = "正在请求授权代码…";
  $("calendarChoices").replaceChildren();
  $("saveCalendars").classList.add("hidden");
  try {
    const result = await api.login();
    if (gen !== connectionGeneration) return;
    await refreshSources();
    await discover(result.accountId, gen);
  } catch (err) {
    if (gen === connectionGeneration)
      $("microsoftMessage").textContent = "授权未完成。请检查配置后重试。";
  }
};
$("closeMicrosoft").onclick = () => {
  connectionGeneration++;
  $("microsoftDialog").close();
};
$("microsoftDialog").addEventListener("cancel", () => connectionGeneration++);
$("saveCalendars").onclick = async () => {
  $("saveCalendars").disabled = true;
  try {
    for (const el of $("calendarChoices").querySelectorAll(
      "input:checked:not(:disabled)",
    )) {
      const c = discovered.find((x) => x.id === el.value);
      await api.saveSource({
        type: "graph",
        accountId: selectedAccountId,
        calendarId: c.id,
        name: c.name,
        color: "#60a5fa",
        visible: true,
        sync: true,
      });
    }
    $("microsoftDialog").close();
    await refreshSources();
    feedback("日历已添加");
  } catch (err) {
    $("microsoftMessage").textContent = errorText(err);
  } finally {
    $("saveCalendars").disabled = false;
  }
};
$("syncNow").onclick = async () => {
  $("syncNow").disabled = true;
  feedback("正在同步…");
  try {
    const start = new Date();
    start.setDate(1);
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setMonth(end.getMonth() + 2);
    const result = await api.getEvents(
      start.toISOString(),
      end.toISOString(),
      true,
    );
    sourceStatuses = result.statuses;
    await refreshSources();
    feedback(
      result.statuses.some((x) => x.error)
        ? "部分来源同步失败，缓存已保留"
        : "同步完成",
    );
  } catch (err) {
    feedback(errorText(err), true);
  } finally {
    $("syncNow").disabled = false;
  }
};
$("clickThrough").onchange = () =>
  api.setClickThrough($("clickThrough").checked);
api.onClickThroughChanged(({ enabled }) => {
  $("clickThrough").checked = enabled;
});
$("resetBounds").onclick = () => api.resetBounds();
$("resetAppearance").onclick = () =>
  save({
    theme: "system",
    backgroundMode: "transparent",
    backgroundOpacity: 50,
    fontScale: 1,
    textEnhance: false,
    accent: "#60a5fa",
  });
for (const [id, url] of Object.entries({
  azureLink: "https://portal.azure.com/",
  deviceLoginLink: "https://microsoft.com/devicelogin",
  projectLink: "https://github.com/TuSiV/TransparentCalendar",
  releasesLink: "https://github.com/TuSiV/TransparentCalendar/releases",
  licenseLink: "https://github.com/TuSiV/TransparentCalendar/blob/main/LICENSE",
}))
  $(id).onclick = () => api.openLink(url);
document.querySelectorAll("[data-page]").forEach(
  (el) =>
    (el.onclick = () => {
      document
        .querySelectorAll(".page")
        .forEach((page) =>
          page.classList.toggle("hidden", page.id !== el.dataset.page),
        );
      document
        .querySelectorAll("[data-page]")
        .forEach((btn) =>
          btn.setAttribute("aria-current", btn === el ? "page" : "false"),
        );
      if (el.dataset.page === "accounts")
        refreshSources().catch((err) => feedback(errorText(err), true));
      if (el.dataset.page === "window")
        api.getClickThrough().then((v) => ($("clickThrough").checked = v));
    }),
);
let opacityTimer;
function opacityChange(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0 || n > 100) return;
  $("backgroundOpacity").value = $("opacityNumber").value = n;
  clearTimeout(opacityTimer);
  opacityTimer = setTimeout(() => save({ backgroundOpacity: n }), 60);
}
$("opacityNumber").oninput = (e) => opacityChange(e.target.value);
document
  .querySelectorAll("[data-opacity]")
  .forEach((el) => (el.onclick = () => opacityChange(el.dataset.opacity)));
document.querySelectorAll("[data-setting]").forEach((el) => {
  const key = el.dataset.setting;
  if (key === "backgroundOpacity") {
    el.oninput = (e) => opacityChange(e.target.value);
    return;
  }
  el.onchange = () =>
    save({
      [key]:
        el.type === "checkbox"
          ? el.checked
          : ["weekStart", "fontScale", "syncMinutes"].includes(key)
            ? Number(el.value)
            : el.value.trim(),
    });
});
api.onSettingsChanged(async (value) => {
  const old = settings;
  settings = { ...settings, ...value };
  syncInputs();
  if (JSON.stringify(old.sources) !== JSON.stringify(value.sources))
    await refreshSources().catch((err) => feedback(errorText(err), true));
});
(async () => {
  settings = await api.getSettings();
  syncInputs();
  $("clickThrough").checked = await api.getClickThrough();
  $("appVersion").textContent = (await api.appInfo()).version;
  await refreshSources();
})().catch((err) => feedback(errorText(err), true));

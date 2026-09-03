# 透明日历 · Outlook | TransparentCalendar

桌面透明置顶日历小部件，接入 Outlook 日历。
A transparent, always-on-top desktop calendar widget with Outlook integration.

## 功能 Features

- 透明无边框置顶窗口，可拖动、位置记忆 / Transparent borderless window, draggable, remembers position
- 月视图 + 日程打点，点击日期查看当日日程 / Monthly view with event dots, click a date to see that day's events
- 支持两种接入方式：ICS 订阅（简单）/ Microsoft Graph API（实时）/ Two sync modes: ICS subscription (simple) / Graph API (real-time)
- 托盘常驻：显示/隐藏、鼠标穿透、退出 / System tray: show/hide, click-through, quit
- 不透明度可调 / Adjustable opacity
- 本地事件与任务支持，无需账户 / Local event and task support, no account required
- Microsoft Todo 集成（Graph 模式）/ Microsoft Todo integration (Graph mode)
- 点击穿透模式，悬停智能检测 / Click-through mode with smart hover detection
- 可配置每周起始日（周一/周日）/ Configurable first day of week (Monday/Sunday)

## 使用 Usage

```powershell
npm install
npm start
```

### 方式一：ICS 订阅（推荐，无需 Azure）

1. 打开 [Outlook 网页版](https://outlook.live.com/owa) → 左下角齿轮 → **日历**
2. **共享/发布** → 选择要共享的日历 → **获取日历链接**
3. 复制 **ICS** 格式链接（不是 webcal，插件会自动转换）
4. 托盘图标 → 设置 → 粘贴到「ICS 订阅链接」→ 保存

### Option 1: ICS Subscription (Recommended, No Azure Needed)

1. Open [Outlook on the web](https://outlook.live.com/owa) → gear icon → **Calendar**
2. **Shared calendars** → pick a calendar → **Get a link**
3. Copy the **ICS** format link (not webcal — the app converts automatically)
4. Tray icon → Settings → paste the ICS URL → Save

### 方式二：Microsoft Graph API

需要注册 Azure 应用（个人 Microsoft 账号可能无 Entra ID 目录，需先创建租户）。

1. 打开 [Azure 门户 - 应用注册](https://portal.azure.com/#blade/Microsoft_AAD_RegisteredApps/ApplicationsListBlade)，点击「新注册」
2. 账户类型选「任何组织目录中的账户和个人 Microsoft 账户」
3. 注册后复制**应用程序(客户端) ID**
4. API 权限添加 `Calendars.Read`（委托），身份验证中允许「公共客户端流」
5. 托盘 → 设置 → 填入 Client ID → 点击「登录 Microsoft 账户」→ 浏览器输入设备码

### Option 2: Microsoft Graph API

Requires an Azure app registration (personal Microsoft accounts may need to create a tenant first).

1. Open [Azure Portal – App Registrations](https://portal.azure.com/#blade/Microsoft_AAD_RegisteredApps/ApplicationsListBlade) → **New registration**
2. Account type: **Accounts in any organizational directory and personal Microsoft accounts**
3. Copy the **Application (client) ID**
4. Add `Calendars.Read` permission (delegated); enable **Allow public client flows** in Authentication
5. Tray → Settings → paste Client ID → **Login Microsoft Account** → enter the device code in browser

## 目录结构 Project Structure

```
src/main.js        主进程：透明窗口、托盘、IPC / Main process: window, tray, IPC
src/auth.js        MSAL 设备码登录 + 令牌缓存 / MSAL device code login + token cache
src/graph.js       Graph API calendarView 数据拉取 / Graph API calendarView fetch
src/ics.js         ICS 订阅解析（ical.js）/ ICS subscription parser
src/todo.js        Microsoft Todo API
src/store.js       本地事件/任务 JSON 存储 / Local event/task JSON persistence
src/preload.js     渲染层安全桥接 / Secure renderer bridge
src/renderer/      界面（月历 + 日程/任务列表 + 设置）/ UI (calendar + panels + settings)
```

## 许可 License

[MIT](LICENSE)

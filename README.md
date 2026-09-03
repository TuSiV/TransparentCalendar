# 透明日历 · Outlook

桌面透明置顶日历小部件，接入 Outlook 日历。

## 功能

- 透明无边框置顶窗口，可拖动、位置记忆
- 月视图 + 日程打点，点击日期查看当日日程
- 支持两种接入方式：ICS 订阅（简单）/ Microsoft Graph API（实时）
- 托盘常驻：显示/隐藏、鼠标穿透、退出
- 不透明度可调

## 使用

```powershell
npm install
npm start
```

### 方式一：ICS 订阅（推荐，无需 Azure）

1. 打开 [Outlook 网页版](https://outlook.live.com/owa) → 左下角齿轮 → **日历**
2. **共享/发布** → 选择要共享的日历 → **获取日历链接**
3. 复制 **ICS** 格式链接（不是 webcal，插件会自动转换）
4. 托盘图标 → 设置 → 粘贴到「ICS 订阅链接」→ 保存

### 方式二：Microsoft Graph API

需要注册 Azure 应用（个人 Microsoft 账号可能无 Entra ID 目录，需先创建租户）。

1. 打开 [Azure 门户 - 应用注册](https://portal.azure.com/#blade/Microsoft_AAD_RegisteredApps/ApplicationsListBlade)，点击「新注册」
2. 账户类型选「任何组织目录中的账户和个人 Microsoft 账户」
3. 注册后复制**应用程序(客户端) ID**
4. API 权限添加 `Calendars.Read`（委托），身份验证中允许「公共客户端流」
5. 托盘 → 设置 → 填入 Client ID → 点击「登录 Microsoft 账户」→ 浏览器输入设备码

## 目录结构

```
src/main.js       主进程：透明窗口、托盘、IPC
src/auth.js       MSAL 设备码登录 + 令牌缓存
src/graph.js      Graph API calendarView 数据拉取
src/ics.js        ICS 订阅解析（ical.js）
src/preload.js    渲染层安全桥接
src/renderer/     界面（月历 + 日程列表 + 设置）
```

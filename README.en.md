<div align="center">

# TransparentCalendar

**Your calendar, at home on your desktop.**

A transparent Windows calendar for local plans, Outlook and ICS subscriptions.

[简体中文](README.md) · [English](README.en.md)

<img src="docs/media/badges.svg" alt="Windows x64 · Local first · MIT" width="300" height="28">

**[Download](https://github.com/TuSiV/TransparentCalendar/releases/latest)** · [Quick start](#quick-start) · [Report an issue](https://github.com/TuSiV/TransparentCalendar/issues)

<img src="docs/media/hero.png" alt="TransparentCalendar rendered preview with a monthly calendar, daily events and tasks" width="100%">

<sub>Rendered application UI with sample data and a composed background; not a Windows desktop capture. The preview shows the Chinese interface.</sub>

</div>

## A lighter place for your plans

| Clear text. Transparent background. | A layout that fits your desktop. |
| :--- | :--- |
| Adjust background opacity from **0% to 100%** without fading text or controls. | Resize from any edge or corner; wide windows use a two-column layout. |
| Switch between **month and week views**, with daily events and tasks below. | Each view remembers its own window size and position. |
| Choose **dark, light or system theme**, font size and accent color. | Combine local plans, multiple Outlook calendars and ICS subscriptions. |

Start with local events and tasks without signing in. Connect external calendars when you need them. The current application interface is in Chinese.

## Download

| Package | Best for | Link |
| :--- | :--- | :--- |
| **Installer** | Everyday use with an installation wizard | [Open the latest release and select the Setup installer](https://github.com/TuSiV/TransparentCalendar/releases/latest) |
| **Portable** | Running without installation | [TransparentCalendar.exe](https://github.com/TuSiV/TransparentCalendar/releases/latest/download/TransparentCalendar.exe) |
| **Checksums** | Verifying downloaded files | [SHA256SUMS.txt](https://github.com/TuSiV/TransparentCalendar/releases/latest/download/SHA256SUMS.txt) |

Packages are available for **Windows x64**. Use the system tray to reopen a hidden calendar.

## Quick start

1. **Place it.** Drag the empty header area to move the window; drag an edge or corner to resize it.
2. **Add a plan.** Select a date, then click `+` in the event or task section. Click a local record to view its details and edit it.
3. **Make it yours.** Open the gear button to adjust the theme, font size and background opacity in a separate settings window.

| Action | Where to find it |
| :--- | :--- |
| Change month/week view or return to today | Header buttons **周／月** and **今** |
| Complete tasks or reveal completed items | Task circles and the checkmark button |
| Reopen a completed local task | Reveal completed items, then click its circle |
| Configure always-on-top, sync or Windows startup | Settings or the tray menu |
| Restore interaction after enabling click-through | Turn it off in the tray, or press **Ctrl + Alt + C** |

With click-through enabled, **empty areas pass clicks to the desktop while dates, buttons, events, tasks, editing panels and resize grips remain interactive**. Change dates or add plans without disabling the mode. The recovery shortcut is configurable; the settings window remains interactive.

## Calendar connections

| Source | View | Available changes | Connection |
| :--- | :---: | :--- | :--- |
| **Local events and tasks** | ✓ | Create, inspect, edit and delete; complete and reopen tasks | No account required |
| **Outlook / Microsoft 365 calendars** | ✓ | Read-only details and links to the original calendar | Microsoft authorization with your own Client ID |
| **ICS / webcal subscriptions** | ✓ | Read-only | Subscription URL and connection test |
| **Microsoft To Do** | ✓ | Create and complete tasks; read-only details | Microsoft authorization and the default task list |

Display multiple Microsoft accounts, calendars within each account, and ICS subscriptions together. Each calendar has its own color, visibility and update controls.

Native Google authorization, iCloud CalDAV, external calendar editing and native frosted-glass effects are not included. Use transparent background mode to see the content beneath the window clearly.

<details>
<summary><strong>Add an ICS subscription</strong></summary>

1. Obtain an **ICS or webcal subscription URL** from your calendar provider.
2. Open **设置 → 日历账户 → ICS 订阅** (Settings → Calendar accounts → ICS subscription).
3. Enter a name, URL and color, then run **测试连接** (Test connection).
4. Add the subscription after a successful test. A valid calendar with no events in the next 90 days can still be added.

URLs are masked by default. Removing a subscription clears its cache and preserves local records.

</details>

<details>
<summary><strong>Connect Outlook / Microsoft 365</strong></summary>

The project does not currently include a built-in Azure application identity. Use your own public-client Client ID with device-code login enabled, subject to your tenant's authorization policies.

1. Enter the Client ID under **设置 → 日历账户 → Microsoft 接入配置**.
2. Click **连接 Microsoft** and enter the device code on Microsoft's authorization page.
3. Select calendars after signing in. Repeat to connect another account.
4. Use **选择日历** under an existing account to add more calendars.

Requested permissions are `User.Read`, `Calendars.Read`, `Tasks.ReadWrite` and `offline_access`. Task permissions are used for Microsoft To Do. Disconnect existing Microsoft accounts before changing the Client ID.

Microsoft To Do currently uses the default task list of the first signed-in account. Choose local storage or To Do as the destination for new tasks under **日程与任务**.

</details>

<details>
<summary><strong>Settings preview</strong></summary>

Appearance, calendar accounts, events and tasks, window behavior, and application information have separate pages.

<img src="docs/media/settings.png" alt="Dark appearance settings with theme, background, opacity, accent color and font size controls" width="760">

<img src="docs/media/accounts.png" alt="Light calendar account settings with ICS, Microsoft configuration and sync controls" width="760">

These are rendered interface previews with sample data.

</details>

## Sync, offline use and data

| Setting or state | Behavior |
| :--- | :--- |
| **Hide a calendar** | Keep updating it without displaying its events |
| **Pause source updates** | Keep cached data and stop fetching that source |
| **Disable automatic sync** | Read cached ranges; manual refresh updates sources that are not paused |
| **One source fails** | Other sources continue; keep its previous cache for the same time range |
| **Sync interval** | Choose 5, 10, 15, 30 or 60 minutes |

Caches are stored per source and time range. Offline ranges that have never been fetched successfully may be empty. ICS freshness also depends on the provider.

Local records, settings, calendar caches and Microsoft sign-in caches are stored in the application's user data directory. **Subscription URLs may contain access keys**; remove them before sharing settings files. Source error messages do not echo subscription URLs or tokens.

Upgrades migrate older ICS and appearance settings while retaining local records. Legacy whole-window opacity is converted to background opacity.

## Development

Built with Electron, HTML / CSS / JavaScript, Microsoft Graph and ical.js.

```sh
npm ci
npm start
```

<details>
<summary><strong>Tests and Windows packaging</strong></summary>

```sh
npm test
npm run test:electron
npm run dist -- --publish never
```

`test:electron` checks real Electron windows, preload IPC, persistence and Windows startup settings. Windows CI also builds installer and portable packages. Browser UI checks using mocked APIs do not replace real Microsoft-account authorization or desktop-composition and DPI checks on Windows hardware.

See [release.yml](.github/workflows/release.yml) and [validate.yml](.github/workflows/validate.yml).

</details>

---

[MIT License](LICENSE) · [TuSiV](https://github.com/TuSiV) · [Release history](https://github.com/TuSiV/TransparentCalendar/releases)

# TransparentCalendar · Outlook

A transparent, always-on-top desktop calendar widget with Outlook integration.

## Features

- Transparent borderless window, draggable, remembers position
- Monthly view with event dots, click a date to see that day's events
- Two sync modes: ICS subscription (simple, no Azure) / Microsoft Graph API (real-time)
- System tray: show/hide, click-through, quit
- Adjustable opacity
- Local event and task support (no account required)
- Microsoft Todo integration (Graph mode)
- Click-through mode with smart hover detection
- Configurable first day of week (Monday/Sunday)

## Usage

```powershell
npm install
npm start
```

### Option 1: ICS Subscription (Recommended, No Azure Needed)

1. Open [Outlook on the web](https://outlook.live.com/owa) → gear icon → **Calendar**
2. **Shared calendars** → pick a calendar → **Get a link**
3. Copy the **ICS** format link (not webcal — the app converts automatically)
4. Tray icon → Settings → paste the ICS URL → Save

### Option 2: Microsoft Graph API

Requires an Azure app registration (personal Microsoft accounts may need to create a tenant first).

1. Open [Azure Portal – App Registrations](https://portal.azure.com/#blade/Microsoft_AAD_RegisteredApps/ApplicationsListBlade) → **New registration**
2. Account type: **Accounts in any organizational directory and personal Microsoft accounts**
3. Copy the **Application (client) ID**
4. Add `Calendars.Read` permission (delegated); enable **Allow public client flows** in Authentication
5. Tray → Settings → paste Client ID → **Login Microsoft Account** → enter the device code in browser

## Project Structure

```
src/main.js        Main process: transparent window, tray, IPC
src/auth.js        MSAL device code login + token cache
src/graph.js       Graph API calendarView fetch
src/ics.js         ICS subscription parser (ical.js)
src/todo.js        Microsoft Todo API
src/store.js       Local event/task JSON persistence
src/preload.js     Secure renderer bridge
src/renderer/      UI (calendar grid + event/task panel + settings)
```

## License

[MIT](LICENSE)

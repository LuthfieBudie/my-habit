# My Habit

A habit tracker that runs entirely on your device — no account, no server, no internet needed after the first open.

- **Dashboard**: monthly habit tracker, schedule, to-dos, calendar with priority colors, notes, active projects, charts and analysis
- **Check-in**: mobile-first cards with heatmaps, streaks, average log time and goal progress (dark & light theme)
- **Private by design**: all data is stored locally in your browser / app. Use **Export backup** to keep a copy or move to another device.

## Use it

**Phone (Android & iPhone)** — open the web app and install it:
`https://<your-username>.github.io/<repo-name>/checkin.html`
- Android (Chrome): ⋮ → *Install app*
- iPhone (Safari): Share → *Add to Home Screen*

**Windows PC** — download `My Habit.exe` from the [Releases](../../releases) page and open it.

> Phone and PC keep separate data. To copy data between devices: *Your data* (top-right on the dashboard) → **Export backup**, then **Import backup** on the other device.

## Build the Windows app

```bat
build_exe.bat
```
The app is created at `dist\My Habit.exe`.

## Tech

HTML, CSS, vanilla JavaScript, Service Worker (offline PWA), localStorage, Python + pywebview, PyInstaller.

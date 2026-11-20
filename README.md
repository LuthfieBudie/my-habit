# My Habit

A habit tracker that runs entirely on your device — no account, no server, no internet needed after the first open.

- **Dashboard**: monthly habit tracker, schedule, to-dos, calendar with priority colors, notes, active projects, charts and analysis
- **Check-in**: mobile-first cards with heatmaps, streaks, average log time and goal progress (dark & light theme)
- **Private by design**: all data is stored locally in your browser / app. Use **Export backup** to keep a copy or move to another device.

## Use it

**Android** — download `My-Habit.apk` from the [Releases](../../releases) page and install it
(allow *Install unknown apps* for your browser / file manager when asked).

**Windows PC** — download `My Habit.exe` from the [Releases](../../releases) page and open it.
(If Windows shows *"Windows protected your PC"*: **More info → Run anyway**.)

> Phone and PC keep separate data. To copy data between devices: *Your data* (top-right on the dashboard) → **Export backup**, then **Import backup** on the other device.

## Build the Windows app

```bat
build_exe.bat
```
The app is created at `dist\My Habit.exe`.

## Build the Android app

GitHub Actions builds the APK automatically (tab **Actions → Build My Habit APK → Run workflow**, or push a `v*` tag).
Locally (needs Node 22, JDK 21, Android SDK): `npm install`, `npm run build`, `npx cap add android`, then `cd android && gradlew assembleDebug`.

## Tech

HTML, CSS, vanilla JavaScript, Service Worker (offline PWA), localStorage, Python + pywebview, PyInstaller, Capacitor (Android), GitHub Actions.

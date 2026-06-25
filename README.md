# Pomodoro Timer

Lightweight tray-resident Pomodoro timer built with Electron.

## Features
- Work / short break / long break phases with configurable durations
- Drift-free timer (accurate even after sleep / wake)
- System tray with running/paused icons, dynamic tooltip, and context menu
- Global shortcuts: `Ctrl+Shift+P` (show/hide), `Ctrl+Shift+S` (start/pause), `Ctrl+Shift+R` (reset)
- Task list with per-task pomodoro counter
- Light / dark theme
- Native OS notifications
- Persistent settings, tasks, and crash-recoverable timer state

## Development

```bash
npm install
npm run gen-icons   # one-time: generate PNG assets from build/icon.png
npm start
```

## Packaging

```bash
npm run dist:win    # Windows NSIS installer
npm run dist:mac    # macOS DMG
npm run dist        # current platform
```

Outputs land in `release/`.

## Project Layout

- `src/main/` — Electron main process (Node, no DOM)
- `src/preload/` — contextBridge bridge
- `src/renderer/` — UI (vanilla HTML/CSS/JS, ES modules)

## Keyboard Shortcuts

| Shortcut | Action |
|---|---|
| `Ctrl+Shift+P` | Show / hide main window |
| `Ctrl+Shift+S` | Start / pause timer |
| `Ctrl+Shift+R` | Reset current phase |

## Data Storage

All persistent state lives under Electron's `userData` directory:
- `settings.json` — durations, theme, sound
- `tasks.json` — task list
- `state.json` — current timer phase / `endsAt` (for crash recovery)

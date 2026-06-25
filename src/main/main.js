// src/main/main.js
// Electron entry point. Wires lifecycle, the single BrowserWindow, the tray,
// global shortcuts, and the IPC handlers.

'use strict';

const path = require('node:path');
const { app, BrowserWindow, Notification } = require('electron');

const paths = require('./paths');
const store = require('./store');
const { createTimer } = require('./timer-engine');
const { registerTray } = require('./tray');
const { registerShortcuts, unregisterAll } = require('./shortcuts');
const { registerIpc } = require('./ipc-handlers');
const { showPhaseEnd } = require('./notifications');

// --- Single-instance lock ---------------------------------------------------

if (!app.requestSingleInstanceLock()) {
  app.quit();
  process.exit(0);
}

// --- Globals ----------------------------------------------------------------

let mainWindow = null;

// --- Window -----------------------------------------------------------------

function createWindow() {
  const win = new BrowserWindow({
    width: 420,
    height: 640,
    minWidth: 360,
    minHeight: 520,
    resizable: true,
    maximizable: false,
    minimizable: true,
    show: false,
    title: 'Pomodoro',
    backgroundColor: '#F7F2EC',
    icon: paths.rendererAsset('icon.png'),
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
    },
  });

  win.removeMenu(); // hide the default application menu
  win.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));

  win.once('ready-to-show', () => win.show());

  // Close button → hide to tray (unless we're really quitting).
  win.on('close', (e) => {
    if (!app.isQuitting) {
      e.preventDefault();
      win.hide();
    }
  });

  return win;
}

// --- Lifecycle --------------------------------------------------------------

app.on('second-instance', () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    if (!mainWindow.isVisible()) mainWindow.show();
    mainWindow.focus();
  }
});

app.whenReady().then(() => {
  paths.init();
  store.init();

  mainWindow = createWindow();
  const timer = createTimer(store);

  // Wire IPC handlers (they reference timer + store).
  registerIpc({ timer, store, getWin });

  // Tray + global shortcuts. Use a getter so macOS activate handler works
  // when the window is destroyed and re-created.
  const getWin = () => mainWindow;
  registerTray({ getWin, timer });
  registerShortcuts({ getWin, timer });

  // Broadcast timer state to the renderer on every tick and phase change.
  const broadcast = (state) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('timer:update', state);
    }
  };
  timer.on('tick', broadcast);
  timer.on('phaseEnd', (info) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('timer:phaseEnd', info);
    }
    const settings = store.getSettings();
    showPhaseEnd(info.from, info.to, settings);
  });

  // macOS: re-create a window when the dock icon is clicked and no windows exist.
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      mainWindow = createWindow();
    }
  });
});

// Don't quit when the window is closed — we live in the tray.
app.on('window-all-closed', () => {
  // Intentionally empty: tray handles the quit lifecycle.
});

app.on('will-quit', () => {
  unregisterAll();
});

app.on('before-quit', () => {
  app.isQuitting = true;
});

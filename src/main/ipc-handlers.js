// src/main/ipc-handlers.js
// Central registration point for all ipcMain handlers. Every channel the
// renderer can invoke lives here, behind the contextBridge surface defined in
// src/preload/preload.js.

'use strict';

const { ipcMain } = require('electron');

function ok(value) {
  return value === undefined ? { ok: true } : value;
}

function registerIpc({ timer, store }) {
  // --- Timer ----------------------------------------------------------------
  ipcMain.handle('timer:getState', () => timer.getState());
  ipcMain.handle('timer:start',    () => timer.start());
  ipcMain.handle('timer:pause',    () => timer.pause());
  ipcMain.handle('timer:resume',   () => timer.resume());
  ipcMain.handle('timer:reset',    () => timer.reset());
  ipcMain.handle('timer:skip',     () => timer.skip());
  ipcMain.handle('timer:setActiveTask', (_e, { id }) => timer.setActiveTask(id));

  // --- Settings -------------------------------------------------------------
  ipcMain.handle('settings:get', () => store.getSettings());
  ipcMain.handle('settings:set', (_e, patch) => {
    const next = store.setSettings(patch || {});
    // Settings changes affect durations — refresh the timer state.
    timer.refreshSettings();
    return next;
  });

  // --- Tasks ----------------------------------------------------------------
  ipcMain.handle('tasks:list',       () => store.listTasks());
  ipcMain.handle('tasks:add',        (_e, { title }) => store.addTask(title));
  ipcMain.handle('tasks:update',     (_e, { id, patch }) => store.updateTask(id, patch || {}));
  ipcMain.handle('tasks:delete',     (_e, { id }) => store.deleteTask(id));

  // --- App ------------------------------------------------------------------
  ipcMain.handle('app:hideToTray', () => ok());
  ipcMain.handle('app:quit', () => {
    require('electron').app.isQuitting = true;
    require('electron').app.quit();
    return ok();
  });
}

module.exports = { registerIpc };

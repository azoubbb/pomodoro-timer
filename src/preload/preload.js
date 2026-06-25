// src/preload/preload.js
// The ONLY bridge between renderer (untrusted web content) and main (full
// Node). Exposes a small, typed API on window.api. No raw ipcRenderer or Node
// globals are leaked through.

'use strict';

const { contextBridge, ipcRenderer } = require('electron');

const invoke = (channel, payload) => ipcRenderer.invoke(channel, payload);

const subscribe = (channel, cb) => {
  const handler = (_event, data) => cb(data);
  ipcRenderer.on(channel, handler);
  return () => ipcRenderer.removeListener(channel, handler);
};

contextBridge.exposeInMainWorld('api', {
  // Timer control (each returns a Promise<TimerState>)
  timerStart:        ()      => invoke('timer:start'),
  timerPause:        ()      => invoke('timer:pause'),
  timerResume:       ()      => invoke('timer:resume'),
  timerReset:        ()      => invoke('timer:reset'),
  timerSkip:         ()      => invoke('timer:skip'),
  timerGetState:     ()      => invoke('timer:getState'),
  timerSetActiveTask:(id)    => invoke('timer:setActiveTask', { id }),

  // Settings
  settingsGet: ()              => invoke('settings:get'),
  settingsSet: (patch)         => invoke('settings:set', patch),

  // Tasks
  tasksList:   ()              => invoke('tasks:list'),
  tasksAdd:    (title)         => invoke('tasks:add', { title }),
  tasksUpdate: (id, patch)     => invoke('tasks:update', { id, patch }),
  tasksDelete: (id)            => invoke('tasks:delete', { id }),

  // Window / app
  hideToTray:  ()              => invoke('app:hideToTray'),
  quit:        ()              => invoke('app:quit'),

  // Subscriptions — return an unsubscribe function.
  onTimerUpdate: (cb) => subscribe('timer:update', cb),
  onPhaseEnd:    (cb) => subscribe('timer:phaseEnd', cb),
});

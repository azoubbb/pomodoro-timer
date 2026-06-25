// src/main/tray.js
// Tray icon + dynamic tooltip + context menu. The tooltip is rebuilt on every
// timer tick; the menu is rebuilt whenever state changes (so the "Start /
// Pause" label stays in sync with what the click will actually do).

'use strict';

const path = require('node:path');
const { Tray, Menu, nativeImage, app } = require('electron');
const { rendererAsset } = require('./paths');
const { PHASE_LABELS } = require('./timer-engine');

function formatRemaining(ms) {
  const totalSec = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function capitalize(s) {
  return s ? s[0].toUpperCase() + s.slice(1) : s;
}

function buildMenu(win, timer, onShowHide, onStartPause, onSkip, onQuit) {
  const state = timer.getState();
  const startPauseLabel = state.runState === 'running' ? '暂停' : '开始';
  return Menu.buildFromTemplate([
    { label: '显示 / 隐藏窗口', click: onShowHide },
    { type: 'separator' },
    { label: startPauseLabel, click: onStartPause },
    { label: '跳过此阶段', click: onSkip },
    { label: '重置', click: () => timer.reset() },
    { type: 'separator' },
    { label: '退出', click: onQuit },
  ]);
}

function toggleWindow(win) {
  if (win.isVisible() && !win.isMinimized()) {
    win.hide();
  } else {
    if (win.isMinimized()) win.restore();
    win.show();
    win.focus();
  }
}

function registerTray({ win, timer }) {
  const runningIconPath = rendererAsset('tray-running.png');
  const pausedIconPath = rendererAsset('tray-paused.png');

  let tray;
  try {
    tray = new Tray(runningIconPath);
  } catch (err) {
    // Last-ditch: fall back to a 1x1 transparent image so the app still has a tray.
    const fallback = nativeImage.createEmpty();
    tray = new Tray(fallback);
  }

  let lastIcon = 'running';
  const setIconForState = (runState) => {
    const want = runState === 'running' ? 'running' : 'paused';
    if (want === lastIcon) return;
    try {
      const img = nativeImage.createFromPath(want === 'running' ? runningIconPath : pausedIconPath);
      tray.setImage(img);
    } catch (_) { /* ignore icon swap failures */ }
    lastIcon = want;
  };

  const onShowHide = () => toggleWindow(win);
  const onStartPause = () => {
    const s = timer.getState();
    if (s.runState === 'running') timer.pause();
    else if (s.runState === 'paused') timer.resume();
    else timer.start();
  };
  const onSkip = () => timer.skip();
  const onQuit = () => {
    app.isQuitting = true;
    app.quit();
  };

  tray.setToolTip('Pomodoro');
  tray.on('click', onShowHide);
  tray.on('right-click', () => {
    tray.popUpContextMenu(buildMenu(win, timer, onShowHide, onStartPause, onSkip, onQuit));
  });

  function refresh(state) {
    const s = state || timer.getState();
    setIconForState(s.runState);
    const label = s.runState === 'paused'
      ? `Paused ${formatRemaining(s.remainingMs)}`
      : `${capitalize(PHASE_LABELS[s.phase] || s.phase)} ${formatRemaining(s.remainingMs)}`;
    tray.setToolTip(`Pomodoro — ${label}`);
    tray.setContextMenu(buildMenu(win, timer, onShowHide, onStartPause, onSkip, onQuit));
  }

  refresh();
  timer.on('tick', refresh);
  timer.on('phaseEnd', () => refresh());

  return { tray, refresh };
}

module.exports = { registerTray, toggleWindow };

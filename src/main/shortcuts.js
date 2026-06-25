// src/main/shortcuts.js
// Registers global OS-level shortcuts. Failures (e.g. another app owns the
// combination) are logged and reported via a one-shot notification so the
// user knows something didn't bind.

'use strict';

const { globalShortcut } = require('electron');
const { Notification } = require('electron');

const BINDINGS = [
  { accelerator: 'CommandOrControl+Shift+P', label: '显示 / 隐藏窗口' },
  { accelerator: 'CommandOrControl+Shift+S', label: '开始 / 暂停计时' },
  { accelerator: 'CommandOrControl+Shift+R', label: '重置当前阶段' },
];

function notifyMissing(accelerator) {
  if (!Notification.isSupported()) return;
  new Notification({
    title: '快捷键不可用',
    body: `无法注册 ${accelerator},可能被其他程序占用。`,
    silent: true,
  }).show();
}

function registerShortcuts({ win, timer }) {
  const handlers = {
    'CommandOrControl+Shift+P': () => {
      if (win.isVisible() && !win.isMinimized()) win.hide();
      else {
        if (win.isMinimized()) win.restore();
        win.show();
        win.focus();
      }
    },
    'CommandOrControl+Shift+S': () => {
      const s = timer.getState();
      if (s.runState === 'running') timer.pause();
      else if (s.runState === 'paused') timer.resume();
      else timer.start();
    },
    'CommandOrControl+Shift+R': () => timer.reset(),
  };

  let anyFailed = false;
  for (const acc of BINDINGS) {
    const ok = globalShortcut.register(acc.accelerator, handlers[acc.accelerator]);
    if (!ok) {
      console.warn(`[shortcuts] Failed to register ${acc.accelerator}`);
      anyFailed = true;
    }
  }
  if (anyFailed) {
    setTimeout(() => {
      // Single combined notice so we don't spam the user.
      if (!Notification.isSupported()) return;
      new Notification({
        title: '部分快捷键不可用',
        body: '有一个或多个全局快捷键注册失败。',
        silent: true,
      }).show();
    }, 1500);
  }
}

function unregisterAll() {
  globalShortcut.unregisterAll();
}

module.exports = { registerShortcuts, unregisterAll };

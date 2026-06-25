// src/main/notifications.js
// Wraps Electron's native Notification so other modules don't need to know
// about Notification.isSupported() or how to silence it.

'use strict';

const { Notification } = require('electron');
const { PHASE_LABELS } = require('./timer-engine');

const PHASE_COPY = {
  shortBreak:  { title: '专注结束',     body: '该短休息了 — 起来活动一下,看看远方。' },
  longBreak:   { title: '专注结束',     body: '干得漂亮!该来一次长休息了。' },
  work:        { title: '休息结束',     body: '回到专注时间,开始下一个番茄钟。' },
};

function showPhaseEnd(from, to, settings) {
  if (!Notification.isSupported()) return;
  const copy = PHASE_COPY[to] || { title: '阶段结束', body: `当前阶段:${PHASE_LABELS[to] || to}` };
  const n = new Notification({
    title: copy.title,
    body: copy.body,
    silent: !settings.soundEnabled,
  });
  n.show();
}

module.exports = { showPhaseEnd };

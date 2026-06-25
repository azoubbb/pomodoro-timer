// src/main/timer-engine.js
// Drift-free Pomodoro state machine. The "source of truth" for remaining time
// is `endsAt` (absolute wall-clock timestamp); setInterval is only used to
// emit UI ticks. On pause we freeze the remaining duration; on resume we
// re-anchor `endsAt`. After a crash or system sleep, recomputing from
// `Date.now()` automatically catches up — no manual compensation needed.

'use strict';

const { EventEmitter } = require('node:events');

// --- Public types (JSDoc) ---------------------------------------------------

/**
 * @typedef {'work' | 'shortBreak' | 'longBreak'} Phase
 * @typedef {'idle' | 'running' | 'paused'} RunState
 *
 * @typedef {Object} TimerState
 * @property {Phase} phase
 * @property {RunState} runState
 * @property {number} remainingMs
 * @property {number} totalMs
 * @property {number | null} endsAt
 * @property {string | null} currentTaskId
 * @property {number} completedPomodorosInCycle
 */

const PHASE_LABELS = {
  work: '专注',
  shortBreak: '短休息',
  longBreak: '长休息',
};

function durationForPhase(phase, settings) {
  if (phase === 'work') return settings.workDuration * 60_000;
  if (phase === 'shortBreak') return settings.shortBreakDuration * 60_000;
  return settings.longBreakDuration * 60_000;
}

function createTimer(store) {
  const emitter = new EventEmitter();

  let settings = store.getSettings();
  let saved = store.loadState();
  // `currentTaskId` is intentionally kept on the engine, not in state.json,
  // because it's not part of the timer phase state — it survives restarts.
  let currentTaskId = null;

  let phase = saved.currentPhase || 'work';
  let endsAt = null;
  let remainingMs = Number.isFinite(saved.remainingMs)
    ? saved.remainingMs
    : durationForPhase(phase, settings);
  let isPaused = false;
  let completedPomodorosInCycle = saved.completedPomodorosInCycle || 0;

  // Recover after a restart: if we were running and the deadline already
  // passed, advance past the expired phase(s) to settle into a coherent
  // starting state. We bound the loop defensively — under normal operation
  // we'll exit after one or two iterations.
  let runState = 'idle';
  let tickHandle = null;

  if (saved.isRunning && saved.endsAt && saved.endsAt <= Date.now()) {
    let safetyBound = 32; // hard ceiling; bail if anything pathological
    while (saved.isRunning && saved.endsAt && saved.endsAt <= Date.now() && safetyBound-- > 0) {
      advance(saved.endsAt);
      // Re-read state so the loop condition sees the new phase / endsAt.
      saved = store.loadState();
    }
    phase = saved.currentPhase;
    remainingMs = durationForPhase(phase, settings);
    runState = 'idle';
    endsAt = null;
  }

  // --- Helpers --------------------------------------------------------------

  function persist() {
    store.saveState({
      currentPhase: phase,
      endsAt,
      isRunning: runState === 'running',
      isPaused,
      remainingMs,
      currentTaskId,
      completedPomodorosInCycle,
    });
  }

  function snapshot() {
    return {
      phase,
      runState,
      remainingMs,
      totalMs: durationForPhase(phase, settings),
      endsAt,
      currentTaskId,
      completedPomodorosInCycle,
    };
  }

  function emitTick() {
    emitter.emit('tick', snapshot());
  }

  function startTickLoop() {
    stopTickLoop();
    tickHandle = setInterval(() => {
      if (runState !== 'running') return;
      const now = Date.now();
      const remaining = Math.max(0, endsAt - now);
      remainingMs = remaining;
      emitTick();
      if (remaining === 0) {
        advance(now);
      }
    }, 1000);
  }

  function stopTickLoop() {
    if (tickHandle) {
      clearInterval(tickHandle);
      tickHandle = null;
    }
  }

  function nextPhase(from) {
    if (from === 'work') {
      const nextCount = completedPomodorosInCycle + 1;
      return nextCount % settings.longBreakInterval === 0 ? 'longBreak' : 'shortBreak';
    }
    return 'work';
  }

  function advance(firedAt) {
    const from = phase;
    const to = nextPhase(from);

    if (from === 'work') {
      completedPomodorosInCycle += 1;
      // Charge the active task (if any) for one completed pomodoro.
      if (currentTaskId) {
        try {
          store.incrementTaskPomodoro(currentTaskId);
        } catch (_) {
          /* task may have been deleted mid-phase — ignore */
        }
      }
    }

    phase = to;
    remainingMs = durationForPhase(phase, settings);

    // Decide whether to auto-advance into the new phase or wait for the user.
    const isBreak = to !== 'work';
    const shouldAuto = isBreak ? settings.autoStartBreaks : settings.autoStartWork;
    const autoStarted = Boolean(shouldAuto);

    if (autoStarted) {
      runState = 'running';
      endsAt = Date.now() + remainingMs;
      persist();
      startTickLoop();
    } else {
      runState = 'idle';
      endsAt = null;
      persist();
      stopTickLoop();
      emitTick();
    }

    emitter.emit('phaseEnd', {
      from,
      to,
      autoStarted,
      firedAt: firedAt || Date.now(),
    });
  }

  // --- Public API -----------------------------------------------------------

  function start() {
    if (runState === 'running') return snapshot();
    runState = 'running';
    endsAt = Date.now() + remainingMs;
    persist();
    startTickLoop();
    emitTick();
    return snapshot();
  }

  function pause() {
    if (runState !== 'running') return snapshot();
    remainingMs = Math.max(0, endsAt - Date.now());
    runState = 'paused';
    isPaused = true;
    endsAt = null;
    persist();
    stopTickLoop();
    emitTick();
    return snapshot();
  }

  function resume() {
    if (runState !== 'paused') return snapshot();
    runState = 'running';
    endsAt = Date.now() + remainingMs;
    isPaused = false;
    persist();
    startTickLoop();
    emitTick();
    return snapshot();
  }

  function reset() {
    stopTickLoop();
    phase = 'work';
    completedPomodorosInCycle = 0;
    remainingMs = durationForPhase('work', settings);
    runState = 'idle';
    isPaused = false;
    endsAt = null;
    persist();
    emitTick();
    return snapshot();
  }

  function skip() {
    // Force-advance to the next phase immediately, applying the same logic as
    // a natural phase end (counter increments on work completion, etc.).
    stopTickLoop();
    advance(Date.now());
    return snapshot();
  }

  function getState() {
    return snapshot();
  }

  function setActiveTask(taskId) {
    currentTaskId = taskId || null;
    persist();
    emitTick();
    return snapshot();
  }

  function refreshSettings() {
    settings = store.getSettings();
    // If we're idle, reflect new durations right away.
    if (runState === 'idle') {
      remainingMs = durationForPhase(phase, settings);
      persist();
      emitTick();
    }
    return snapshot();
  }

  // Initial broadcast so the renderer can paint immediately on load.
  setImmediate(emitTick);

  return {
    start,
    pause,
    resume,
    reset,
    skip,
    getState,
    setActiveTask,
    refreshSettings,
    on: (event, fn) => emitter.on(event, fn),
    off: (event, fn) => emitter.off(event, fn),
    PHASE_LABELS,
  };
}

module.exports = { createTimer, durationForPhase, PHASE_LABELS };

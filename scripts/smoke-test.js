// scripts/smoke-test.js
// Standalone smoke test for the core timer engine and store helpers.
// Runs under plain Node (no Electron) by mocking the electron-store-backed
// store API. Verifies the drift-free state machine and basic task accounting.

'use strict';

const assert = require('node:assert/strict');

// --- In-memory store mock ---------------------------------------------------

function makeMockStore(initialSettings = {}) {
  const settings = {
    workDuration: 25,
    shortBreakDuration: 5,
    longBreakDuration: 15,
    longBreakInterval: 4,
    theme: 'light',
    soundEnabled: true,
    autoStartBreaks: false,
    autoStartWork: false,
    ...initialSettings,
  };
  let state = {
    currentPhase: 'work',
    endsAt: null,
    isRunning: false,
    isPaused: false,
    remainingMs: settings.workDuration * 60_000,
    currentTaskId: null,
    completedPomodorosInCycle: 0,
  };
  const tasks = [];

  return {
    getSettings: () => ({ ...settings }),
    setSettings: (patch) => Object.assign(settings, patch),
    saveState: (s) => { state = { ...state, ...s }; },
    loadState: () => ({ ...state }),
    incrementTaskPomodoro: (id) => {
      const t = tasks.find((x) => x.id === id);
      if (t) t.pomodorosSpent += 1;
    },
    addTask: (title) => {
      const t = { id: `t-${tasks.length + 1}`, title, completed: false, pomodorosSpent: 0 };
      tasks.push(t);
      return t;
    },
    _tasks: tasks,
    _settings: settings,
    _state: () => state,
  };
}

// --- Inject our modules by patching require cache ----------------------------

const Module = require('node:module');
const origResolve = Module._resolveFilename;
const origLoad = Module._load;

const path = require('node:path');
const timerEnginePath = path.resolve(__dirname, '..', 'src', 'main', 'timer-engine.js');

// --- Test runner ------------------------------------------------------------

async function test(name, fn) {
  try {
    await fn();
    console.log(`  ✓ ${name}`);
  } catch (e) {
    console.error(`  ✗ ${name}`);
    console.error(e);
    process.exitCode = 1;
  }
}

const { createTimer } = require(timerEnginePath);

async function main() {
  console.log('timer-engine smoke tests:');

  await test('starts in idle state with full work duration', () => {
    const store = makeMockStore();
    const timer = createTimer(store);
    const s = timer.getState();
    assert.equal(s.phase, 'work');
    assert.equal(s.runState, 'idle');
    assert.equal(s.remainingMs, 25 * 60_000);
    assert.equal(s.totalMs, 25 * 60_000);
  });

  await test('start transitions to running and sets endsAt', () => {
    const store = makeMockStore();
    const timer = createTimer(store);
    const before = Date.now();
    timer.start();
    const s = timer.getState();
    const after = Date.now();
    assert.equal(s.runState, 'running');
    assert.ok(s.endsAt >= before + 25 * 60_000 - 50);
    assert.ok(s.endsAt <= after + 25 * 60_000 + 50);
  });

  await test('pause freezes remaining; resume re-anchors endsAt', async () => {
    const store = makeMockStore({ workDuration: 25 });
    const timer = createTimer(store);
    timer.start();
    await new Promise((r) => setTimeout(r, 100));
    timer.pause();
    const p = timer.getState();
    assert.equal(p.runState, 'paused');
    const pausedRemaining = p.remainingMs;
    await new Promise((r) => setTimeout(r, 200));
    // Remaining must not have decreased while paused.
    assert.equal(timer.getState().remainingMs, pausedRemaining);
    timer.resume();
    const r = timer.getState();
    assert.equal(r.runState, 'running');
    assert.ok(r.endsAt > Date.now());
  });

  await test('skip advances to shortBreak after one work phase', () => {
    const store = makeMockStore({ longBreakInterval: 4 });
    const timer = createTimer(store);
    timer.skip();
    const s = timer.getState();
    assert.equal(s.phase, 'shortBreak');
    assert.equal(s.totalMs, 5 * 60_000);
    assert.equal(s.runState, 'idle');
  });

  await test('long break fires every Nth work phase', () => {
    const store = makeMockStore({ longBreakInterval: 2, autoStartBreaks: false, autoStartWork: false });
    const timer = createTimer(store);
    timer.skip(); // 1 -> shortBreak
    timer.skip(); // shortBreak -> work
    timer.skip(); // 2 -> longBreak
    const s = timer.getState();
    assert.equal(s.phase, 'longBreak');
    assert.equal(s.totalMs, 15 * 60_000);
  });

  await test('active task pomodorosSpent increments on work phase end', () => {
    const store = makeMockStore();
    const timer = createTimer(store);
    const task = store.addTask('write tests');
    timer.setActiveTask(task.id);
    timer.skip(); // work -> shortBreak, should bump task
    assert.equal(store._tasks[0].pomodorosSpent, 1);
    timer.skip(); // shortBreak -> work, no bump
    assert.equal(store._tasks[0].pomodorosSpent, 1);
    timer.skip(); // work -> shortBreak, bump again
    assert.equal(store._tasks[0].pomodorosSpent, 2);
  });

  await test('reset clears cycle counter and returns to work', () => {
    const store = makeMockStore();
    const timer = createTimer(store);
    timer.skip(); // work -> shortBreak
    timer.skip(); // shortBreak -> work
    timer.skip(); // work -> shortBreak (counter at 2)
    timer.reset();
    const s = timer.getState();
    assert.equal(s.phase, 'work');
    assert.equal(s.runState, 'idle');
    assert.equal(s.completedPomodorosInCycle, 0);
    assert.equal(s.remainingMs, 25 * 60_000);
  });

  await test('crash recovery: phase that ended in our absence is auto-advanced', () => {
    const store = makeMockStore();
    store.saveState({
      currentPhase: 'work',
      endsAt: Date.now() - 5_000, // already past
      isRunning: true,
      isPaused: false,
      remainingMs: 0,
      currentTaskId: null,
      completedPomodorosInCycle: 0,
    });
    const timer = createTimer(store);
    const s = timer.getState();
    assert.equal(s.phase, 'shortBreak');
    assert.equal(s.runState, 'idle');
  });

  await test('refreshSettings updates totalMs while idle', () => {
    const store = makeMockStore();
    const timer = createTimer(store);
    store.setSettings({ workDuration: 30 });
    timer.refreshSettings();
    assert.equal(timer.getState().totalMs, 30 * 60_000);
  });

  await test('emits phaseEnd event on skip', () => new Promise((resolve) => {
    const store = makeMockStore();
    const timer = createTimer(store);
    timer.on('phaseEnd', (info) => {
      assert.equal(info.from, 'work');
      assert.equal(info.to, 'shortBreak');
      resolve();
    });
    timer.skip();
  }));

  console.log(process.exitCode ? '\nFAILED' : '\nOK');
  // Explicit exit — setImmediate() callbacks and lingering listeners from
  // previous tests keep the event loop alive in Node otherwise.
  process.exit(process.exitCode || 0);
}

main().catch((e) => { console.error(e); process.exit(1); });

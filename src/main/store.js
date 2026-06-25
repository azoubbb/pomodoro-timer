// src/main/store.js
// Persistence layer. Wraps electron-store for settings, tasks, and the
// crash-recoverable timer state. All three live under userData as separate
// stores for clean separation of concerns.

'use strict';

const path = require('node:path');
const Store = require('electron-store');
const { userDataPath } = require('./paths');

// --- Settings schema ---------------------------------------------------------

const SETTINGS_DEFAULTS = {
  workDuration: 25,           // minutes
  shortBreakDuration: 5,
  longBreakDuration: 15,
  longBreakInterval: 4,       // long break every N work phases
  soundEnabled: true,
  autoStartBreaks: true,
  autoStartWork: false,
};

const SETTINGS_KEYS = Object.keys(SETTINGS_DEFAULTS);

// --- Task helpers ------------------------------------------------------------

const TASK_KEYS = ['title', 'completed', 'pomodorosSpent', 'createdAt', 'completedAt'];

function sanitizeTask(t) {
  return {
    id: String(t.id),
    title: String(t.title || ''),
    completed: Boolean(t.completed),
    pomodorosSpent: Number.isFinite(t.pomodorosSpent) ? t.pomodorosSpent : 0,
    createdAt: Number.isFinite(t.createdAt) ? t.createdAt : Date.now(),
    completedAt: Number.isFinite(t.completedAt) ? t.completedAt : null,
  };
}

// --- Module state ------------------------------------------------------------

let settings = null;
let tasksStore = null;
let stateStore = null;

function init() {
  if (settings && tasksStore && stateStore) return;

  const baseDir = userDataPath();

  settings = new Store({
    name: 'settings',
    cwd: baseDir,
    defaults: SETTINGS_DEFAULTS,
  });

  tasksStore = new Store({
    name: 'tasks',
    cwd: baseDir,
    defaults: { items: [] },
  });

  stateStore = new Store({
    name: 'state',
    cwd: baseDir,
    defaults: {
      currentPhase: 'work',
      endsAt: null,
      isRunning: false,
      isPaused: false,
      remainingMs: SETTINGS_DEFAULTS.workDuration * 60_000,
      currentTaskId: null,
      completedPomodorosInCycle: 0,
    },
  });
}

// --- Settings API ------------------------------------------------------------

function getSettings() {
  init();
  // Merge defaults so newly-added keys appear after upgrades.
  const merged = { ...SETTINGS_DEFAULTS };
  for (const k of SETTINGS_KEYS) merged[k] = settings.get(k);
  return merged;
}

function setSettings(patch) {
  init();
  const clean = {};
  for (const [k, v] of Object.entries(patch || {})) {
    if (SETTINGS_KEYS.includes(k)) clean[k] = v;
  }
  settings.set(clean);
  return getSettings();
}

// --- Tasks API ---------------------------------------------------------------

function listTasks() {
  init();
  return tasksStore.get('items').map(sanitizeTask);
}

function addTask(title) {
  init();
  const trimmed = String(title || '').trim();
  if (!trimmed) throw new Error('Task title cannot be empty');
  const task = sanitizeTask({
    id: cryptoRandomId(),
    title: trimmed,
    completed: false,
    pomodorosSpent: 0,
    createdAt: Date.now(),
    completedAt: null,
  });
  const items = tasksStore.get('items');
  items.push(task);
  tasksStore.set('items', items);
  return task;
}

function updateTask(id, patch) {
  init();
  const items = tasksStore.get('items');
  const idx = items.findIndex((t) => t.id === id);
  if (idx === -1) throw new Error(`Task ${id} not found`);
  const clean = {};
  for (const [k, v] of Object.entries(patch || {})) {
    if (TASK_KEYS.includes(k)) clean[k] = v;
  }
  // If marking complete, stamp completedAt; if un-completing, clear it.
  if (clean.completed === true && !items[idx].completedAt) clean.completedAt = Date.now();
  if (clean.completed === false) clean.completedAt = null;
  items[idx] = sanitizeTask({ ...items[idx], ...clean });
  tasksStore.set('items', items);
  return items[idx];
}

function deleteTask(id) {
  init();
  const items = tasksStore.get('items');
  const next = items.filter((t) => t.id !== id);
  tasksStore.set('items', next);
  return { ok: true };
}

function incrementTaskPomodoro(id) {
  init();
  if (!id) return null;
  const items = tasksStore.get('items');
  const idx = items.findIndex((t) => t.id === id);
  if (idx === -1) return null;
  items[idx] = sanitizeTask({
    ...items[idx],
    pomodorosSpent: (items[idx].pomodorosSpent || 0) + 1,
  });
  tasksStore.set('items', items);
  return items[idx];
}

// --- State API (timer crash recovery) ---------------------------------------

function loadState() {
  init();
  return { ...stateStore.store };
}

function saveState(snapshot) {
  init();
  // Only persist whitelisted keys to avoid stray fields polluting state.json.
  const clean = {
    currentPhase: snapshot.currentPhase,
    endsAt: snapshot.endsAt ?? null,
    isRunning: Boolean(snapshot.isRunning),
    isPaused: Boolean(snapshot.isPaused),
    remainingMs: snapshot.remainingMs,
    currentTaskId: snapshot.currentTaskId ?? null,
    completedPomodorosInCycle: snapshot.completedPomodorosInCycle ?? 0,
  };
  stateStore.set(clean);
}

// --- ID generator ------------------------------------------------------------

function cryptoRandomId() {
  // electron-store doesn't depend on node:crypto but we can use it here.
  // 16 random hex chars is plenty for a local id space.
  const { randomUUID } = require('node:crypto');
  return randomUUID();
}

module.exports = {
  init,
  getSettings,
  setSettings,
  listTasks,
  addTask,
  updateTask,
  deleteTask,
  incrementTaskPomodoro,
  loadState,
  saveState,
  SETTINGS_DEFAULTS,
};

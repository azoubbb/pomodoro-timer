// app.js — renderer entry. Wires together timer view, task list, settings,
// and the API surface. Runs entirely off the onTimerUpdate event stream so
// the UI stays in sync without polling.

import { createTimerView } from './timer-view.js';
import { createTaskList }  from './task-list.js';
import { createSettings }  from './settings.js';
import { createSound }     from './sound.js';

const api = window.api;
if (!api) {
  document.body.innerHTML = '<p style="padding:20px">Preload bridge missing.</p>';
  throw new Error('window.api is not defined');
}

const root = document;
const timerView = createTimerView(root);
const tasks     = createTaskList({ api, root });
const settings  = createSettings({ api, root });
const sound     = createSound({ api });

// --- Controls ---------------------------------------------------------------

const startBtn = root.querySelector('#btn-start');
const resetBtn = root.querySelector('#btn-reset');
const skipBtn  = root.querySelector('#btn-skip');

startBtn.addEventListener('click', async () => {
  const s = await api.timerGetState();
  if (s.runState === 'running')      await api.timerPause();
  else if (s.runState === 'paused')  await api.timerResume();
  else                                await api.timerStart();
});

resetBtn.addEventListener('click', () => api.timerReset());
skipBtn.addEventListener('click',  () => api.timerSkip());

function refreshStartLabel(state) {
  startBtn.textContent =
    state.runState === 'running' ? '暂停' :
    state.runState === 'paused'  ? '继续' : '开始';
}

// --- Timer event stream -----------------------------------------------------

api.onTimerUpdate((state) => {
  timerView.render(state);
  refreshStartLabel(state);
  if (state.currentTaskId !== undefined) {
    tasks.setActiveFromTimer(state.currentTaskId);
  }
});

api.onPhaseEnd(async (info) => {
  sound.playTick();
  // After a phase ends, the timer-engine may auto-start the next one — task
  // pomodoros have already been incremented server-side, so just refresh.
  await tasks.refresh();
});

// --- Initial load -----------------------------------------------------------

(async function bootstrap() {
  await tasks.refresh();
  const state = await api.timerGetState();
  timerView.render(state);
  refreshStartLabel(state);
})();

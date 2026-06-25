// timer-view.js — paints the circular SVG ring + numeric countdown.

const RING_CIRCUMFERENCE = 2 * Math.PI * 90; // ≈ 565.487

const PHASE_LABEL = {
  work: '专注',
  shortBreak: '短休息',
  longBreak: '长休息',
};

const STATE_LABEL = {
  idle: '就绪',
  running: '进行中',
  paused: '已暂停',
};

export function createTimerView(root) {
  const ring        = root.querySelector('#ring-progress');
  const timeEl      = root.querySelector('#time-display');
  const statusEl    = root.querySelector('#phase-status');
  const phasePill   = root.querySelector('#phase-label');
  const cycleEl     = root.querySelector('#cycle-indicator');

  ring.style.strokeDasharray = String(RING_CIRCUMFERENCE);

  function format(ms) {
    const total = Math.max(0, Math.ceil(ms / 1000));
    const m = Math.floor(total / 60);
    const s = total % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }

  function setPhaseColor(phase) {
    phasePill.classList.remove('phase-work', 'phase-shortBreak', 'phase-longBreak');
    phasePill.classList.add(`phase-${phase}`);
  }

  let lastPhase = null;
  function render(state) {
    // Time + ring
    timeEl.textContent = format(state.remainingMs);
    const pct = state.totalMs > 0 ? state.remainingMs / state.totalMs : 0;
    const offset = RING_CIRCUMFERENCE * (1 - pct);
    ring.style.strokeDashoffset = String(offset);

    // Phase label + color
    if (state.phase !== lastPhase) {
      phasePill.textContent = PHASE_LABEL[state.phase] || state.phase;
      setPhaseColor(state.phase);
      lastPhase = state.phase;
    }

    // Status text
    statusEl.textContent = STATE_LABEL[state.runState] || '';

    // Cycle indicator
    cycleEl.textContent = state.completedPomodorosInCycle > 0
      ? `● ${state.completedPomodorosInCycle}`
      : '';
  }

  return { render };
}

// settings.js — settings drawer. Loads current values on open, applies changes
// on Save.
//
// Close semantics:
//   - Save   → persist and keep the new values
//   - Cancel → discard un-saved changes
//   - Esc / ✕ / backdrop → same as Cancel

export function createSettings({ api, root }) {
  const drawer   = root.querySelector('#settings-drawer');
  const openBtn  = root.querySelector('#open-settings');

  const workIn    = root.querySelector('#set-work');
  const shortIn   = root.querySelector('#set-short');
  const longIn    = root.querySelector('#set-long');
  const intervalIn= root.querySelector('#set-interval');
  const autoBreak = root.querySelector('#set-autobreak');
  const autoWork  = root.querySelector('#set-autowork');
  const soundIn   = root.querySelector('#set-sound');

  const saveBtn   = root.querySelector('#save-settings');

  function open() {
    api.settingsGet().then((s) => {
      workIn.value     = s.workDuration;
      shortIn.value    = s.shortBreakDuration;
      longIn.value     = s.longBreakDuration;
      intervalIn.value = s.longBreakInterval;
      autoBreak.checked= !!s.autoStartBreaks;
      autoWork.checked = !!s.autoStartWork;
      soundIn.checked  = !!s.soundEnabled;
      drawer.hidden = false;
      drawer.setAttribute('aria-hidden', 'false');
    });
  }

  function close() {
    drawer.hidden = true;
    drawer.setAttribute('aria-hidden', 'true');
  }

  openBtn.addEventListener('click', open);

  drawer.addEventListener('click', (e) => {
    if (e.target.matches('[data-close]')) close();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !drawer.hidden) close();
  });

  saveBtn.addEventListener('click', async () => {
    const patch = {
      workDuration:       clampInt(workIn.value, 1, 180),
      shortBreakDuration: clampInt(shortIn.value, 1, 60),
      longBreakDuration:  clampInt(longIn.value, 1, 120),
      longBreakInterval:  clampInt(intervalIn.value, 2, 12),
      autoStartBreaks:    autoBreak.checked,
      autoStartWork:      autoWork.checked,
      soundEnabled:       soundIn.checked,
    };
    try {
      await api.settingsSet(patch);
      close();
    } catch (err) {
      console.error('Failed to save settings', err);
    }
  });

  function clampInt(v, min, max) {
    const n = Math.round(Number(v));
    if (!Number.isFinite(n)) return min;
    return Math.min(max, Math.max(min, n));
  }

  return { open, close };
}

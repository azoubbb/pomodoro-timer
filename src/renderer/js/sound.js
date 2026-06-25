// sound.js — optional in-app notification chime. Used as a redundant cue
// alongside the OS notification, in case the OS has suppressed system sounds.

export function createSound({ api }) {
  let audio = null;
  let unlocked = false;

  function ensureAudio() {
    if (audio) return audio;
    // Use a tiny base64-encoded WAV (silent if soundEnabled is off, but we
    // still expose the API so callers don't have to check).
    try {
      audio = new Audio('assets/tick.wav');
      audio.preload = 'auto';
    } catch (_) {
      audio = null;
    }
    return audio;
  }

  // Browsers require a user gesture before Audio can play. We unlock on the
  // first click anywhere in the document.
  document.addEventListener('click', () => {
    if (unlocked) return;
    const a = ensureAudio();
    if (a) {
      a.play().then(() => { a.pause(); a.currentTime = 0; unlocked = true; }).catch(() => {});
    }
  }, { once: false });

  async function playTick() {
    const settings = await api.settingsGet();
    if (!settings.soundEnabled) return;
    const a = ensureAudio();
    if (!a) return;
    try {
      a.currentTime = 0;
      await a.play();
    } catch (_) { /* ignore autoplay/permission errors */ }
  }

  return { playTick };
}

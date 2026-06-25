// scripts/gen-sound.js
// Generates a tiny notification "ding" WAV without any external dependencies.
// Two-tone ascending sine (E5 -> A5), quick attack and exponential decay.

'use strict';

const fs = require('node:fs');
const path = require('node:path');

function generateDing() {
  const sampleRate = 44100;
  const durationSec = 0.45;
  const totalSamples = Math.floor(sampleRate * durationSec);
  const samples = Buffer.alloc(totalSamples * 2); // 16-bit mono

  // Two-tone: 660Hz for first half, 880Hz for second half.
  const tones = [
    { freq: 660, dur: 0.22 },
    { freq: 880, dur: 0.23 },
  ];

  let idx = 0;
  for (const tone of tones) {
    const toneSamples = Math.floor(sampleRate * tone.dur);
    for (let i = 0; i < toneSamples && idx < totalSamples; i++, idx++) {
      const t = i / sampleRate;
      const envelope = Math.exp(-t * 6);             // exponential decay
      const v = Math.sin(2 * Math.PI * tone.freq * t) * envelope * 0.35;
      const s = Math.max(-1, Math.min(1, v));
      samples.writeInt16LE(Math.round(s * 32767), idx * 2);
    }
  }

  // Pad with silence if we came up short.
  while (idx < totalSamples) {
    samples.writeInt16LE(0, idx * 2);
    idx++;
  }

  // Build WAV container.
  const byteRate = sampleRate * 2; // mono * 16-bit
  const dataSize = samples.length;
  const riffSize = 36 + dataSize;
  const wav = Buffer.alloc(44 + dataSize);
  wav.write('RIFF', 0);
  wav.writeUInt32LE(riffSize, 4);
  wav.write('WAVE', 8);
  wav.write('fmt ', 12);
  wav.writeUInt32LE(16, 16);          // PCM chunk size
  wav.writeUInt16LE(1, 20);           // format = PCM
  wav.writeUInt16LE(1, 22);           // channels = 1
  wav.writeUInt32LE(sampleRate, 24);
  wav.writeUInt32LE(byteRate, 28);
  wav.writeUInt16LE(2, 32);           // block align
  wav.writeUInt16LE(16, 34);          // bits per sample
  wav.write('data', 36);
  wav.writeUInt32LE(dataSize, 40);
  samples.copy(wav, 44);
  return wav;
}

function main() {
  const out = path.resolve(__dirname, '..', 'src', 'renderer', 'assets', 'tick.wav');
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, generateDing());
  console.log(`wrote ${out} (${fs.statSync(out).size} bytes)`);
}

if (require.main === module) main();

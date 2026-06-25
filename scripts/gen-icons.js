// scripts/gen-icons.js
// Pure-Node PNG generator. Produces the icons we need without any native
// dependencies. Output:
//   build/installerIcon.png        — 256x256, large app icon
//   build/icon.png                 — 256x256, dev-time icon
//   src/renderer/assets/icon.png   — 256x256, used by main + window
//   src/renderer/assets/tray-running.png — 32x32, tray when timer running
//   src/renderer/assets/tray-paused.png  — 32x32, tray when idle/paused

'use strict';

const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');

// --- CRC32 (PNG polynomial) -------------------------------------------------

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

// --- PNG chunk writer -------------------------------------------------------

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crcInput = Buffer.concat([typeBuf, data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(crcInput), 0);
  return Buffer.concat([len, typeBuf, data, crc]);
}

function buildPng(width, height, pixels /* Uint8Array RGBA, length = w*h*4 */) {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr.writeUInt8(8, 8);  // bit depth
  ihdr.writeUInt8(6, 9);  // color type: 6 = RGBA
  ihdr.writeUInt8(0, 10); // compression
  ihdr.writeUInt8(0, 11); // filter
  ihdr.writeUInt8(0, 12); // interlace

  // Add filter byte (0 = None) at the start of each row.
  const rowSize = width * 4;
  const raw = Buffer.alloc((rowSize + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (rowSize + 1)] = 0;
    pixels.copy(raw, y * (rowSize + 1) + 1, y * rowSize, (y + 1) * rowSize);
  }
  const idatData = zlib.deflateSync(raw, { level: 9 });

  return Buffer.concat([
    sig,
    chunk('IHDR', ihdr),
    chunk('IDAT', idatData),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// --- Drawing primitives -----------------------------------------------------

function makePixels(size) {
  // Buffer is a Uint8Array with .copy() available — works in Node, that's all we need.
  return { size, data: Buffer.alloc(size * size * 4) };
}

function setPx(p, x, y, r, g, b, a) {
  if (x < 0 || y < 0 || x >= p.size || y >= p.size) return;
  const i = (y * p.size + x) * 4;
  // Alpha blending: source-over composite.
  const sa = a / 255;
  const da = p.data[i + 3] / 255;
  const oa = sa + da * (1 - sa);
  if (oa < 0.001) {
    p.data[i]     = 0;
    p.data[i + 1] = 0;
    p.data[i + 2] = 0;
    p.data[i + 3] = 0;
    return;
  }
  p.data[i]     = Math.round((r * sa + p.data[i]     * da * (1 - sa)) / oa);
  p.data[i + 1] = Math.round((g * sa + p.data[i + 1] * da * (1 - sa)) / oa);
  p.data[i + 2] = Math.round((b * sa + p.data[i + 2] * da * (1 - sa)) / oa);
  p.data[i + 3] = Math.round(oa * 255);
}

function fillCircle(p, cx, cy, radius, r, g, b, a = 255) {
  const r2 = radius * radius;
  const inner = (radius - 1.5) * (radius - 1.5);
  for (let y = Math.floor(cy - radius - 1); y <= Math.ceil(cy + radius + 1); y++) {
    for (let x = Math.floor(cx - radius - 1); x <= Math.ceil(cx + radius + 1); x++) {
      const dx = x + 0.5 - cx;
      const dy = y + 0.5 - cy;
      const d2 = dx * dx + dy * dy;
      if (d2 <= inner) {
        setPx(p, x, y, r, g, b, a);
      } else if (d2 <= r2) {
        // Anti-aliased edge.
        const edge = 1 - (Math.sqrt(d2) - (radius - 1.5));
        const aa = Math.max(0, Math.min(1, edge)) * (a / 255);
        setPx(p, x, y, r, g, b, Math.round(aa * 255));
      }
    }
  }
}

function fillEllipse(p, cx, cy, rx, ry, r, g, b, a = 255) {
  for (let y = Math.floor(cy - ry - 1); y <= Math.ceil(cy + ry + 1); y++) {
    for (let x = Math.floor(cx - rx - 1); x <= Math.ceil(cx + rx + 1); x++) {
      const dx = (x + 0.5 - cx) / rx;
      const dy = (y + 0.5 - cy) / ry;
      const d2 = dx * dx + dy * dy;
      if (d2 <= 1) {
        // Simple edge AA.
        const edgeAlpha = d2 > 0.85 ? (1 - (Math.sqrt(d2) - 0.92) / 0.08) : 1;
        setPx(p, x, y, r, g, b, Math.round(a * Math.max(0, Math.min(1, edgeAlpha))));
      }
    }
  }
}

// --- Composition: tomato icon ----------------------------------------------

function drawTomato(size) {
  const p = makePixels(size);
  const cx = size / 2;
  const cy = size / 2;

  // Body — warm coral (matches accent #C65A4A).
  fillEllipse(p, cx, cy + size * 0.04, size * 0.40, size * 0.38, 198, 90, 74);
  // Soft highlight on upper-left.
  fillEllipse(p, cx - size * 0.15, cy - size * 0.18, size * 0.10, size * 0.07, 251, 220, 207, 200);

  // Stem — warm sage green.
  fillEllipse(p, cx, cy - size * 0.38, size * 0.06, size * 0.05, 90, 116, 78);
  // Leaves — three small sage ovals around the stem.
  fillEllipse(p, cx - size * 0.10, cy - size * 0.34, size * 0.08, size * 0.04, 143, 166, 125);
  fillEllipse(p, cx + size * 0.10, cy - size * 0.34, size * 0.08, size * 0.04, 143, 166, 125);
  fillEllipse(p, cx,            cy - size * 0.30, size * 0.04, size * 0.06, 143, 166, 125);

  return p;
}

// Tray icons use the same tomato as the app icon so the user recognizes
// them at a glance in the system tray. The `muted` flag desaturates and
// dims the tomato for the paused/idle state — clearly distinct from the
// running state without changing the recognizable shape.
function drawTrayTomato(size, muted = false) {
  const p = drawTomato(size);
  if (!muted) return p;
  for (let i = 0; i < p.data.length; i += 4) {
    const r = p.data[i];
    const g = p.data[i + 1];
    const b = p.data[i + 2];
    // Luminance-preserving desaturate (~70%) + dim to 65%.
    const lum = 0.299 * r + 0.587 * g + 0.114 * b;
    const dr = Math.round((r * 0.3 + lum * 0.7) * 0.65);
    const dg = Math.round((g * 0.3 + lum * 0.7) * 0.65);
    const db = Math.round((b * 0.3 + lum * 0.7) * 0.65);
    p.data[i]     = dr;
    p.data[i + 1] = dg;
    p.data[i + 2] = db;
    // Also drop alpha so the dimmed icon sits lighter on dark taskbars.
    p.data[i + 3] = Math.round(p.data[i + 3] * 0.85);
  }
  return p;
}

// Legacy: a solid circle of a phase color. Kept exported for any callers
// that still want a plain dot (none currently use it).
function drawTrayDot(size, color) {
  const p = makePixels(size);
  const cx = size / 2;
  const cy = size / 2;
  fillCircle(p, cx, cy, size * 0.42, color[0], color[1], color[2]);
  // Inner highlight for a little depth.
  fillEllipse(p, cx - size * 0.08, cy - size * 0.10, size * 0.10, size * 0.06,
              Math.min(255, color[0] + 40),
              Math.min(255, color[1] + 40),
              Math.min(255, color[2] + 40), 160);
  return p;
}

// --- File writes ------------------------------------------------------------

function writePng(filePath, pixels) {
  const buf = buildPng(pixels.size, pixels.size, pixels.data);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, buf);
  console.log(`wrote ${filePath} (${pixels.size}x${pixels.size}, ${buf.length} bytes)`);
}

function main() {
  const projectRoot = path.resolve(__dirname, '..');

  // Large app icons.
  const tomato256 = drawTomato(256);
  const png256 = buildPng(tomato256.size, tomato256.size, tomato256.data);
  writePng(path.join(projectRoot, 'build', 'installerIcon.png'), tomato256);
  writePng(path.join(projectRoot, 'build', 'icon.png'), tomato256);
  writePng(path.join(projectRoot, 'src', 'renderer', 'assets', 'icon.png'), tomato256);

  // Tray icons: same tomato as the app, with the paused state desaturated.
  // 32x32 reads well on Windows + macOS tray scales.
  const trayRunning = drawTrayTomato(32, false); // full color when active
  const trayPaused  = drawTrayTomato(32, true);  // desaturated when paused/idle
  writePng(path.join(projectRoot, 'src', 'renderer', 'assets', 'tray-running.png'), trayRunning);
  writePng(path.join(projectRoot, 'src', 'renderer', 'assets', 'tray-paused.png'), trayPaused);

  // Windows .ico wrapper around the 256x256 PNG (PNG-in-ICO is supported on Vista+).
  fs.writeFileSync(path.join(projectRoot, 'build', 'icon.ico'), buildIco([png256]));
  console.log('wrote build/icon.ico');
}

// --- .ico wrapper (PNG payload, single entry) -------------------------------

function buildIco(pngBufs) {
  const count = pngBufs.length;
  const headerSize = 6 + 16 * count;
  let offset = headerSize;
  const entries = [];
  for (const png of pngBufs) {
    // Read width/height from the PNG IHDR chunk.
    const w = png.readUInt32BE(16);
    const h = png.readUInt32BE(20);
    entries.push({ png, w, h, size: png.length, offset });
    offset += png.length;
  }
  const header = Buffer.alloc(headerSize);
  header.writeUInt16LE(0, 0);             // reserved
  header.writeUInt16LE(1, 2);             // type: 1 = icon
  header.writeUInt16LE(count, 4);         // count
  entries.forEach((e, i) => {
    const base = 6 + i * 16;
    header.writeUInt8(e.w >= 256 ? 0 : e.w, base + 0);   // width
    header.writeUInt8(e.h >= 256 ? 0 : e.h, base + 1);   // height
    header.writeUInt8(0, base + 2);                      // color count
    header.writeUInt8(0, base + 3);                      // reserved
    header.writeUInt16LE(1, base + 4);                  // planes
    header.writeUInt16LE(32, base + 6);                 // bit count
    header.writeUInt32LE(e.size, base + 8);             // size in bytes
    header.writeUInt32LE(e.offset, base + 12);          // offset
  });
  return Buffer.concat([header, ...entries.map((e) => e.png)]);
}

if (require.main === module) {
  try { main(); }
  catch (e) { console.error(e); process.exit(1); }
}

module.exports = { buildPng, drawTomato, drawTrayDot };

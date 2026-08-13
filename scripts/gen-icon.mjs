// Generates resources/icon.png (512x512) — the Lattice brand mark: a dark
// rounded square with an accent "Λ" (lambda/caret) glyph. Pure Node (zlib +
// a minimal PNG encoder), no native deps.

import { deflateSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const SIZE = 512;
const bg = [0x0c, 0x0d, 0x10, 0xff];
const accent = [0x5b, 0x9d, 0xff, 0xff];

function crc32(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, "ascii");
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crc]);
}

// Rounded-square mask + caret glyph, evaluated per pixel.
function pixel(x, y) {
  const n = SIZE;
  const radius = n * 0.22;
  // rounded-rect test
  const cx = Math.max(radius, Math.min(n - 1 - radius, x));
  const cy = Math.max(radius, Math.min(n - 1 - radius, y));
  const dx = x - cx;
  const dy = y - cy;
  if (dx * dx + dy * dy > radius * radius) return [0, 0, 0, 0]; // transparent corner

  // caret "Λ" (two thick segments meeting at the top center)
  const topX = n * 0.5;
  const topY = n * 0.32;
  const bottomY = n * 0.72;
  const halfW = n * 0.22;
  const thick = n * 0.06;
  const leftX = topX - halfW;
  const rightX = topX + halfW;

  // distance from (x,y) to segment left→top and top→right
  const dLeft = distToSegment(x, y, leftX, bottomY, topX, topY);
  const dRight = distToSegment(x, y, topX, topY, rightX, bottomY);
  if (Math.min(dLeft, dRight) <= thick) return accent;
  return bg;
}

function distToSegment(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len2 = dx * dx + dy * dy;
  let t = len2 === 0 ? 0 : ((px - x1) * dx + (py - y1) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  const ex = x1 + t * dx;
  const ey = y1 + t * dy;
  return Math.hypot(px - ex, py - ey);
}

const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(SIZE, 0);
ihdr.writeUInt32BE(SIZE, 4);
ihdr[8] = 8; // bit depth
ihdr[9] = 6; // RGBA
// rest zero

const raw = Buffer.alloc(SIZE * (SIZE * 4 + 1));
for (let y = 0; y < SIZE; y++) {
  const rowStart = y * (SIZE * 4 + 1);
  raw[rowStart] = 0; // filter none
  for (let x = 0; x < SIZE; x++) {
    const [r, g, b, a] = pixel(x, y);
    const o = rowStart + 1 + x * 4;
    raw[o] = r;
    raw[o + 1] = g;
    raw[o + 2] = b;
    raw[o + 3] = a;
  }
}

const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk("IHDR", ihdr),
  chunk("IDAT", deflateSync(raw, { level: 9 })),
  chunk("IEND", Buffer.alloc(0)),
]);

const out = join(dirname(fileURLToPath(import.meta.url)), "..", "resources", "icon.png");
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, png);
console.log("wrote", out, png.length, "bytes");

// Generates the toolbar icons. Run it when the mark changes:
//
//   node tools/make-icons.mjs
//
// The PNGs it writes are committed, so a build never depends on this file —
// it exists so the icons are reproducible rather than a binary nobody can
// regenerate. No image library: a PNG is a zlib stream in a handful of
// length-tagged chunks, and writing those directly is shorter than a
// dependency.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const OUT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'src', 'icons');
const SIZES = [16, 32, 48, 128];

const NHS_BLUE = [0, 94, 184];
const WHITE = [255, 255, 255];

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(buf) {
  let c = 0xffffffff;
  for (const byte of buf) c = crcTable[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const head = Buffer.alloc(4);
  head.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'latin1'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([head, body, crc]);
}

function png(size, pixels) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // colour type: RGBA
  // 10-12: compression, filter, interlace — all zero.

  // One filter byte (0 = none) in front of every scanline.
  const raw = Buffer.alloc(size * (1 + size * 4));
  for (let y = 0; y < size; y += 1) {
    const row = y * (1 + size * 4);
    pixels.copy(raw, row + 1, y * size * 4, (y + 1) * size * 4);
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// A rounded NHS-blue tile with a white cross on it, supersampled 4x so the
// corners and the cross do not come out ragged at 16px.
function draw(size) {
  const SS = 4;
  const n = size * SS;
  const radius = n * 0.22;
  const armThick = n * 0.2;
  const armLength = n * 0.56;
  const mid = n / 2;

  const inTile = (x, y) => {
    const dx = Math.max(radius - x, 0, x - (n - radius));
    const dy = Math.max(radius - y, 0, y - (n - radius));
    return dx * dx + dy * dy <= radius * radius;
  };

  const inCross = (x, y) =>
    (Math.abs(x - mid) <= armThick / 2 && Math.abs(y - mid) <= armLength / 2) ||
    (Math.abs(y - mid) <= armThick / 2 && Math.abs(x - mid) <= armLength / 2);

  const pixels = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      let covered = 0;
      let white = 0;
      for (let sy = 0; sy < SS; sy += 1) {
        for (let sx = 0; sx < SS; sx += 1) {
          const px = x * SS + sx + 0.5;
          const py = y * SS + sy + 0.5;
          if (!inTile(px, py)) continue;
          covered += 1;
          if (inCross(px, py)) white += 1;
        }
      }
      const samples = SS * SS;
      const alpha = Math.round((covered / samples) * 255);
      const mix = covered ? white / covered : 0;
      const rgb = NHS_BLUE.map((c, i) => Math.round(c + (WHITE[i] - c) * mix));
      const at = (y * size + x) * 4;
      pixels[at] = rgb[0];
      pixels[at + 1] = rgb[1];
      pixels[at + 2] = rgb[2];
      pixels[at + 3] = alpha;
    }
  }
  return pixels;
}

fs.mkdirSync(OUT, { recursive: true });
for (const size of SIZES) {
  const file = path.join(OUT, `icon${size}.png`);
  fs.writeFileSync(file, png(size, draw(size)));
  console.log(`[icons] wrote ${path.relative(process.cwd(), file)}`);
}

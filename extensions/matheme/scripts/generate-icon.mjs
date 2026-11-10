#!/usr/bin/env node
// Generates assets/extension-icon.png (light) and assets/extension-icon@dark.png (dark) with
// nothing but node's zlib. Raycast swaps in the "@dark" variant automatically.
//
// The glyph has to survive being drawn at 16px in the launcher, so it is four large rounded cells
// with a gutter wide enough to stay visible after downscaling — thin detail turns into grey mush.
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { deflateSync } from "node:zlib";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const args = new Map(
  process.argv
    .slice(2)
    .filter((arg) => arg.startsWith("--"))
    .map((arg) => {
      const [key, value] = arg.replace(/^--/, "").split("=");
      return [key, value ?? "true"];
    }),
);

const SS = 4; // supersampling per axis for smooth edges

/* ---------- geometry ---------- */

const insideBox = (x, y, left, top, width, height, radius) => {
  if (x < left || x > left + width || y < top || y > top + height) {
    return false;
  }
  const dx = Math.max(Math.abs(x - (left + width / 2)) - (width / 2 - radius), 0);
  const dy = Math.max(Math.abs(y - (top + height / 2)) - (height / 2 - radius), 0);
  return dx * dx + dy * dy <= radius * radius;
};

const hex = (value) => [
  Number.parseInt(value.slice(1, 3), 16),
  Number.parseInt(value.slice(3, 5), 16),
  Number.parseInt(value.slice(5, 7), 16),
];

const TRANSPARENT = [0, 0, 0, 0];
const solid = (color) => [...hex(color), 1];

/* ---------- designs ---------- */

const TILE_INSET = 0.085;
const TILE_RADIUS = 0.18;
const CELL_INSET = 0.1;
const GUTTER = 0.055;
const CELL_RADIUS = 0.072;
const BORDER = 0.006;

const VARIANTS = {
  light: {
    tile: "#ffffff",
    border: "#d8dae2",
    cells: ["#5f9e95", "#bf7fa0", "#d97a56", "#8fb069"],
    ui: "#f2f2f4",
  },
  dark: {
    tile: "#23262e",
    border: null,
    cells: ["#7fbbb3", "#d699b6", "#e69875", "#a7c080"],
    ui: "#1c1c1e",
  },
};

function tiles(p, variant) {
  const size = 1 - 2 * TILE_INSET;

  if (!insideBox(p.x, p.y, TILE_INSET, TILE_INSET, size, size, TILE_RADIUS)) {
    return TRANSPARENT;
  }

  if (
    variant.border &&
    !insideBox(
      p.x,
      p.y,
      TILE_INSET + BORDER,
      TILE_INSET + BORDER,
      size - 2 * BORDER,
      size - 2 * BORDER,
      TILE_RADIUS - BORDER,
    )
  ) {
    return solid(variant.border);
  }

  const start = TILE_INSET + CELL_INSET;
  const cell = (size - 2 * CELL_INSET - GUTTER) / 2;

  for (let row = 0; row < 2; row++) {
    for (let column = 0; column < 2; column++) {
      const left = start + column * (cell + GUTTER);
      const top = start + row * (cell + GUTTER);
      if (insideBox(p.x, p.y, left, top, cell, cell, CELL_RADIUS)) {
        return solid(variant.cells[row * 2 + column]);
      }
    }
  }

  return solid(variant.tile);
}

/* ---------- raster ---------- */

function render(size, draw, background) {
  const pixels = Buffer.alloc(size * size * 4);
  const samples = SS * SS;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;

      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const color = draw({
            x: (x + (sx + 0.5) / SS) / size,
            y: (y + (sy + 0.5) / SS) / size,
          });
          r += color[0] * color[3];
          g += color[1] * color[3];
          b += color[2] * color[3];
          a += color[3];
        }
      }

      const offset = (y * size + x) * 4;
      if (a > 0) {
        pixels[offset] = Math.round(r / a);
        pixels[offset + 1] = Math.round(g / a);
        pixels[offset + 2] = Math.round(b / a);
      } else if (background) {
        // Previews are composited on the UI colour so contrast can be judged for real.
        pixels[offset] = background[0];
        pixels[offset + 1] = background[1];
        pixels[offset + 2] = background[2];
      }
      pixels[offset + 3] = background ? 255 : Math.round((a / samples) * 255);
    }
  }

  return pixels;
}

function upscale(pixels, size, factor) {
  const out = Buffer.alloc(size * factor * size * factor * 4);
  for (let y = 0; y < size * factor; y++) {
    for (let x = 0; x < size * factor; x++) {
      const from = (Math.floor(y / factor) * size + Math.floor(x / factor)) * 4;
      pixels.copy(out, (y * size * factor + x) * 4, from, from + 4);
    }
  }
  return out;
}

/* ---------- png ---------- */

const crcTable = Array.from({ length: 256 }, (_, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit++) {
    value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  }
  return value >>> 0;
});

function crc32(buffer) {
  let value = 0xffffffff;
  for (const byte of buffer) {
    value = crcTable[(value ^ byte) & 0xff] ^ (value >>> 8);
  }
  return (value ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, checksum]);
}

function encode(size, pixels) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8; // bit depth
  header[9] = 6; // RGBA
  header[10] = 0;
  header[11] = 0;
  header[12] = 0;

  const stride = size * 4 + 1;
  const scanlines = Buffer.alloc(size * stride);
  for (let y = 0; y < size; y++) {
    scanlines[y * stride] = 0; // filter: none
    pixels.copy(scanlines, y * stride + 1, y * size * 4, (y + 1) * size * 4);
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(scanlines, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

function write(path, size, pixels) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, encode(size, pixels));
}

/* ---------- main ---------- */

const targets = [
  { name: "light", file: "extension-icon.png" },
  { name: "dark", file: "extension-icon@dark.png" },
];

if (args.has("preview")) {
  const dir = join(root, ".preview");
  for (const { name } of targets) {
    const variant = VARIANTS[name];
    const background = hex(variant.ui);
    const draw = (p) => tiles(p, variant);
    write(join(dir, `${name}-512.png`), 512, render(512, draw, background));
    write(join(dir, `${name}-32.png`), 32, render(32, draw, background));
    write(join(dir, `${name}-32x8.png`), 256, upscale(render(32, draw, background), 32, 8));
    write(join(dir, `${name}-16x16.png`), 256, upscale(render(16, draw, background), 16, 16));
  }
  console.log(`wrote previews to ${dir}`);
} else {
  for (const { name, file } of targets) {
    const variant = VARIANTS[name];
    const out = join(root, "assets", file);
    write(out, 512, render(512, (p) => tiles(p, variant)));
    console.log(`wrote ${out}`);
  }
}

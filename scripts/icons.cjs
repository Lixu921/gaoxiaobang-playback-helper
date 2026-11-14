"use strict";

const fs = require("node:fs");
const path = require("node:path");
const zlib = require("node:zlib");
const { crc32 } = require("./zip.cjs");

function chunk(type, data) {
  const name = Buffer.from(type);
  const size = Buffer.alloc(4);
  size.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([name, data])));
  return Buffer.concat([size, name, data, crc]);
}

const assets = path.resolve(__dirname, "../assets");
fs.mkdirSync(assets, { recursive: true });
for (const size of [16, 48, 128]) {
  const pixels = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const nx = x / size;
      const ny = y / size;
      const play = nx > 0.36 && nx < 0.71 && Math.abs(ny - 0.5) < (0.71 - nx) * 0.78;
      const accent = nx > 0.15 && nx < 0.22 && ny > 0.26 && ny < 0.74;
      const color = play ? [255, 255, 255, 255] : accent ? [245, 192, 95, 255] : [32, 124, 89, 255];
      pixels.set(color, y * (size * 4 + 1) + 1 + x * 4);
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  fs.writeFileSync(path.join(assets, `icon-${size}.png`), Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", ihdr), chunk("IDAT", zlib.deflateSync(pixels)), chunk("IEND", Buffer.alloc(0))
  ]));
}
console.log("Generated 16, 48, and 128 px PNG icons.");

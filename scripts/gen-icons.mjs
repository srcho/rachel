// 의존성 없는 PNG 아이콘 생성기(임시 아이콘). 실제 아이콘이 준비되면 public/icons 를 교체한다.

import { writeFileSync } from "node:fs";
import { deflateSync } from "node:zlib";

const crcTable = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type, data) => {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
};
function png(size, pixel) {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    for (let x = 0; x < size; x++) {
      const [r, g, b, a] = pixel(x, y);
      raw.set([r, g, b, a], y * (size * 4 + 1) + 1 + x * 4);
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}
// 5x7 비트맵 'R'
const R = ["1111 ", "1   1", "1   1", "1111 ", "1 1  ", "1  1 ", "1   1"];
const BG = [42, 75, 215]; // #2A4BD7
function make(size, { maskable = false, radius = 0.22 }) {
  const pad = maskable ? size * 0.1 : 0; // maskable: 안전 영역
  const inner = size - pad * 2;
  const rad = maskable ? 0 : inner * radius;
  const cell = inner / 9; // 글자 셀
  const gx0 = pad + (inner - 5 * cell) / 2,
    gy0 = pad + (inner - 7 * cell) / 2;
  return png(size, (x, y) => {
    // 둥근 사각형 배경
    const cx = Math.max(pad + rad - x, 0, x - (size - pad - rad)),
      cy = Math.max(pad + rad - y, 0, y - (size - pad - rad));
    const inside =
      maskable ||
      (x >= pad &&
        x < size - pad &&
        y >= pad &&
        y < size - pad &&
        cx * cx + cy * cy <= rad * rad);
    if (!inside) return [0, 0, 0, 0];
    const gx = Math.floor((x - gx0) / cell),
      gy = Math.floor((y - gy0) / cell);
    if (gx >= 0 && gx < 5 && gy >= 0 && gy < 7 && R[gy][gx] === "1")
      return [255, 255, 255, 255];
    return [...BG, 255];
  });
}
writeFileSync("public/icons/icon-192.png", make(192, {}));
writeFileSync("public/icons/icon-512.png", make(512, {}));
writeFileSync("public/icons/maskable-512.png", make(512, { maskable: true }));
writeFileSync(
  "public/icons/apple-touch-icon.png",
  make(180, { maskable: true }),
);
console.log("icons written");

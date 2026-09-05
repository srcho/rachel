import { mkdir, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";

// Use the image pipeline already shipped with Next. The source is an ImageGen asset.
const require = createRequire(import.meta.url);
const sharp = createRequire(require.resolve("next/package.json"))("sharp");
const source = "design/rachel-icon.png";
await mkdir("public/icons", { recursive: true });
for (const [name, size] of [
  ["icon-192.png", 192],
  ["icon-512.png", 512],
  ["maskable-512.png", 512],
  ["apple-touch-icon.png", 180],
]) {
  await sharp(source)
    .resize(size, size)
    .removeAlpha()
    .png()
    .toFile(`public/icons/${name}`);
}

// ICO container with PNG entries for browser tabs (16/32/48 px).
const sizes = [16, 32, 48];
const images = await Promise.all(
  sizes.map((size) =>
    sharp(source).resize(size, size).ensureAlpha().png().toBuffer(),
  ),
);
const header = Buffer.alloc(6 + images.length * 16);
header.writeUInt16LE(1, 2);
header.writeUInt16LE(images.length, 4);
let offset = header.length;
images.forEach((data, i) => {
  const entry = 6 + i * 16;
  header[entry] = sizes[i];
  header[entry + 1] = sizes[i];
  header.writeUInt16LE(1, entry + 4);
  header.writeUInt16LE(32, entry + 6);
  header.writeUInt32LE(data.length, entry + 8);
  header.writeUInt32LE(offset, entry + 12);
  offset += data.length;
});
await writeFile("src/app/favicon.ico", Buffer.concat([header, ...images]));
console.log("Rachel app icons and favicon generated");

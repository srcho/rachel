// 사용: ANALYZE=1 pnpm build → node scripts/analyze-bundle.mjs <chunk-name...>
// 소스맵으로 청크 바이트를 패키지/모듈별로 귀속해 gzip 근사치로 집계한다.
import fs from "node:fs";
import path from "node:path";
import { gzipSync } from "node:zlib";
import { SourceMapConsumer } from "source-map";

const dir = ".next/static/chunks";
const names = process.argv.slice(2);
const totals = new Map();
for (const n of names) {
  const js = fs.readFileSync(path.join(dir, `${n}.js`), "utf8");
  const ref = js.match(/sourceMappingURL=(\S+)/)?.[1];
  const mapPath = path.join(dir, ref ?? `${n}.js.map`);
  if (!fs.existsSync(mapPath)) {
    console.warn(`소스맵 없음: ${n} (ANALYZE=1 pnpm build 필요)`);
    continue;
  }
  const map = JSON.parse(fs.readFileSync(mapPath, "utf8"));
  const consumer = await new SourceMapConsumer(map);
  const lines = js.split("\n");
  const raw = new Map();
  const maps = [];
  consumer.eachMapping(
    (m) => maps.push(m),
    null,
    SourceMapConsumer.GENERATED_ORDER,
  );
  for (let i = 0; i < maps.length; i++) {
    const m = maps[i];
    const nx = maps[i + 1];
    const lineLen = lines[m.generatedLine - 1]?.length ?? 0;
    const end =
      nx && nx.generatedLine === m.generatedLine ? nx.generatedColumn : lineLen;
    const len = Math.max(0, end - m.generatedColumn);
    const src = m.source ?? "(unmapped)";
    raw.set(src, (raw.get(src) ?? 0) + len);
  }
  consumer.destroy();
  const ratio = gzipSync(js).length / js.length;
  for (const [src, len] of raw) {
    let key;
    const mm = src.match(
      /node_modules\/(?:\.pnpm\/[^/]+\/node_modules\/)?((?:@[^/]+\/)?[^/]+)/,
    );
    if (mm) key = `pkg:${mm[1]}`;
    else {
      const s = src.match(/src\/([^/]+\/[^/]+)/);
      key = s ? `src:${s[1]}` : src.slice(-60);
    }
    totals.set(key, (totals.get(key) ?? 0) + len * ratio);
  }
}
const rows = [...totals].sort((a, b) => b[1] - a[1]);
let sum = 0;
for (const [, v] of rows) sum += v;
console.log(`합계 ≈ ${Math.round(sum / 1024)} KB gzip`);
for (const [k, v] of rows.slice(0, 40))
  console.log(`${String(Math.round(v / 1024)).padStart(5)} KB  ${k}`);

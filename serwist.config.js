import { spawnSync } from "node:child_process";
import { serwist } from "@serwist/next/config";

// 프리캐시 revision: 커밋 해시(없으면 랜덤)
const revision =
  spawnSync("git", ["rev-parse", "HEAD"], {
    encoding: "utf-8",
  }).stdout?.trim() || crypto.randomUUID();

export default serwist({
  swSrc: "src/app/sw.ts",
  swDest: "public/sw.js",
  additionalPrecacheEntries: [{ url: "/~offline", revision }],
});

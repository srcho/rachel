import { serwist } from "@serwist/next/config";

export default serwist({
  swSrc: "src/app/sw.ts",
  swDest: "public/sw.js",
  // Static Next pages (including /~offline) already receive content revisions.
  // Adding the same URL with a commit revision prevents the worker from starting.
});

import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // ANALYZE=1 pnpm build 후 scripts/analyze-bundle.mjs 로 패키지별 크기 집계
  productionBrowserSourceMaps: process.env.ANALYZE === "1",
  turbopack: { root: path.resolve(__dirname) },
  poweredByHeader: false,
  experimental: {
    optimizePackageImports: [
      "lucide-react",
      "recharts",
      "@dnd-kit/core",
      "@dnd-kit/sortable",
      "date-fns",
    ],
  },
};

export default nextConfig;

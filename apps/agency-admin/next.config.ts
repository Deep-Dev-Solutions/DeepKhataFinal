import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  // Parallel E2E runs give each dev server its own build dir.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  output: "standalone",
  outputFileTracingRoot: path.join(__dirname, "../../"),
};

export default nextConfig;

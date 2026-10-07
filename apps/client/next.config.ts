import type { NextConfig } from "next";
import path from "node:path";
import withSerwistInit from "@serwist/next";

const withSerwist = withSerwistInit({
  swSrc: "src/sw.ts",
  swDest: "public/sw.js",
  disable: process.env.NODE_ENV === "development",
});

const nextConfig: NextConfig = {
  turbopack: {},
  webpack(config) {
    config.resolve.alias = {
      ...config.resolve.alias,
      "@": path.resolve(__dirname, "src"),
    };
    return config;
  },
  devIndicators: {
    position: "bottom-right",
  },
  async redirects() {
    return [
      {
        source: "/setting",
        destination: "/settings",
        permanent: true,
      },
    ];
  },
};

export default withSerwist(nextConfig);

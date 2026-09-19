import type { NextConfig } from "next";
import withSerwistInit from "@serwist/next";

const withSerwist = withSerwistInit({
  swSrc: "src/sw.ts",
  swDest: "public/sw.js",
  disable: process.env.NODE_ENV === "development",
});

const nextConfig: NextConfig = {
  turbopack: {},
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

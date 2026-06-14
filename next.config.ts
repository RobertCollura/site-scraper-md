import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["pdf-parse"],
  outputFileTracingIncludes: {
    "/api/export": ["./output/**/*"],
    "/api/scrape": ["./output/**/*"],
  },
};

export default nextConfig;

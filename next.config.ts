import type { NextConfig } from "next";

const dynamicMediaTraceExcludes = [
  "./app/**/*",
  "./components/**/*",
  "./docs/**/*",
  "./infra/**/*",
  "./lib/**/*",
  "./output/**/*",
  "./packages/**/*",
  "./public/**/*",
  "./scripts/**/*",
  "./supabase/**/*",
  "./tests/**/*",
  "./*.md",
  "./next.config.ts",
  "./tsconfig.json",
  "./eslint.config.mjs",
];

const nextConfig: NextConfig = {
  allowedDevOrigins: ["127.0.0.1"],
  // Allow large request bodies for tus resumable uploads (up to 500MB per chunk)
  experimental: {
    serverActions: {
      bodySizeLimit: "500mb",
    },
  },
  outputFileTracingExcludes: {
    "/api/media/tus": dynamicMediaTraceExcludes,
    "/api/media/tus/*": dynamicMediaTraceExcludes,
  },
  turbopack: {
    ignoreIssue: [
      {
        path: "**/next.config.ts",
        title: "Encountered unexpected file in NFT list",
      },
    ],
  },
}

export default nextConfig;

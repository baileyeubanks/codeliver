import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Allow large request bodies for tus resumable uploads (up to 500MB per chunk)
  experimental: {
    serverActions: {
      bodySizeLimit: "500mb",
    },
  },
}

export default nextConfig;

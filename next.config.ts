import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Next 16.2.10's internal local-image response drops the detected MIME type
  // in this runtime. Serve the validated source assets directly until that
  // optimizer path is safe to re-enable.
  images: {
    unoptimized: true,
  },
  // Allow large request bodies for tus resumable uploads (up to 500MB per chunk)
  experimental: {
    serverActions: {
      bodySizeLimit: "500mb",
    },
  },
};

export default nextConfig;

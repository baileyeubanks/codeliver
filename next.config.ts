import type { NextConfig } from "next";

const contentSecurityPolicy = [
  "default-src 'self'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
  `script-src 'self' 'unsafe-inline'${process.env.NODE_ENV === "development" && process.env.CODELIVER_DEMO_MODE === "1" ? " 'unsafe-eval'" : ""} https://static.cloudflareinsights.com`,
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' data: https://fonts.gstatic.com",
  "img-src 'self' blob: data: https:",
  "media-src 'self' blob: data: https:",
  "connect-src 'self' https: wss: https://cloudflareinsights.com",
  "worker-src 'self' blob:",
  "frame-src 'self' blob: data: https:",
  "frame-ancestors 'none'",
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: contentSecurityPolicy },
  { key: "Permissions-Policy", value: "camera=(), geolocation=(), microphone=()" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-DNS-Prefetch-Control", value: "off" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Permitted-Cross-Domain-Policies", value: "none" },
];

const nextConfig: NextConfig = {
  // Origin gzip fights the edge. Cloudflare forwards Accept-Encoding: gzip and
  // a compressed Next response hung the HTML door as a 0-byte body. Compression
  // stays at the edge; this process serves identity bytes.
  compress: false,
  poweredByHeader: false,
  productionBrowserSourceMaps: false,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
      {
        source: "/api/:path*",
        headers: [{ key: "Cache-Control", value: "no-store" }],
      },
    ];
  },
  // The image optimizer stays enabled: the July `unoptimized` bypass treated
  // a host-gate defect (the optimizer's headerless internal fetch was denied)
  // as a Next.js MIME bug. Static and local images flow through `/_next/image`
  // again; media surfaces that need raw sources opt out per-component.
  // The proxy buffers PATCH bodies independently of Server Actions. Match the
  // storage maximum; the browser sends smaller 8 MiB chunks.
  experimental: {
    proxyClientMaxBodySize: "64mb",
    serverActions: {
      bodySizeLimit: "500mb",
    },
  },
};

export default nextConfig;

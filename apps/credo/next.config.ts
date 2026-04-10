import type { NextConfig } from "next";
import path from "path";

const securityHeaders = [
  { key: "X-DNS-Prefetch-Control", value: "on" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-XSS-Protection", value: "1; mode=block" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline'",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "img-src 'self' blob: data: https:",
      "font-src 'self' data: https://fonts.gstatic.com",
      "connect-src 'self'",
      "frame-src 'none'",
      "object-src 'none'",
    ].join("; "),
  },
];

const nextConfig: any = {
  output: "standalone",
  transpilePackages: ["@zenowethu/shared-lib", "@zenowethu/database", "@zenowethu/config"],
  serverExternalPackages: ["pino", "pino-pretty", "thread-stream"],
  turbopack: {
    root: "../../",
  },
  experimental: {
    serverActions: {
      bodySizeLimit: "10mb",
    },
    outputFileTracingRoot: path.join(__dirname, "../../"),
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;

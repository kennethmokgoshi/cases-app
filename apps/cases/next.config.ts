import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";
import path from "path";


const securityHeaders = [
  { key: 'X-DNS-Prefetch-Control', value: 'on' },
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-XSS-Protection', value: '1; mode=block' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
  {
    key: 'Content-Security-Policy',
    value: "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data: https://*.zenowethu.co.za; font-src 'self' data:; connect-src 'self' https://*.zenowethu.co.za https://api.openai.com; frame-src 'self'; object-src 'none'; upgrade-insecure-requests;"
  },
];

const nextConfig: NextConfig = {
  output: 'standalone',
  outputFileTracingRoot: path.join(__dirname, "../../"),
  transpilePackages: ['@zenowethu/ui', '@zenowethu/shared-lib', '@zenowethu/plan-engine'],
  serverExternalPackages: ['imapflow', 'pino', 'pino-pretty', 'thread-stream', 'puppeteer', 'puppeteer-core', 'pdfjs-dist', 'googleapis', 'google-auth-library'],
  experimental: {
    serverActions: {
      bodySizeLimit: '50mb'
    }
  },
  async headers() {
    return [
      {
        // Apply security headers to all routes
        source: '/:path*',
        headers: securityHeaders
      },
    ];
  }
};

export default withSentryConfig(nextConfig, {
  org: "zenowethu",
  project: "cases",
  silent: !process.env.CI,
  widenClientFileUpload: true,
  disableLogger: true,
  automaticVercelMonitors: true,
});

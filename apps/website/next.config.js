/** @type {import('next').NextConfig} */

// Same header set as the authenticated apps, minus frame-ancestors strictness
// differences — the public website has no auth but still should not be framed
// or MIME-sniffed. CSP allows Next.js inline styles/scripts and same-origin API.
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
    value:
      "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data: https://*.zenowethu.co.za; font-src 'self' data:; connect-src 'self' https://*.zenowethu.co.za; frame-src 'self'; object-src 'none'; upgrade-insecure-requests;",
  },
];

const nextConfig = {
  transpilePackages: ["@zenowethu/ui", "@zenowethu/shared-lib", "@zenowethu/database"],
  experimental: {
    // Enable performance optimizations
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

module.exports = nextConfig;

/** @type {import('next').NextConfig} */

// Same header set as the authenticated apps, minus frame-ancestors strictness
// differences — the public website has no auth but still should not be framed
// or MIME-sniffed. CSP allows Next.js inline styles/scripts and same-origin API.
// The OPSGENTY (GHL) chat widget is only loaded when a widget ID is configured
// (see app/layout.tsx); its domains are allowed in the CSP under the same condition.
const ghlWidget = Boolean(process.env.NEXT_PUBLIC_GHL_CHAT_WIDGET_ID?.trim());
const ghlSrc = ghlWidget ? " https://*.leadconnectorhq.com https://*.msgsndr.com" : "";

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
      `default-src 'self'; script-src 'self' 'unsafe-inline'${ghlSrc}; style-src 'self' 'unsafe-inline'${ghlSrc}; img-src 'self' blob: data: https://*.zenowethu.co.za${ghlSrc}; font-src 'self' data:${ghlSrc}; connect-src 'self' https://*.zenowethu.co.za${ghlSrc}${ghlWidget ? " wss://*.leadconnectorhq.com" : ""}; frame-src 'self'${ghlSrc}; object-src 'none'; upgrade-insecure-requests;`,
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

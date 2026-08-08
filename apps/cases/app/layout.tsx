import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Providers } from "./providers";

export const metadata: Metadata = {
  title: "Zenowethu - Case Management",
  description: "Zenowethu Case Management System",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Zenowethu" },
  formatDetection: {
    telephone: true },
  icons: {
    icon: [
      { url: "/icons/icon.svg", type: "image/svg+xml" },
    ],
    apple: [
      { url: "/icons/icon.svg", type: "image/svg+xml" },
    ] } };

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  userScalable: true,
  themeColor: "#06b6d4",
  viewportFit: "cover" };

export default function RootLayout({
  children }: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning={true} style={{ colorScheme: 'dark' }}>
      <head>
        {/* PWA Meta Tags */}
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="Zenowethu" />
        <link rel="apple-touch-icon" href="/icons/icon.svg" />
        <link rel="icon" type="image/svg+xml" href="/icons/icon.svg" />
      </head>
      <body
        className="antialiased"
        suppressHydrationWarning={true}
      >
        <Providers>
          {children}
        </Providers>
        {/* Service Worker Registration — production only. A caching service worker
            fighting Turbopack's dev-mode rebuilds is what causes "Failed to fetch"
            on client-side navigation in local dev, and it survives dev server
            restarts since it lives in the browser, not the server. In non-production
            builds we instead actively unregister any worker + caches left over from
            before this guard existed, so a stale one doesn't linger silently. */}
        {process.env.NODE_ENV === 'production' ? (
          <script
            dangerouslySetInnerHTML={{
              __html: `
                if ('serviceWorker' in navigator) {
                  window.addEventListener('load', function() {
                    navigator.serviceWorker.register('/sw.js').then(
                      function(registration) {
                        console.log('[INFO] ServiceWorker registered:', registration.scope);
                      },
                      function(err) {
                        console.log('[INFO] ServiceWorker registration failed:', err);
                      }
                    );
                  });
                }
              ` }}
          />
        ) : (
          <script
            dangerouslySetInnerHTML={{
              __html: `
                if ('serviceWorker' in navigator) {
                  navigator.serviceWorker.getRegistrations().then(function(regs) {
                    if (regs.length === 0) return;
                    // Unregistering doesn't stop a worker that's already controlling
                    // THIS page load — only the next one. Force that next load
                    // ourselves once cleanup finishes, so one reload is enough
                    // instead of leaving the user to hard-reload twice. This can't
                    // loop: once the worker is gone, regs.length is 0 and we stop.
                    Promise.all(regs.map(function(reg) { return reg.unregister(); }))
                      .then(function() {
                        if (!('caches' in window)) { window.location.reload(); return; }
                        caches.keys().then(function(names) {
                          Promise.all(names.map(function(name) { return caches.delete(name); }))
                            .then(function() { window.location.reload(); });
                        });
                      });
                  });
                }
              ` }}
          />
        )}
      </body>
    </html>
  );
}

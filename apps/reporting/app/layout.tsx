import type { Metadata, Viewport } from "next";
import "./globals.css";
import { SessionProvider, ThemeProvider, Toaster } from '@zenowethu/ui';

export const metadata: Metadata = {
  title: "Zenowethu - Work Reporting",
  description: "Zenowethu Work Reporting System",
  icons: {
    icon: [
      { url: "/icons/icon.svg", type: "image/svg+xml" },
    ],
    apple: [
      { url: "/icons/icon.svg", type: "image/svg+xml" },
    ]
  }
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  userScalable: true,
  themeColor: "#06b6d4",
  viewportFit: "cover"
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning={true} style={{ colorScheme: 'dark' }}>
      <head>
        <link rel="icon" type="image/svg+xml" href="/icons/icon.svg" />
      </head>
      <body className="antialiased" suppressHydrationWarning={true}>
        <ThemeProvider>
          <SessionProvider>
            {children}
            <Toaster />
          </SessionProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}

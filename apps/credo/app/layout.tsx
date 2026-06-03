import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Credo — Repair Your Credit. Own Your Future.",
    template: "%s | Credo",
  },
  description:
    "South Africa's trusted credit repair platform. NCA-compliant dispute centre, all 4 bureaus, AI-powered action plans. Start for free.",
  keywords: [
    "credit repair",
    "credit score",
    "South Africa",
    "NCA",
    "credit bureau",
    "debt review",
    "credit dispute",
    "TransUnion",
    "Experian",
    "XDS",
  ],
  authors: [{ name: "Credo" }],
  creator: "Credo",
  metadataBase: new URL("https://credoapp.co.za"),
  openGraph: {
    type: "website",
    locale: "en_ZA",
    url: "https://credoapp.co.za",
    title: "Credo — Repair Your Credit. Own Your Future.",
    description:
      "South Africa's trusted credit repair platform. NCA-compliant, POPIA-secure. All 4 bureaus.",
    siteName: "Credo",
  },
  twitter: {
    card: "summary_large_image",
    title: "Credo — Credit Repair Platform",
    description: "SA's most trusted credit repair platform.",
  },
  robots: {
    index: true,
    follow: true,
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  themeColor: "#0B1D35",
};

import { AuthProvider } from "../components/AuthProvider";
import { Toaster, ConfirmProvider } from "@zenowethu/ui";

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en-ZA" suppressHydrationWarning>
      <head>
        <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=Playfair+Display:ital,wght@0,400;0,500;0,600;0,700;1,400;1,600&display=swap"
          rel="stylesheet"
        />
        <style>{`
          :root {
            --font-inter: 'Inter', system-ui, -apple-system, BlinkMacSystemFont, sans-serif;
            --font-playfair: 'Playfair Display', Georgia, 'Times New Roman', serif;
          }
        `}</style>
      </head>
      <body className="antialiased" suppressHydrationWarning>
        <AuthProvider>
          <ConfirmProvider>
            {children}
          </ConfirmProvider>
          <Toaster />
        </AuthProvider>
      </body>
    </html>
  );
}

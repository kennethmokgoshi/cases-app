import type { Metadata } from "next";
import { Inter, Outfit } from "next/font/google";
import "./globals.css";
import Script from "next/script";
import { getSiteCompany } from "../lib/company";
import { professionalsLabel } from "../lib/company-format";

const inter = Inter({ subsets: ["latin"], variable: "--font-body" });
const outfit = Outfit({ subsets: ["latin"], variable: "--font-display" });

const GHL_CHAT_WIDGET_ID = process.env.NEXT_PUBLIC_GHL_CHAT_WIDGET_ID?.trim();

// Every page shows tenant company details from the Company Profile, so render
// per request (the profile itself is cached in memory for 60 s).
export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const company = await getSiteCompany();
  const who = company.isRegisteredDebtCounsellor
    ? `${company.tradingName}: ${professionalsLabel(company)} (${company.ncrdcNumber})`
    : company.tradingName;
  return {
    title: `${company.shortName} | Reclaim Your Financial Freedom`,
    description: `${who}. Expert help with Debt Review Removal, Court Rescissions, Credit Repair and cheaper Credit Life Insurance.`,
  };
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${inter.variable} ${outfit.variable}`}>
      <body className="bg-brand-deep text-slate-50">
        {children}

        {/* OPSGENTY (GHL) chat widget — only rendered once a real widget ID is
            configured. next.config.js opens the CSP for the widget domains under
            the same condition. */}
        {GHL_CHAT_WIDGET_ID && (
          <Script
            id="ghl-chat-widget"
            strategy="afterInteractive"
            src="https://widgets.leadconnectorhq.com/loader.js"
            data-resources-url="https://widgets.leadconnectorhq.com/chat-widget/loader.js"
            data-widget-id={GHL_CHAT_WIDGET_ID}
          />
        )}
      </body>
    </html>
  );
}

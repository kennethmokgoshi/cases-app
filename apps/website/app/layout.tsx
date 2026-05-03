import type { Metadata } from "next";
import { Inter, Outfit } from "next/font/google";
import "./globals.css";
import Script from "next/script";

const inter = Inter({ subsets: ["latin"], variable: "--font-body" });
const outfit = Outfit({ subsets: ["latin"], variable: "--font-display" });

export const metadata: Metadata = {
  title: "Zenowethu | Reclaim Your Financial Freedom",
  description: "South Africa's most trusted credit repair and debt management platform. Expert help with Debt Review Removal, Credit Repair, and Insurance.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${inter.variable} ${outfit.variable}`}>
      <body className="bg-brand-deep text-slate-50">
        {children}

        {/* Opsgenty AI Chat Widget */}
        <Script id="ghl-chat-widget" strategy="afterInteractive">
          {`
            (function() {
              const script = document.createElement('script');
              script.src = "https://widgets.leadconnectorhq.com/loader.js";
              script.dataset.resourcesUrl = "https://widgets.leadconnectorhq.com/chat-widget/loader.js";
              // Replace with real widget ID in production
              script.dataset.widgetId = "ZENOWETHU_AI_WIDGET"; 
              document.body.appendChild(script);

              window.addEventListener('load', function() {
                setTimeout(function() {
                  if (window.chatWidget) {
                    window.chatWidget.open();
                    window.chatWidget.sendMessage("Hi! I'm the Zenowethu AI. How can I help you reclaim your financial freedom today?");
                  }
                }, 5000);
              });
            })();
          `}
        </Script>
      </body>
    </html>
  );
}

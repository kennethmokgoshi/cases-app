"use client";

import React from "react";

export function LandingFooter() {
  return (
    <footer
      style={{
        background: "#0B1D35",
        padding: "48px 24px 32px",
        borderTop: "1px solid rgba(255,255,255,0.06)",
      }}
    >
      <div style={{ maxWidth: 1200, margin: "0 auto" }}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "2fr repeat(3, 1fr)",
            gap: 40,
            marginBottom: 48,
          }}
        >
          {/* Brand */}
          <div>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                marginBottom: 16,
              }}
            >
              <div
                style={{
                  width: 32,
                  height: 32,
                  background: "rgba(196,149,58,0.15)",
                  border: "1px solid rgba(196,149,58,0.3)",
                  borderRadius: 8,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                  <path
                    d="M9 2C5.69 2 3 4.69 3 9s2.69 7 6 7 6-2.69 6-6"
                    stroke="#C4953A"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                  />
                  <path
                    d="M12.5 2l2 2-2 2"
                    stroke="#C4953A"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  <path
                    d="M6 9l2 2 3.5-3.5"
                    stroke="white"
                    strokeWidth="1.2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </div>
              <span
                style={{ fontWeight: 700, fontSize: "1rem", color: "#FFFFFF" }}
              >
                Credo
              </span>
            </div>
            <p
              style={{
                fontSize: "0.875rem",
                color: "#64748B",
                lineHeight: 1.7,
                maxWidth: 260,
              }}
            >
              South Africa&apos;s trusted credit repair platform. NCA-compliant,
              POPIA-secure.
            </p>
            <div style={{ marginTop: 20, display: "flex", gap: 8 }}>
              {["NCR", "NCA", "POPIA"].map((b) => (
                <span
                  key={b}
                  style={{
                    padding: "3px 10px",
                    background: "rgba(196,149,58,0.1)",
                    border: "1px solid rgba(196,149,58,0.2)",
                    borderRadius: 4,
                    fontSize: "0.6875rem",
                    fontWeight: 600,
                    color: "#C4953A",
                    letterSpacing: "0.04em",
                  }}
                >
                  {b}
                </span>
              ))}
            </div>
          </div>

          {/* Links */}
          {[
            {
              title: "Product",
              links: [
                "Features",
                "Pricing",
                "Credit Bureaus",
                "AI Coach",
                "Document Vault",
              ],
            },
            {
              title: "Legal",
              links: [
                "Privacy Policy",
                "Terms of Service",
                "POPIA Notice",
                "Cookie Policy",
              ],
            },
            {
              title: "Company",
              links: ["About Us", "For Firms", "Contact", "Blog"],
            },
          ].map((col) => (
            <div key={col.title}>
              <p
                style={{
                  fontSize: "0.75rem",
                  fontWeight: 600,
                  color: "#94A3B8",
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                  marginBottom: 16,
                }}
              >
                {col.title}
              </p>
              <div
                style={{ display: "flex", flexDirection: "column", gap: 10 }}
              >
                {col.links.map((l) => (
                  <a
                    key={l}
                    href="#"
                    style={{
                      fontSize: "0.875rem",
                      color: "#64748B",
                      textDecoration: "none",
                      transition: "color 150ms",
                    }}
                  >
                    {l}
                  </a>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div
          style={{
            borderTop: "1px solid rgba(255,255,255,0.06)",
            paddingTop: 24,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: 12,
          }}
        >
          <p style={{ fontSize: "0.8125rem", color: "#475569" }}>
            &copy; {new Date().getFullYear()} Credo. All rights reserved.
            Registered in South Africa.
          </p>
          <p style={{ fontSize: "0.8125rem", color: "#475569" }}>
            Regulated under the National Credit Act No. 34 of 2005
          </p>
        </div>
      </div>
    </footer>
  );
}

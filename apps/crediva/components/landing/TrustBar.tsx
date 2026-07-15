"use client";

import React from "react";

export function TrustBar() {
  const items = [
    { icon: "⚖️", label: "NCA Section 72 Compliant" },
    { icon: "🛡️", label: "POPIA Certified" },
    { icon: "📋", label: "NCR Registered" },
    { icon: "🏦", label: "All 4 SA Bureaus" },
    { icon: "🔒", label: "AES-256 Encrypted" },
    { icon: "🇿🇦", label: "Hosted in South Africa" },
  ];

  return (
    <div
      style={{
        background: "#FFFFFF",
        borderBottom: "1px solid #E2E8F0",
        padding: "16px 24px",
        overflowX: "auto",
      }}
    >
      <div
        style={{
          maxWidth: 1200,
          margin: "0 auto",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: "clamp(20px, 4vw, 48px)",
          flexWrap: "wrap",
        }}
      >
        {items.map((item) => (
          <div
            key={item.label}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              fontSize: "0.8125rem",
              fontWeight: 500,
              color: "#475569",
              whiteSpace: "nowrap",
            }}
          >
            <span>{item.icon}</span>
            <span>{item.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

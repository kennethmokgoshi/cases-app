"use client";

import Link from "next/link";
import { CheckIcon } from "../icons";

export function Pricing() {
  const tiers = [
    {
      name: "Free",
      price: "R0",
      period: "forever",
      description: "Start your credit repair journey at no cost.",
      highlight: false,
      cta: "Get started",
      features: [
        "Single bureau credit score",
        "Basic case status tracking",
        "NCA rights summary",
        "Credit education library",
        "10 AI coach queries/month",
      ],
    },
    {
      name: "Standard",
      price: "R149",
      period: "per month",
      description: "Full access for consumers actively repairing their credit.",
      highlight: true,
      cta: "Start free trial",
      features: [
        "All 4 bureau reports",
        "Full dispute letter builder",
        "Prescription debt scanner",
        "20-day response tracker",
        "Smart alerts & notifications",
        "AI-powered action plan",
        "Document vault (1 GB)",
        "Coupon code access",
      ],
    },
    {
      name: "Premium",
      price: "R299",
      period: "per month",
      description:
        "For consumers who want the complete credit repair experience.",
      highlight: false,
      cta: "Start free trial",
      features: [
        "Everything in Standard",
        "Multilingual AI Credit Coach",
        "Legal escalation pathways",
        "Debt review module + DC finder",
        "Judgment rescission assistant",
        "EAO / Garnishee checker",
        "Financial health score",
        "WhatsApp integration",
        "Document vault (10 GB)",
      ],
    },
  ];

  return (
    <section
      id="pricing"
      style={{ padding: "96px 24px", background: "#F8F9FA" }}
    >
      <div style={{ maxWidth: 1100, margin: "0 auto" }}>
        <div style={{ textAlign: "center", marginBottom: 64 }}>
          <span className="section-label">Pricing</span>
          <h2
            className="font-display"
            style={{
              fontSize: "clamp(1.875rem, 4vw, 2.75rem)",
              fontWeight: 700,
              color: "#0F172A",
              marginTop: 12,
              letterSpacing: "-0.02em",
            }}
          >
            Simple, transparent pricing
          </h2>
          <p style={{ marginTop: 16, fontSize: "1.0625rem", color: "#64748B" }}>
            Cancel anytime. No hidden fees.
          </p>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
            gap: 20,
            alignItems: "start",
          }}
        >
          {tiers.map((tier) => (
            <div
              key={tier.name}
              style={{
                background: tier.highlight ? "#0B1D35" : "#FFFFFF",
                border: tier.highlight
                  ? "2px solid #C4953A"
                  : "1px solid #E2E8F0",
                borderRadius: 16,
                padding: "36px 28px",
                position: "relative",
                boxShadow: tier.highlight
                  ? "0 20px 40px rgba(11,29,53,0.2)"
                  : "0 1px 3px rgba(0,0,0,0.06)",
                transform: tier.highlight ? "scale(1.02)" : "none",
              }}
            >
              {tier.highlight && (
                <div
                  style={{
                    position: "absolute",
                    top: -14,
                    left: "50%",
                    transform: "translateX(-50%)",
                    background: "#C4953A",
                    color: "#FFFFFF",
                    fontSize: "0.75rem",
                    fontWeight: 700,
                    letterSpacing: "0.06em",
                    padding: "5px 16px",
                    borderRadius: 9999,
                    textTransform: "uppercase",
                  }}
                >
                  Most Popular
                </div>
              )}

              <div style={{ marginBottom: 24 }}>
                <p
                  style={{
                    fontSize: "0.875rem",
                    fontWeight: 600,
                    color: tier.highlight ? "#C4953A" : "#64748B",
                    letterSpacing: "0.04em",
                    textTransform: "uppercase",
                    marginBottom: 8,
                  }}
                >
                  {tier.name}
                </p>
                <div
                  style={{
                    display: "flex",
                    alignItems: "baseline",
                    gap: 4,
                    marginBottom: 8,
                  }}
                >
                  <span
                    style={{
                      fontSize: "2.5rem",
                      fontWeight: 800,
                      color: tier.highlight ? "#FFFFFF" : "#0F172A",
                      lineHeight: 1,
                    }}
                  >
                    {tier.price}
                  </span>
                  <span
                    style={{
                      fontSize: "0.875rem",
                      color: tier.highlight ? "#94A3B8" : "#64748B",
                    }}
                  >
                    /{tier.period}
                  </span>
                </div>
                <p
                  style={{
                    fontSize: "0.875rem",
                    color: tier.highlight ? "#94A3B8" : "#64748B",
                    lineHeight: 1.5,
                  }}
                >
                  {tier.description}
                </p>
              </div>

              <Link
                href="/register"
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  width: "100%",
                  padding: "11px 0",
                  background: tier.highlight ? "#C4953A" : "#0B1D35",
                  color: "#FFFFFF",
                  fontWeight: 600,
                  fontSize: "0.9375rem",
                  borderRadius: 9,
                  textDecoration: "none",
                  marginBottom: 28,
                }}
              >
                {tier.cta}
              </Link>

              <div
                style={{ display: "flex", flexDirection: "column", gap: 12 }}
              >
                {tier.features.map((f) => (
                  <div
                    key={f}
                    style={{
                      display: "flex",
                      alignItems: "flex-start",
                      gap: 10,
                    }}
                  >
                    <div
                      style={{
                        width: 18,
                        height: 18,
                        borderRadius: "50%",
                        background: tier.highlight
                          ? "rgba(196,149,58,0.2)"
                          : "#E4EDF8",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        flexShrink: 0,
                        marginTop: 1,
                        color: tier.highlight ? "#C4953A" : "#0B1D35",
                      }}
                    >
                      <CheckIcon size={10} />
                    </div>
                    <span
                      style={{
                        fontSize: "0.875rem",
                        color: tier.highlight ? "#CBD5E1" : "#374151",
                        lineHeight: 1.5,
                      }}
                    >
                      {f}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

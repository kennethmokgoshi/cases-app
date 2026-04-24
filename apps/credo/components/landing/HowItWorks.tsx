"use client";

import React from "react";

export function HowItWorks() {
  const steps = [
    {
      number: "01",
      title: "Create your free account",
      description:
        "Sign up in under 2 minutes. Verify your identity securely using your South African ID number. No credit card required.",
    },
    {
      number: "02",
      title: "Pull your credit reports",
      description:
        "We connect to all four SA bureaus — TransUnion, Experian, XDS, and Lightstone — and retrieve your full credit picture in one place.",
    },
    {
      number: "03",
      title: "Get your action plan",
      description:
        "Our AI analyses your reports and builds a prioritised dispute and repair plan. Know exactly what to fix, in what order, and why.",
    },
    {
      number: "04",
      title: "Track your progress",
      description:
        "Watch disputes resolve, judgments get removed, and your score rise. We keep you updated at every step — in plain language.",
    },
  ];

  return (
    <section
      id="how-it-works"
      style={{ padding: "96px 24px", background: "#F8F9FA" }}
    >
      <div style={{ maxWidth: 1200, margin: "0 auto" }}>
        <div style={{ textAlign: "center", marginBottom: 64 }}>
          <span className="section-label">Process</span>
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
            How it works
          </h2>
          <p
            style={{
              marginTop: 16,
              fontSize: "1.0625rem",
              color: "#64748B",
              maxWidth: 500,
              margin: "16px auto 0",
            }}
          >
            From registration to a repaired credit profile — a clear, guided
            journey.
          </p>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
            gap: 2,
          }}
        >
          {steps.map((step, i) => (
            <div
              key={step.number}
              style={{
                background: "#FFFFFF",
                border: "1px solid #E2E8F0",
                borderRadius:
                  i === 0
                    ? "12px 0 0 12px"
                    : i === steps.length - 1
                      ? "0 12px 12px 0"
                      : "0",
                padding: "36px 32px",
                position: "relative",
                borderLeft: i > 0 ? "none" : undefined,
              }}
            >
              <div
                style={{
                  fontSize: "3rem",
                  fontWeight: 800,
                  color: "#E2E8F0",
                  lineHeight: 1,
                  marginBottom: 20,
                  fontFamily: "var(--font-playfair), Georgia, serif",
                }}
              >
                {step.number}
              </div>
              <div
                style={{
                  width: 36,
                  height: 3,
                  background: "#C4953A",
                  borderRadius: 2,
                  marginBottom: 20,
                }}
              />
              <h3
                style={{
                  fontSize: "1.0625rem",
                  fontWeight: 600,
                  color: "#0F172A",
                  marginBottom: 12,
                }}
              >
                {step.title}
              </h3>
              <p
                style={{
                  fontSize: "0.9375rem",
                  color: "#64748B",
                  lineHeight: 1.65,
                }}
              >
                {step.description}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

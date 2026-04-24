"use client";

import {
  ChartIcon,
  FileIcon,
  BotIcon,
  ShieldIcon,
  LockIcon,
  GlobeIcon,
} from "../icons";

export function Features() {
  const features = [
    {
      icon: <ChartIcon />,
      title: "4-Bureau Credit Dashboard",
      description:
        "Scores, payment profiles, and trend graphs from TransUnion, Experian, XDS, and Lightstone — unified in one clear view.",
    },
    {
      icon: <FileIcon />,
      title: "NCA Dispute Centre",
      description:
        "Section 72 dispute letters drafted and routed directly to each bureau. 20-business-day response tracker included.",
    },
    {
      icon: <BotIcon />,
      title: "AI Credit Coach",
      description:
        "Chat with an AI that understands SA credit law — debt review flags, prescribed debts, EAOs, and more. In your language.",
    },
    {
      icon: <ShieldIcon />,
      title: "Prescription Scanner",
      description:
        "Automatically flags debts older than 3 years that may be legally prescribed under SA law. Know your rights.",
    },
    {
      icon: <LockIcon />,
      title: "POPIA-Compliant Vault",
      description:
        "Store your ID, payslips, bureau letters, and clearance certificates in an encrypted document vault built for SA law.",
    },
    {
      icon: <GlobeIcon />,
      title: "Multilingual Support",
      description:
        "Full platform in English, Afrikaans, isiZulu, Sesotho, and Xhosa. Every South African deserves access.",
    },
  ];

  return (
    <section
      id="features"
      style={{ padding: "96px 24px", background: "#FFFFFF" }}
    >
      <div style={{ maxWidth: 1200, margin: "0 auto" }}>
        <div style={{ textAlign: "center", marginBottom: 64 }}>
          <span className="section-label">Platform</span>
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
            Everything you need to repair your credit
          </h2>
          <p
            style={{
              marginTop: 16,
              fontSize: "1.0625rem",
              color: "#64748B",
              maxWidth: 520,
              margin: "16px auto 0",
            }}
          >
            Purpose-built for South Africa. Every feature designed around the
            NCA, POPIA, and the four SA credit bureaus.
          </p>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))",
            gap: 24,
          }}
        >
          {features.map((f) => (
            <div
              key={f.title}
              className="credo-card"
              style={{ padding: "28px 28px" }}
            >
              <div
                style={{
                  width: 44,
                  height: 44,
                  background: "#E4EDF8",
                  borderRadius: 10,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "#0B1D35",
                  marginBottom: 20,
                }}
              >
                {f.icon}
              </div>
              <h3
                style={{
                  fontSize: "1rem",
                  fontWeight: 600,
                  color: "#0F172A",
                  marginBottom: 10,
                }}
              >
                {f.title}
              </h3>
              <p
                style={{
                  fontSize: "0.9375rem",
                  color: "#64748B",
                  lineHeight: 1.65,
                }}
              >
                {f.description}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

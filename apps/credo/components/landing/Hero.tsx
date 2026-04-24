"use client";

import Link from "next/link";
import { ArrowRight } from "../icons";

export function Hero() {
  return (
    <section
      style={{
        background:
          "linear-gradient(160deg, #0B1D35 0%, #112847 55%, #0B1D35 100%)",
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "120px 24px 80px",
        position: "relative",
        overflow: "hidden",
      }}
    >
      {/* Subtle background texture */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          opacity: 0.04,
          backgroundImage:
            "radial-gradient(circle at 25% 25%, #C4953A 0%, transparent 50%), radial-gradient(circle at 75% 75%, #C4953A 0%, transparent 50%)",
        }}
      />

      {/* Gold accent line top */}
      <div
        style={{
          position: "absolute",
          top: 0,
          left: "50%",
          transform: "translateX(-50%)",
          width: 1,
          height: 80,
          background: "linear-gradient(to bottom, transparent, #C4953A)",
        }}
      />

      <div
        style={{
          maxWidth: 820,
          margin: "0 auto",
          textAlign: "center",
          position: "relative",
        }}
      >
        {/* Eyebrow */}
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            padding: "6px 14px",
            background: "rgba(196,149,58,0.12)",
            border: "1px solid rgba(196,149,58,0.25)",
            borderRadius: 9999,
            marginBottom: 32,
          }}
        >
          <div
            style={{
              width: 6,
              height: 6,
              borderRadius: "50%",
              background: "#C4953A",
            }}
          />
          <span
            style={{
              fontSize: "0.8125rem",
              fontWeight: 500,
              color: "#DEB96E",
              letterSpacing: "0.04em",
            }}
          >
            NCA-Compliant &bull; POPIA-Secure &bull; All 4 SA Bureaus
          </span>
        </div>

        {/* Headline */}
        <h1
          className="font-display"
          style={{
            fontSize: "clamp(2.5rem, 6vw, 4.25rem)",
            fontWeight: 700,
            color: "#FFFFFF",
            lineHeight: 1.12,
            letterSpacing: "-0.02em",
            marginBottom: 24,
          }}
        >
          Repair your credit.{" "}
          <span style={{ color: "#C4953A", fontStyle: "italic" }}>Own</span>{" "}
          your future.
        </h1>

        {/* Sub-headline */}
        <p
          style={{
            fontSize: "clamp(1rem, 2vw, 1.1875rem)",
            color: "#94A3B8",
            lineHeight: 1.7,
            maxWidth: 580,
            margin: "0 auto 40px",
          }}
        >
          South Africa&apos;s most trusted credit repair platform. Dispute
          inaccuracies, track your cases, and rebuild your financial future — in
          plain language, in your language.
        </p>

        {/* CTAs */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 12,
            flexWrap: "wrap",
          }}
        >
          <Link
            href="/register"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              padding: "13px 28px",
              background: "#C4953A",
              color: "#FFFFFF",
              fontWeight: 600,
              fontSize: "0.9375rem",
              borderRadius: 9,
              textDecoration: "none",
              boxShadow: "0 4px 20px rgba(196,149,58,0.35)",
              transition: "transform 150ms, box-shadow 150ms",
              letterSpacing: "0.01em",
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLElement).style.transform =
                "translateY(-1px)";
              (e.currentTarget as HTMLElement).style.boxShadow =
                "0 6px 24px rgba(196,149,58,0.45)";
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLElement).style.transform = "none";
              (e.currentTarget as HTMLElement).style.boxShadow =
                "0 4px 20px rgba(196,149,58,0.35)";
            }}
          >
            Start for free
            <ArrowRight />
          </Link>
          <a
            href="#how-it-works"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              padding: "13px 28px",
              background: "rgba(255,255,255,0.07)",
              color: "#E2E8F0",
              fontWeight: 500,
              fontSize: "0.9375rem",
              borderRadius: 9,
              textDecoration: "none",
              border: "1px solid rgba(255,255,255,0.12)",
              transition: "background-color 150ms",
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLElement).style.background =
                "rgba(255,255,255,0.12)";
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLElement).style.background =
                "rgba(255,255,255,0.07)";
            }}
          >
            See how it works
          </a>
        </div>

        {/* Social proof */}
        <p
          style={{
            marginTop: 48,
            fontSize: "0.8125rem",
            color: "#64748B",
            letterSpacing: "0.01em",
          }}
        >
          Trusted by South Africans repairing their credit &mdash; no credit
          card required
        </p>

        {/* Bureau logos row */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 24,
            marginTop: 20,
            flexWrap: "wrap",
          }}
        >
          {["TransUnion", "Experian", "XDS", "Lightstone"].map((b) => (
            <div
              key={b}
              style={{
                padding: "6px 14px",
                background: "rgba(255,255,255,0.05)",
                border: "1px solid rgba(255,255,255,0.1)",
                borderRadius: 6,
                fontSize: "0.75rem",
                fontWeight: 600,
                color: "#94A3B8",
                letterSpacing: "0.04em",
              }}
            >
              {b}
            </div>
          ))}
        </div>
      </div>

      {/* Dashboard preview card */}
      <div
        style={{
          marginTop: 72,
          maxWidth: 860,
          width: "100%",
          background: "rgba(255,255,255,0.03)",
          border: "1px solid rgba(255,255,255,0.08)",
          borderRadius: 20,
          padding: "2px",
          boxShadow: "0 40px 80px rgba(0,0,0,0.5)",
        }}
      >
        <div
          style={{
            background: "#F8F9FA",
            borderRadius: 18,
            overflow: "hidden",
            display: "grid",
            gridTemplateColumns: "220px 1fr",
            minHeight: 320,
          }}
        >
          {/* Mini sidebar */}
          <div
            style={{
              background: "#FFFFFF",
              borderRight: "1px solid #E2E8F0",
              padding: "24px 16px",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                marginBottom: 28,
              }}
            >
              <div
                style={{
                  width: 28,
                  height: 28,
                  background: "#0B1D35",
                  borderRadius: 7,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <path
                    d="M8 2C4.69 2 2 4.69 2 8s2.69 6 6 6 6-2.69 6-6"
                    stroke="#C4953A"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                  />
                  <path
                    d="M11.5 2l2 2-2 2"
                    stroke="#C4953A"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  <path
                    d="M5.5 8l1.5 1.5 3-3"
                    stroke="white"
                    strokeWidth="1.2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </div>
              <span
                style={{
                  fontWeight: 700,
                  fontSize: "0.875rem",
                  color: "#0B1D35",
                }}
              >
                Credo
              </span>
            </div>
            {[
              { label: "Dashboard", active: true },
              { label: "Credit Report", active: false },
              { label: "My Cases", active: false },
              { label: "Get a Quote", active: false },
              { label: "Documents", active: false },
            ].map((item) => (
              <div
                key={item.label}
                style={{
                  padding: "8px 10px",
                  borderRadius: 7,
                  fontSize: "0.8125rem",
                  fontWeight: item.active ? 600 : 400,
                  color: item.active ? "#0B1D35" : "#64748B",
                  background: item.active ? "#E4EDF8" : "transparent",
                  marginBottom: 2,
                  cursor: "pointer",
                }}
              >
                {item.label}
              </div>
            ))}
          </div>

          {/* Mini dashboard */}
          <div style={{ padding: "24px" }}>
            <p
              style={{
                fontSize: "0.75rem",
                color: "#94A3B8",
                marginBottom: 4,
                fontWeight: 500,
                letterSpacing: "0.06em",
                textTransform: "uppercase",
              }}
            >
              Your Credit Overview
            </p>
            <h3
              style={{
                fontSize: "1.125rem",
                fontWeight: 700,
                color: "#0F172A",
                marginBottom: 20,
              }}
            >
              Good morning, Sipho
            </h3>

            {/* Score cards row */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(4, 1fr)",
                gap: 10,
                marginBottom: 20,
              }}
            >
              {[
                { name: "TransUnion", score: 648, color: "#D97706" },
                { name: "Experian", score: 622, color: "#D97706" },
                { name: "XDS", score: 671, color: "#059669" },
                { name: "Lightstone", score: 635, color: "#D97706" },
              ].map((b) => (
                <div
                  key={b.name}
                  style={{
                    background: "#FFFFFF",
                    border: "1px solid #E2E8F0",
                    borderRadius: 10,
                    padding: "12px 10px",
                    textAlign: "center",
                  }}
                >
                  <div
                    style={{
                      fontSize: "1.25rem",
                      fontWeight: 700,
                      color: b.color,
                    }}
                  >
                    {b.score}
                  </div>
                  <div
                    style={{
                      fontSize: "0.65rem",
                      color: "#94A3B8",
                      fontWeight: 500,
                      marginTop: 2,
                    }}
                  >
                    {b.name}
                  </div>
                </div>
              ))}
            </div>

            {/* Active case pill */}
            <div
              style={{
                background: "#FFFFFF",
                border: "1px solid #E2E8F0",
                borderRadius: 10,
                padding: "12px 16px",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <div>
                <p
                  style={{
                    fontSize: "0.8125rem",
                    fontWeight: 600,
                    color: "#0F172A",
                    margin: 0,
                  }}
                >
                  Judgment Removal — Standard Bank
                </p>
                <p
                  style={{
                    fontSize: "0.7rem",
                    color: "#94A3B8",
                    margin: "2px 0 0",
                  }}
                >
                  In progress &bull; Step 3 of 7
                </p>
              </div>
              <div
                style={{
                  padding: "3px 10px",
                  background: "#FFFBEB",
                  color: "#D97706",
                  borderRadius: 9999,
                  fontSize: "0.7rem",
                  fontWeight: 600,
                }}
              >
                14 days left
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

"use client";

import Link from "next/link";
import { useState, useEffect } from "react";

/* ─── SVG Icons ──────────────────────────────────────────────────── */
const CheckIcon = ({ size = 16 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill="none">
    <path d="M3 8l3.5 3.5L13 4.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const ArrowRight = ({ size = 16 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill="none">
    <path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const ShieldIcon = () => (
  <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
    <path d="M10 2L3 5.5v5c0 3.6 3 6.9 7 7.5 4-0.6 7-3.9 7-7.5v-5L10 2z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
    <path d="M7 10l2 2 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const ChartIcon = () => (
  <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
    <path d="M3 14l4-5 4 2 5-6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    <rect x="2" y="2" width="16" height="16" rx="2" stroke="currentColor" strokeWidth="1.5" />
  </svg>
);

const FileIcon = () => (
  <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
    <path d="M11 2H5a1 1 0 00-1 1v14a1 1 0 001 1h10a1 1 0 001-1V7l-5-5z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
    <path d="M11 2v5h5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    <path d="M7 12h6M7 15h4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
  </svg>
);

const BotIcon = () => (
  <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
    <rect x="3" y="7" width="14" height="10" rx="2" stroke="currentColor" strokeWidth="1.5" />
    <path d="M7 7V5a3 3 0 016 0v2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    <circle cx="7.5" cy="12" r="1.5" fill="currentColor" />
    <circle cx="12.5" cy="12" r="1.5" fill="currentColor" />
  </svg>
);

const LockIcon = () => (
  <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
    <rect x="3" y="9" width="14" height="10" rx="2" stroke="currentColor" strokeWidth="1.5" />
    <path d="M6.5 9V6.5a3.5 3.5 0 017 0V9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    <circle cx="10" cy="14" r="1.5" fill="currentColor" />
  </svg>
);

const GlobeIcon = () => (
  <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
    <circle cx="10" cy="10" r="8" stroke="currentColor" strokeWidth="1.5" />
    <path d="M10 2c0 0-3 3.5-3 8s3 8 3 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    <path d="M10 2c0 0 3 3.5 3 8s-3 8-3 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    <path d="M2 10h16" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
  </svg>
);

const MenuIcon = () => (
  <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
    <path d="M3 6h14M3 10h14M3 14h14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
  </svg>
);

const CloseIcon = () => (
  <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
    <path d="M4 4l10 10M14 4L4 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
  </svg>
);

/* ─── Score Ring ─────────────────────────────────────────────────── */
function ScoreRing({ score, max = 999, size = 120 }: { score: number; max?: number; size?: number }) {
  const radius = (size - 16) / 2;
  const circumference = 2 * Math.PI * radius;
  const pct = score / max;
  const offset = circumference * (1 - pct * 0.75);
  const color = score >= 700 ? "#059669" : score >= 600 ? "#10B981" : score >= 500 ? "#D97706" : "#DC2626";
  const label = score >= 700 ? "Excellent" : score >= 600 ? "Good" : score >= 500 ? "Fair" : "Poor";

  return (
    <div style={{ position: "relative", width: size, height: size }}>
      <svg width={size} height={size} style={{ transform: "rotate(135deg)" }}>
        <circle cx={size / 2} cy={size / 2} r={radius} strokeWidth="8" className="score-ring-track" />
        <circle
          cx={size / 2} cy={size / 2} r={radius}
          strokeWidth="8"
          stroke={color}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          style={{ transition: "stroke-dashoffset 1s cubic-bezier(0.4,0,0.2,1)" }}
        />
      </svg>
      <div style={{
        position: "absolute", inset: 0,
        display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center",
      }}>
        <span style={{ fontSize: size * 0.22, fontWeight: 700, color, lineHeight: 1, fontFamily: "var(--font-inter)" }}>
          {score}
        </span>
        <span style={{ fontSize: size * 0.10, color: "#64748B", fontWeight: 500, marginTop: 2 }}>
          {label}
        </span>
      </div>
    </div>
  );
}

/* ─── Nav ────────────────────────────────────────────────────────── */
function Nav() {
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    const handler = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", handler, { passive: true });
    return () => window.removeEventListener("scroll", handler);
  }, []);

  return (
    <nav style={{
      position: "fixed", top: 0, left: 0, right: 0,
      zIndex: 100,
      background: scrolled ? "rgba(255,255,255,0.95)" : "transparent",
      backdropFilter: scrolled ? "blur(12px)" : "none",
      borderBottom: scrolled ? "1px solid #E2E8F0" : "1px solid transparent",
      transition: "all 300ms cubic-bezier(0.4,0,0.2,1)",
    }}>
      <div style={{
        maxWidth: 1200, margin: "0 auto",
        padding: "0 24px",
        height: 68,
        display: "flex", alignItems: "center", justifyContent: "space-between",
      }}>
        {/* Logo */}
        <Link href="/" style={{ display: "flex", alignItems: "center", gap: 10, textDecoration: "none" }}>
          <div style={{
            width: 36, height: 36,
            background: "var(--brand-primary)",
            borderRadius: 9,
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
              <path d="M10 3C6.13 3 3 6.13 3 10s3.13 7 7 7 7-3.13 7-7" stroke="#C4953A" strokeWidth="2" strokeLinecap="round" />
              <path d="M14 3l3 3-3 3" stroke="#C4953A" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M7 10l2 2 4-4" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <span style={{ fontWeight: 700, fontSize: "1.125rem", color: scrolled ? "#0B1D35" : "#0B1D35", letterSpacing: "-0.01em" }}>
            Credo
          </span>
        </Link>

        {/* Desktop links */}
        <div style={{ display: "flex", alignItems: "center", gap: 4 }} className="hidden md:flex">
          {["Features", "How It Works", "Pricing", "For Firms"].map((item) => (
            <a key={item} href={`#${item.toLowerCase().replace(/ /g, "-")}`}
              style={{
                padding: "6px 14px",
                fontSize: "0.875rem",
                fontWeight: 500,
                color: "#475569",
                textDecoration: "none",
                borderRadius: 6,
                transition: "color 150ms, background-color 150ms",
              }}
              onMouseEnter={(e) => { (e.target as HTMLElement).style.color = "#0B1D35"; (e.target as HTMLElement).style.background = "#F1F5F9"; }}
              onMouseLeave={(e) => { (e.target as HTMLElement).style.color = "#475569"; (e.target as HTMLElement).style.background = "transparent"; }}
            >
              {item}
            </a>
          ))}
        </div>

        {/* CTA */}
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Link href="/login" className="btn-ghost" style={{ fontSize: "0.875rem" }}>
            Sign in
          </Link>
          <Link href="/register" className="btn-primary" style={{ fontSize: "0.875rem", padding: "8px 18px" }}>
            Get started free
          </Link>
          <button
            onClick={() => setMobileOpen(!mobileOpen)}
            style={{ display: "none", background: "none", border: "none", cursor: "pointer", color: "#475569", padding: 6 }}
            className="block md:hidden"
          >
            {mobileOpen ? <CloseIcon /> : <MenuIcon />}
          </button>
        </div>
      </div>

      {/* Mobile menu */}
      {mobileOpen && (
        <div style={{
          background: "white", borderTop: "1px solid #E2E8F0",
          padding: "16px 24px 24px",
          display: "flex", flexDirection: "column", gap: 4,
        }}>
          {["Features", "How It Works", "Pricing", "For Firms"].map((item) => (
            <a key={item} href={`#${item.toLowerCase().replace(/ /g, "-")}`}
              onClick={() => setMobileOpen(false)}
              style={{
                padding: "10px 12px",
                fontSize: "0.9375rem",
                fontWeight: 500,
                color: "#374151",
                textDecoration: "none",
                borderRadius: 8,
              }}
            >
              {item}
            </a>
          ))}
          <div style={{ height: 1, background: "#E2E8F0", margin: "8px 0" }} />
          <Link href="/login" style={{ padding: "10px 12px", fontSize: "0.9375rem", fontWeight: 500, color: "#374151", textDecoration: "none" }}>
            Sign in
          </Link>
          <Link href="/register" className="btn-primary" style={{ marginTop: 4, justifyContent: "center" }}>
            Get started free
          </Link>
        </div>
      )}
    </nav>
  );
}

/* ─── Hero ───────────────────────────────────────────────────────── */
function Hero() {
  return (
    <section style={{
      background: "linear-gradient(160deg, #0B1D35 0%, #112847 55%, #0B1D35 100%)",
      minHeight: "100vh",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      padding: "120px 24px 80px",
      position: "relative",
      overflow: "hidden",
    }}>
      {/* Subtle background texture */}
      <div style={{
        position: "absolute", inset: 0, opacity: 0.04,
        backgroundImage: "radial-gradient(circle at 25% 25%, #C4953A 0%, transparent 50%), radial-gradient(circle at 75% 75%, #C4953A 0%, transparent 50%)",
      }} />

      {/* Gold accent line top */}
      <div style={{
        position: "absolute", top: 0, left: "50%", transform: "translateX(-50%)",
        width: 1, height: 80, background: "linear-gradient(to bottom, transparent, #C4953A)",
      }} />

      <div style={{ maxWidth: 820, margin: "0 auto", textAlign: "center", position: "relative" }}>
        {/* Eyebrow */}
        <div style={{
          display: "inline-flex", alignItems: "center", gap: 8,
          padding: "6px 14px",
          background: "rgba(196,149,58,0.12)",
          border: "1px solid rgba(196,149,58,0.25)",
          borderRadius: 9999,
          marginBottom: 32,
        }}>
          <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#C4953A" }} />
          <span style={{ fontSize: "0.8125rem", fontWeight: 500, color: "#DEB96E", letterSpacing: "0.04em" }}>
            NCA-Compliant  &bull;  POPIA-Secure  &bull;  All 4 SA Bureaus
          </span>
        </div>

        {/* Headline */}
        <h1 className="font-display" style={{
          fontSize: "clamp(2.5rem, 6vw, 4.25rem)",
          fontWeight: 700,
          color: "#FFFFFF",
          lineHeight: 1.12,
          letterSpacing: "-0.02em",
          marginBottom: 24,
        }}>
          Repair your credit.{" "}
          <span style={{ color: "#C4953A", fontStyle: "italic" }}>Own</span>{" "}
          your future.
        </h1>

        {/* Sub-headline */}
        <p style={{
          fontSize: "clamp(1rem, 2vw, 1.1875rem)",
          color: "#94A3B8",
          lineHeight: 1.7,
          maxWidth: 580,
          margin: "0 auto 40px",
        }}>
          South Africa&apos;s most trusted credit repair platform. Dispute inaccuracies,
          track your cases, and rebuild your financial future — in plain language,
          in your language.
        </p>

        {/* CTAs */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 12, flexWrap: "wrap" }}>
          <Link href="/register" style={{
            display: "inline-flex", alignItems: "center", gap: 8,
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
            onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.transform = "translateY(-1px)"; (e.currentTarget as HTMLElement).style.boxShadow = "0 6px 24px rgba(196,149,58,0.45)"; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.transform = "none"; (e.currentTarget as HTMLElement).style.boxShadow = "0 4px 20px rgba(196,149,58,0.35)"; }}
          >
            Start for free
            <ArrowRight />
          </Link>
          <a href="#how-it-works" style={{
            display: "inline-flex", alignItems: "center", gap: 8,
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
            onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.12)"; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.07)"; }}
          >
            See how it works
          </a>
        </div>

        {/* Social proof */}
        <p style={{ marginTop: 48, fontSize: "0.8125rem", color: "#64748B", letterSpacing: "0.01em" }}>
          Trusted by South Africans repairing their credit  &mdash;  no credit card required
        </p>

        {/* Bureau logos row */}
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "center",
          gap: 24, marginTop: 20, flexWrap: "wrap",
        }}>
          {["TransUnion", "Experian", "XDS", "Lightstone"].map((b) => (
            <div key={b} style={{
              padding: "6px 14px",
              background: "rgba(255,255,255,0.05)",
              border: "1px solid rgba(255,255,255,0.1)",
              borderRadius: 6,
              fontSize: "0.75rem",
              fontWeight: 600,
              color: "#94A3B8",
              letterSpacing: "0.04em",
            }}>
              {b}
            </div>
          ))}
        </div>
      </div>

      {/* Dashboard preview card */}
      <div style={{
        marginTop: 72,
        maxWidth: 860,
        width: "100%",
        background: "rgba(255,255,255,0.03)",
        border: "1px solid rgba(255,255,255,0.08)",
        borderRadius: 20,
        padding: "2px",
        boxShadow: "0 40px 80px rgba(0,0,0,0.5)",
      }}>
        <div style={{
          background: "#F8F9FA",
          borderRadius: 18,
          overflow: "hidden",
          display: "grid",
          gridTemplateColumns: "220px 1fr",
          minHeight: 320,
        }}>
          {/* Mini sidebar */}
          <div style={{ background: "#FFFFFF", borderRight: "1px solid #E2E8F0", padding: "24px 16px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 28 }}>
              <div style={{ width: 28, height: 28, background: "#0B1D35", borderRadius: 7, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <path d="M8 2C4.69 2 2 4.69 2 8s2.69 6 6 6 6-2.69 6-6" stroke="#C4953A" strokeWidth="1.5" strokeLinecap="round" />
                  <path d="M11.5 2l2 2-2 2" stroke="#C4953A" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  <path d="M5.5 8l1.5 1.5 3-3" stroke="white" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
              <span style={{ fontWeight: 700, fontSize: "0.875rem", color: "#0B1D35" }}>Credo</span>
            </div>
            {[
              { label: "Dashboard", active: true },
              { label: "Credit Report", active: false },
              { label: "My Cases", active: false },
              { label: "Get a Quote", active: false },
              { label: "Documents", active: false },
            ].map((item) => (
              <div key={item.label} style={{
                padding: "8px 10px",
                borderRadius: 7,
                fontSize: "0.8125rem",
                fontWeight: item.active ? 600 : 400,
                color: item.active ? "#0B1D35" : "#64748B",
                background: item.active ? "#E4EDF8" : "transparent",
                marginBottom: 2,
                cursor: "pointer",
              }}>
                {item.label}
              </div>
            ))}
          </div>

          {/* Mini dashboard */}
          <div style={{ padding: "24px" }}>
            <p style={{ fontSize: "0.75rem", color: "#94A3B8", marginBottom: 4, fontWeight: 500, letterSpacing: "0.06em", textTransform: "uppercase" }}>
              Your Credit Overview
            </p>
            <h3 style={{ fontSize: "1.125rem", fontWeight: 700, color: "#0F172A", marginBottom: 20 }}>
              Good morning, Sipho
            </h3>

            {/* Score cards row */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10, marginBottom: 20 }}>
              {[
                { name: "TransUnion", score: 648, color: "#D97706" },
                { name: "Experian", score: 622, color: "#D97706" },
                { name: "XDS", score: 671, color: "#059669" },
                { name: "Lightstone", score: 635, color: "#D97706" },
              ].map((b) => (
                <div key={b.name} style={{
                  background: "#FFFFFF",
                  border: "1px solid #E2E8F0",
                  borderRadius: 10,
                  padding: "12px 10px",
                  textAlign: "center",
                }}>
                  <div style={{ fontSize: "1.25rem", fontWeight: 700, color: b.color }}>
                    {b.score}
                  </div>
                  <div style={{ fontSize: "0.65rem", color: "#94A3B8", fontWeight: 500, marginTop: 2 }}>
                    {b.name}
                  </div>
                </div>
              ))}
            </div>

            {/* Active case pill */}
            <div style={{
              background: "#FFFFFF",
              border: "1px solid #E2E8F0",
              borderRadius: 10,
              padding: "12px 16px",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}>
              <div>
                <p style={{ fontSize: "0.8125rem", fontWeight: 600, color: "#0F172A", margin: 0 }}>
                  Judgment Removal — Standard Bank
                </p>
                <p style={{ fontSize: "0.7rem", color: "#94A3B8", margin: "2px 0 0" }}>
                  In progress &bull; Step 3 of 7
                </p>
              </div>
              <div style={{
                padding: "3px 10px",
                background: "#FFFBEB",
                color: "#D97706",
                borderRadius: 9999,
                fontSize: "0.7rem",
                fontWeight: 600,
              }}>
                14 days left
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ─── Trust Bar ──────────────────────────────────────────────────── */
function TrustBar() {
  const items = [
    { icon: "⚖️", label: "NCA Section 72 Compliant" },
    { icon: "🛡️", label: "POPIA Certified" },
    { icon: "📋", label: "NCR Registered" },
    { icon: "🏦", label: "All 4 SA Bureaus" },
    { icon: "🔒", label: "AES-256 Encrypted" },
    { icon: "🇿🇦", label: "Hosted in South Africa" },
  ];

  return (
    <div style={{
      background: "#FFFFFF",
      borderBottom: "1px solid #E2E8F0",
      padding: "16px 24px",
      overflowX: "auto",
    }}>
      <div style={{
        maxWidth: 1200, margin: "0 auto",
        display: "flex", alignItems: "center", justifyContent: "center",
        gap: "clamp(20px, 4vw, 48px)",
        flexWrap: "wrap",
      }}>
        {items.map((item) => (
          <div key={item.label} style={{
            display: "flex", alignItems: "center", gap: 8,
            fontSize: "0.8125rem", fontWeight: 500, color: "#475569",
            whiteSpace: "nowrap",
          }}>
            <span>{item.icon}</span>
            <span>{item.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ─── How It Works ───────────────────────────────────────────────── */
function HowItWorks() {
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
    <section id="how-it-works" style={{ padding: "96px 24px", background: "#F8F9FA" }}>
      <div style={{ maxWidth: 1200, margin: "0 auto" }}>
        <div style={{ textAlign: "center", marginBottom: 64 }}>
          <span className="section-label">Process</span>
          <h2 className="font-display" style={{
            fontSize: "clamp(1.875rem, 4vw, 2.75rem)",
            fontWeight: 700,
            color: "#0F172A",
            marginTop: 12,
            letterSpacing: "-0.02em",
          }}>
            How it works
          </h2>
          <p style={{ marginTop: 16, fontSize: "1.0625rem", color: "#64748B", maxWidth: 500, margin: "16px auto 0" }}>
            From registration to a repaired credit profile — a clear, guided journey.
          </p>
        </div>

        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
          gap: 2,
        }}>
          {steps.map((step, i) => (
            <div key={step.number} style={{
              background: "#FFFFFF",
              border: "1px solid #E2E8F0",
              borderRadius: i === 0 ? "12px 0 0 12px" : i === steps.length - 1 ? "0 12px 12px 0" : "0",
              padding: "36px 32px",
              position: "relative",
              borderLeft: i > 0 ? "none" : undefined,
            }}>
              <div style={{
                fontSize: "3rem",
                fontWeight: 800,
                color: "#E2E8F0",
                lineHeight: 1,
                marginBottom: 20,
                fontFamily: "var(--font-playfair), Georgia, serif",
              }}>
                {step.number}
              </div>
              <div style={{
                width: 36, height: 3,
                background: "#C4953A",
                borderRadius: 2,
                marginBottom: 20,
              }} />
              <h3 style={{ fontSize: "1.0625rem", fontWeight: 600, color: "#0F172A", marginBottom: 12 }}>
                {step.title}
              </h3>
              <p style={{ fontSize: "0.9375rem", color: "#64748B", lineHeight: 1.65 }}>
                {step.description}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ─── Features ───────────────────────────────────────────────────── */
function Features() {
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
    <section id="features" style={{ padding: "96px 24px", background: "#FFFFFF" }}>
      <div style={{ maxWidth: 1200, margin: "0 auto" }}>
        <div style={{ textAlign: "center", marginBottom: 64 }}>
          <span className="section-label">Platform</span>
          <h2 className="font-display" style={{
            fontSize: "clamp(1.875rem, 4vw, 2.75rem)",
            fontWeight: 700,
            color: "#0F172A",
            marginTop: 12,
            letterSpacing: "-0.02em",
          }}>
            Everything you need to repair your credit
          </h2>
          <p style={{ marginTop: 16, fontSize: "1.0625rem", color: "#64748B", maxWidth: 520, margin: "16px auto 0" }}>
            Purpose-built for South Africa. Every feature designed around the NCA,
            POPIA, and the four SA credit bureaus.
          </p>
        </div>

        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))",
          gap: 24,
        }}>
          {features.map((f) => (
            <div key={f.title} className="credo-card" style={{ padding: "28px 28px" }}>
              <div style={{
                width: 44, height: 44,
                background: "#E4EDF8",
                borderRadius: 10,
                display: "flex", alignItems: "center", justifyContent: "center",
                color: "#0B1D35",
                marginBottom: 20,
              }}>
                {f.icon}
              </div>
              <h3 style={{ fontSize: "1rem", fontWeight: 600, color: "#0F172A", marginBottom: 10 }}>
                {f.title}
              </h3>
              <p style={{ fontSize: "0.9375rem", color: "#64748B", lineHeight: 1.65 }}>
                {f.description}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ─── Pricing ────────────────────────────────────────────────────── */
function Pricing() {
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
      description: "For consumers who want the complete credit repair experience.",
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
    <section id="pricing" style={{ padding: "96px 24px", background: "#F8F9FA" }}>
      <div style={{ maxWidth: 1100, margin: "0 auto" }}>
        <div style={{ textAlign: "center", marginBottom: 64 }}>
          <span className="section-label">Pricing</span>
          <h2 className="font-display" style={{
            fontSize: "clamp(1.875rem, 4vw, 2.75rem)",
            fontWeight: 700,
            color: "#0F172A",
            marginTop: 12,
            letterSpacing: "-0.02em",
          }}>
            Simple, transparent pricing
          </h2>
          <p style={{ marginTop: 16, fontSize: "1.0625rem", color: "#64748B" }}>
            Cancel anytime. No hidden fees.
          </p>
        </div>

        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
          gap: 20,
          alignItems: "start",
        }}>
          {tiers.map((tier) => (
            <div key={tier.name} style={{
              background: tier.highlight ? "#0B1D35" : "#FFFFFF",
              border: tier.highlight ? "2px solid #C4953A" : "1px solid #E2E8F0",
              borderRadius: 16,
              padding: "36px 28px",
              position: "relative",
              boxShadow: tier.highlight ? "0 20px 40px rgba(11,29,53,0.2)" : "0 1px 3px rgba(0,0,0,0.06)",
              transform: tier.highlight ? "scale(1.02)" : "none",
            }}>
              {tier.highlight && (
                <div style={{
                  position: "absolute", top: -14, left: "50%", transform: "translateX(-50%)",
                  background: "#C4953A",
                  color: "#FFFFFF",
                  fontSize: "0.75rem",
                  fontWeight: 700,
                  letterSpacing: "0.06em",
                  padding: "5px 16px",
                  borderRadius: 9999,
                  textTransform: "uppercase",
                }}>
                  Most Popular
                </div>
              )}

              <div style={{ marginBottom: 24 }}>
                <p style={{ fontSize: "0.875rem", fontWeight: 600, color: tier.highlight ? "#C4953A" : "#64748B", letterSpacing: "0.04em", textTransform: "uppercase", marginBottom: 8 }}>
                  {tier.name}
                </p>
                <div style={{ display: "flex", alignItems: "baseline", gap: 4, marginBottom: 8 }}>
                  <span style={{ fontSize: "2.5rem", fontWeight: 800, color: tier.highlight ? "#FFFFFF" : "#0F172A", lineHeight: 1 }}>
                    {tier.price}
                  </span>
                  <span style={{ fontSize: "0.875rem", color: tier.highlight ? "#94A3B8" : "#64748B" }}>
                    /{tier.period}
                  </span>
                </div>
                <p style={{ fontSize: "0.875rem", color: tier.highlight ? "#94A3B8" : "#64748B", lineHeight: 1.5 }}>
                  {tier.description}
                </p>
              </div>

              <Link href="/register" style={{
                display: "flex", alignItems: "center", justifyContent: "center",
                width: "100%", padding: "11px 0",
                background: tier.highlight ? "#C4953A" : "#0B1D35",
                color: "#FFFFFF",
                fontWeight: 600,
                fontSize: "0.9375rem",
                borderRadius: 9,
                textDecoration: "none",
                marginBottom: 28,
                transition: "opacity 150ms",
              }}>
                {tier.cta}
              </Link>

              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {tier.features.map((f) => (
                  <div key={f} style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
                    <div style={{
                      width: 18, height: 18, borderRadius: "50%",
                      background: tier.highlight ? "rgba(196,149,58,0.2)" : "#E4EDF8",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      flexShrink: 0, marginTop: 1,
                      color: tier.highlight ? "#C4953A" : "#0B1D35",
                    }}>
                      <CheckIcon size={10} />
                    </div>
                    <span style={{ fontSize: "0.875rem", color: tier.highlight ? "#CBD5E1" : "#374151", lineHeight: 1.5 }}>
                      {f}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Enterprise CTA */}
        <div style={{
          marginTop: 48,
          background: "#FFFFFF",
          border: "1px solid #E2E8F0",
          borderRadius: 16,
          padding: "28px 36px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: 20,
        }}>
          <div>
            <h3 style={{ fontSize: "1.125rem", fontWeight: 700, color: "#0F172A", marginBottom: 6 }}>
              For credit repair firms, dealerships &amp; financial institutions
            </h3>
            <p style={{ fontSize: "0.9375rem", color: "#64748B" }}>
              White-label Credo under your brand. Custom bureau API keys, GHL integration, and your own client portal.
            </p>
          </div>
          <Link href="/contact" className="btn-primary" style={{ whiteSpace: "nowrap", padding: "12px 24px" }}>
            Talk to us
          </Link>
        </div>
      </div>
    </section>
  );
}

/* ─── CTA Section ────────────────────────────────────────────────── */
function CTASection() {
  return (
    <section style={{
      background: "linear-gradient(135deg, #0B1D35 0%, #112847 100%)",
      padding: "96px 24px",
      textAlign: "center",
    }}>
      <div style={{ maxWidth: 640, margin: "0 auto" }}>
        <h2 className="font-display" style={{
          fontSize: "clamp(1.875rem, 4vw, 2.75rem)",
          fontWeight: 700,
          color: "#FFFFFF",
          letterSpacing: "-0.02em",
          marginBottom: 20,
        }}>
          Your credit repair journey{" "}
          <span style={{ color: "#C4953A", fontStyle: "italic" }}>starts today.</span>
        </h2>
        <p style={{ fontSize: "1.0625rem", color: "#94A3B8", lineHeight: 1.7, marginBottom: 40 }}>
          Over 11 million South Africans have adverse credit listings.
          You are entitled to dispute inaccurate information — and we make it simple.
        </p>
        <Link href="/register" style={{
          display: "inline-flex", alignItems: "center", gap: 10,
          padding: "14px 32px",
          background: "#C4953A",
          color: "#FFFFFF",
          fontWeight: 600,
          fontSize: "1rem",
          borderRadius: 10,
          textDecoration: "none",
          boxShadow: "0 4px 24px rgba(196,149,58,0.35)",
          letterSpacing: "0.01em",
        }}>
          Create your free account
          <ArrowRight size={18} />
        </Link>
        <p style={{ marginTop: 20, fontSize: "0.8125rem", color: "#475569" }}>
          Free forever &bull; No credit card &bull; Cancel anytime
        </p>
      </div>
    </section>
  );
}

/* ─── Footer ─────────────────────────────────────────────────────── */
function Footer() {
  return (
    <footer style={{ background: "#0B1D35", padding: "48px 24px 32px", borderTop: "1px solid rgba(255,255,255,0.06)" }}>
      <div style={{ maxWidth: 1200, margin: "0 auto" }}>
        <div style={{
          display: "grid",
          gridTemplateColumns: "2fr repeat(3, 1fr)",
          gap: 40,
          marginBottom: 48,
        }}>
          {/* Brand */}
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
              <div style={{ width: 32, height: 32, background: "rgba(196,149,58,0.15)", border: "1px solid rgba(196,149,58,0.3)", borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                  <path d="M9 2C5.69 2 3 4.69 3 9s2.69 7 6 7 6-2.69 6-6" stroke="#C4953A" strokeWidth="1.5" strokeLinecap="round" />
                  <path d="M12.5 2l2 2-2 2" stroke="#C4953A" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  <path d="M6 9l2 2 3.5-3.5" stroke="white" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
              <span style={{ fontWeight: 700, fontSize: "1rem", color: "#FFFFFF" }}>Credo</span>
            </div>
            <p style={{ fontSize: "0.875rem", color: "#64748B", lineHeight: 1.7, maxWidth: 260 }}>
              South Africa&apos;s trusted credit repair platform. NCA-compliant, POPIA-secure.
            </p>
            <div style={{ marginTop: 20, display: "flex", gap: 8 }}>
              {["NCR", "NCA", "POPIA"].map((b) => (
                <span key={b} style={{
                  padding: "3px 10px",
                  background: "rgba(196,149,58,0.1)",
                  border: "1px solid rgba(196,149,58,0.2)",
                  borderRadius: 4,
                  fontSize: "0.6875rem",
                  fontWeight: 600,
                  color: "#C4953A",
                  letterSpacing: "0.04em",
                }}>
                  {b}
                </span>
              ))}
            </div>
          </div>

          {/* Links */}
          {[
            {
              title: "Product",
              links: ["Features", "Pricing", "Credit Bureaus", "AI Coach", "Document Vault"],
            },
            {
              title: "Legal",
              links: ["Privacy Policy", "Terms of Service", "POPIA Notice", "Cookie Policy"],
            },
            {
              title: "Company",
              links: ["About Us", "For Firms", "Contact", "Blog"],
            },
          ].map((col) => (
            <div key={col.title}>
              <p style={{ fontSize: "0.75rem", fontWeight: 600, color: "#94A3B8", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 16 }}>
                {col.title}
              </p>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {col.links.map((l) => (
                  <a key={l} href="#" style={{ fontSize: "0.875rem", color: "#64748B", textDecoration: "none", transition: "color 150ms" }}
                    onMouseEnter={(e) => { (e.target as HTMLElement).style.color = "#E2E8F0"; }}
                    onMouseLeave={(e) => { (e.target as HTMLElement).style.color = "#64748B"; }}
                  >
                    {l}
                  </a>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div style={{
          borderTop: "1px solid rgba(255,255,255,0.06)",
          paddingTop: 24,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: 12,
        }}>
          <p style={{ fontSize: "0.8125rem", color: "#475569" }}>
            &copy; {new Date().getFullYear()} Credo. All rights reserved. Registered in South Africa.
          </p>
          <p style={{ fontSize: "0.8125rem", color: "#475569" }}>
            Regulated under the National Credit Act No. 34 of 2005
          </p>
        </div>
      </div>
    </footer>
  );
}

/* ─── Page ───────────────────────────────────────────────────────── */
export default function LandingPage() {
  return (
    <>
      <Nav />
      <main>
        <Hero />
        <TrustBar />
        <HowItWorks />
        <Features />
        <Pricing />
        <CTASection />
      </main>
      <Footer />
    </>
  );
}

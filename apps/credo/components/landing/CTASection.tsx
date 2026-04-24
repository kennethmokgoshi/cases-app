"use client";

import Link from "next/link";
import { ArrowRight } from "../icons";

export function CTASection() {
  return (
    <section
      style={{
        background: "linear-gradient(135deg, #0B1D35 0%, #112847 100%)",
        padding: "96px 24px",
        textAlign: "center",
      }}
    >
      <div style={{ maxWidth: 640, margin: "0 auto" }}>
        <h2
          className="font-display"
          style={{
            fontSize: "clamp(1.875rem, 4vw, 2.75rem)",
            fontWeight: 700,
            color: "#FFFFFF",
            letterSpacing: "-0.02em",
            marginBottom: 20,
          }}
        >
          Your credit repair journey{" "}
          <span style={{ color: "#C4953A", fontStyle: "italic" }}>
            starts today.
          </span>
        </h2>
        <p
          style={{
            fontSize: "1.0625rem",
            color: "#94A3B8",
            lineHeight: 1.7,
            marginBottom: 40,
          }}
        >
          Over 11 million South Africans have adverse credit listings. You are
          entitled to dispute inaccurate information — and we make it simple.
        </p>
        <Link
          href="/register"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 10,
            padding: "14px 32px",
            background: "#C4953A",
            color: "#FFFFFF",
            fontWeight: 600,
            fontSize: "1rem",
            borderRadius: 10,
            textDecoration: "none",
            boxShadow: "0 4px 24px rgba(196,149,58,0.35)",
            letterSpacing: "0.01em",
          }}
        >
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

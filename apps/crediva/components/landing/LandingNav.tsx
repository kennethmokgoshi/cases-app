"use client";

import Link from "next/link";
import { useState, useEffect } from "react";
import { MenuIcon, CloseIcon } from "../icons";

export function LandingNav() {
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    const handler = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", handler, { passive: true });
    return () => window.removeEventListener("scroll", handler);
  }, []);

  // When not scrolled we're over the dark hero — use white logo + light text
  // When scrolled we're on a white/light background — use dark logo + dark text
  const isDark = !scrolled;

  return (
    <nav
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        zIndex: 100,
        background: scrolled ? "rgba(255,255,255,0.95)" : "transparent",
        backdropFilter: scrolled ? "blur(12px)" : "none",
        borderBottom: scrolled ? "1px solid #E2E8F0" : "1px solid transparent",
        transition: "all 300ms cubic-bezier(0.4,0,0.2,1)",
      }}
    >
      <div
        style={{
          maxWidth: 1200,
          margin: "0 auto",
          padding: "0 24px",
          height: 68,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        {/* Logo — white version on dark hero, colour version on white nav */}
        <Link
          href="/"
          style={{
            display: "flex",
            alignItems: "center",
            textDecoration: "none",
          }}
        >
          <img
            src={isDark ? "/logo-white.png" : "/logo.png"}
            alt="Crediva"
            style={{ height: 36, width: "auto", transition: "opacity 300ms" }}
          />
        </Link>

        {/* Desktop links */}
        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
          {["Features", "How It Works", "Pricing", "For Firms"].map((item) => (
            <a
              key={item}
              href={`#${item.toLowerCase().replace(/ /g, "-")}`}
              style={{
                padding: "6px 14px",
                fontSize: "0.875rem",
                fontWeight: 500,
                color: isDark ? "rgba(255,255,255,0.85)" : "#475569",
                textDecoration: "none",
                borderRadius: 6,
                transition: "color 150ms, background-color 150ms",
              }}
            >
              {item}
            </a>
          ))}
        </div>

        {/* CTA */}
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Link
            href="/login"
            style={{
              fontSize: "0.875rem",
              color: isDark ? "rgba(255,255,255,0.85)" : "#475569",
              textDecoration: "none",
              fontWeight: 500,
              transition: "color 300ms",
            }}
          >
            Sign in
          </Link>
          <Link
            href="/register"
            className="btn-primary"
            style={{ fontSize: "0.875rem", padding: "8px 18px" }}
          >
            Get started free
          </Link>
          <button
            onClick={() => setMobileOpen(!mobileOpen)}
            style={{
              display: "none",
              background: "none",
              border: "none",
              cursor: "pointer",
              color: isDark ? "rgba(255,255,255,0.85)" : "#475569",
              padding: 6,
              transition: "color 300ms",
            }}
          >
            {mobileOpen ? <CloseIcon /> : <MenuIcon />}
          </button>
        </div>
      </div>

      {/* Mobile menu (Hidden in this version to stay light, can be added later) */}
    </nav>
  );
}

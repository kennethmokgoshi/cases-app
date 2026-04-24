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
        {/* Logo */}
        <Link
          href="/"
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            textDecoration: "none",
          }}
        >
          <div
            style={{
              width: 36,
              height: 36,
              background: "#0B1D35",
              borderRadius: 9,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
              <path
                d="M10 3C6.13 3 3 6.13 3 10s3.13 7 7 7 7-3.13 7-7"
                stroke="#C4953A"
                strokeWidth="2"
                strokeLinecap="round"
              />
              <path
                d="M14 3l3 3-3 3"
                stroke="#C4953A"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <path
                d="M7 10l2 2 4-4"
                stroke="white"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>
          <span
            style={{
              fontWeight: 700,
              fontSize: "1.125rem",
              color: "#0B1D35",
              letterSpacing: "-0.01em",
            }}
          >
            Credo
          </span>
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
                color: "#475569",
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
              color: "#475569",
              textDecoration: "none",
              fontWeight: 500,
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
              color: "#475569",
              padding: 6,
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

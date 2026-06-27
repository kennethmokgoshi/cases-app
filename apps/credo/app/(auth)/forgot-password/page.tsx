"use client";

import Link from "next/link";
import { useState } from "react";

export default function ForgotPasswordPage() {
  const [idNumber, setIdNumber] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (idNumber.length !== 13) {
      setError("Please enter your full 13-digit ID number.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/consumer/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idNumber }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Something went wrong. Please try again.");
        setLoading(false);
        return;
      }
      setSubmitted(true);
    } catch {
      setError("Network error. Please check your connection and try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#F8F9FA", padding: "24px 16px" }}>
      <div style={{ width: "100%", maxWidth: 420 }}>
        {/* Logo */}
        <div style={{ textAlign: "center", marginBottom: 32 }}>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 10 }}>
            <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
              <rect width="32" height="32" rx="8" fill="#0B1D35"/>
              <path d="M10 22 Q16 8 22 22" stroke="#C4953A" strokeWidth="2.5" strokeLinecap="round" fill="none"/>
              <path d="M13 18 L19 18" stroke="#C4953A" strokeWidth="2" strokeLinecap="round"/>
            </svg>
            <span style={{ fontSize: "1.25rem", fontWeight: 700, color: "#0B1D35", letterSpacing: "-0.02em", fontFamily: "var(--font-playfair), Georgia, serif" }}>Credo</span>
          </div>
        </div>

        <div style={{ background: "#FFFFFF", borderRadius: 16, padding: "40px 36px", boxShadow: "0 1px 3px rgba(0,0,0,0.06), 0 4px 24px rgba(0,0,0,0.04)" }}>
          {submitted ? (
            <div style={{ textAlign: "center" }}>
              <div style={{ width: 56, height: 56, borderRadius: "50%", background: "#F0FDF4", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 20px" }}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                  <path d="M20 6L9 17l-5-5" stroke="#16A34A" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </div>
              <h2 style={{ fontSize: "1.375rem", fontWeight: 700, color: "#0F172A", margin: "0 0 10px", fontFamily: "var(--font-playfair), Georgia, serif" }}>Check your email</h2>
              <p style={{ fontSize: "0.9375rem", color: "#64748B", margin: "0 0 28px", lineHeight: 1.6 }}>
                If a Credo profile exists for ID <strong>{idNumber}</strong> and has an email on file, a password reset link has been sent. The link expires in 7 days.
              </p>
              <Link href="/login" style={{ display: "block", textAlign: "center", padding: "12px 24px", background: "#0B1D35", color: "#FFFFFF", borderRadius: 9, fontSize: "0.9375rem", fontWeight: 600, textDecoration: "none" }}>
                Back to login
              </Link>
            </div>
          ) : (
            <>
              <h2 style={{ fontSize: "1.5rem", fontWeight: 700, color: "#0F172A", letterSpacing: "-0.02em", margin: "0 0 8px", fontFamily: "var(--font-playfair), Georgia, serif" }}>
                Reset your password
              </h2>
              <p style={{ fontSize: "0.9375rem", color: "#64748B", margin: "0 0 28px" }}>
                Enter your 13-digit ID number and we&apos;ll email a reset link to the address on your profile.
              </p>

              {error && (
                <div style={{ background: "#FEF2F2", border: "1px solid #FECACA", borderRadius: 9, padding: "10px 14px", marginBottom: 20 }}>
                  <p style={{ fontSize: "0.8125rem", color: "#DC2626", margin: 0 }}>{error}</p>
                </div>
              )}

              <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 20 }}>
                <div>
                  <label style={{ display: "block", fontSize: "0.8125rem", fontWeight: 600, color: "#374151", marginBottom: 6, letterSpacing: "0.02em", textTransform: "uppercase" }}>
                    ID number
                  </label>
                  <input
                    type="text"
                    inputMode="numeric"
                    className="credo-input"
                    placeholder="8001015009087"
                    value={idNumber}
                    onChange={e => setIdNumber(e.target.value.replace(/\D/g, "").slice(0, 13))}
                    maxLength={13}
                    required
                  />
                </div>

                <button
                  type="submit"
                  disabled={loading || idNumber.length !== 13}
                  style={{
                    padding: "13px 24px", background: loading || idNumber.length !== 13 ? "#94A3B8" : "#0B1D35",
                    color: "#FFFFFF", border: "none", borderRadius: 9,
                    fontSize: "0.9375rem", fontWeight: 600, cursor: loading || idNumber.length !== 13 ? "not-allowed" : "pointer",
                    transition: "background 150ms",
                  }}
                >
                  {loading ? "Sending…" : "Send reset link"}
                </button>
              </form>

              <p style={{ textAlign: "center", marginTop: 20, fontSize: "0.875rem", color: "#64748B" }}>
                Remembered it?{" "}
                <Link href="/login" style={{ color: "#0B1D35", fontWeight: 600, textDecoration: "none" }}>Back to login</Link>
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

"use client";

import Link from "next/link";
import { useState, useRef } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";

export default function OtpPage() {
  const [otp, setOtp] = useState(["", "", "", "", "", ""]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputs = useRef<(HTMLInputElement | null)[]>([]);
  const router = useRouter();

  const handleChange = (index: number, value: string) => {
    if (!/^\d?$/.test(value)) return;
    const next = [...otp];
    next[index] = value;
    setOtp(next);
    if (value && index < 5) inputs.current[index + 1]?.focus();
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (e.key === "Backspace" && !otp[index] && index > 0) {
      inputs.current[index - 1]?.focus();
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const code = otp.join("");
    if (code.length < 6) return;
    setLoading(true);
    setError(null);
    // OTP verification — placeholder until GHL OTP is wired
    await new Promise(r => setTimeout(r, 1000));
    setError("OTP login is not yet configured. Please use email & password.");
    setLoading(false);
  };

  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#F8F9FA", padding: "24px 16px" }}>
      <div style={{ width: "100%", maxWidth: 400 }}>
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
          <h2 style={{ fontSize: "1.5rem", fontWeight: 700, color: "#0F172A", letterSpacing: "-0.02em", margin: "0 0 8px", fontFamily: "var(--font-playfair), Georgia, serif" }}>
            Enter OTP
          </h2>
          <p style={{ fontSize: "0.9375rem", color: "#64748B", margin: "0 0 28px" }}>
            We sent a 6-digit code to your phone number.
          </p>

          {error && (
            <div style={{ background: "#FEF2F2", border: "1px solid #FECACA", borderRadius: 9, padding: "10px 14px", marginBottom: 20, fontSize: "0.8125rem", color: "#DC2626" }}>
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit}>
            <div style={{ display: "flex", gap: 10, justifyContent: "center", marginBottom: 28 }}>
              {otp.map((digit, i) => (
                <input
                  key={i}
                  ref={el => { inputs.current[i] = el; }}
                  type="text"
                  inputMode="numeric"
                  maxLength={1}
                  value={digit}
                  onChange={e => handleChange(i, e.target.value)}
                  onKeyDown={e => handleKeyDown(i, e)}
                  style={{
                    width: 48, height: 56, textAlign: "center", fontSize: "1.25rem", fontWeight: 700,
                    border: "1.5px solid #E2E8F0", borderRadius: 9, outline: "none",
                    color: "#0F172A", background: "#FAFAFA", transition: "border-color 150ms",
                  }}
                  onFocus={e => e.target.style.borderColor = "#C4953A"}
                  onBlur={e => e.target.style.borderColor = "#E2E8F0"}
                />
              ))}
            </div>

            <button
              type="submit"
              disabled={loading || otp.join("").length < 6}
              style={{
                width: "100%", padding: "13px 24px",
                background: loading || otp.join("").length < 6 ? "#94A3B8" : "#0B1D35",
                color: "#FFFFFF", border: "none", borderRadius: 9,
                fontSize: "0.9375rem", fontWeight: 600,
                cursor: loading || otp.join("").length < 6 ? "not-allowed" : "pointer",
              }}
            >
              {loading ? "Verifying…" : "Verify OTP"}
            </button>
          </form>

          <p style={{ textAlign: "center", marginTop: 20, fontSize: "0.875rem", color: "#64748B" }}>
            <Link href="/login" style={{ color: "#0B1D35", fontWeight: 600, textDecoration: "none" }}>← Use password instead</Link>
          </p>
        </div>
      </div>
    </div>
  );
}

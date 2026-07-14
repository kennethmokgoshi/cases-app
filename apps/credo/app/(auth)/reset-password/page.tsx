"use client";

import Link from "next/link";
import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";

const CARD: React.CSSProperties = {
  background: "#FFFFFF",
  borderRadius: 16,
  padding: "40px 36px",
  boxShadow: "0 1px 3px rgba(0,0,0,0.06), 0 4px 24px rgba(0,0,0,0.04)",
};

function Logo() {
  return (
    <div style={{ textAlign: "center", marginBottom: 32 }}>
      <div style={{ display: "inline-flex", alignItems: "center", gap: 10 }}>
        <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
          <rect width="32" height="32" rx="8" fill="#0B1D35" />
          <path d="M10 22 Q16 8 22 22" stroke="#C4953A" strokeWidth="2.5" strokeLinecap="round" fill="none" />
          <path d="M13 18 L19 18" stroke="#C4953A" strokeWidth="2" strokeLinecap="round" />
        </svg>
        <span style={{ fontSize: "1.25rem", fontWeight: 700, color: "#0B1D35", letterSpacing: "-0.02em", fontFamily: "var(--font-playfair), Georgia, serif" }}>Crediva</span>
      </div>
    </div>
  );
}

function ResetPasswordForm() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token") || "";

  const [tokenState, setTokenState] = useState<"checking" | "valid" | "invalid">("checking");
  const [tokenError, setTokenError] = useState<string>("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!token) {
      setTokenState("invalid");
      setTokenError("This reset link is missing its token. Please request a new one.");
      return;
    }
    fetch(`/api/consumer/reset-password?token=${encodeURIComponent(token)}`)
      .then((r) => r.json())
      .then((data: { status: string; valid: boolean }) => {
        if (data.valid) {
          setTokenState("valid");
        } else {
          setTokenState("invalid");
          setTokenError(
            data.status === "EXPIRED"
              ? "This reset link has expired. Please request a new one."
              : data.status === "USED"
              ? "This reset link has already been used. Please request a new one."
              : "This reset link is invalid. Please request a new one."
          );
        }
      })
      .catch(() => {
        setTokenState("invalid");
        setTokenError("Could not verify this link. Please try again.");
      });
  }, [token]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 8 || !/[a-z]/.test(password) || !/[A-Z]/.test(password) || !/\d/.test(password)) {
      setError("Password must be at least 8 characters with an uppercase letter, a lowercase letter and a number.");
      return;
    }
    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/consumer/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Could not reset your password.");
        setLoading(false);
        return;
      }
      setDone(true);
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#F8F9FA", padding: "24px 16px" }}>
      <div style={{ width: "100%", maxWidth: 420 }}>
        <Logo />
        <div style={CARD}>
          {tokenState === "checking" && (
            <p style={{ textAlign: "center", color: "#64748B", fontSize: "0.9375rem", margin: 0 }}>Verifying your link…</p>
          )}

          {tokenState === "invalid" && (
            <div style={{ textAlign: "center" }}>
              <h2 style={{ fontSize: "1.375rem", fontWeight: 700, color: "#0F172A", margin: "0 0 10px", fontFamily: "var(--font-playfair), Georgia, serif" }}>Link not valid</h2>
              <p style={{ fontSize: "0.9375rem", color: "#64748B", margin: "0 0 28px", lineHeight: 1.6 }}>{tokenError}</p>
              <Link href="/forgot-password" style={{ display: "block", textAlign: "center", padding: "12px 24px", background: "#0B1D35", color: "#FFFFFF", borderRadius: 9, fontSize: "0.9375rem", fontWeight: 600, textDecoration: "none" }}>
                Request a new link
              </Link>
            </div>
          )}

          {tokenState === "valid" && done && (
            <div style={{ textAlign: "center" }}>
              <div style={{ width: 56, height: 56, borderRadius: "50%", background: "#F0FDF4", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 20px" }}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                  <path d="M20 6L9 17l-5-5" stroke="#16A34A" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
              <h2 style={{ fontSize: "1.375rem", fontWeight: 700, color: "#0F172A", margin: "0 0 10px", fontFamily: "var(--font-playfair), Georgia, serif" }}>Password set</h2>
              <p style={{ fontSize: "0.9375rem", color: "#64748B", margin: "0 0 28px", lineHeight: 1.6 }}>
                You can now log in using your <strong>13-digit ID number</strong> and your new password.
              </p>
              <Link href="/login" style={{ display: "block", textAlign: "center", padding: "12px 24px", background: "#0B1D35", color: "#FFFFFF", borderRadius: 9, fontSize: "0.9375rem", fontWeight: 600, textDecoration: "none" }}>
                Go to login
              </Link>
            </div>
          )}

          {tokenState === "valid" && !done && (
            <>
              <h2 style={{ fontSize: "1.5rem", fontWeight: 700, color: "#0F172A", letterSpacing: "-0.02em", margin: "0 0 8px", fontFamily: "var(--font-playfair), Georgia, serif" }}>
                Choose a new password
              </h2>
              <p style={{ fontSize: "0.9375rem", color: "#64748B", margin: "0 0 28px" }}>
                Set the password you&apos;ll use to log in. Your username is your ID number.
              </p>

              {error && (
                <div style={{ background: "#FEF2F2", border: "1px solid #FECACA", borderRadius: 9, padding: "10px 14px", marginBottom: 20 }}>
                  <p style={{ fontSize: "0.8125rem", color: "#DC2626", margin: 0 }}>{error}</p>
                </div>
              )}

              <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 18 }}>
                <div>
                  <label style={{ display: "block", fontSize: "0.8125rem", fontWeight: 600, color: "#374151", marginBottom: 6, letterSpacing: "0.02em", textTransform: "uppercase" }}>
                    New password
                  </label>
                  <input
                    type={showPassword ? "text" : "password"}
                    className="credo-input"
                    placeholder="8+ chars with upper, lower & number"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete="new-password"
                    required
                  />
                </div>
                <div>
                  <label style={{ display: "block", fontSize: "0.8125rem", fontWeight: 600, color: "#374151", marginBottom: 6, letterSpacing: "0.02em", textTransform: "uppercase" }}>
                    Confirm password
                  </label>
                  <input
                    type={showPassword ? "text" : "password"}
                    className="credo-input"
                    placeholder="Re-enter your password"
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    autoComplete="new-password"
                    required
                  />
                </div>
                <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: "0.8125rem", color: "#64748B", cursor: "pointer" }}>
                  <input type="checkbox" checked={showPassword} onChange={(e) => setShowPassword(e.target.checked)} />
                  Show password
                </label>

                <button
                  type="submit"
                  disabled={loading || password.length < 8 || password !== confirm}
                  style={{
                    padding: "13px 24px",
                    background: loading || password.length < 8 || password !== confirm ? "#94A3B8" : "#0B1D35",
                    color: "#FFFFFF", border: "none", borderRadius: 9,
                    fontSize: "0.9375rem", fontWeight: 600,
                    cursor: loading || password.length < 8 || password !== confirm ? "not-allowed" : "pointer",
                    transition: "background 150ms",
                  }}
                >
                  {loading ? "Saving…" : "Set password & continue"}
                </button>
              </form>
            </>
          )}

          <p style={{ textAlign: "center", marginTop: 20, fontSize: "0.875rem", color: "#64748B" }}>
            <Link href="/login" style={{ color: "#0B1D35", fontWeight: 600, textDecoration: "none" }}>Back to login</Link>
          </p>
        </div>
      </div>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={null}>
      <ResetPasswordForm />
    </Suspense>
  );
}

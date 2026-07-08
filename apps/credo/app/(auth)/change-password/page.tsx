"use client";

import { useState } from "react";
import { signOut } from "next-auth/react";

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
        <span style={{ fontSize: "1.25rem", fontWeight: 700, color: "#0B1D35", letterSpacing: "-0.02em", fontFamily: "var(--font-playfair), Georgia, serif" }}>Credo</span>
      </div>
    </div>
  );
}

function meetsPolicy(password: string): boolean {
  return (
    password.length >= 8 &&
    /[a-z]/.test(password) &&
    /[A-Z]/.test(password) &&
    /\d/.test(password)
  );
}

export default function ChangePasswordPage() {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const canSubmit = !loading && currentPassword.length > 0 && meetsPolicy(newPassword) && newPassword === confirm;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!meetsPolicy(newPassword)) {
      setError("Password must be at least 8 characters with an uppercase letter, a lowercase letter and a number.");
      return;
    }
    if (newPassword !== confirm) {
      setError("Passwords do not match.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/consumer/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Could not change your password.");
        setLoading(false);
        return;
      }
      setDone(true);
      // Re-authenticate with the new password — also refreshes the session
      // token so the must-change-password flag is cleared everywhere.
      setTimeout(() => {
        void signOut({ callbackUrl: "/login" });
      }, 2500);
    } catch {
      setError("Network error. Please try again.");
      setLoading(false);
    }
  };

  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#F8F9FA", padding: "24px 16px" }}>
      <div style={{ width: "100%", maxWidth: 420 }}>
        <Logo />
        <div style={CARD}>
          {done ? (
            <div style={{ textAlign: "center" }}>
              <div style={{ width: 56, height: 56, borderRadius: "50%", background: "#F0FDF4", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 20px" }}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                  <path d="M20 6L9 17l-5-5" stroke="#16A34A" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
              <h2 style={{ fontSize: "1.375rem", fontWeight: 700, color: "#0F172A", margin: "0 0 10px", fontFamily: "var(--font-playfair), Georgia, serif" }}>Password changed</h2>
              <p style={{ fontSize: "0.9375rem", color: "#64748B", margin: 0, lineHeight: 1.6 }}>
                Taking you back to login — sign in with your <strong>13-digit ID number</strong> and your new password.
              </p>
            </div>
          ) : (
            <>
              <h2 style={{ fontSize: "1.5rem", fontWeight: 700, color: "#0F172A", letterSpacing: "-0.02em", margin: "0 0 8px", fontFamily: "var(--font-playfair), Georgia, serif" }}>
                Set your own password
              </h2>
              <p style={{ fontSize: "0.9375rem", color: "#64748B", margin: "0 0 28px", lineHeight: 1.6 }}>
                For your security you must replace your temporary password before continuing.
                You cannot reuse any of your last 5 passwords.
              </p>

              {error && (
                <div style={{ background: "#FEF2F2", border: "1px solid #FECACA", borderRadius: 9, padding: "10px 14px", marginBottom: 20 }}>
                  <p style={{ fontSize: "0.8125rem", color: "#DC2626", margin: 0 }}>{error}</p>
                </div>
              )}

              <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 18 }}>
                <div>
                  <label style={{ display: "block", fontSize: "0.8125rem", fontWeight: 600, color: "#374151", marginBottom: 6, letterSpacing: "0.02em", textTransform: "uppercase" }}>
                    Current password
                  </label>
                  <input
                    type={showPassword ? "text" : "password"}
                    className="credo-input"
                    placeholder="Your current or temporary password"
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    autoComplete="current-password"
                    required
                  />
                </div>
                <div>
                  <label style={{ display: "block", fontSize: "0.8125rem", fontWeight: 600, color: "#374151", marginBottom: 6, letterSpacing: "0.02em", textTransform: "uppercase" }}>
                    New password
                  </label>
                  <input
                    type={showPassword ? "text" : "password"}
                    className="credo-input"
                    placeholder="8+ chars with upper, lower & number"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    autoComplete="new-password"
                    required
                  />
                </div>
                <div>
                  <label style={{ display: "block", fontSize: "0.8125rem", fontWeight: 600, color: "#374151", marginBottom: 6, letterSpacing: "0.02em", textTransform: "uppercase" }}>
                    Confirm new password
                  </label>
                  <input
                    type={showPassword ? "text" : "password"}
                    className="credo-input"
                    placeholder="Re-enter your new password"
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
                  disabled={!canSubmit}
                  style={{
                    padding: "13px 24px",
                    background: !canSubmit ? "#94A3B8" : "#0B1D35",
                    color: "#FFFFFF", border: "none", borderRadius: 9,
                    fontSize: "0.9375rem", fontWeight: 600,
                    cursor: !canSubmit ? "not-allowed" : "pointer",
                    transition: "background 150ms",
                  }}
                >
                  {loading ? "Saving…" : "Change password & continue"}
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

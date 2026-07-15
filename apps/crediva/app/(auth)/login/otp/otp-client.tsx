"use client";

import Link from "next/link";
import { useState, useRef, useEffect } from "react";
import { signIn } from "next-auth/react";
import { useSearchParams } from "next/navigation";

type OtpStep = "username" | "otp";

export default function OtpPageClient() {
  const [step, setStep] = useState<OtpStep>("username");
  const [username, setUsername] = useState("");
  const [otp, setOtp] = useState(["", "", "", "", "", ""]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [remainingAttempts, setRemainingAttempts] = useState<number | null>(null);
  const [resendCountdown, setResendCountdown] = useState(0);
  const inputs = useRef<(HTMLInputElement | null)[]>([]);
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get("callbackUrl") ?? "/dashboard";

  // Resend countdown timer
  useEffect(() => {
    if (resendCountdown <= 0) return;
    const timer = setTimeout(() => setResendCountdown(resendCountdown - 1), 1000);
    return () => clearTimeout(timer);
  }, [resendCountdown]);

  const handleRequestOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username) return;
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/consumer/generate-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? "Failed to send OTP");
        setLoading(false);
        return;
      }

      setStep("otp");
      setResendCountdown(60); // 60-second resend cooldown
      setOtp(["", "", "", "", "", ""]);
      setRemainingAttempts(3);
    } catch {
      setError("Network error. Please check your connection.");
    } finally {
      setLoading(false);
    }
  };

  const handleOtpChange = (index: number, value: string) => {
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

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    const code = otp.join("");
    if (code.length < 6) return;
    setLoading(true);
    setError(null);

    try {
      // First verify OTP
      const verifyRes = await fetch("/api/consumer/verify-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, otpCode: code }),
      });

      const verifyData = await verifyRes.json();

      if (!verifyRes.ok) {
        setError(verifyData.error ?? "OTP verification failed");
        if (verifyData.remainingAttempts !== undefined) {
          setRemainingAttempts(verifyData.remainingAttempts);
        }
        setLoading(false);
        return;
      }

      // OTP verified — now sign in the user
      const signInResult = await signIn("credentials", {
        username,
        password: code, // Use OTP as password (it's verified at this point)
        redirect: false,
      });

      if (signInResult?.error) {
        setError("Authentication failed. Please try again.");
        setLoading(false);
      } else {
        window.location.href = callbackUrl;
      }
    } catch {
      setError("Network error. Please try again.");
      setLoading(false);
    }
  };

  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#F8F9FA", padding: "24px 16px" }}>
      <div style={{ width: "100%", maxWidth: 400 }}>
        <div style={{ textAlign: "center", marginBottom: 32 }}>
          <img src="/logo.png" alt="Crediva" style={{ height: 48, width: "auto", display: "block", margin: "0 auto" }} />
        </div>

        <div style={{ background: "#FFFFFF", borderRadius: 16, padding: "40px 36px", boxShadow: "0 1px 3px rgba(0,0,0,0.06), 0 4px 24px rgba(0,0,0,0.04)" }}>
          {step === "username" ? (
            <>
              <h2 style={{ fontSize: "1.5rem", fontWeight: 700, color: "#0F172A", letterSpacing: "-0.02em", margin: "0 0 8px", fontFamily: "var(--font-playfair), Georgia, serif" }}>
                Sign in with OTP
              </h2>
              <p style={{ fontSize: "0.9375rem", color: "#64748B", margin: "0 0 28px" }}>
                Enter your email or ID number to receive a 6-digit code.
              </p>

              {error && (
                <div style={{ background: "#FEF2F2", border: "1px solid #FECACA", borderRadius: 9, padding: "10px 14px", marginBottom: 20, fontSize: "0.8125rem", color: "#DC2626" }}>
                  {error}
                </div>
              )}

              <form onSubmit={handleRequestOtp} style={{ display: "flex", flexDirection: "column", gap: 20 }}>
                <div>
                  <label style={{ display: "block", fontSize: "0.8125rem", fontWeight: 600, color: "#374151", marginBottom: 6, letterSpacing: "0.02em", textTransform: "uppercase" }}>
                    Email or ID number
                  </label>
                  <input
                    type="text"
                    className="credo-input"
                    placeholder="you@example.co.za or 8001015009087"
                    value={username}
                    onChange={e => setUsername(e.target.value)}
                    required
                    disabled={loading}
                  />
                </div>

                <button
                  type="submit"
                  disabled={loading || !username}
                  style={{
                    padding: "13px 24px",
                    background: loading || !username ? "#94A3B8" : "#0B1D35",
                    color: "#FFFFFF", border: "none", borderRadius: 9,
                    fontSize: "0.9375rem", fontWeight: 600,
                    cursor: loading || !username ? "not-allowed" : "pointer",
                  }}
                >
                  {loading ? "Sending…" : "Send OTP"}
                </button>
              </form>

              <p style={{ textAlign: "center", marginTop: 20, fontSize: "0.875rem", color: "#64748B" }}>
                <Link href="/login" style={{ color: "#0B1D35", fontWeight: 600, textDecoration: "none" }}>← Use password instead</Link>
              </p>
            </>
          ) : (
            <>
              <h2 style={{ fontSize: "1.5rem", fontWeight: 700, color: "#0F172A", letterSpacing: "-0.02em", margin: "0 0 8px", fontFamily: "var(--font-playfair), Georgia, serif" }}>
                Enter OTP
              </h2>
              <p style={{ fontSize: "0.9375rem", color: "#64748B", margin: "0 0 28px" }}>
                We sent a 6-digit code to your registered email address.
              </p>

              {error && (
                <div style={{ background: "#FEF2F2", border: "1px solid #FECACA", borderRadius: 9, padding: "10px 14px", marginBottom: 20, fontSize: "0.8125rem", color: "#DC2626" }}>
                  <p style={{ margin: 0 }}>{error}</p>
                  {remainingAttempts !== null && remainingAttempts > 0 && (
                    <p style={{ margin: "6px 0 0", fontSize: "0.75rem" }}>Remaining attempts: {remainingAttempts}</p>
                  )}
                </div>
              )}

              <form onSubmit={handleVerifyOtp}>
                <div style={{ display: "flex", gap: 10, justifyContent: "center", marginBottom: 28 }}>
                  {otp.map((digit, i) => (
                    <input
                      key={i}
                      ref={el => { inputs.current[i] = el; }}
                      type="text"
                      inputMode="numeric"
                      maxLength={1}
                      value={digit}
                      onChange={e => handleOtpChange(i, e.target.value)}
                      onKeyDown={e => handleKeyDown(i, e)}
                      disabled={loading}
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

              <div style={{ textAlign: "center", marginTop: 20, display: "flex", flexDirection: "column", gap: 12 }}>
                <button
                  type="button"
                  disabled={resendCountdown > 0 || loading}
                  onClick={() => {
                    setStep("username");
                    setOtp(["", "", "", "", "", ""]);
                    setError(null);
                  }}
                  style={{
                    fontSize: "0.875rem",
                    color: resendCountdown > 0 ? "#94A3B8" : "#0B1D35",
                    fontWeight: 600,
                    background: "none",
                    border: "none",
                    cursor: resendCountdown > 0 ? "not-allowed" : "pointer",
                    textDecoration: "underline",
                    padding: 0,
                  }}
                >
                  {resendCountdown > 0 ? `Resend OTP in ${resendCountdown}s` : "Send a new OTP"}
                </button>
                <Link href="/login" style={{ color: "#0B1D35", fontWeight: 600, textDecoration: "none", fontSize: "0.875rem" }}>
                  ← Use password instead
                </Link>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

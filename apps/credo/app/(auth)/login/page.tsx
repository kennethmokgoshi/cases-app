"use client";

import Link from "next/link";
import { useState, Suspense } from "react";
import { signIn } from "next-auth/react";
import { useSearchParams } from "next/navigation";

function LoginForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get("callbackUrl") ?? "/dashboard";

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const result = await signIn("credentials", {
      email,
      password,
      redirect: false,
    });

    if (result?.error) {
      setError("Incorrect email or password. Please try again.");
      setLoading(false);
    } else {
      window.location.href = callbackUrl;
    }
  };

  return (
    <div style={{
      minHeight: "100vh",
      display: "grid",
      gridTemplateColumns: "1fr 1fr",
      background: "#F8F9FA",
    }}>
      {/* Left panel — brand */}
      <div style={{
        background: "linear-gradient(160deg, #0B1D35 0%, #112847 100%)",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        padding: "48px",
        position: "relative",
        overflow: "hidden",
      }}>
        <div style={{
          position: "absolute", inset: 0, opacity: 0.04,
          backgroundImage: "radial-gradient(circle at 20% 80%, #C4953A 0%, transparent 60%)",
          pointerEvents: "none",
        }} />

        <Link href="/" style={{ display: "flex", alignItems: "center", gap: 10, textDecoration: "none", position: "relative" }}>
          <div style={{
            width: 40, height: 40,
            background: "rgba(196,149,58,0.15)",
            border: "1px solid rgba(196,149,58,0.3)",
            borderRadius: 10,
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
              <path d="M11 2.5C6.86 2.5 3.5 5.86 3.5 11s3.36 8.5 7.5 8.5 8.5-3.36 8.5-7.5" stroke="#C4953A" strokeWidth="2" strokeLinecap="round" />
              <path d="M15.5 2.5l3 3-3 3" stroke="#C4953A" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M7.5 11l2.5 2.5 5-5" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <span style={{ fontWeight: 700, fontSize: "1.25rem", color: "#FFFFFF", letterSpacing: "-0.01em" }}>Credo</span>
        </Link>

        <div style={{ position: "relative" }}>
          <div style={{ width: 40, height: 3, background: "#C4953A", borderRadius: 2, marginBottom: 28 }} />
          <blockquote style={{
            fontFamily: "var(--font-playfair), Georgia, serif",
            fontSize: "clamp(1.5rem, 2.5vw, 2rem)",
            fontWeight: 600, color: "#FFFFFF", lineHeight: 1.35, marginBottom: 24, letterSpacing: "-0.01em",
          }}>
            &ldquo;Every South African deserves a second chance at financial freedom.&rdquo;
          </blockquote>
          <p style={{ fontSize: "0.875rem", color: "#64748B" }}>
            Guided by the National Credit Act &bull; Secured by POPIA
          </p>
        </div>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", position: "relative" }}>
          {["TransUnion", "Experian", "XDS", "Lightstone"].map((b) => (
            <span key={b} style={{
              padding: "5px 12px",
              background: "rgba(255,255,255,0.06)",
              border: "1px solid rgba(255,255,255,0.1)",
              borderRadius: 6, fontSize: "0.75rem", fontWeight: 600, color: "#94A3B8", letterSpacing: "0.04em",
            }}>
              {b}
            </span>
          ))}
        </div>
      </div>

      {/* Right panel — form */}
      <div style={{
        display: "flex", flexDirection: "column", justifyContent: "center",
        alignItems: "center", padding: "48px", background: "#FFFFFF",
      }}>
        <div style={{ width: "100%", maxWidth: 400 }}>
          <div style={{ marginBottom: 36 }}>
            <h1 style={{
              fontSize: "1.875rem", fontWeight: 700, color: "#0F172A",
              letterSpacing: "-0.02em", marginBottom: 8,
              fontFamily: "var(--font-playfair), Georgia, serif",
            }}>
              Welcome back
            </h1>
            <p style={{ fontSize: "0.9375rem", color: "#64748B" }}>Sign in to your Credo account</p>
          </div>

          {error && (
            <div style={{
              background: "#FEF2F2", border: "1px solid #FECACA", borderRadius: 9,
              padding: "10px 14px", display: "flex", alignItems: "center", gap: 10, marginBottom: 20,
            }}>
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" style={{ flexShrink: 0 }}>
                <circle cx="8" cy="8" r="6" stroke="#DC2626" strokeWidth="1.3"/>
                <path d="M8 5v3M8 10v.5" stroke="#DC2626" strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
              <p style={{ fontSize: "0.8125rem", color: "#DC2626", margin: 0 }}>{error}</p>
            </div>
          )}

          <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 18 }}>
            <div>
              <label className="credo-label" htmlFor="email">Email address</label>
              <input
                id="email" type="email" className="credo-input"
                placeholder="you@example.co.za"
                value={email} onChange={(e) => setEmail(e.target.value)}
                required autoComplete="email"
              />
            </div>

            <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                <label className="credo-label" htmlFor="password" style={{ margin: 0 }}>Password</label>
                <Link href="/forgot-password" style={{ fontSize: "0.8125rem", color: "#C4953A", textDecoration: "none", fontWeight: 500 }}>
                  Forgot password?
                </Link>
              </div>
              <div style={{ position: "relative" }}>
                <input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  className="credo-input"
                  placeholder="Enter your password"
                  value={password} onChange={(e) => setPassword(e.target.value)}
                  required autoComplete="current-password"
                  style={{ paddingRight: 44 }}
                />
                <button
                  type="button" onClick={() => setShowPassword(!showPassword)}
                  style={{
                    position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)",
                    background: "none", border: "none", cursor: "pointer", color: "#94A3B8", padding: 4,
                    display: "flex", alignItems: "center",
                  }}
                >
                  {showPassword ? (
                    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                      <path d="M2 9s2.5-5 7-5 7 5 7 5-2.5 5-7 5-7-5-7-5z" stroke="currentColor" strokeWidth="1.4" />
                      <circle cx="9" cy="9" r="2" stroke="currentColor" strokeWidth="1.4" />
                      <path d="M3 3l12 12" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
                    </svg>
                  ) : (
                    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                      <path d="M2 9s2.5-5 7-5 7 5 7 5-2.5 5-7 5-7-5-7-5z" stroke="currentColor" strokeWidth="1.4" />
                      <circle cx="9" cy="9" r="2" stroke="currentColor" strokeWidth="1.4" />
                    </svg>
                  )}
                </button>
              </div>
            </div>

            <button
              type="submit" disabled={loading}
              style={{
                marginTop: 4, width: "100%", padding: "12px 0",
                background: loading ? "#94A3B8" : "var(--brand-primary)",
                color: "#FFFFFF", fontWeight: 600, fontSize: "0.9375rem",
                border: "none", borderRadius: 9,
                cursor: loading ? "not-allowed" : "pointer",
                transition: "background-color 150ms, box-shadow 150ms",
                display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                boxShadow: loading ? "none" : "0 4px 14px rgba(11,29,53,0.2)",
              }}
            >
              {loading ? (
                <>
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" style={{ animation: "spin 1s linear infinite" }}>
                    <circle cx="8" cy="8" r="6" stroke="rgba(255,255,255,0.3)" strokeWidth="2" />
                    <path d="M8 2a6 6 0 016 6" stroke="white" strokeWidth="2" strokeLinecap="round" />
                  </svg>
                  Signing in...
                </>
              ) : "Sign in"}
            </button>
          </form>

          <p style={{ textAlign: "center", marginTop: 28, fontSize: "0.875rem", color: "#64748B" }}>
            Don&apos;t have an account?{" "}
            <Link href="/register" style={{ color: "#C4953A", fontWeight: 600, textDecoration: "none" }}>
              Create one for free
            </Link>
          </p>

          <p style={{ textAlign: "center", marginTop: 32, fontSize: "0.75rem", color: "#94A3B8", lineHeight: 1.6 }}>
            By signing in, you agree to our{" "}
            <a href="/terms" style={{ color: "#64748B", textDecoration: "underline" }}>Terms</a>{" "}
            and{" "}
            <a href="/privacy" style={{ color: "#64748B", textDecoration: "underline" }}>Privacy Policy</a>.
            Your data is protected under POPIA.
          </p>
        </div>
      </div>

      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        @media (max-width: 768px) {
          div[style*="grid-template-columns: 1fr 1fr"] { grid-template-columns: 1fr !important; }
          div[style*="background: linear-gradient(160deg, #0B1D35"] { display: none !important; }
        }
      `}</style>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}

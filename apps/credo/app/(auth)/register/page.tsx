"use client";

import Link from "next/link";
import { useState, useRef } from "react";
import { signIn } from "next-auth/react";

type Step = 1 | 2 | 3 | 4;

interface FormData {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  password: string;
  confirmPassword: string;
  language: string;
  idNumber: string;
  province: string;
}

const STEPS = [
  { num: 1, label: "Account"  },
  { num: 2, label: "Identity" },
  { num: 3, label: "Consent"  },
  { num: 4, label: "Done"     },
];

function StepIndicator({ current }: { current: Step }) {
  return (
    <div style={{ display: "flex", alignItems: "center", marginBottom: 36 }}>
      {STEPS.map((s, i) => {
        const done    = s.num < current;
        const active  = s.num === current;
        const pending = s.num > current;
        return (
          <div key={s.num} style={{ display: "flex", alignItems: "center", flex: i < STEPS.length - 1 ? 1 : "none" }}>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
              <div style={{
                width: 32, height: 32, borderRadius: "50%",
                background: done ? "#0B1D35" : active ? "#C4953A" : "#F1F5F9",
                border: pending ? "2px solid #E2E8F0" : "none",
                display: "flex", alignItems: "center", justifyContent: "center",
                transition: "all 200ms",
              }}>
                {done ? (
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                    <path d="M2.5 7l3 3 6-6" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                ) : (
                  <span style={{ fontSize: "0.8125rem", fontWeight: 700, color: active ? "white" : "#94A3B8" }}>
                    {s.num}
                  </span>
                )}
              </div>
              <span style={{
                fontSize: "0.6875rem", fontWeight: 600,
                color: active ? "#0F172A" : done ? "#059669" : "#94A3B8",
                letterSpacing: "0.02em",
              }}>
                {s.label}
              </span>
            </div>
            {i < STEPS.length - 1 && (
              <div style={{
                flex: 1, height: 2, margin: "0 8px",
                background: done ? "#0B1D35" : "#E2E8F0",
                marginBottom: 22, transition: "background-color 300ms",
              }}/>
            )}
          </div>
        );
      })}
    </div>
  );
}

/* ─── Step 1: Account ────────────────────────────────────────────── */
function Step1({ data, onChange, onNext }: {
  data: FormData;
  onChange: (field: keyof FormData, value: string) => void;
  onNext: () => void;
}) {
  const [showPw, setShowPw] = useState(false);
  const [showConfirmPw, setShowConfirmPw] = useState(false);

  const passwordsMatch = data.confirmPassword === "" || data.password === data.confirmPassword;
  const phoneDigits = data.phone.replace(/\D/g, "");
  const phoneValid = phoneDigits === "" || phoneDigits.length === 10;
  const canProceed = data.firstName && data.lastName && data.email && data.password.length >= 8 && data.confirmPassword === data.password && data.confirmPassword !== "" && (phoneDigits === "" || phoneDigits.length === 10);

  return (
    <div>
      <h2 style={{ fontSize: "1.5rem", fontWeight: 700, color: "#0F172A", letterSpacing: "-0.02em", margin: "0 0 6px", fontFamily: "var(--font-playfair), Georgia, serif" }}>
        Create your account
      </h2>
      <p style={{ fontSize: "0.9375rem", color: "#64748B", margin: "0 0 28px" }}>
        Free forever. No credit card required.
      </p>

      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
          <div>
            <label className="credo-label">First name</label>
            <input className="credo-input" placeholder="Sipho" value={data.firstName} onChange={e => onChange("firstName", e.target.value)}/>
          </div>
          <div>
            <label className="credo-label">Last name</label>
            <input className="credo-input" placeholder="Sithole" value={data.lastName} onChange={e => onChange("lastName", e.target.value)}/>
          </div>
        </div>

        <div>
          <label className="credo-label">Email address</label>
          <input className="credo-input" type="email" placeholder="sipho@example.co.za" value={data.email} onChange={e => onChange("email", e.target.value)}/>
        </div>

        <div>
          <label className="credo-label">Phone / WhatsApp number</label>
          <input
            className="credo-input"
            type="tel"
            placeholder="0825366384"
            maxLength={10}
            style={{ borderColor: !phoneValid ? "#EF4444" : undefined }}
            value={data.phone}
            onChange={e => {
              const digits = e.target.value.replace(/\D/g, "").slice(0, 10);
              onChange("phone", digits);
            }}
          />
          {!phoneValid && (
            <p style={{ fontSize: "0.8125rem", color: "#EF4444", marginTop: 4 }}>Phone number must be 10 digits</p>
          )}
        </div>

        <div>
          <label className="credo-label">Password <span style={{ color: "#94A3B8", fontWeight: 400 }}>(min. 8 characters)</span></label>
          <div style={{ position: "relative" }}>
            <input
              className="credo-input"
              type={showPw ? "text" : "password"}
              placeholder="Min. 8 characters"
              style={{ paddingRight: 44 }}
              value={data.password}
              onChange={e => onChange("password", e.target.value)}
            />
            <button type="button" onClick={() => setShowPw(!showPw)}
              style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: "#94A3B8" }}>
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                <path d="M2 9s2.5-5 7-5 7 5 7 5-2.5 5-7 5-7-5-7-5z" stroke="currentColor" strokeWidth="1.4"/>
                <circle cx="9" cy="9" r="2" stroke="currentColor" strokeWidth="1.4"/>
              </svg>
            </button>
          </div>
          <p style={{ fontSize: "0.75rem", color: "#94A3B8", margin: "6px 0 0" }}>
            You'll use this password to log in alongside your email address
          </p>
        </div>

        <div>
          <label className="credo-label">Confirm password</label>
          <div style={{ position: "relative" }}>
            <input
              className="credo-input"
              type={showConfirmPw ? "text" : "password"}
              placeholder="Re-enter your password"
              style={{ paddingRight: 44, borderColor: !passwordsMatch ? "#EF4444" : undefined }}
              value={data.confirmPassword}
              onChange={e => onChange("confirmPassword", e.target.value)}
            />
            <button type="button" onClick={() => setShowConfirmPw(!showConfirmPw)}
              style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: "#94A3B8" }}>
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                <path d="M2 9s2.5-5 7-5 7 5 7 5-2.5 5-7 5-7-5-7-5z" stroke="currentColor" strokeWidth="1.4"/>
                <circle cx="9" cy="9" r="2" stroke="currentColor" strokeWidth="1.4"/>
              </svg>
            </button>
          </div>
          {!passwordsMatch && (
            <p style={{ fontSize: "0.8125rem", color: "#EF4444", marginTop: 4 }}>Passwords do not match</p>
          )}
        </div>

        <div>
          <label className="credo-label">Preferred language</label>
          <select className="credo-input" style={{ cursor: "pointer" }} value={data.language} onChange={e => onChange("language", e.target.value)}>
            <option>Afrikaans</option>
            <option>English</option>
            <option>isiNdebele</option>
            <option>isiXhosa</option>
            <option>isiZulu</option>
            <option>Sepedi</option>
            <option>Sesotho</option>
            <option>Setswana</option>
            <option>siSwati</option>
            <option>Tshivenda</option>
            <option>Xitsonga</option>
          </select>
        </div>
      </div>

      <button
        onClick={onNext}
        disabled={!canProceed}
        className="btn-primary"
        style={{ width: "100%", marginTop: 24, padding: "12px 0", fontSize: "0.9375rem", justifyContent: "center", opacity: canProceed ? 1 : 0.5, cursor: canProceed ? "pointer" : "not-allowed" }}
      >
        Continue
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
          <path d="M6 4l4 4-4 4" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </button>

      <p style={{ textAlign: "center", marginTop: 20, fontSize: "0.875rem", color: "#64748B" }}>
        Already have an account?{" "}
        <Link href="/login" style={{ color: "#C4953A", fontWeight: 600, textDecoration: "none" }}>Sign in</Link>
      </p>
    </div>
  );
}

/* ─── Step 2: Identity ───────────────────────────────────────────── */
function Step2({ data, onChange, onNext, onBack }: {
  data: FormData;
  onChange: (field: keyof FormData, value: string) => void;
  onNext: () => void;
  onBack: () => void;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [idFileName, setIdFileName] = useState<string | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) setIdFileName(file.name);
  };

  return (
    <div>
      <h2 style={{ fontSize: "1.5rem", fontWeight: 700, color: "#0F172A", letterSpacing: "-0.02em", margin: "0 0 6px", fontFamily: "var(--font-playfair), Georgia, serif" }}>
        Verify your identity
      </h2>
      <p style={{ fontSize: "0.9375rem", color: "#64748B", margin: "0 0 28px" }}>
        Required by law to access your credit reports. Your data is POPIA-protected.
      </p>

      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <div>
          <label className="credo-label">South African ID number <span style={{ color: "#94A3B8", fontWeight: 400 }}>(optional)</span></label>
          <input
            className="credo-input"
            placeholder="e.g. 8001015009087"
            maxLength={13}
            style={{ letterSpacing: "0.06em", fontSize: "1rem", fontWeight: 600 }}
            value={data.idNumber}
            onChange={e => onChange("idNumber", e.target.value.replace(/\D/g, ""))}
          />
          <p style={{ fontSize: "0.75rem", color: "#94A3B8", margin: "6px 0 0" }}>
            13-digit South African identity number. If provided, you can use it to log in instead of your email.
          </p>
        </div>

        <div>
          <label className="credo-label">Province</label>
          <select className="credo-input" style={{ cursor: "pointer" }} value={data.province} onChange={e => onChange("province", e.target.value)}>
            <option value="">Select province</option>
            {[
              "Gauteng", "Western Cape", "KwaZulu-Natal", "Eastern Cape",
              "Limpopo", "Mpumalanga", "North West", "Free State", "Northern Cape",
            ].map(p => <option key={p}>{p}</option>)}
          </select>
        </div>

        {/* ID upload */}
        <div>
          <label className="credo-label">Upload copy of ID (optional)</label>
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.jpg,.jpeg,.png,.webp"
            style={{ display: "none" }}
            onChange={handleFileChange}
          />
          <div
            onClick={() => fileInputRef.current?.click()}
            style={{
              border: idFileName ? "1.5px solid #C4953A" : "1.5px dashed #E2E8F0",
              borderRadius: 9, padding: "14px 18px",
              display: "flex", alignItems: "center", gap: 12,
              cursor: "pointer", background: idFileName ? "#FFFBF4" : "#F8F9FA",
              transition: "all 150ms",
            }}
          >
            {idFileName ? (
              <>
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                  <circle cx="10" cy="10" r="8" fill="#C4953A" opacity="0.15"/>
                  <path d="M6.5 10.5l2.5 2.5 4.5-5" stroke="#C4953A" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                <div>
                  <p style={{ fontSize: "0.875rem", fontWeight: 500, color: "#92700A", margin: 0 }}>{idFileName}</p>
                  <p style={{ fontSize: "0.75rem", color: "#C4953A", margin: 0 }}>Click to change file</p>
                </div>
              </>
            ) : (
              <>
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                  <path d="M10 14V6M7 9l3-3 3 3" stroke="#94A3B8" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                  <path d="M4 17h12" stroke="#94A3B8" strokeWidth="1.5" strokeLinecap="round"/>
                </svg>
                <div>
                  <p style={{ fontSize: "0.875rem", fontWeight: 500, color: "#64748B", margin: 0 }}>Upload ID document</p>
                  <p style={{ fontSize: "0.75rem", color: "#94A3B8", margin: 0 }}>Smart ID or Green ID book &bull; PDF or image</p>
                </div>
              </>
            )}
          </div>
        </div>

        <div style={{ background: "#F0F5FB", border: "1px solid #C8D9EF", borderRadius: 9, padding: "12px 16px", display: "flex", gap: 10, alignItems: "flex-start" }}>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" style={{ flexShrink: 0, marginTop: 1 }}>
            <circle cx="8" cy="8" r="6" stroke="#0B1D35" strokeWidth="1.4"/>
            <path d="M8 7v3M8 5v.5" stroke="#0B1D35" strokeWidth="1.4" strokeLinecap="round"/>
          </svg>
          <p style={{ fontSize: "0.8125rem", color: "#374151", margin: 0, lineHeight: 1.6 }}>
            Your ID number is used solely to retrieve your credit reports from SA bureaus under NCA Section 72.
            It is encrypted and never shared with third parties.
          </p>
        </div>
      </div>

      <div style={{ display: "flex", gap: 10, marginTop: 24 }}>
        <button onClick={onBack} className="btn-outline" style={{ padding: "11px 20px" }}>← Back</button>
        <button onClick={onNext} className="btn-primary" style={{ flex: 1, padding: "11px 0", justifyContent: "center" }}>
          Continue
        </button>
      </div>
    </div>
  );
}

/* ─── Step 3: Consent ────────────────────────────────────────────── */
function Step3({ onNext, onBack, submitting, error, onGoToStep }: {
  onNext: () => void;
  onBack: () => void;
  submitting: boolean;
  error: string | null;
  onGoToStep: (step: number) => void;
}) {
  const [consents, setConsents] = useState({ popia: false, bureau: false, terms: false });
  const allChecked = Object.values(consents).every(Boolean);

  return (
    <div>
      <h2 style={{ fontSize: "1.5rem", fontWeight: 700, color: "#0F172A", letterSpacing: "-0.02em", margin: "0 0 6px", fontFamily: "var(--font-playfair), Georgia, serif" }}>
        Your consent
      </h2>
      <p style={{ fontSize: "0.9375rem", color: "#64748B", margin: "0 0 28px" }}>
        We need your authorisation before accessing any of your personal credit information.
      </p>

      {error && (
        <div style={{ background: "#FEF2F2", border: "1px solid #FECACA", borderRadius: 9, padding: "12px 16px", marginBottom: 20 }}>
          <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" style={{ flexShrink: 0, marginTop: 1 }}>
              <circle cx="8" cy="8" r="6" stroke="#DC2626" strokeWidth="1.3"/>
              <path d="M8 5v3M8 10v.5" stroke="#DC2626" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
            <p style={{ fontSize: "0.8125rem", color: "#DC2626", margin: 0, lineHeight: 1.5 }}>{error}</p>
          </div>
          {(error.toLowerCase().includes("email") || error.toLowerCase().includes("password")) && (
            <button onClick={() => onGoToStep(1)} style={{ marginTop: 8, marginLeft: 26, fontSize: "0.8125rem", color: "#DC2626", fontWeight: 600, background: "none", border: "none", cursor: "pointer", textDecoration: "underline", padding: 0 }}>
              ← Go back to Step 1 to fix this
            </button>
          )}
          {(error.toLowerCase().includes("id number") || error.toLowerCase().includes("id numbe")) && (
            <button onClick={() => onGoToStep(2)} style={{ marginTop: 8, marginLeft: 26, fontSize: "0.8125rem", color: "#DC2626", fontWeight: 600, background: "none", border: "none", cursor: "pointer", textDecoration: "underline", padding: 0 }}>
              ← Go back to Step 2 to fix this
            </button>
          )}
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        {[
          {
            key: "popia" as const,
            title: "POPIA Data Protection Consent",
            body: "I consent to Credo processing my personal information in accordance with the Protection of Personal Information Act (POPIA) No. 4 of 2013. My data will be used solely to provide credit repair services and will not be sold or shared without my express consent.",
          },
          {
            key: "bureau" as const,
            title: "Credit Bureau Access Authorisation",
            body: "I authorise Credo to retrieve my credit reports from TransUnion SA, Experian SA, XDS, and Lightstone on my behalf, as permitted under the National Credit Act (NCA) No. 34 of 2005 Section 72. I understand I am entitled to one free report per bureau per year.",
          },
          {
            key: "terms" as const,
            title: "Terms of Service & Privacy Policy",
            body: `I have read and agree to Credo's Terms of Service and Privacy Policy. I understand that Credo is not a law firm and that dispute outcomes are not guaranteed.`,
          },
        ].map(item => (
          <label key={item.key} style={{
            display: "flex", gap: 14, alignItems: "flex-start",
            padding: "16px 18px",
            background: consents[item.key] ? "#F0F5FB" : "#FAFAFA",
            border: `1.5px solid ${consents[item.key] ? "#0B1D35" : "#E2E8F0"}`,
            borderRadius: 10, cursor: "pointer", transition: "all 150ms",
          }}>
            <div style={{
              width: 20, height: 20, borderRadius: 5, flexShrink: 0, marginTop: 1,
              background: consents[item.key] ? "#0B1D35" : "#FFFFFF",
              border: consents[item.key] ? "none" : "1.5px solid #CBD5E1",
              display: "flex", alignItems: "center", justifyContent: "center",
              transition: "all 150ms",
            }}>
              {consents[item.key] && (
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                  <path d="M2 6l3 3 5-5" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              )}
            </div>
            <input type="checkbox" checked={consents[item.key]}
              onChange={() => setConsents(prev => ({ ...prev, [item.key]: !prev[item.key] }))}
              style={{ display: "none" }}
            />
            <div>
              <p style={{ fontSize: "0.875rem", fontWeight: 700, color: "#0F172A", margin: "0 0 5px" }}>
                {item.title} <span style={{ color: "#DC2626", marginLeft: 4 }}>*</span>
              </p>
              <p style={{ fontSize: "0.8125rem", color: "#64748B", margin: 0, lineHeight: 1.6 }}>{item.body}</p>
            </div>
          </label>
        ))}
      </div>

      <div style={{ display: "flex", gap: 10, marginTop: 24 }}>
        <button onClick={onBack} className="btn-outline" style={{ padding: "11px 20px" }} disabled={submitting}>← Back</button>
        <button
          onClick={onNext}
          disabled={!allChecked || submitting}
          style={{
            flex: 1, padding: "11px 0",
            background: allChecked && !submitting ? "#0B1D35" : "#CBD5E1",
            color: "white", border: "none", borderRadius: 9,
            fontSize: "0.9375rem", fontWeight: 600,
            cursor: allChecked && !submitting ? "pointer" : "not-allowed",
            transition: "background-color 200ms",
            display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
          }}
        >
          {submitting ? (
            <>
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" style={{ animation: "spin 1s linear infinite" }}>
                <circle cx="8" cy="8" r="6" stroke="rgba(255,255,255,0.3)" strokeWidth="2"/>
                <path d="M8 2a6 6 0 016 6" stroke="white" strokeWidth="2" strokeLinecap="round"/>
              </svg>
              Creating account...
            </>
          ) : "Create my account"}
        </button>
      </div>
      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

/* ─── Step 4: Done ───────────────────────────────────────────────── */
function Step4() {
  return (
    <div style={{ textAlign: "center", padding: "20px 0 10px" }}>
      <div style={{
        width: 72, height: 72,
        background: "linear-gradient(135deg, #0B1D35, #1E4470)",
        borderRadius: "50%",
        display: "flex", alignItems: "center", justifyContent: "center",
        margin: "0 auto 24px",
        boxShadow: "0 8px 24px rgba(11,29,53,0.25)",
      }}>
        <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
          <path d="M6 16l7 7 13-13" stroke="#C4953A" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </div>

      <h2 style={{ fontSize: "1.5rem", fontWeight: 700, color: "#0F172A", letterSpacing: "-0.02em", margin: "0 0 10px", fontFamily: "var(--font-playfair), Georgia, serif" }}>
        Welcome to Credo
      </h2>
      <p style={{ fontSize: "0.9375rem", color: "#64748B", margin: "0 0 32px", lineHeight: 1.7 }}>
        Your account is ready. We&apos;re pulling your credit reports from all 4 SA bureaus.
        This takes about 60 seconds.
      </p>

      <div style={{ background: "#F8F9FA", border: "1px solid #E2E8F0", borderRadius: 12, padding: "20px", marginBottom: 28, textAlign: "left" }}>
        {[
          { label: "Account created",             done: true  },
          { label: "Identity verified",            done: true  },
          { label: "Pulling TransUnion report",    done: true  },
          { label: "Pulling Experian report",      done: true  },
          { label: "Pulling XDS report",           done: false },
          { label: "Pulling Lightstone report",    done: false },
          { label: "Generating your action plan",  done: false },
        ].map((item, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: i < 6 ? 10 : 0 }}>
            {item.done ? (
              <div style={{ width: 20, height: 20, borderRadius: "50%", background: "#0B1D35", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                  <path d="M2 5l2.5 2.5L8 3" stroke="white" strokeWidth="1.8" strokeLinecap="round"/>
                </svg>
              </div>
            ) : (
              <div style={{ width: 20, height: 20, borderRadius: "50%", border: "2px solid #E2E8F0", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <div style={{ width: 6, height: 6, borderRadius: "50%", background: i === 4 ? "#C4953A" : "#E2E8F0", animation: i === 4 ? "pulse 1.2s infinite" : "none" }}/>
              </div>
            )}
            <span style={{ fontSize: "0.875rem", color: item.done ? "#0F172A" : "#94A3B8", fontWeight: item.done ? 500 : 400 }}>
              {item.label}
            </span>
          </div>
        ))}
      </div>

      <Link href="/dashboard" className="btn-primary" style={{ display: "inline-flex", padding: "12px 28px", fontSize: "0.9375rem", fontWeight: 700, justifyContent: "center", width: "100%" }}>
        Go to my dashboard
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
          <path d="M6 4l4 4-4 4" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </Link>

      <style>{`@keyframes pulse { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:0.4;transform:scale(0.7)} }`}</style>
    </div>
  );
}

/* ─── Page ───────────────────────────────────────────────────────── */
export default function RegisterPage() {
  const [step, setStep] = useState<Step>(1);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [formData, setFormData] = useState<FormData>({
    firstName: "", lastName: "", email: "", phone: "",
    password: "", confirmPassword: "", language: "English", idNumber: "", province: "",
  });

  const update = (field: keyof FormData, value: string) =>
    setFormData(prev => ({ ...prev, [field]: value }));

  const handleCreateAccount = async () => {
    setSubmitting(true);
    setSubmitError(null);

    try {
      const res = await fetch("/api/consumer/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: formData.email,
          password: formData.password,
          firstName: formData.firstName,
          lastName: formData.lastName,
          idNumber: formData.idNumber || undefined,
          phone: formData.phone || undefined,
          province: formData.province || undefined,
          language: formData.language,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setSubmitError(data.error ?? "Registration failed. Please try again.");
        setSubmitting(false);
        return;
      }

      // Auto sign-in after successful registration
      await signIn("credentials", {
        email: formData.email,
        password: formData.password,
        redirect: false,
      });

      setStep(4);
    } catch {
      setSubmitError("Network error. Please check your connection and try again.");
      setSubmitting(false);
    }
  };

  return (
    <div style={{ minHeight: "100vh", display: "grid", gridTemplateColumns: "1fr 1fr", background: "#F8F9FA" }}>
      {/* Left: brand panel */}
      <div style={{
        background: "linear-gradient(160deg, #0B1D35 0%, #112847 100%)",
        display: "flex", flexDirection: "column",
        justifyContent: "space-between", padding: "48px",
        position: "relative", overflow: "hidden",
      }}>
        <div style={{ position: "absolute", inset: 0, opacity: 0.04, backgroundImage: "radial-gradient(circle at 80% 20%, #C4953A 0%, transparent 55%)", pointerEvents: "none" }}/>

        <Link href="/" style={{ display: "flex", alignItems: "center", gap: 10, textDecoration: "none", position: "relative" }}>
          <div style={{ width: 40, height: 40, background: "rgba(196,149,58,0.15)", border: "1px solid rgba(196,149,58,0.3)", borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
              <path d="M11 2.5C6.86 2.5 3.5 5.86 3.5 11s3.36 8.5 7.5 8.5 8.5-3.36 8.5-7.5" stroke="#C4953A" strokeWidth="2" strokeLinecap="round"/>
              <path d="M15.5 2.5l3 3-3 3" stroke="#C4953A" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M7.5 11l2.5 2.5 5-5" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
          <span style={{ fontWeight: 700, fontSize: "1.25rem", color: "#FFFFFF", letterSpacing: "-0.01em" }}>Credo</span>
        </Link>

        <div style={{ position: "relative" }}>
          <div style={{ width: 40, height: 3, background: "#C4953A", borderRadius: 2, marginBottom: 28 }}/>
          <p style={{ fontFamily: "var(--font-playfair), Georgia, serif", fontSize: "1.75rem", fontWeight: 600, color: "#FFFFFF", lineHeight: 1.35, margin: "0 0 24px", letterSpacing: "-0.01em" }}>
            Over 11 million South Africans have adverse credit listings.
          </p>
          <p style={{ fontSize: "0.9375rem", color: "#64748B", lineHeight: 1.7 }}>
            You have the right to dispute inaccurate information under the National Credit Act.
            Credo makes that simple, guided, and free to start.
          </p>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 14, position: "relative" }}>
          {[
            { num: "4",   label: "SA credit bureaus connected"        },
            { num: "NCA", label: "Section 72 compliant disputes"      },
            { num: "R0",  label: "To get started — free forever"      },
          ].map(stat => (
            <div key={stat.label} style={{ display: "flex", alignItems: "center", gap: 14 }}>
              <div style={{ width: 44, height: 36, background: "rgba(196,149,58,0.1)", border: "1px solid rgba(196,149,58,0.2)", borderRadius: 7, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <span style={{ fontSize: "0.875rem", fontWeight: 800, color: "#C4953A" }}>{stat.num}</span>
              </div>
              <span style={{ fontSize: "0.875rem", color: "#94A3B8" }}>{stat.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Right: form */}
      <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", padding: "48px", background: "#FFFFFF" }}>
        <div style={{ width: "100%", maxWidth: 440 }}>
          <StepIndicator current={step} />
          {step === 1 && <Step1 data={formData} onChange={update} onNext={() => setStep(2)} />}
          {step === 2 && <Step2 data={formData} onChange={update} onNext={() => setStep(3)} onBack={() => setStep(1)} />}
          {step === 3 && <Step3 onNext={handleCreateAccount} onBack={() => setStep(2)} submitting={submitting} error={submitError} onGoToStep={(s) => { setSubmitError(null); setStep(s as Step); }} />}
          {step === 4 && <Step4 />}
        </div>
      </div>

      <style>{`
        @media (max-width: 768px) {
          div[style*="grid-template-columns: 1fr 1fr"] { grid-template-columns: 1fr !important; }
          div[style*="background: linear-gradient(160deg, #0B1D35"] { display: none !important; }
        }
      `}</style>
    </div>
  );
}

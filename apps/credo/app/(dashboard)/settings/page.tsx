"use client";

import { useState, useRef } from "react";

type Tab = "profile" | "banking" | "letterhead" | "notifications" | "security";

export default function SettingsPage() {
  const [tab, setTab] = useState<Tab>("profile");

  const TABS: { key: Tab; label: string; icon: React.ReactNode }[] = [
    {
      key: "profile", label: "Profile",
      icon: <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="5.5" r="3" stroke="currentColor" strokeWidth="1.4" /><path d="M2.5 14c0-3 2.5-5 5.5-5s5.5 2 5.5 5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" /></svg>,
    },
    {
      key: "banking", label: "Banking Details",
      icon: <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><rect x="1.5" y="5" width="13" height="9" rx="1.5" stroke="currentColor" strokeWidth="1.4" /><path d="M1.5 8.5h13" stroke="currentColor" strokeWidth="1.4" /><path d="M8 2.5L3 5h10L8 2.5z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" /></svg>,
    },
    {
      key: "letterhead", label: "Letterhead",
      icon: <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><rect x="2" y="1.5" width="12" height="13" rx="1.5" stroke="currentColor" strokeWidth="1.4" /><path d="M5 5.5h6M5 8h6M5 10.5h4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" /></svg>,
    },
    {
      key: "notifications", label: "Notifications",
      icon: <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M8 1.5a4.5 4.5 0 00-4.5 4.5v2.5L2 10.5H14L12.5 8.5V6A4.5 4.5 0 008 1.5z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" /><path d="M6.5 13a1.5 1.5 0 003 0" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" /></svg>,
    },
    {
      key: "security", label: "Security",
      icon: <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M8 1.5L2.5 4.5v3.5C2.5 11.5 5 14 8 15c3-1 5.5-3.5 5.5-7V4.5L8 1.5z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" /></svg>,
    },
  ];

  return (
    <div className="animate-fade-in" style={{ maxWidth:860 }}>
      <div style={{ marginBottom:24 }}>
        <h2 style={{ fontSize:"1.25rem", fontWeight:700, color:"#0F172A", margin:"0 0 4px", letterSpacing:"-0.01em" }}>
          Settings
        </h2>
        <p style={{ fontSize:"0.875rem", color:"#64748B", margin:0 }}>
          Manage your account, billing, and notification preferences.
        </p>
      </div>

      <div style={{ display:"grid", gridTemplateColumns:"200px 1fr", gap:20, alignItems:"start" }}>
        {/* Sidebar */}
        <div className="credo-card" style={{ padding:"8px" }}>
          {TABS.map(t => (
            <button key={t.key} onClick={() => setTab(t.key)} style={{
              display:"flex", alignItems:"center", gap:9, width:"100%",
              padding:"9px 12px", borderRadius:7,
              background: tab === t.key ? "#E4EDF8" : "transparent",
              color: tab === t.key ? "#0B1D35" : "#64748B",
              border:"none", cursor:"pointer", textAlign:"left",
              fontSize:"0.875rem", fontWeight: tab === t.key ? 600 : 500,
              transition:"all 150ms",
            }}>
              {t.icon}
              {t.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div>
          {tab === "profile" && <ProfileTab />}
          {tab === "banking" && <BankingTab />}
          {tab === "letterhead" && <LetterheadTab />}
          {tab === "notifications" && <NotificationsTab />}
          {tab === "security" && <SecurityTab />}
        </div>
      </div>
    </div>
  );
}

/* ─── Profile Tab ────────────────────────────────────────────────── */
function ProfileTab() {
  return (
    <div className="credo-card" style={{ padding:"28px" }}>
      <h3 style={{ fontSize:"1rem", fontWeight:700, color:"#0F172A", margin:"0 0 4px" }}>Personal Information</h3>
      <p style={{ fontSize:"0.875rem", color:"#64748B", margin:"0 0 24px" }}>
        Update your profile details. ID number cannot be changed after verification.
      </p>
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:16 }}>
        <div><label className="credo-label">First name</label><input className="credo-input" defaultValue="Sipho" /></div>
        <div><label className="credo-label">Last name</label><input className="credo-input" defaultValue="Sithole" /></div>
        <div><label className="credo-label">Email address</label><input className="credo-input" type="email" defaultValue="sipho@example.co.za" /></div>
        <div><label className="credo-label">Phone / WhatsApp</label><input className="credo-input" defaultValue="071 234 5678" /></div>
        <div>
          <label className="credo-label">SA ID Number</label>
          <input className="credo-input" defaultValue="8001015009087" disabled style={{ cursor:"not-allowed" }} />
          <p style={{ fontSize:"0.75rem", color:"#94A3B8", marginTop:4 }}>Verified — cannot be changed</p>
        </div>
        <div>
          <label className="credo-label">Language preference</label>
          <select className="credo-input" style={{ cursor:"pointer" }}>
            <option>English</option>
            <option>Afrikaans</option>
            <option>isiZulu</option>
            <option>Sesotho</option>
            <option>Xhosa</option>
          </select>
        </div>
      </div>
      <div style={{ marginTop:24 }}>
        <button className="btn-primary" style={{ padding:"10px 20px" }}>Save changes</button>
      </div>
    </div>
  );
}

/* ─── Banking Tab ────────────────────────────────────────────────── */
function BankingTab() {
  const [saved, setSaved] = useState(false);

  return (
    <div style={{ display:"flex", flexDirection:"column", gap:16 }}>
      <div className="credo-card" style={{ padding:"28px" }}>
        <div style={{ display:"flex", alignItems:"flex-start", gap:12, marginBottom:24 }}>
          <div style={{ width:40, height:40, background:"#E4EDF8", borderRadius:10, display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
              <rect x="2" y="6" width="16" height="11" rx="2" stroke="#0B1D35" strokeWidth="1.5" />
              <path d="M2 10h16" stroke="#0B1D35" strokeWidth="1.5" />
              <path d="M10 3L4 6h12L10 3z" stroke="#0B1D35" strokeWidth="1.5" strokeLinejoin="round" />
            </svg>
          </div>
          <div>
            <h3 style={{ fontSize:"1rem", fontWeight:700, color:"#0F172A", margin:"0 0 4px" }}>Banking Details</h3>
            <p style={{ fontSize:"0.875rem", color:"#64748B", margin:0 }}>
              These details appear on all quotes and invoices sent to you or generated by your firm.
              Used for payment allocation and EFT collections.
            </p>
          </div>
        </div>

        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:16 }}>
          <div style={{ gridColumn:"1 / -1" }}>
            <label className="credo-label">Bank name</label>
            <select className="credo-input" style={{ cursor:"pointer" }}>
              <option value="">Select your bank</option>
              <option>Absa</option>
              <option>Capitec</option>
              <option>FNB (First National Bank)</option>
              <option>Investec</option>
              <option>Nedbank</option>
              <option>Standard Bank</option>
              <option>African Bank</option>
              <option>TymeBank</option>
              <option>Discovery Bank</option>
              <option>Bidvest Bank</option>
              <option>Other</option>
            </select>
          </div>
          <div>
            <label className="credo-label">Account holder name</label>
            <input className="credo-input" placeholder="As it appears on your bank statement" />
          </div>
          <div>
            <label className="credo-label">Account number</label>
            <input className="credo-input" placeholder="e.g. 1234567890" />
          </div>
          <div>
            <label className="credo-label">Account type</label>
            <select className="credo-input" style={{ cursor:"pointer" }}>
              <option>Cheque / Current</option>
              <option>Savings</option>
              <option>Transmission</option>
            </select>
          </div>
          <div>
            <label className="credo-label">Branch code</label>
            <input className="credo-input" placeholder="e.g. 051001" />
          </div>
        </div>

        <div style={{
          marginTop:20,
          background:"#FFFBEB", border:"1px solid #FCD34D",
          borderRadius:9, padding:"12px 16px",
          display:"flex", gap:10, alignItems:"flex-start",
        }}>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" style={{ flexShrink:0, marginTop:1 }}>
            <circle cx="8" cy="8" r="6" stroke="#D97706" strokeWidth="1.4" />
            <path d="M8 5v3M8 10v.5" stroke="#D97706" strokeWidth="1.4" strokeLinecap="round" />
          </svg>
          <p style={{ fontSize:"0.8125rem", color:"#92400E", margin:0, lineHeight:1.6 }}>
            <strong>Firm administrators:</strong> banking details saved here are printed on all client quotes and invoices.
            Ensure these match your registered business banking account to avoid payment delays.
          </p>
        </div>

        <div style={{ marginTop:24, display:"flex", gap:10, alignItems:"center" }}>
          <button className="btn-primary" style={{ padding:"10px 20px" }} onClick={() => setSaved(true)}>
            Save banking details
          </button>
          {saved && (
            <span style={{ fontSize:"0.875rem", color:"#059669", fontWeight:600 }}>
              ✓ Saved successfully
            </span>
          )}
        </div>
      </div>

      {/* Payment reference */}
      <div className="credo-card" style={{ padding:"24px 28px" }}>
        <h3 style={{ fontSize:"0.9375rem", fontWeight:700, color:"#0F172A", margin:"0 0 4px" }}>
          Payment Reference Format
        </h3>
        <p style={{ fontSize:"0.875rem", color:"#64748B", margin:"0 0 16px" }}>
          Choose how payment references appear on quotes and invoices.
        </p>
        <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
          {[
            { label:"Case ID (default)", example:"CR-2024-001" },
            { label:"Client name + case ID", example:"SITHOLE-CR-2024-001" },
            { label:"Client ID number", example:"8001015009087" },
            { label:"Custom prefix + case ID", example:"FIRM-CR-2024-001" },
          ].map((opt, i) => (
            <label key={opt.label} style={{ display:"flex", alignItems:"center", gap:12, cursor:"pointer" }}>
              <input type="radio" name="ref_format" defaultChecked={i === 0} style={{ accentColor:"#0B1D35" }} />
              <div>
                <span style={{ fontSize:"0.875rem", fontWeight:500, color:"#0F172A" }}>{opt.label}</span>
                <span style={{ fontSize:"0.8125rem", color:"#94A3B8", marginLeft:8, fontFamily:"monospace" }}>
                  {opt.example}
                </span>
              </div>
            </label>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ─── Letterhead Tab ─────────────────────────────────────────────── */
function LetterheadTab() {
  const [mode, setMode] = useState<"upload" | "create" | null>(null);
  const [uploaded, setUploaded] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [generated, setGenerated] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleGenerate = () => {
    setGenerating(true);
    setTimeout(() => { setGenerating(false); setGenerated(true); }, 2800);
  };

  return (
    <div style={{ display:"flex", flexDirection:"column", gap:16 }}>
      {/* Choice panel */}
      {!mode && (
        <div className="credo-card" style={{ padding:"28px" }}>
          <div style={{ display:"flex", alignItems:"flex-start", gap:12, marginBottom:24 }}>
            <div style={{ width:40, height:40, background:"#E4EDF8", borderRadius:10, display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                <rect x="2" y="2" width="16" height="16" rx="2" stroke="#0B1D35" strokeWidth="1.5" />
                <path d="M5 5h10M5 8h10M5 11h7" stroke="#0B1D35" strokeWidth="1.4" strokeLinecap="round" />
                <path d="M2 5h16" stroke="#C4953A" strokeWidth="1.5" />
              </svg>
            </div>
            <div>
              <h3 style={{ fontSize:"1rem", fontWeight:700, color:"#0F172A", margin:"0 0 4px" }}>Letterhead</h3>
              <p style={{ fontSize:"0.875rem", color:"#64748B", margin:0 }}>
                Your letterhead appears on all quotes, invoices, and dispute letters generated by Credo.
                Choose to upload an existing letterhead or have Credo create one for you.
              </p>
            </div>
          </div>

          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:14 }}>
            {/* Upload option */}
            <button onClick={() => setMode("upload")} style={{
              background:"#FFFFFF", border:"1.5px solid #E2E8F0",
              borderRadius:12, padding:"24px 20px",
              cursor:"pointer", textAlign:"left",
              transition:"all 150ms",
            }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = "#0B1D35"; (e.currentTarget as HTMLElement).style.boxShadow = "0 4px 12px rgba(11,29,53,0.08)"; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = "#E2E8F0"; (e.currentTarget as HTMLElement).style.boxShadow = "none"; }}
            >
              <div style={{ width:44, height:44, background:"#E4EDF8", borderRadius:10, display:"flex", alignItems:"center", justifyContent:"center", marginBottom:14 }}>
                <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
                  <path d="M11 14V4M7.5 7.5L11 4l3.5 3.5" stroke="#0B1D35" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                  <path d="M4 16.5h14" stroke="#0B1D35" strokeWidth="1.6" strokeLinecap="round" />
                </svg>
              </div>
              <h4 style={{ fontSize:"0.9375rem", fontWeight:700, color:"#0F172A", margin:"0 0 6px" }}>
                Upload my letterhead
              </h4>
              <p style={{ fontSize:"0.8125rem", color:"#64748B", margin:0, lineHeight:1.6 }}>
                Already have a designed letterhead? Upload it as a PDF, PNG, or DOCX.
                We&apos;ll apply it to all documents automatically.
              </p>
            </button>

            {/* AI create option */}
            <button onClick={() => setMode("create")} style={{
              background:"linear-gradient(160deg, #0B1D35 0%, #112847 100%)",
              border:"1.5px solid #1E4470",
              borderRadius:12, padding:"24px 20px",
              cursor:"pointer", textAlign:"left",
              transition:"all 150ms", position:"relative", overflow:"hidden",
            }}>
              <div style={{
                position:"absolute", top:10, right:12,
                padding:"2px 8px", background:"rgba(196,149,58,0.2)", border:"1px solid rgba(196,149,58,0.3)",
                borderRadius:9999, fontSize:"0.65rem", fontWeight:700, color:"#C4953A", letterSpacing:"0.04em",
              }}>
                AI-POWERED
              </div>
              <div style={{ width:44, height:44, background:"rgba(196,149,58,0.15)", borderRadius:10, display:"flex", alignItems:"center", justifyContent:"center", marginBottom:14 }}>
                <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
                  <rect x="4" y="8" width="14" height="10" rx="2" stroke="#C4953A" strokeWidth="1.6" />
                  <path d="M8 8V6a3 3 0 016 0v2" stroke="#C4953A" strokeWidth="1.6" strokeLinecap="round" />
                  <circle cx="8.5" cy="13" r="1.5" fill="#C4953A" />
                  <circle cx="13.5" cy="13" r="1.5" fill="#C4953A" />
                </svg>
              </div>
              <h4 style={{ fontSize:"0.9375rem", fontWeight:700, color:"#FFFFFF", margin:"0 0 6px" }}>
                Create one for me
              </h4>
              <p style={{ fontSize:"0.8125rem", color:"#94A3B8", margin:0, lineHeight:1.6 }}>
                Don&apos;t have a letterhead? Credo AI will generate a professional, branded letterhead
                using your company details and logo.
              </p>
            </button>
          </div>
        </div>
      )}

      {/* Upload flow */}
      {mode === "upload" && (
        <div className="credo-card" style={{ padding:"28px" }}>
          <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:20 }}>
            <button onClick={() => setMode(null)} style={{ background:"none", border:"none", cursor:"pointer", color:"#64748B", padding:4 }}>
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path d="M10 4L6 8l4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
            <h3 style={{ fontSize:"1rem", fontWeight:700, color:"#0F172A", margin:0 }}>Upload your letterhead</h3>
          </div>

          <input ref={fileRef} type="file" accept=".pdf,.png,.jpg,.docx" style={{ display:"none" }}
            onChange={() => setUploaded(true)} />

          {!uploaded ? (
            <div
              onClick={() => fileRef.current?.click()}
              style={{
                border:"2px dashed #CBD5E1", borderRadius:12, padding:"48px 24px",
                textAlign:"center", cursor:"pointer",
                transition:"border-color 150ms, background-color 150ms",
              }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = "#0B1D35"; (e.currentTarget as HTMLElement).style.background = "#F0F5FB"; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = "#CBD5E1"; (e.currentTarget as HTMLElement).style.background = "transparent"; }}
            >
              <div style={{ width:48, height:48, background:"#E4EDF8", borderRadius:12, display:"flex", alignItems:"center", justifyContent:"center", margin:"0 auto 16px" }}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                  <path d="M12 16V6M8 10l4-4 4 4" stroke="#0B1D35" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                  <path d="M4 20h16" stroke="#0B1D35" strokeWidth="1.8" strokeLinecap="round" />
                </svg>
              </div>
              <p style={{ fontSize:"0.9375rem", fontWeight:600, color:"#0F172A", margin:"0 0 4px" }}>
                Click to upload or drag and drop
              </p>
              <p style={{ fontSize:"0.8125rem", color:"#94A3B8", margin:0 }}>
                PDF, PNG, JPG or DOCX &bull; Max 10 MB
              </p>
            </div>
          ) : (
            <div style={{
              background:"#ECFDF5", border:"1px solid #A7F3D0",
              borderRadius:10, padding:"16px 20px",
              display:"flex", alignItems:"center", gap:12,
            }}>
              <div style={{ width:36, height:36, background:"#D1FAE5", borderRadius:8, display:"flex", alignItems:"center", justifyContent:"center" }}>
                <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                  <path d="M3 9l4 4 8-8" stroke="#059669" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
              <div style={{ flex:1 }}>
                <p style={{ fontSize:"0.875rem", fontWeight:700, color:"#065F46", margin:0 }}>Letterhead uploaded</p>
                <p style={{ fontSize:"0.8125rem", color:"#047857", margin:0 }}>company-letterhead.pdf &bull; Applied to all documents</p>
              </div>
              <button onClick={() => setUploaded(false)} style={{ background:"none", border:"none", cursor:"pointer", color:"#6B7280", fontSize:"0.8125rem", fontWeight:500 }}>
                Replace
              </button>
            </div>
          )}

          <div style={{ marginTop:20, padding:"14px 18px", background:"#F8F9FA", border:"1px solid #E2E8F0", borderRadius:9 }}>
            <p style={{ fontSize:"0.8125rem", fontWeight:600, color:"#374151", margin:"0 0 6px" }}>Preview placement</p>
            <p style={{ fontSize:"0.8125rem", color:"#64748B", margin:0 }}>
              Your letterhead will appear at the top of: Dispute letters, Section 72 notices, Client quotes, Invoices, and Prescription challenge letters.
            </p>
          </div>
        </div>
      )}

      {/* AI create flow */}
      {mode === "create" && (
        <div className="credo-card" style={{ padding:"28px" }}>
          <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:20 }}>
            <button onClick={() => setMode(null)} style={{ background:"none", border:"none", cursor:"pointer", color:"#64748B", padding:4 }}>
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path d="M10 4L6 8l4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
            <div>
              <h3 style={{ fontSize:"1rem", fontWeight:700, color:"#0F172A", margin:0 }}>Create your letterhead with AI</h3>
              <p style={{ fontSize:"0.8125rem", color:"#64748B", margin:0 }}>Fill in your details — Credo will generate a professional letterhead.</p>
            </div>
          </div>

          {!generated ? (
            <>
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:14, marginBottom:20 }}>
                <div style={{ gridColumn:"1 / -1" }}>
                  <label className="credo-label">Company / Practice name</label>
                  <input className="credo-input" placeholder="e.g. Sithole Credit Solutions" />
                </div>
                <div>
                  <label className="credo-label">Tagline (optional)</label>
                  <input className="credo-input" placeholder="e.g. Restoring Financial Dignity" />
                </div>
                <div>
                  <label className="credo-label">Registration number</label>
                  <input className="credo-input" placeholder="e.g. 2021/123456/07" />
                </div>
                <div>
                  <label className="credo-label">Physical address</label>
                  <input className="credo-input" placeholder="123 Main St, Johannesburg, 2001" />
                </div>
                <div>
                  <label className="credo-label">Contact number</label>
                  <input className="credo-input" placeholder="010 123 4567" />
                </div>
                <div>
                  <label className="credo-label">Email address</label>
                  <input className="credo-input" placeholder="info@sitholecredit.co.za" />
                </div>
                <div>
                  <label className="credo-label">Website (optional)</label>
                  <input className="credo-input" placeholder="www.sitholecredit.co.za" />
                </div>
                <div>
                  <label className="credo-label">NCR / NCRDC number (if registered)</label>
                  <input className="credo-input" placeholder="e.g. NCRDC3693" />
                </div>
              </div>

              <div style={{ marginBottom:20 }}>
                <label className="credo-label">Colour style</label>
                <div style={{ display:"flex", gap:10, flexWrap:"wrap" }}>
                  {[
                    { name:"Classic Navy & Gold", primary:"#0B1D35", accent:"#C4953A" },
                    { name:"Professional Black", primary:"#111827", accent:"#374151" },
                    { name:"Modern Teal",        primary:"#0D4F5C", accent:"#0E7490" },
                    { name:"Warm Burgundy",      primary:"#7F1D1D", accent:"#B91C1C" },
                    { name:"Forest Green",       primary:"#14532D", accent:"#16A34A" },
                  ].map((style, i) => (
                    <label key={style.name} style={{ display:"flex", alignItems:"center", gap:8, cursor:"pointer" }}>
                      <input type="radio" name="color_style" defaultChecked={i === 0} style={{ accentColor:style.primary }} />
                      <div style={{ display:"flex", alignItems:"center", gap:5 }}>
                        <div style={{ width:14, height:14, borderRadius:3, background:style.primary }} />
                        <div style={{ width:14, height:14, borderRadius:3, background:style.accent }} />
                        <span style={{ fontSize:"0.8125rem", color:"#374151" }}>{style.name}</span>
                      </div>
                    </label>
                  ))}
                </div>
              </div>

              <div style={{ marginBottom:20 }}>
                <label className="credo-label">Logo upload (optional)</label>
                <div style={{
                  border:"1.5px dashed #E2E8F0", borderRadius:9, padding:"16px 20px",
                  display:"flex", alignItems:"center", gap:12, cursor:"pointer",
                  background:"#F8F9FA",
                }}>
                  <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                    <path d="M10 13V5M7 8l3-3 3 3" stroke="#94A3B8" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                    <path d="M4 16h12" stroke="#94A3B8" strokeWidth="1.5" strokeLinecap="round" />
                  </svg>
                  <div>
                    <p style={{ fontSize:"0.875rem", fontWeight:500, color:"#64748B", margin:0 }}>Upload your logo</p>
                    <p style={{ fontSize:"0.75rem", color:"#94A3B8", margin:0 }}>PNG or SVG, transparent background preferred</p>
                  </div>
                </div>
                <p style={{ fontSize:"0.75rem", color:"#94A3B8", marginTop:6 }}>
                  No logo? Credo will use your initials in a professional monogram style.
                </p>
              </div>

              <button
                onClick={handleGenerate}
                disabled={generating}
                className="btn-primary"
                style={{ width:"100%", padding:"12px 0", fontSize:"0.9375rem", justifyContent:"center" }}
              >
                {generating ? (
                  <>
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" style={{ animation:"spin 1s linear infinite" }}>
                      <circle cx="8" cy="8" r="5.5" stroke="rgba(255,255,255,0.3)" strokeWidth="2" />
                      <path d="M8 2.5a5.5 5.5 0 015.5 5.5" stroke="white" strokeWidth="2" strokeLinecap="round" />
                    </svg>
                    Generating your letterhead...
                  </>
                ) : "Generate letterhead with AI"}
              </button>
            </>
          ) : (
            <div>
              <div style={{
                background:"linear-gradient(135deg, #ECFDF5, #D1FAE5)",
                border:"1px solid #A7F3D0",
                borderRadius:10, padding:"16px 20px",
                display:"flex", alignItems:"center", gap:12, marginBottom:20,
              }}>
                <div style={{ width:36, height:36, background:"#D1FAE5", borderRadius:8, display:"flex", alignItems:"center", justifyContent:"center" }}>
                  <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                    <path d="M3 9l4 4 8-8" stroke="#059669" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </div>
                <div>
                  <p style={{ fontSize:"0.875rem", fontWeight:700, color:"#065F46", margin:0 }}>Letterhead generated successfully</p>
                  <p style={{ fontSize:"0.8125rem", color:"#047857", margin:0 }}>
                    Applied to all quotes, invoices, and dispute letters immediately.
                  </p>
                </div>
              </div>

              {/* Preview mockup */}
              <div style={{
                border:"1px solid #E2E8F0", borderRadius:10, overflow:"hidden",
                boxShadow:"0 4px 12px rgba(0,0,0,0.06)", marginBottom:20,
              }}>
                {/* Letterhead header */}
                <div style={{ background:"#0B1D35", padding:"16px 24px", display:"flex", alignItems:"center", justifyContent:"space-between" }}>
                  <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                    <div style={{ width:36, height:36, background:"rgba(196,149,58,0.2)", border:"1px solid rgba(196,149,58,0.4)", borderRadius:8, display:"flex", alignItems:"center", justifyContent:"center" }}>
                      <span style={{ fontSize:"0.875rem", fontWeight:800, color:"#C4953A" }}>SC</span>
                    </div>
                    <div>
                      <p style={{ fontSize:"0.9375rem", fontWeight:700, color:"#FFFFFF", margin:0 }}>Sithole Credit Solutions</p>
                      <p style={{ fontSize:"0.75rem", color:"#94A3B8", margin:0 }}>Restoring Financial Dignity</p>
                    </div>
                  </div>
                  <div style={{ textAlign:"right" }}>
                    <p style={{ fontSize:"0.75rem", color:"#94A3B8", margin:0 }}>Reg: 2021/123456/07</p>
                    <p style={{ fontSize:"0.75rem", color:"#C4953A", margin:0 }}>NCRDC3693</p>
                  </div>
                </div>
                <div style={{ height:3, background:"#C4953A" }} />
                <div style={{ padding:"16px 24px", background:"#FAFAFA" }}>
                  <p style={{ fontSize:"0.75rem", color:"#94A3B8", margin:0 }}>
                    123 Main St, Johannesburg 2001 &bull; 010 123 4567 &bull; info@sitholecredit.co.za
                  </p>
                </div>
              </div>

              <div style={{ display:"flex", gap:10 }}>
                <button className="btn-outline" style={{ padding:"10px 20px" }} onClick={() => setGenerated(false)}>
                  Regenerate
                </button>
                <button className="btn-primary" style={{ flex:1, padding:"10px 0", justifyContent:"center" }}>
                  Apply letterhead
                </button>
              </div>
            </div>
          )}
        </div>
      )}
      <style>{`@keyframes spin { from { transform:rotate(0deg); } to { transform:rotate(360deg); } }`}</style>
    </div>
  );
}

/* ─── Notifications Tab ──────────────────────────────────────────── */
function NotificationsTab() {
  return (
    <div className="credo-card" style={{ padding:"28px" }}>
      <h3 style={{ fontSize:"1rem", fontWeight:700, color:"#0F172A", margin:"0 0 4px" }}>Notification preferences</h3>
      <p style={{ fontSize:"0.875rem", color:"#64748B", margin:"0 0 24px" }}>Choose how and when Credo contacts you.</p>
      {[
        { label:"Case status updates",        desc:"When your case moves to the next step",   email:true,  sms:true,  whatsapp:true  },
        { label:"Bureau response received",   desc:"When a credit bureau responds to your dispute", email:true, sms:true, whatsapp:true },
        { label:"New negative item alert",    desc:"When a new default or inquiry is listed", email:true,  sms:true,  whatsapp:false },
        { label:"Prescription date warning",  desc:"14 days before a debt prescription date", email:true,  sms:false, whatsapp:false },
        { label:"Invoice reminders",          desc:"When a payment is due or overdue",        email:true,  sms:false, whatsapp:false },
        { label:"Promotional updates",        desc:"Tips, feature updates, and news",         email:false, sms:false, whatsapp:false },
      ].map(n => (
        <div key={n.label} style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"14px 0", borderBottom:"1px solid #F1F5F9" }}>
          <div>
            <p style={{ fontSize:"0.875rem", fontWeight:600, color:"#0F172A", margin:"0 0 2px" }}>{n.label}</p>
            <p style={{ fontSize:"0.8125rem", color:"#94A3B8", margin:0 }}>{n.desc}</p>
          </div>
          <div style={{ display:"flex", gap:20 }}>
            {([["Email", n.email], ["SMS", n.sms], ["WhatsApp", n.whatsapp]] as [string, boolean][]).map(([ch, def]) => (
              <label key={ch} style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:4, cursor:"pointer" }}>
                <input type="checkbox" defaultChecked={def} style={{ accentColor:"#0B1D35", width:16, height:16 }} />
                <span style={{ fontSize:"0.6875rem", color:"#94A3B8" }}>{ch}</span>
              </label>
            ))}
          </div>
        </div>
      ))}
      <button className="btn-primary" style={{ marginTop:20, padding:"10px 20px" }}>Save preferences</button>
    </div>
  );
}

/* ─── Security Tab ───────────────────────────────────────────────── */
function SecurityTab() {
  return (
    <div style={{ display:"flex", flexDirection:"column", gap:16 }}>
      <div className="credo-card" style={{ padding:"28px" }}>
        <h3 style={{ fontSize:"1rem", fontWeight:700, color:"#0F172A", margin:"0 0 4px" }}>Change password</h3>
        <p style={{ fontSize:"0.875rem", color:"#64748B", margin:"0 0 20px" }}>Use a strong password of at least 12 characters.</p>
        <div style={{ display:"flex", flexDirection:"column", gap:14, maxWidth:400 }}>
          <div><label className="credo-label">Current password</label><input className="credo-input" type="password" placeholder="Enter current password" /></div>
          <div><label className="credo-label">New password</label><input className="credo-input" type="password" placeholder="Min. 12 characters" /></div>
          <div><label className="credo-label">Confirm new password</label><input className="credo-input" type="password" placeholder="Repeat new password" /></div>
        </div>
        <button className="btn-primary" style={{ marginTop:20, padding:"10px 20px" }}>Update password</button>
      </div>
      <div className="credo-card" style={{ padding:"24px 28px" }}>
        <h3 style={{ fontSize:"1rem", fontWeight:700, color:"#0F172A", margin:"0 0 4px" }}>Two-factor authentication</h3>
        <p style={{ fontSize:"0.875rem", color:"#64748B", margin:"0 0 16px" }}>Add an extra layer of security via SMS or WhatsApp OTP.</p>
        <button className="btn-outline" style={{ padding:"9px 18px" }}>Enable 2FA</button>
      </div>
    </div>
  );
}

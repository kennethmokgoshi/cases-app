"use client";

import { useState } from "react";

const SERVICES = [
  { id: "judgment",      label: "Judgment Removal",            price: 4500,  description: "Rule 49 rescission application — Magistrate's or High Court", category: "Legal"     },
  { id: "default",       label: "Default Dispute",             price: 1800,  description: "Section 72 NCA dispute filed directly with credit bureaus",    category: "Dispute"   },
  { id: "debt_review",   label: "Debt Review Flag Removal",    price: 2500,  description: "DHS clearance certificate coordination and bureau flag removal", category: "DHS"      },
  { id: "prescription",  label: "Prescribed Debt Challenge",   price: 1200,  description: "Formal prescription challenge — 3-year rule (Prescription Act)",category: "Dispute"   },
  { id: "admin_order",   label: "Administration Order Removal",price: 3800,  description: "Court application to rescind administration order",             category: "Legal"     },
  { id: "eao",           label: "Garnishee / EAO Challenge",   price: 2200,  description: "Emolument Attachment Order lawfulness check and challenge",     category: "Legal"     },
  { id: "reckless",      label: "Reckless Lending Assessment", price: 3200,  description: "Forensic audit of credit agreements under NCA Section 80",     category: "Forensic"  },
  { id: "credit_report", label: "Full 4-Bureau Report Pull",   price: 350,   description: "Authorised retrieval from all four SA credit bureaus",          category: "Report"    },
];

const CATEGORY_COLORS: Record<string, string> = {
  Legal:    "#0B1D35",
  Dispute:  "#2563EB",
  DHS:      "#7C3AED",
  Forensic: "#D97706",
  Report:   "#059669",
};

type Step = "services" | "details" | "coupon" | "review";

export default function QuotePage() {
  const [step, setStep] = useState<Step>("services");
  const [selected, setSelected] = useState<string[]>([]);
  const [planType, setPlanType] = useState<"ai" | "manual">("manual");
  const [coupon, setCoupon] = useState("");
  const [couponApplied, setCouponApplied] = useState(false);
  const [couponDiscount, setCouponDiscount] = useState(0);
  const [aiLoading, setAiLoading] = useState(false);
  const [formData, setFormData] = useState({ name: "", email: "", phone: "", idNumber: "" });

  const toggle = (id: string) => {
    setSelected(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  const selectedServices = SERVICES.filter(s => selected.includes(s.id));
  const subtotal = selectedServices.reduce((sum, s) => sum + s.price, 0);
  const discount = couponApplied ? couponDiscount : 0;
  const total = subtotal - discount;
  const vat = total * 0.15;
  const totalWithVat = total + vat;

  const handleAIPlan = async () => {
    setAiLoading(true);
    setTimeout(() => {
      setSelected(["judgment", "default", "prescription"]);
      setPlanType("ai");
      setAiLoading(false);
    }, 2000);
  };

  const applyCoupon = () => {
    if (coupon.toUpperCase() === "CREDO20" || coupon.toUpperCase() === "PARTNER10") {
      const pct = coupon.toUpperCase() === "CREDO20" ? 0.20 : 0.10;
      setCouponDiscount(Math.round(subtotal * pct));
      setCouponApplied(true);
    }
  };

  const STEPS: { key: Step; label: string }[] = [
    { key:"services", label:"Services"    },
    { key:"details",  label:"Your Details"},
    { key:"coupon",   label:"Discount"    },
    { key:"review",   label:"Review"      },
  ];
  const stepIndex = STEPS.findIndex(s => s.key === step);

  return (
    <div className="animate-fade-in" style={{ maxWidth:900 }}>
      {/* Page header */}
      <div style={{ marginBottom:28 }}>
        <h2 style={{ fontSize:"1.25rem", fontWeight:700, color:"#0F172A", margin:"0 0 4px", letterSpacing:"-0.01em" }}>
          Get a Quote
        </h2>
        <p style={{ fontSize:"0.875rem", color:"#64748B", margin:0 }}>
          Choose your services manually or let our AI build the optimal plan for you.
        </p>
      </div>

      {/* Step indicator */}
      <div style={{ display:"flex", alignItems:"center", gap:0, marginBottom:28 }}>
        {STEPS.map((s, i) => (
          <div key={s.key} style={{ display:"flex", alignItems:"center" }}>
            <div style={{
              display:"flex", alignItems:"center", gap:8,
              padding:"8px 16px",
              background: s.key === step ? "#0B1D35" : i < stepIndex ? "#ECFDF5" : "#F1F5F9",
              borderRadius: i === 0 ? "8px 0 0 8px" : i === STEPS.length-1 ? "0 8px 8px 0" : "0",
              borderRight: i < STEPS.length-1 ? "1px solid #E2E8F0" : "none",
              cursor: i < stepIndex ? "pointer" : "default",
            }}
              onClick={() => { if (i < stepIndex) setStep(s.key); }}
            >
              <div style={{
                width:20, height:20, borderRadius:"50%", flexShrink:0,
                background: s.key === step ? "#C4953A" : i < stepIndex ? "#059669" : "#CBD5E1",
                display:"flex", alignItems:"center", justifyContent:"center",
              }}>
                {i < stepIndex ? (
                  <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                    <path d="M2 5l2 2 4-4" stroke="white" strokeWidth="1.5" strokeLinecap="round" />
                  </svg>
                ) : (
                  <span style={{ fontSize:"0.65rem", fontWeight:800, color: s.key === step ? "white" : "#64748B" }}>
                    {i+1}
                  </span>
                )}
              </div>
              <span style={{
                fontSize:"0.8125rem", fontWeight:600,
                color: s.key === step ? "#FFFFFF" : i < stepIndex ? "#059669" : "#94A3B8",
              }}>
                {s.label}
              </span>
            </div>
          </div>
        ))}
      </div>

      <div style={{ display:"grid", gridTemplateColumns:"1fr 300px", gap:20, alignItems:"start" }}>
        {/* Main content */}
        <div>
          {/* STEP 1: Services */}
          {step === "services" && (
            <div className="credo-card" style={{ padding:"28px" }}>
              {/* Plan type toggle */}
              <div style={{ display:"flex", gap:10, marginBottom:24 }}>
                <button onClick={() => setPlanType("manual")} style={{
                  flex:1, padding:"12px 16px",
                  background: planType === "manual" ? "#0B1D35" : "#F8F9FA",
                  border: planType === "manual" ? "2px solid #0B1D35" : "1px solid #E2E8F0",
                  borderRadius:9, cursor:"pointer", textAlign:"left",
                  transition:"all 150ms",
                }}>
                  <p style={{ fontSize:"0.875rem", fontWeight:700, color: planType==="manual" ? "#FFFFFF" : "#0F172A", margin:"0 0 2px" }}>
                    Manual selection
                  </p>
                  <p style={{ fontSize:"0.8125rem", color: planType==="manual" ? "#94A3B8" : "#64748B", margin:0 }}>
                    Choose the services you need
                  </p>
                </button>
                <button onClick={handleAIPlan} disabled={aiLoading} style={{
                  flex:1, padding:"12px 16px",
                  background: planType === "ai" ? "linear-gradient(135deg, #0B1D35, #1E4470)" : "#F8F9FA",
                  border: planType === "ai" ? "2px solid #C4953A" : "1px solid #E2E8F0",
                  borderRadius:9, cursor:"pointer", textAlign:"left",
                  transition:"all 150ms", position:"relative", overflow:"hidden",
                }}>
                  {planType === "ai" && (
                    <div style={{ position:"absolute", top:6, right:8 }}>
                      <span style={{ fontSize:"0.65rem", fontWeight:700, background:"#C4953A", color:"white", padding:"1px 7px", borderRadius:9999 }}>AI</span>
                    </div>
                  )}
                  <p style={{ fontSize:"0.875rem", fontWeight:700, color: planType==="ai" ? "#FFFFFF" : "#0F172A", margin:"0 0 2px" }}>
                    {aiLoading ? "Analysing your profile..." : "AI-powered plan"}
                  </p>
                  <p style={{ fontSize:"0.8125rem", color: planType==="ai" ? "#94A3B8" : "#64748B", margin:0 }}>
                    Built from your actual credit reports
                  </p>
                </button>
              </div>

              {aiLoading && (
                <div style={{ background:"#F0F5FB", border:"1px solid #C8D9EF", borderRadius:9, padding:"14px 18px", marginBottom:20, display:"flex", alignItems:"center", gap:10 }}>
                  <div style={{ width:8, height:8, borderRadius:"50%", background:"#C4953A", animation:"pulse 1s infinite" }} />
                  <p style={{ fontSize:"0.875rem", color:"#0B1D35", fontWeight:500, margin:0 }}>
                    Credo AI is analysing your 4-bureau credit reports...
                  </p>
                </div>
              )}

              <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
                {SERVICES.map(service => {
                  const isSelected = selected.includes(service.id);
                  return (
                    <div key={service.id} onClick={() => toggle(service.id)} style={{
                      border: isSelected ? "2px solid #0B1D35" : "1px solid #E2E8F0",
                      borderRadius:10, padding:"14px 16px",
                      cursor:"pointer",
                      background: isSelected ? "#F0F5FB" : "#FFFFFF",
                      display:"flex", alignItems:"center", gap:14,
                      transition:"all 150ms",
                    }}>
                      <div style={{
                        width:20, height:20, borderRadius:5, flexShrink:0,
                        background: isSelected ? "#0B1D35" : "#F8F9FA",
                        border: isSelected ? "none" : "1.5px solid #E2E8F0",
                        display:"flex", alignItems:"center", justifyContent:"center",
                      }}>
                        {isSelected && (
                          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                            <path d="M2 6l3 3 5-5" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        )}
                      </div>
                      <div style={{ flex:1 }}>
                        <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:2 }}>
                          <span style={{ fontSize:"0.875rem", fontWeight:700, color:"#0F172A" }}>{service.label}</span>
                          <span style={{
                            padding:"1px 8px", borderRadius:4, fontSize:"0.6875rem", fontWeight:600,
                            background:`${CATEGORY_COLORS[service.category]}18`,
                            color: CATEGORY_COLORS[service.category],
                          }}>
                            {service.category}
                          </span>
                        </div>
                        <p style={{ fontSize:"0.8125rem", color:"#64748B", margin:0 }}>{service.description}</p>
                      </div>
                      <span style={{ fontWeight:700, color:"#0F172A", whiteSpace:"nowrap" }}>
                        R {service.price.toLocaleString()}
                      </span>
                    </div>
                  );
                })}
              </div>

              <button
                onClick={() => setStep("details")}
                disabled={selected.length === 0}
                className="btn-primary"
                style={{ marginTop:20, width:"100%", padding:"12px 0", fontSize:"0.9375rem", justifyContent:"center" }}
              >
                Continue to details →
              </button>
            </div>
          )}

          {/* STEP 2: Details */}
          {step === "details" && (
            <div className="credo-card" style={{ padding:"28px" }}>
              <h3 style={{ fontSize:"1rem", fontWeight:700, color:"#0F172A", margin:"0 0 4px" }}>Your contact details</h3>
              <p style={{ fontSize:"0.875rem", color:"#64748B", margin:"0 0 24px" }}>
                Used to send your quote and create your account.
              </p>
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:16 }}>
                <div>
                  <label className="credo-label">Full name</label>
                  <input className="credo-input" placeholder="Sipho Sithole"
                    value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} />
                </div>
                <div>
                  <label className="credo-label">SA ID number</label>
                  <input className="credo-input" placeholder="8001015009087" maxLength={13}
                    value={formData.idNumber} onChange={e => setFormData({...formData, idNumber: e.target.value})} />
                </div>
                <div>
                  <label className="credo-label">Email address</label>
                  <input className="credo-input" type="email" placeholder="sipho@example.co.za"
                    value={formData.email} onChange={e => setFormData({...formData, email: e.target.value})} />
                </div>
                <div>
                  <label className="credo-label">Phone / WhatsApp</label>
                  <input className="credo-input" placeholder="071 234 5678"
                    value={formData.phone} onChange={e => setFormData({...formData, phone: e.target.value})} />
                </div>
              </div>

              <div style={{ height:1, background:"#E2E8F0", margin:"24px 0" }} />

              <div style={{
                background:"#F0F5FB", border:"1px solid #C8D9EF",
                borderRadius:9, padding:"14px 18px",
                display:"flex", gap:12, alignItems:"flex-start",
              }}>
                <svg width="18" height="18" viewBox="0 0 18 18" fill="none" style={{ flexShrink:0, marginTop:1 }}>
                  <path d="M9 2l6.5 3.5v4A7 7 0 019 16.5 7 7 0 012.5 9.5v-4L9 2z" stroke="#0B1D35" strokeWidth="1.4" strokeLinejoin="round" />
                  <path d="M9 7v3M9 12v.5" stroke="#0B1D35" strokeWidth="1.4" strokeLinecap="round" />
                </svg>
                <p style={{ fontSize:"0.875rem", color:"#374151", margin:0, lineHeight:1.6 }}>
                  Your personal information is processed in accordance with the Protection of Personal Information Act (POPIA).
                  We will never share your data with third parties without your consent.
                </p>
              </div>

              <div style={{ display:"flex", gap:10, marginTop:24 }}>
                <button onClick={() => setStep("services")} className="btn-outline" style={{ padding:"11px 20px" }}>
                  ← Back
                </button>
                <button onClick={() => setStep("coupon")} className="btn-primary" style={{ flex:1, padding:"11px 0", justifyContent:"center" }}>
                  Continue →
                </button>
              </div>
            </div>
          )}

          {/* STEP 3: Coupon */}
          {step === "coupon" && (
            <div className="credo-card" style={{ padding:"28px" }}>
              <h3 style={{ fontSize:"1rem", fontWeight:700, color:"#0F172A", margin:"0 0 4px" }}>Do you have a discount code?</h3>
              <p style={{ fontSize:"0.875rem", color:"#64748B", margin:"0 0 24px" }}>
                Received a coupon from your employer, bank, or partner? Apply it here.
              </p>

              {!couponApplied ? (
                <div style={{ display:"flex", gap:10 }}>
                  <input
                    className="credo-input"
                    placeholder="Enter code (e.g. CREDO20)"
                    value={coupon}
                    onChange={e => setCoupon(e.target.value.toUpperCase())}
                    style={{ flex:1, letterSpacing:"0.08em", fontWeight:600 }}
                  />
                  <button onClick={applyCoupon} className="btn-primary" style={{ padding:"10px 20px", whiteSpace:"nowrap" }}>
                    Apply
                  </button>
                </div>
              ) : (
                <div style={{
                  background:"#ECFDF5", border:"1px solid #A7F3D0",
                  borderRadius:10, padding:"16px 20px",
                  display:"flex", alignItems:"center", justifyContent:"space-between",
                }}>
                  <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                    <div style={{ width:32, height:32, borderRadius:8, background:"#D1FAE5", display:"flex", alignItems:"center", justifyContent:"center" }}>
                      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                        <path d="M3 8l3.5 3.5L13 4.5" stroke="#059669" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </div>
                    <div>
                      <p style={{ fontSize:"0.875rem", fontWeight:700, color:"#065F46", margin:0 }}>
                        Code applied: <span style={{ letterSpacing:"0.06em" }}>{coupon}</span>
                      </p>
                      <p style={{ fontSize:"0.8125rem", color:"#047857", margin:0 }}>
                        You save R {couponDiscount.toLocaleString()} on this quote
                      </p>
                    </div>
                  </div>
                  <button onClick={() => { setCouponApplied(false); setCouponDiscount(0); setCoupon(""); }}
                    style={{ background:"none", border:"none", cursor:"pointer", color:"#6B7280", fontSize:"0.8125rem" }}>
                    Remove
                  </button>
                </div>
              )}

              <p style={{ fontSize:"0.8125rem", color:"#94A3B8", marginTop:12 }}>
                Try <strong>CREDO20</strong> for 20% off, or <strong>PARTNER10</strong> for 10% off.
              </p>

              <div style={{ height:1, background:"#E2E8F0", margin:"24px 0" }} />

              <div style={{ display:"flex", gap:10 }}>
                <button onClick={() => setStep("details")} className="btn-outline" style={{ padding:"11px 20px" }}>
                  ← Back
                </button>
                <button onClick={() => setStep("review")} className="btn-primary" style={{ flex:1, padding:"11px 0", justifyContent:"center" }}>
                  Review quote →
                </button>
              </div>
            </div>
          )}

          {/* STEP 4: Review */}
          {step === "review" && (
            <div className="credo-card" style={{ padding:"28px" }}>
              <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:20 }}>
                <div style={{ width:36, height:36, borderRadius:9, background:"#E4EDF8", display:"flex", alignItems:"center", justifyContent:"center" }}>
                  {planType === "ai" ? (
                    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                      <rect x="3" y="7" width="12" height="8" rx="2" stroke="#0B1D35" strokeWidth="1.4" />
                      <path d="M6 7V5.5a3 3 0 016 0V7" stroke="#0B1D35" strokeWidth="1.4" strokeLinecap="round" />
                      <circle cx="6.5" cy="11" r="1" fill="#C4953A" />
                      <circle cx="11.5" cy="11" r="1" fill="#C4953A" />
                    </svg>
                  ) : (
                    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                      <path d="M9 2l6.5 3.5v4A7 7 0 019 16.5 7 7 0 012.5 9.5v-4L9 2z" stroke="#0B1D35" strokeWidth="1.4" strokeLinejoin="round" />
                      <path d="M6 9l2 2 4-4" stroke="#0B1D35" strokeWidth="1.4" strokeLinecap="round" />
                    </svg>
                  )}
                </div>
                <div>
                  <h3 style={{ fontSize:"1rem", fontWeight:700, color:"#0F172A", margin:0 }}>Your Quote Summary</h3>
                  <p style={{ fontSize:"0.8125rem", color:"#64748B", margin:0 }}>
                    {planType === "ai" ? "AI-generated plan" : "Manual selection"} &bull; {selectedServices.length} service{selectedServices.length !== 1 ? "s" : ""}
                  </p>
                </div>
              </div>

              <div style={{ display:"flex", flexDirection:"column", gap:8, marginBottom:20 }}>
                {selectedServices.map(s => (
                  <div key={s.id} style={{
                    display:"flex", justifyContent:"space-between", alignItems:"center",
                    padding:"12px 14px", background:"#F8F9FA", borderRadius:8,
                  }}>
                    <div>
                      <p style={{ fontSize:"0.875rem", fontWeight:600, color:"#0F172A", margin:0 }}>{s.label}</p>
                      <p style={{ fontSize:"0.75rem", color:"#94A3B8", margin:0 }}>{s.category}</p>
                    </div>
                    <span style={{ fontWeight:700, color:"#0F172A" }}>R {s.price.toLocaleString()}</span>
                  </div>
                ))}
              </div>

              <div style={{ borderTop:"1px solid #E2E8F0", paddingTop:16, display:"flex", flexDirection:"column", gap:8 }}>
                <div style={{ display:"flex", justifyContent:"space-between" }}>
                  <span style={{ fontSize:"0.875rem", color:"#64748B" }}>Subtotal</span>
                  <span style={{ fontSize:"0.875rem", color:"#0F172A" }}>R {subtotal.toLocaleString()}</span>
                </div>
                {couponApplied && (
                  <div style={{ display:"flex", justifyContent:"space-between" }}>
                    <span style={{ fontSize:"0.875rem", color:"#059669" }}>Discount ({coupon})</span>
                    <span style={{ fontSize:"0.875rem", color:"#059669" }}>— R {discount.toLocaleString()}</span>
                  </div>
                )}
                <div style={{ display:"flex", justifyContent:"space-between" }}>
                  <span style={{ fontSize:"0.875rem", color:"#64748B" }}>VAT (15%)</span>
                  <span style={{ fontSize:"0.875rem", color:"#0F172A" }}>R {Math.round(vat).toLocaleString()}</span>
                </div>
                <div style={{ height:1, background:"#E2E8F0", margin:"4px 0" }} />
                <div style={{ display:"flex", justifyContent:"space-between" }}>
                  <span style={{ fontSize:"1rem", fontWeight:800, color:"#0F172A" }}>Total</span>
                  <span style={{ fontSize:"1.125rem", fontWeight:800, color:"#0B1D35" }}>R {Math.round(totalWithVat).toLocaleString()}</span>
                </div>
              </div>

              <div style={{ display:"flex", gap:10, marginTop:24 }}>
                <button onClick={() => setStep("coupon")} className="btn-outline" style={{ padding:"11px 20px" }}>
                  ← Back
                </button>
                <button className="btn-accent" style={{ flex:1, padding:"12px 0", fontSize:"0.9375rem", fontWeight:700, justifyContent:"center" }}>
                  Accept quote &amp; create case
                </button>
              </div>
              <p style={{ fontSize:"0.75rem", color:"#94A3B8", textAlign:"center", marginTop:12 }}>
                By accepting, you agree to our Terms of Service. Invoice will be sent to your email.
              </p>
            </div>
          )}
        </div>

        {/* Quote sidebar */}
        <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
          <div className="credo-card" style={{ padding:"20px" }}>
            <p style={{ fontSize:"0.8125rem", fontWeight:700, color:"#0F172A", margin:"0 0 14px" }}>Selected services</p>
            {selected.length === 0 ? (
              <p style={{ fontSize:"0.875rem", color:"#94A3B8", textAlign:"center", padding:"20px 0" }}>
                No services selected yet
              </p>
            ) : (
              <>
                <div style={{ display:"flex", flexDirection:"column", gap:6, marginBottom:14 }}>
                  {selectedServices.map(s => (
                    <div key={s.id} style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                      <span style={{ fontSize:"0.8125rem", color:"#374151" }}>{s.label}</span>
                      <span style={{ fontSize:"0.8125rem", fontWeight:600, color:"#0F172A" }}>R {s.price.toLocaleString()}</span>
                    </div>
                  ))}
                </div>
                <div style={{ height:1, background:"#E2E8F0", marginBottom:12 }} />
                {couponApplied && (
                  <div style={{ display:"flex", justifyContent:"space-between", marginBottom:6 }}>
                    <span style={{ fontSize:"0.8125rem", color:"#059669" }}>Discount</span>
                    <span style={{ fontSize:"0.8125rem", fontWeight:600, color:"#059669" }}>— R {discount.toLocaleString()}</span>
                  </div>
                )}
                <div style={{ display:"flex", justifyContent:"space-between" }}>
                  <span style={{ fontSize:"0.875rem", fontWeight:700, color:"#0F172A" }}>Total (incl. VAT)</span>
                  <span style={{ fontSize:"0.9375rem", fontWeight:800, color:"#0B1D35" }}>
                    R {Math.round(totalWithVat).toLocaleString()}
                  </span>
                </div>
              </>
            )}
          </div>

          {/* AI nudge */}
          {planType !== "ai" && (
            <div style={{
              background:"linear-gradient(135deg, #0B1D35, #112847)",
              borderRadius:12, padding:"18px 20px",
            }}>
              <p style={{ fontSize:"0.8125rem", fontWeight:700, color:"#FFFFFF", margin:"0 0 6px" }}>
                Try the AI plan
              </p>
              <p style={{ fontSize:"0.8125rem", color:"#94A3B8", margin:"0 0 12px", lineHeight:1.55 }}>
                Our AI analyses your credit reports and builds the optimal plan — no guesswork.
              </p>
              <button onClick={handleAIPlan} style={{
                width:"100%", padding:"8px 0",
                background:"#C4953A", color:"white",
                border:"none", borderRadius:7,
                fontSize:"0.8125rem", fontWeight:600, cursor:"pointer",
              }}>
                Generate AI plan
              </button>
            </div>
          )}
        </div>
      </div>

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50%       { opacity: 0.5; transform: scale(0.8); }
        }
      `}</style>
    </div>
  );
}

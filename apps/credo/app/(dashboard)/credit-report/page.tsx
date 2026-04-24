"use client";

import { useState, useEffect } from "react";

type Bureau = "transunion" | "experian" | "xds" | "lightstone";

const BUREAUS: { key: Bureau; name: string }[] = [
  { key: "transunion", name: "TransUnion" },
  { key: "experian",   name: "Experian"    },
  { key: "xds",        name: "XDS"         },
  { key: "lightstone", name: "Lightstone"  },
];

interface BureauData {
  key: Bureau;
  name: string;
  score: number;
  lastPulled: string;
}

function ScoreGauge({ score, size = 88 }: { score: number; size?: number }) {
  const max = 999;
  const r = (size - 10) / 2;
  const c = 2 * Math.PI * r;
  const safeScore = score || 0;
  const offset = c * (1 - (safeScore / max) * 0.75);
  const color = safeScore >= 700 ? "#059669" : safeScore > 0 ? "#D97706" : "#E2E8F0";

  return (
    <div style={{ position: "relative", width: size, height: size }}>
      <svg width={size} height={size} style={{ transform: "rotate(135deg)" }}>
        <circle cx={size/2} cy={size/2} r={r} stroke="#E2E8F0" strokeWidth="5" fill="none" />
        <circle cx={size/2} cy={size/2} r={r} stroke={color} strokeWidth="5" fill="none"
          strokeLinecap="round" strokeDasharray={c} strokeDashoffset={safeScore > 0 ? offset : c}
          style={{ transition: "stroke-dashoffset 1s cubic-bezier(0.4,0,0.2,1)" }}
        />
      </svg>
      <div style={{ position:"absolute", inset:0, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center" }}>
        <span style={{ fontSize: size*0.24, fontWeight: 800, color: safeScore > 0 ? color : "#94A3B8", lineHeight: 1 }}>{safeScore || "—"}</span>
        <span style={{ fontSize: size*0.1, color:"#94A3B8", fontWeight:500 }}>{safeScore > 0 ? "/ 999" : "No Data"}</span>
      </div>
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const map: Record<string, { bg: string; color: string; label: string }> = {
    DISPUTED:           { bg:"#EFF6FF", color:"#2563EB", label:"Disputed"           },
    IN_REVIEW:          { bg:"#FFFBEB", color:"#D97706", label:"Under Review"        },
    PENDING_CLEARANCE:  { bg:"#F5F3FF", color:"#7C3AED", label:"Pending Clearance"   },
    PRESCRIBED:         { bg:"#ECFDF5", color:"#059669", label:"Possibly Prescribed" },
    RESOLVED:           { bg:"#ECFDF5", color:"#059669", label:"Resolved"            },
  };
  const s = map[status] ?? { bg:"#F1F5F9", color:"#475569", label: status };
  return (
    <span style={{ padding:"3px 10px", borderRadius:9999, background:s.bg, color:s.color, fontSize:"0.75rem", fontWeight:600 }}>
      {s.label}
    </span>
  );
}

function PaymentDots({ months }: { months: number }) {
  return (
    <div style={{ display:"flex", gap:3 }}>
      {Array.from({ length: Math.min(months, 12) }).map((_, i) => (
        <div key={i} style={{
          width: 10, height: 10, borderRadius: "50%",
          background: i < months - 1 ? "#059669" : "#C4953A",
          opacity: 1 - i * 0.04,
        }} />
      ))}
    </div>
  );
}

export default function CreditReportPage() {
  const [activeBureau, setActiveBureau] = useState<Bureau>("transunion");
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchData() {
      try {
        const res = await fetch("/api/consumer/dashboard");
        if (res.ok) setData(await res.json());
      } catch (err) {
        console.error("Fetch error:", err);
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, []);

  const bureausData = data?.bureaus || [];
  const bureaus = BUREAUS.map(b => {
    const d = bureausData.find((bd: any) => bd.name.toLowerCase().includes(b.key));
    return { ...b, score: d?.score || 0, lastPulled: d ? "Last updated today" : "Not pulled yet" };
  });

  const active = bureaus.find(b => b.key === activeBureau) || bureaus[0];
  const negativeItems = data?.negativeItems || [];
  const paymentProfile = data?.paymentProfile || [];

  return (
    <div className="animate-fade-in" style={{ display:"flex", flexDirection:"column", gap:24 }}>
      {/* Pull header */}
      <div style={{
        background:"linear-gradient(135deg, #0B1D35, #112847)",
        borderRadius:16, padding:"28px 32px",
        display:"flex", alignItems:"center", justifyContent:"space-between", gap:20, flexWrap:"wrap",
      }}>
        <div>
          <p className="section-label" style={{ color:"rgba(196,149,58,0.8)", marginBottom:6 }}>Credit Reports</p>
          <h2 style={{ fontSize:"1.25rem", fontWeight:700, color:"#FFFFFF", margin:"0 0 4px", letterSpacing:"-0.01em" }}>
            Your credit profile across all 4 bureaus
          </h2>
          <p style={{ fontSize:"0.875rem", color:"#64748B", margin:0 }}>
            Last updated 20 Mar 2026 &bull; You are entitled to one free report per bureau per year (NCA)
          </p>
        </div>
        <button className="btn-accent" style={{ whiteSpace:"nowrap", padding:"10px 20px" }}>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path d="M14 8A6 6 0 112 8" stroke="white" strokeWidth="1.5" strokeLinecap="round" />
            <path d="M14 4v4h-4" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Pull fresh reports
        </button>
      </div>

      {/* Bureau tabs */}
      <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit, minmax(160px, 1fr))", gap:12 }}>
        {bureaus.map((b) => {
          const isActive = b.key === activeBureau;
          const color = b.score >= 700 ? "#059669" : b.score > 0 ? "#D97706" : "#94A3B8";
          return (
            <button key={b.key} onClick={() => setActiveBureau(b.key)} style={{
              background: isActive ? "#FFFFFF" : "#F8F9FA",
              border: isActive ? "2px solid #0B1D35" : "1px solid #E2E8F0",
              borderRadius:12, padding:"16px",
              cursor:"pointer", textAlign:"left",
              boxShadow: isActive ? "0 4px 12px rgba(11,29,53,0.1)" : "none",
              transition:"all 150ms",
            }}>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:10 }}>
                <span style={{ fontSize:"0.8125rem", fontWeight:600, color:"#64748B" }}>{b.name}</span>
                {isActive && (
                  <span style={{ width:8, height:8, borderRadius:"50%", background:"#059669", display:"block" }} />
                )}
              </div>
              <div style={{ fontSize:"1.5rem", fontWeight:800, color: b.score > 0 ? color : "#E2E8F0", lineHeight:1 }}>{b.score || "—"}</div>
              <div style={{ fontSize:"0.75rem", color:"#94A3B8", marginTop:3 }}>{b.lastPulled}</div>
            </button>
          );
        })}
      </div>

      {/* Detail panel */}
      <div style={{ display:"grid", gridTemplateColumns: "1fr 300px", gap:20, alignItems:"start" }}>
        {/* Negative items */}
        <div className="credo-card" style={{ padding:"24px" }}>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:20 }}>
            <div>
              <h3 style={{ fontSize:"0.9375rem", fontWeight:700, color:"#0F172A", margin:"0 0 2px" }}>
                Negative Items
              </h3>
              <p style={{ fontSize:"0.8125rem", color:"#94A3B8", margin:0 }}>
                {negativeItems.length} items identified
              </p>
            </div>
            {negativeItems.length > 0 && (
              <button className="btn-primary" style={{ padding:"8px 16px", fontSize:"0.8125rem" }}>
                Dispute all
              </button>
            )}
          </div>

          <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
            {negativeItems.length > 0 ? (
              negativeItems.map((item) => (
                <div key={item.id} style={{
                  border:"1px solid #E2E8F0",
                  borderRadius:10,
                  padding:"16px 18px",
                  borderLeft: item.isPrescribed ? "3px solid #059669" : "1px solid #E2E8F0",
                }}>
                  <div style={{ display:"flex", alignItems:"flex-start", justifyContent:"space-between", gap:12, marginBottom:8 }}>
                    <div style={{ flex:1 }}>
                      <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:4 }}>
                        <span style={{
                          padding:"2px 8px", borderRadius:4,
                          background:"#F1F5F9", color:"#475569",
                          fontSize:"0.6875rem", fontWeight:700, letterSpacing:"0.04em",
                          textTransform:"uppercase",
                        }}>
                          {item.type}
                        </span>
                        <StatusPill status={item.status} />
                      </div>
                      <p style={{ fontSize:"0.9375rem", fontWeight:700, color:"#0F172A", margin:"0 0 3px" }}>
                        {item.creditor}
                      </p>
                      <p style={{ fontSize:"0.8125rem", color:"#64748B", margin:0 }}>{item.description}</p>
                    </div>
                    <div style={{ textAlign:"right", flexShrink:0 }}>
                      <p style={{ fontSize:"0.9375rem", fontWeight:700, color:"#0F172A", margin:"0 0 2px" }}>{item.amount}</p>
                      <p style={{ fontSize:"0.75rem", color:"#94A3B8", margin:0 }}>{item.date}</p>
                    </div>
                  </div>
                </div>
              ))
            ) : (
                <div style={{ padding: "40px 20px", textAlign: "center", border: "1px dashed #E2E8F0", borderRadius: 12 }}>
                  <p style={{ fontSize: "0.875rem", color: "#64748B", margin: 0 }}>No negative items found for this bureau.</p>
                </div>
            )}
          </div>
        </div>

        {/* Right panel */}
        <div style={{ display:"flex", flexDirection:"column", gap:16 }}>
          {/* Score detail */}
          <div className="credo-card" style={{ padding:"20px" }}>
            <p style={{ fontSize:"0.8125rem", fontWeight:700, color:"#0F172A", margin:"0 0 16px" }}>
              {active.name} Score
            </p>
            <div style={{ display:"flex", justifyContent:"center", marginBottom:16 }}>
              <ScoreGauge score={active.score} size={100} />
            </div>
            <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
              {active.score > 0 ? (
                [
                  { label:"Payment History",   value:72, color:"#059669" },
                  { label:"Credit Utilisation", value:55, color:"#D97706" },
                  { label:"Account Age",        value:61, color:"#D97706" },
                  { label:"Credit Mix",         value:80, color:"#059669" },
                  { label:"New Inquiries",      value:45, color:"#DC2626" },
                ].map((f) => (
                  <div key={f.label}>
                    <div style={{ display:"flex", justifyContent:"space-between", marginBottom:3 }}>
                      <span style={{ fontSize:"0.75rem", color:"#64748B" }}>{f.label}</span>
                      <span style={{ fontSize:"0.75rem", fontWeight:600, color:f.color }}>{f.value}%</span>
                    </div>
                    <div style={{ height:4, background:"#F1F5F9", borderRadius:9999 }}>
                      <div style={{ height:"100%", borderRadius:9999, background:f.color, width:`${f.value}%` }} />
                    </div>
                  </div>
                ))
              ) : (
                  <p style={{ fontSize: "0.75rem", color: "#94A3B8", textAlign: "center" }}>Pull a report to see score factors.</p>
              )}
            </div>
          </div>

          {/* Payment profile */}
          <div className="credo-card" style={{ padding:"20px" }}>
            <p style={{ fontSize:"0.8125rem", fontWeight:700, color:"#0F172A", margin:"0 0 14px" }}>
              Payment Profile
            </p>
            <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
              {paymentProfile.length > 0 ? (
                paymentProfile.map((acc) => (
                  <div key={acc.creditor}>
                    <div style={{ display:"flex", justifyContent:"space-between", marginBottom:4 }}>
                      <span style={{ fontSize:"0.8125rem", fontWeight:600, color:"#0F172A" }}>{acc.creditor}</span>
                    </div>
                    <PaymentDots months={acc.months} />
                  </div>
                ))
              ) : (
                  <p style={{ fontSize: "0.75rem", color: "#94A3B8", textAlign: "center" }}>No account data available.</p>
              )}
            </div>
          </div>

          {/* Prescription checker */}
          <div style={{
            background:"linear-gradient(135deg, #ECFDF5, #D1FAE5)",
            border:"1px solid #A7F3D0",
            borderRadius:12, padding:"18px 20px",
          }}>
            <div style={{ display:"flex", gap:10, alignItems:"flex-start" }}>
              <div style={{ width:32, height:32, borderRadius:8, background:"rgba(5,150,105,0.1)", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <path d="M8 2l6 3v4a6 6 0 01-6 5.5A6 6 0 012 9V5l6-3z" stroke="#059669" strokeWidth="1.4" strokeLinejoin="round" />
                  <path d="M5.5 8l2 2 3-3" stroke="#059669" strokeWidth="1.4" strokeLinecap="round" />
                </svg>
              </div>
              <div>
                <p style={{ fontSize:"0.875rem", fontWeight:700, color:"#065F46", margin:"0 0 4px" }}>
                  1 debt may be prescribed
                </p>
                <p style={{ fontSize:"0.8125rem", color:"#047857", margin:"0 0 12px" }}>
                  The Edgars default (Sep 2020) may qualify under the 3-year Prescription Act.
                </p>
                <button style={{
                  padding:"6px 14px", fontSize:"0.8125rem", fontWeight:600,
                  background:"#059669", color:"white",
                  border:"none", borderRadius:6, cursor:"pointer",
                }}>
                  Run full scanner
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

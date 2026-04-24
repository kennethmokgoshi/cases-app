"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

const STATUS_CONFIG: Record<string, { bg: string; color: string; label: string }> = {
  IN_PROGRESS: { bg:"#EFF6FF", color:"#2563EB", label:"In Progress"    },
  WAITING:     { bg:"#FFFBEB", color:"#D97706", label:"Awaiting Reply"  },
  PENDING:     { bg:"#F5F3FF", color:"#7C3AED", label:"Pending"         },
  RESOLVED:    { bg:"#ECFDF5", color:"#059669", label:"Resolved"        },
  OVERDUE:     { bg:"#FEF2F2", color:"#DC2626", label:"Overdue"         },
};

function StatusBadge({ status }: { status: string }) {
  const s = STATUS_CONFIG[status] ?? { bg:"#F1F5F9", color:"#475569", label: status };
  return (
    <span style={{ padding:"3px 10px", borderRadius:9999, background:s.bg, color:s.color, fontSize:"0.75rem", fontWeight:600 }}>
      {s.label}
    </span>
  );
}

function ProgressBar({ value }: { value: number }) {
  return (
    <div style={{ height:4, background:"#F1F5F9", borderRadius:9999, overflow:"hidden" }}>
      <div style={{
        height:"100%", borderRadius:9999,
        background: value === 100 ? "#059669" : "linear-gradient(90deg, #0B1D35, #C4953A)",
        width:`${value}%`,
        transition:"width 0.8s cubic-bezier(0.4,0,0.2,1)",
      }} />
    </div>
  );
}

export default function CasesPage() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<any>(null);
  const [filter, setFilter] = useState("ALL");

  useEffect(() => {
    async function fetchData() {
      try {
        const res = await fetch("/api/consumer/dashboard");
        if (res.ok) {
          const json = await res.json();
          setData(json);
          if (json.cases?.length > 0) setSelected(json.cases[0]);
        }
      } catch (err) {
        console.error("Fetch error:", err);
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, []);

  const cases = data?.cases || [];
  const filters = ["ALL", "IN_PROGRESS", "WAITING", "PENDING", "RESOLVED"];
  const filtered = filter === "ALL" ? cases : cases.filter((c: any) => c.status === filter);

  if (loading) return <div style={{ padding: 40, textAlign: "center", color: "#94A3B8" }}>Loading cases...</div>;

  return (
    <div className="animate-fade-in" style={{ display:"flex", flexDirection:"column", gap:20 }}>
      {/* Header */}
      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", gap:16, flexWrap:"wrap" }}>
        <div>
          <h2 style={{ fontSize:"1.25rem", fontWeight:700, color:"#0F172A", margin:"0 0 4px", letterSpacing:"-0.01em" }}>
            My Case Status
          </h2>
          <p style={{ fontSize:"0.875rem", color:"#64748B", margin:0 }}>
            {cases.filter((c: any) => c.status !== "RESOLVED").length} active &bull; {cases.filter((c: any) => c.status === "RESOLVED").length} resolved &mdash; managed by your debt counsellor
          </p>
        </div>
        <Link href="/quote" style={{ textDecoration:"none" }}>
          <button className="btn-primary" style={{ padding:"10px 18px", fontSize:"0.875rem", display:"flex", alignItems:"center", gap:8 }}>
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M7 1v12M1 7h12" stroke="white" strokeWidth="2" strokeLinecap="round" />
            </svg>
            Request a service
          </button>
        </Link>
      </div>

      {/* Read-only notice */}
      <div style={{
        background:"#F0F9FF", border:"1px solid #BAE6FD", borderRadius:9,
        padding:"10px 16px", display:"flex", alignItems:"center", gap:10,
      }}>
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" style={{ flexShrink:0 }}>
          <circle cx="8" cy="8" r="7" stroke="#0EA5E9" strokeWidth="1.3"/>
          <path d="M8 7v4M8 5.5v.5" stroke="#0EA5E9" strokeWidth="1.5" strokeLinecap="round"/>
        </svg>
        <p style={{ fontSize:"0.8125rem", color:"#0369A1", margin:0, lineHeight:1.5 }}>
          These cases are managed by your debt counselling firm. Updates here reflect real-time progress from their system.
          To request a new service, use <Link href="/quote" style={{ color:"#0B1D35", fontWeight:600, textDecoration:"underline" }}>Get a Quote</Link>.
        </p>
      </div>

      {/* Filter tabs */}
      <div style={{ display:"flex", gap:4, background:"#F8F9FA", border:"1px solid #E2E8F0", borderRadius:9, padding:3, width:"fit-content" }}>
        {filters.map(f => {
          const cfg = STATUS_CONFIG[f] ?? { color:"#475569", bg:"transparent", label: f === "ALL" ? "All Cases" : f };
          const isActive = filter === f;
          return (
            <button key={f} onClick={() => setFilter(f)} style={{
              padding:"6px 14px",
              background: isActive ? "#FFFFFF" : "transparent",
              border:"none",
              borderRadius:7,
              fontSize:"0.8125rem",
              fontWeight: isActive ? 600 : 500,
              color: isActive ? (f === "ALL" ? "#0F172A" : cfg.color) : "#64748B",
              cursor:"pointer",
              boxShadow: isActive ? "0 1px 3px rgba(0,0,0,0.08)" : "none",
              transition:"all 150ms",
              whiteSpace:"nowrap",
            }}>
              {f === "ALL" ? "All Cases" : cfg.label}
              {f !== "ALL" && (
                <span style={{ marginLeft:6, fontSize:"0.7rem" }}>
                  {cases.filter((c: any) => c.status === f).length}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Split view */}
      <div style={{ display:"grid", gridTemplateColumns: cases.length > 0 ? "380px 1fr" : "1fr", gap:16, alignItems:"start" }}>
        {cases.length > 0 ? (
          <>
            {/* Case list */}
            <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
              {filtered.map((c: any) => (
                <div key={c.id} onClick={() => setSelected(c)} style={{
                  background: selected?.id === c.id ? "#FFFFFF" : "#FAFAFA",
                  border: selected?.id === c.id ? "2px solid #0B1D35" : "1px solid #E2E8F0",
                  borderRadius:12, padding:"16px 18px",
                  cursor:"pointer",
                  boxShadow: selected?.id === c.id ? "0 4px 12px rgba(11,29,53,0.08)" : "none",
                  transition:"all 150ms",
                }}>
                  <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:8 }}>
                    <div>
                      <p style={{ fontSize:"0.875rem", fontWeight:700, color:"#0F172A", margin:"0 0 3px" }}>{c.title}</p>
                      <p style={{ fontSize:"0.8125rem", color:"#64748B", margin:0 }}>{c.type}</p>
                    </div>
                    <StatusBadge status={c.status} />
                  </div>
                  <ProgressBar value={c.progress || 0} />
                </div>
              ))}
            </div>

            {/* Case detail */}
            {selected && (
              <div className="credo-card" style={{ padding:"28px" }}>
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:24 }}>
                  <div>
                    <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:6 }}>
                      <span style={{ fontSize:"0.75rem", color:"#94A3B8", fontWeight:600, letterSpacing:"0.04em" }}>{selected.id}</span>
                      <StatusBadge status={selected.status} />
                    </div>
                    <h3 style={{ fontSize:"1.125rem", fontWeight:700, color:"#0F172A", margin:"0 0 4px", letterSpacing:"-0.01em" }}>
                      {selected.title}
                    </h3>
                  </div>
                </div>
                <p style={{ color: "#64748B", fontSize: "0.875rem" }}>Detailed status and timeline will be displayed here as updates are processed by the worker apps.</p>
              </div>
            )}
          </>
        ) : (
            <div style={{ padding: "80px 20px", textAlign: "center", border: "1px dashed #E2E8F0", borderRadius: 16 }}>
              <div style={{ width: 48, height: 48, background: "#F1F5F9", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px" }}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none"><path d="M12 8v4M12 16h.01" stroke="#94A3B8" strokeWidth="2" strokeLinecap="round" /></svg>
              </div>
              <h3 style={{ fontSize: "1rem", fontWeight: 700, color: "#0F172A", margin: "0 0 8px" }}>No Cases Yet</h3>
              <p style={{ fontSize: "0.875rem", color: "#64748B", margin: "0 0 20px" }}>You don't have any active credit repair cases at the moment.</p>
              <Link href="/quote" className="btn-primary" style={{ padding: "10px 24px" }}>Start Your Journey</Link>
            </div>
        )}
      </div>
    </div>
  );
}

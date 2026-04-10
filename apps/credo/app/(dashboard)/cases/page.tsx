"use client";

import { useState } from "react";
import { DEMO_CASES } from "@/lib/credo-demo-data";

const CASES = DEMO_CASES;

// Data moved to @/lib/credo-demo-data

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
  const [selected, setSelected] = useState(CASES[0]);
  const [filter, setFilter] = useState("ALL");

  const filters = ["ALL", "IN_PROGRESS", "WAITING", "PENDING", "RESOLVED"];
  const filtered = filter === "ALL" ? CASES : CASES.filter(c => c.status === filter);

  return (
    <div className="animate-fade-in" style={{ display:"flex", flexDirection:"column", gap:20 }}>
      {/* Header */}
      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", gap:16, flexWrap:"wrap" }}>
        <div>
          <h2 style={{ fontSize:"1.25rem", fontWeight:700, color:"#0F172A", margin:"0 0 4px", letterSpacing:"-0.01em" }}>
            My Case Status
          </h2>
          <p style={{ fontSize:"0.875rem", color:"#64748B", margin:0 }}>
            {CASES.filter(c => c.status !== "RESOLVED").length} active &bull; {CASES.filter(c => c.status === "RESOLVED").length} resolved &mdash; managed by your debt counsellor
          </p>
        </div>
        <a href="/quote" style={{ textDecoration:"none" }}>
          <button className="btn-primary" style={{ padding:"10px 18px", fontSize:"0.875rem", display:"flex", alignItems:"center", gap:8 }}>
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M7 1v12M1 7h12" stroke="white" strokeWidth="2" strokeLinecap="round" />
            </svg>
            Request a service
          </button>
        </a>
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
          To request a new service, use <a href="/quote" style={{ color:"#0B1D35", fontWeight:600, textDecoration:"underline" }}>Get a Quote</a>.
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
                  {CASES.filter(c => c.status === f).length}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Split view */}
      <div style={{ display:"grid", gridTemplateColumns:"380px 1fr", gap:16, alignItems:"start" }}>
        {/* Case list */}
        <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
          {filtered.map(c => (
            <div key={c.id} onClick={() => setSelected(c)} style={{
              background: selected.id === c.id ? "#FFFFFF" : "#FAFAFA",
              border: selected.id === c.id ? "2px solid #0B1D35" : "1px solid #E2E8F0",
              borderRadius:12, padding:"16px 18px",
              cursor:"pointer",
              boxShadow: selected.id === c.id ? "0 4px 12px rgba(11,29,53,0.08)" : "none",
              transition:"all 150ms",
            }}>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:8 }}>
                <div>
                  <p style={{ fontSize:"0.875rem", fontWeight:700, color:"#0F172A", margin:"0 0 3px" }}>{c.title}</p>
                  <p style={{ fontSize:"0.8125rem", color:"#64748B", margin:0 }}>{c.type}</p>
                </div>
                <StatusBadge status={c.status} />
              </div>
              <ProgressBar value={c.progress} />
              <div style={{ display:"flex", justifyContent:"space-between", marginTop:8 }}>
                <span style={{ fontSize:"0.75rem", color:"#94A3B8" }}>{c.progress}% complete</span>
                <span style={{ fontSize:"0.75rem", color:"#94A3B8" }}>
                  {c.daysLeft ? `${c.daysLeft}d remaining` : `${c.daysOpen}d open`}
                </span>
              </div>
            </div>
          ))}
        </div>

        {/* Case detail */}
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
              <p style={{ fontSize:"0.875rem", color:"#64748B", margin:0 }}>
                {selected.type} &bull; {selected.bureau} &bull; Opened {selected.openedDate}
              </p>
            </div>
            <div style={{ display:"flex", gap:8 }}>
              <button className="btn-ghost" style={{ fontSize:"0.8125rem" }}>Download PDF</button>
              <button className="btn-outline" style={{ fontSize:"0.8125rem" }}>Add document</button>
            </div>
          </div>

          {/* Progress */}
          <div style={{ marginBottom:28 }}>
            <div style={{ display:"flex", justifyContent:"space-between", marginBottom:8 }}>
              <span style={{ fontSize:"0.875rem", fontWeight:600, color:"#0F172A" }}>Progress</span>
              <span style={{ fontSize:"0.875rem", fontWeight:700, color: selected.progress === 100 ? "#059669" : "#0B1D35" }}>
                {selected.progress}%
              </span>
            </div>
            <div style={{ height:6, background:"#F1F5F9", borderRadius:9999 }}>
              <div style={{
                height:"100%", borderRadius:9999,
                background: selected.progress === 100 ? "#059669" : "linear-gradient(90deg, #0B1D35, #1E4470)",
                width:`${selected.progress}%`,
                transition:"width 0.8s cubic-bezier(0.4,0,0.2,1)",
              }} />
            </div>
          </div>

          {/* Steps */}
          <div style={{ marginBottom:28 }}>
            <p style={{ fontSize:"0.875rem", fontWeight:700, color:"#0F172A", margin:"0 0 16px" }}>Steps</p>
            <div style={{ display:"flex", flexDirection:"column", gap:0 }}>
              {selected.steps.map((step, i) => (
                <div key={i} style={{ display:"flex", gap:14, alignItems:"flex-start" }}>
                  <div style={{ display:"flex", flexDirection:"column", alignItems:"center" }}>
                    <div style={{
                      width:24, height:24, borderRadius:"50%", flexShrink:0,
                      background: step.done ? "#0B1D35" : "#F1F5F9",
                      border: step.done ? "none" : "2px solid #E2E8F0",
                      display:"flex", alignItems:"center", justifyContent:"center",
                    }}>
                      {step.done ? (
                        <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                          <path d="M2 6l3 3 5-5" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      ) : (
                        <div style={{ width:6, height:6, borderRadius:"50%", background:"#CBD5E1" }} />
                      )}
                    </div>
                    {i < selected.steps.length - 1 && (
                      <div style={{ width:2, height:24, background: step.done ? "#0B1D35" : "#E2E8F0", marginTop:2 }} />
                    )}
                  </div>
                  <div style={{ paddingBottom: i < selected.steps.length - 1 ? 12 : 0 }}>
                    <p style={{
                      fontSize:"0.875rem",
                      fontWeight: step.done ? 600 : 400,
                      color: step.done ? "#0F172A" : "#94A3B8",
                      margin:"2px 0 0",
                    }}>
                      {step.label}
                    </p>
                    {step.date && (
                      <p style={{ fontSize:"0.75rem", color:"#94A3B8", margin:0 }}>{step.date}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Case updates */}
          <div>
            <p style={{ fontSize:"0.875rem", fontWeight:700, color:"#0F172A", margin:"0 0 14px" }}>Case Updates</p>
            <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
              {selected.updates.map((u, i) => (
                <div key={i} style={{
                  display:"flex", gap:12, alignItems:"flex-start",
                  padding:"12px 14px",
                  background:"#F8F9FA",
                  borderRadius:9,
                  border:"1px solid #F1F5F9",
                }}>
                  <span style={{
                    fontSize:"0.75rem", fontWeight:600, color:"#94A3B8",
                    whiteSpace:"nowrap", paddingTop:1,
                  }}>
                    {u.date}
                  </span>
                  <p style={{ fontSize:"0.875rem", color:"#374151", margin:0, lineHeight:1.55 }}>{u.text}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

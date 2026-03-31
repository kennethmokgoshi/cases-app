"use client";

import Link from "next/link";

/* ─── Score Ring ─────────────────────────────────────────────────── */
function ScoreRing({ score, size = 100 }: { score: number; size?: number }) {
  const max = 999;
  const radius = (size - 12) / 2;
  const circ = 2 * Math.PI * radius;
  const pct = score / max;
  const offset = circ * (1 - pct * 0.75);
  const color = score >= 700 ? "#059669" : score >= 600 ? "#D97706" : score >= 500 ? "#D97706" : "#DC2626";
  const label = score >= 700 ? "Excellent" : score >= 600 ? "Good" : score >= 500 ? "Fair" : "Poor";

  return (
    <div style={{ position: "relative", width: size, height: size }}>
      <svg width={size} height={size} style={{ transform: "rotate(135deg)" }}>
        <circle cx={size / 2} cy={size / 2} r={radius} strokeWidth="6" stroke="#E2E8F0" fill="none" />
        <circle
          cx={size / 2} cy={size / 2} r={radius}
          strokeWidth="6" stroke={color} fill="none"
          strokeLinecap="round"
          strokeDasharray={circ}
          strokeDashoffset={offset}
          style={{ transition: "stroke-dashoffset 1s cubic-bezier(0.4,0,0.2,1)" }}
        />
      </svg>
      <div style={{
        position: "absolute", inset: 0,
        display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center",
      }}>
        <span style={{ fontSize: size * 0.24, fontWeight: 800, color, lineHeight: 1 }}>{score}</span>
        <span style={{ fontSize: size * 0.1, color: "#94A3B8", fontWeight: 500, marginTop: 2 }}>{label}</span>
      </div>
    </div>
  );
}

/* ─── Bureau Score Card ──────────────────────────────────────────── */
function BureauCard({ name, score, change }: { name: string; score: number; change: number }) {
  const positive = change >= 0;
  const color = score >= 700 ? "#059669" : score >= 600 ? "#D97706" : "#DC2626";

  return (
    <div className="credo-card" style={{ padding: "20px 20px", display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontSize: "0.8125rem", fontWeight: 600, color: "#64748B" }}>{name}</span>
        <span style={{
          fontSize: "0.75rem", fontWeight: 600, padding: "2px 8px", borderRadius: 9999,
          background: positive ? "#ECFDF5" : "#FEF2F2",
          color: positive ? "#059669" : "#DC2626",
        }}>
          {positive ? "+" : ""}{change}
        </span>
      </div>
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between" }}>
        <div>
          <div style={{ fontSize: "2rem", fontWeight: 800, color, lineHeight: 1 }}>{score}</div>
          <div style={{ fontSize: "0.75rem", color: "#94A3B8", marginTop: 2 }}>
            {score >= 700 ? "Excellent" : score >= 600 ? "Good" : "Fair"}
          </div>
        </div>
        {/* Sparkline */}
        <svg width="64" height="32" viewBox="0 0 64 32" fill="none">
          <polyline
            points={score >= 700
              ? "0,28 12,22 24,20 36,16 48,12 64,8"
              : "0,26 12,24 24,22 36,20 48,18 64,16"}
            stroke={color} strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round"
          />
          <circle cx="64" cy={score >= 700 ? 8 : 16} r="3" fill={color} />
        </svg>
      </div>
      <div style={{ height: 4, background: "#F1F5F9", borderRadius: 9999 }}>
        <div style={{
          height: "100%", borderRadius: 9999,
          background: color,
          width: `${(score / 999) * 100}%`,
          transition: "width 1s cubic-bezier(0.4,0,0.2,1)",
        }} />
      </div>
    </div>
  );
}

/* ─── Case Status Badge ──────────────────────────────────────────── */
function CaseBadge({ status }: { status: string }) {
  const map: Record<string, { bg: string; color: string; label: string }> = {
    IN_PROGRESS:  { bg: "#EFF6FF", color: "#2563EB", label: "In Progress"  },
    PENDING:      { bg: "#FFFBEB", color: "#D97706", label: "Pending"       },
    RESOLVED:     { bg: "#ECFDF5", color: "#059669", label: "Resolved"      },
    WAITING:      { bg: "#F5F3FF", color: "#7C3AED", label: "Awaiting Reply" },
    OVERDUE:      { bg: "#FEF2F2", color: "#DC2626", label: "Overdue"       },
  };
  const s = map[status] ?? { bg: "#F1F5F9", color: "#475569", label: status };
  return (
    <span style={{
      padding: "3px 10px", borderRadius: 9999,
      background: s.bg, color: s.color,
      fontSize: "0.75rem", fontWeight: 600,
    }}>
      {s.label}
    </span>
  );
}

/* ─── Activity Item ──────────────────────────────────────────────── */
function ActivityItem({
  icon, title, subtitle, time, iconBg,
}: { icon: React.ReactNode; title: string; subtitle: string; time: string; iconBg: string }) {
  return (
    <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
      <div style={{
        width: 34, height: 34, flexShrink: 0,
        background: iconBg, borderRadius: 9,
        display: "flex", alignItems: "center", justifyContent: "center",
      }}>
        {icon}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ fontSize: "0.875rem", fontWeight: 600, color: "#0F172A", margin: "0 0 2px" }}>
          {title}
        </p>
        <p style={{ fontSize: "0.8125rem", color: "#64748B", margin: 0 }}>{subtitle}</p>
      </div>
      <span style={{ fontSize: "0.75rem", color: "#94A3B8", whiteSpace: "nowrap", marginTop: 2 }}>
        {time}
      </span>
    </div>
  );
}

/* ─── Page ───────────────────────────────────────────────────────── */
export default function DashboardPage() {
  const bureaus = [
    { name: "TransUnion",  score: 648, change: +12 },
    { name: "Experian",    score: 622, change: +8  },
    { name: "XDS",         score: 671, change: +18 },
    { name: "Lightstone",  score: 635, change: +5  },
  ];

  const cases = [
    {
      id: "CR-2024-001",
      title: "Judgment Removal — Standard Bank",
      type: "Judgment Rescission",
      status: "IN_PROGRESS",
      step: "Step 3 of 7",
      daysLeft: 14,
      bureau: "TransUnion",
    },
    {
      id: "CR-2024-002",
      title: "Default Dispute — Capitec",
      type: "Section 72 Dispute",
      status: "WAITING",
      step: "Awaiting bureau response",
      daysLeft: 6,
      bureau: "Experian",
    },
    {
      id: "CR-2024-003",
      title: "Debt Review Flag Removal",
      type: "DHS Clearance",
      status: "PENDING",
      step: "Clearance certificate required",
      daysLeft: null,
      bureau: "All bureaus",
    },
  ];

  const avgScore = Math.round(bureaus.reduce((s, b) => s + b.score, 0) / bureaus.length);

  return (
    <div className="animate-fade-in" style={{ display: "flex", flexDirection: "column", gap: 28 }}>
      {/* Greeting row */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 20, flexWrap: "wrap" }}>
        <div>
          <p className="section-label" style={{ marginBottom: 4 }}>Monday, 24 March 2026</p>
          <h2 style={{ fontSize: "1.5rem", fontWeight: 700, color: "#0F172A", letterSpacing: "-0.02em", margin: "0 0 6px" }}>
            Good morning, Sipho
          </h2>
          <p style={{ fontSize: "0.9375rem", color: "#64748B", margin: 0 }}>
            Your credit score improved by <strong style={{ color: "#059669" }}>+11 points</strong> this month.
          </p>
        </div>
        <Link href="/quote" className="btn-primary" style={{ padding: "10px 20px", whiteSpace: "nowrap" }}>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path d="M8 2l6.5 3.5v4a7 7 0 01-6.5 6.5A7 7 0 011.5 9.5v-4L8 2z" stroke="white" strokeWidth="1.4" />
            <path d="M5.5 8l2 2 3.5-3.5" stroke="white" strokeWidth="1.3" strokeLinecap="round" />
          </svg>
          Get a quote
        </Link>
      </div>

      {/* Credit score overview */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "auto 1fr",
        gap: 24,
        background: "#FFFFFF",
        border: "1px solid #E2E8F0",
        borderRadius: 16,
        padding: "28px 28px",
        alignItems: "center",
      }}>
        {/* Composite ring */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
          <ScoreRing score={avgScore} size={120} />
          <p style={{ fontSize: "0.75rem", color: "#94A3B8", textAlign: "center", margin: 0 }}>
            Average across<br />all 4 bureaus
          </p>
        </div>

        {/* Bureau grid */}
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
            <p style={{ fontSize: "0.875rem", fontWeight: 700, color: "#0F172A", margin: 0 }}>Credit Score by Bureau</p>
            <button style={{ fontSize: "0.8125rem", color: "#C4953A", background: "none", border: "none", cursor: "pointer", fontWeight: 600, padding: 0 }}>
              Pull latest reports →
            </button>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12 }}>
            {bureaus.map((b) => (
              <BureauCard key={b.name} {...b} />
            ))}
          </div>
        </div>
      </div>

      {/* Stats row */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 16 }}>
        {[
          { label: "Active Cases", value: "3", sub: "2 in progress", color: "#2563EB", bg: "#EFF6FF" },
          { label: "Disputes Filed", value: "7", sub: "Since joining", color: "#7C3AED", bg: "#F5F3FF" },
          { label: "Items Removed", value: "4", sub: "Negative items cleared", color: "#059669", bg: "#ECFDF5" },
          { label: "Months Active", value: "8", sub: "Credit repair journey", color: "#C4953A", bg: "#F6EDD6" },
        ].map((stat) => (
          <div key={stat.label} className="stat-card">
            <div style={{
              width: 38, height: 38, borderRadius: 9,
              background: stat.bg,
              display: "flex", alignItems: "center", justifyContent: "center",
              marginBottom: 14,
              color: stat.color,
              fontSize: "1.125rem",
              fontWeight: 800,
            }}>
              {stat.value}
            </div>
            <p style={{ fontSize: "0.8125rem", fontWeight: 600, color: "#0F172A", margin: "0 0 3px" }}>
              {stat.label}
            </p>
            <p style={{ fontSize: "0.75rem", color: "#94A3B8", margin: 0 }}>{stat.sub}</p>
          </div>
        ))}
      </div>

      {/* Cases + Activity */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 360px", gap: 20, alignItems: "start" }}>
        {/* Active Cases */}
        <div className="credo-card" style={{ padding: "24px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
            <div>
              <h3 style={{ fontSize: "0.9375rem", fontWeight: 700, color: "#0F172A", margin: "0 0 2px" }}>Active Cases</h3>
              <p style={{ fontSize: "0.8125rem", color: "#94A3B8", margin: 0 }}>3 cases being processed</p>
            </div>
            <Link href="/cases" style={{ fontSize: "0.8125rem", color: "#C4953A", fontWeight: 600, textDecoration: "none" }}>
              View all →
            </Link>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {cases.map((c) => (
              <div key={c.id} style={{
                border: "1px solid #E2E8F0",
                borderRadius: 10,
                padding: "16px 18px",
                display: "flex",
                alignItems: "center",
                gap: 16,
                transition: "border-color 150ms, box-shadow 150ms",
                cursor: "pointer",
              }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLElement).style.borderColor = "#CBD5E1";
                  (e.currentTarget as HTMLElement).style.boxShadow = "0 2px 8px rgba(0,0,0,0.06)";
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLElement).style.borderColor = "#E2E8F0";
                  (e.currentTarget as HTMLElement).style.boxShadow = "none";
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                    <p style={{ fontSize: "0.875rem", fontWeight: 700, color: "#0F172A", margin: 0 }}>
                      {c.title}
                    </p>
                    <CaseBadge status={c.status} />
                  </div>
                  <div style={{ display: "flex", gap: 16 }}>
                    <span style={{ fontSize: "0.8125rem", color: "#64748B" }}>{c.type}</span>
                    <span style={{ fontSize: "0.8125rem", color: "#94A3B8" }}>{c.step}</span>
                  </div>
                </div>
                <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
                  <span style={{ fontSize: "0.75rem", color: "#94A3B8" }}>{c.bureau}</span>
                  {c.daysLeft && (
                    <span style={{
                      fontSize: "0.75rem", fontWeight: 600,
                      color: c.daysLeft <= 7 ? "#DC2626" : "#D97706",
                    }}>
                      {c.daysLeft}d remaining
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Action plan prompt */}
          <div style={{
            marginTop: 16,
            background: "linear-gradient(135deg, #E4EDF8, #EFF6FF)",
            border: "1px solid #C8D9EF",
            borderRadius: 10,
            padding: "16px 18px",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 12,
          }}>
            <div>
              <p style={{ fontSize: "0.875rem", fontWeight: 700, color: "#0B1D35", margin: "0 0 2px" }}>
                2 more items identified
              </p>
              <p style={{ fontSize: "0.8125rem", color: "#475569", margin: 0 }}>
                Your AI plan found a prescribed debt and duplicate listing.
              </p>
            </div>
            <button className="btn-primary" style={{ padding: "8px 16px", whiteSpace: "nowrap", fontSize: "0.8125rem" }}>
              View plan
            </button>
          </div>
        </div>

        {/* Recent Activity */}
        <div className="credo-card" style={{ padding: "24px" }}>
          <div style={{ marginBottom: 20 }}>
            <h3 style={{ fontSize: "0.9375rem", fontWeight: 700, color: "#0F172A", margin: "0 0 2px" }}>Recent Activity</h3>
            <p style={{ fontSize: "0.8125rem", color: "#94A3B8", margin: 0 }}>Your latest updates</p>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
            <ActivityItem
              iconBg="#ECFDF5"
              icon={<svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M3 8l3.5 3.5L13 4.5" stroke="#059669" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>}
              title="Default removed"
              subtitle="Capitec — TransUnion confirmed"
              time="2h ago"
            />
            <div style={{ height: 1, background: "#F1F5F9" }} />
            <ActivityItem
              iconBg="#EFF6FF"
              icon={<svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M8 2a6 6 0 100 12A6 6 0 008 2zm0 3v3l2 2" stroke="#2563EB" strokeWidth="1.4" strokeLinecap="round" /></svg>}
              title="Bureau response received"
              subtitle="Experian — Section 72 dispute"
              time="1d ago"
            />
            <div style={{ height: 1, background: "#F1F5F9" }} />
            <ActivityItem
              iconBg="#F6EDD6"
              icon={<svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M8 2L2.5 5v4c0 2.9 2.3 5.5 5.5 6.2 3.2-.7 5.5-3.3 5.5-6.2V5L8 2z" stroke="#C4953A" strokeWidth="1.4" strokeLinejoin="round" /></svg>}
              title="Document uploaded"
              subtitle="ID copy — identity verification"
              time="3d ago"
            />
            <div style={{ height: 1, background: "#F1F5F9" }} />
            <ActivityItem
              iconBg="#F5F3FF"
              icon={<svg width="16" height="16" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="6" r="3" stroke="#7C3AED" strokeWidth="1.4" /><path d="M2 14c0-3.3 2.7-6 6-6s6 2.7 6 6" stroke="#7C3AED" strokeWidth="1.4" strokeLinecap="round" /></svg>}
              title="Case assigned"
              subtitle="Debt Review Flag Removal — initiated"
              time="5d ago"
            />
            <div style={{ height: 1, background: "#F1F5F9" }} />
            <ActivityItem
              iconBg="#FEF2F2"
              icon={<svg width="16" height="16" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="6" stroke="#DC2626" strokeWidth="1.4" /><path d="M8 5v3M8 11v.5" stroke="#DC2626" strokeWidth="1.4" strokeLinecap="round" /></svg>}
              title="Alert: New hard inquiry"
              subtitle="FNB — vehicle finance application"
              time="1w ago"
            />
          </div>

          <button style={{
            marginTop: 20, width: "100%",
            padding: "9px 0",
            background: "#F8F9FA",
            border: "1px solid #E2E8F0",
            borderRadius: 8,
            fontSize: "0.8125rem",
            fontWeight: 500,
            color: "#64748B",
            cursor: "pointer",
            transition: "background-color 150ms",
          }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "#F1F5F9"; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "#F8F9FA"; }}
          >
            View full history
          </button>
        </div>
      </div>

      {/* Quick actions */}
      <div className="credo-card" style={{ padding: "24px 28px" }}>
        <p style={{ fontSize: "0.875rem", fontWeight: 700, color: "#0F172A", margin: "0 0 16px" }}>Quick actions</p>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          {[
            { label: "File a dispute", href: "/cases/new", color: "#0B1D35", bg: "#E4EDF8" },
            { label: "Pull credit report", href: "/credit-report", color: "#0B1D35", bg: "#E4EDF8" },
            { label: "Get a quote", href: "/quote", color: "#C4953A", bg: "#F6EDD6" },
            { label: "Upload document", href: "/documents", color: "#0B1D35", bg: "#E4EDF8" },
            { label: "Chat with AI coach", href: "/ai-coach", color: "#7C3AED", bg: "#F5F3FF" },
          ].map((a) => (
            <Link key={a.label} href={a.href} style={{
              display: "inline-flex", alignItems: "center", gap: 7,
              padding: "8px 16px",
              background: a.bg,
              color: a.color,
              borderRadius: 8,
              fontSize: "0.875rem",
              fontWeight: 600,
              textDecoration: "none",
              transition: "opacity 150ms",
            }}>
              {a.label}
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}

"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { toast } from "@zenowethu/ui";

type TimelineKind = "status" | "comment" | "communication";

type CaseView = {
  id: string;
  fileNumber: string;
  title: string;
  type: string;
  status: string;
  statusLabel: string;
  statusDescription: string | null;
  progress: number;
  progressSteps: Array<{ key: string; label: string; state: "done" | "current" | "pending" }>;
  currentStep: string;
  nextAction: string;
  nextUpdate: string | null;
  deadline: string | null;
  consumerDhsStatus: string | null;
  requestedDhsStatus: string | null;
  financials: {
    feeBasisTotal: number | null;
    feeBasisSource: "CASE_SERVICE_FEE" | "ACCEPTED_QUOTE" | null;
    totalPaid: number;
    outstanding: number | null;
    acceptedQuotesTotal: number;
    acceptedQuoteCount: number;
    quoteBalance: number | null;
    quoteOverpaid: number;
  };
  quotes: Array<{
    id: string;
    number: string;
    status: string;
    total: number;
    issuedAt: string;
    dueAt: string;
    acceptedAt: string | null;
    viewUrl: string | null;
    downloadUrl: string | null;
  }>;
  payments: Array<{
    id: string;
    amount: number;
    date: string;
    method: string;
    reference: string | null;
    status: string;
  }>;
  documentRequests: Array<{
    id: string;
    category: string;
    label: string;
    notes: string | null;
    status: string;
    createdAt: string;
    reviewedAt: string | null;
  }>;
  consent: {
    status: string;
    channel: string;
    createdAt: string;
    consentedAt: string | null;
    expiresAt: string;
  } | null;
  timeline: Array<{
    id: string;
    kind: TimelineKind;
    title: string;
    detail: string | null;
    date: string;
  }>;
};

const STATUS_STYLE: Record<string, { bg: string; color: string }> = {
  COMPLETED: { bg: "#ECFDF5", color: "#059669" },
  RESOLVED: { bg: "#ECFDF5", color: "#059669" },
  READY_TO_CONSENT: { bg: "#FFFBEB", color: "#B45309" },
  CONSENT_RECEIVED: { bg: "#ECFEFF", color: "#0E7490" },
  AWAITING_DRR_DOCS: { bg: "#FEF3C7", color: "#B45309" },
  ACCEPTED_VIA_DHS: { bg: "#F5F3FF", color: "#7C3AED" },
};

function StatusBadge({ status, label }: { status: string; label: string }) {
  const style = STATUS_STYLE[status] ?? { bg: "#F1F5F9", color: "#475569" };
  return (
    <span style={{ padding: "3px 10px", borderRadius: 9999, background: style.bg, color: style.color, fontSize: "0.75rem", fontWeight: 700 }}>
      {label}
    </span>
  );
}

function ProgressBar({ value }: { value: number }) {
  return (
    <div style={{ height: 6, background: "#F1F5F9", borderRadius: 9999, overflow: "hidden" }}>
      <div style={{ height: "100%", borderRadius: 9999, background: value === 100 ? "#059669" : "#0B1D35", width: `${value}%`, transition: "width 250ms" }} />
    </div>
  );
}

function MoneyCard({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div style={{ border: "1px solid #E2E8F0", borderRadius: 10, padding: "14px 16px", background: "#FFFFFF" }}>
      <p style={{ fontSize: "0.75rem", color: "#94A3B8", margin: "0 0 4px", fontWeight: 700, textTransform: "uppercase" }}>{label}</p>
      <p style={{ fontSize: "1.05rem", color: "#0F172A", margin: 0, fontWeight: 800 }}>{value}</p>
      <p style={{ fontSize: "0.75rem", color: "#64748B", margin: "3px 0 0" }}>{sub}</p>
    </div>
  );
}

export default function CasesPage() {
  const [cases, setCases] = useState<CaseView[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [filter, setFilter] = useState("ALL");
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function fetchCases() {
    try {
      const res = await fetch("/api/consumer/cases");
      if (!res.ok) throw new Error("Failed to fetch cases");
      const json = await res.json() as { cases: CaseView[] };
      setCases(json.cases);
      setSelectedId(current => current ?? json.cases[0]?.id ?? null);
    } catch {
      toast.error("Unable to load your cases right now.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void fetchCases();
  }, []);

  const selected = useMemo(
    () => cases.find(item => item.id === selectedId) ?? cases[0] ?? null,
    [cases, selectedId],
  );
  const filtered = filter === "ALL" ? cases : cases.filter(item => item.status === filter);
  const filters = ["ALL", ...Array.from(new Set(cases.map(item => item.status)))];

  async function submitComment() {
    if (!selected || !comment.trim()) return;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/consumer/cases/${selected.id}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: comment }),
      });
      const json = await res.json() as { error?: string };
      if (!res.ok) throw new Error(json.error || "Failed to submit comment");
      setComment("");
      toast.success("Comment sent to your case team.");
      await fetchCases();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to send comment.");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return <div style={{ padding: 40, textAlign: "center", color: "#94A3B8" }}>Loading cases...</div>;
  }

  return (
    <div className="animate-fade-in" style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
        <div>
          <h2 style={{ fontSize: "1.25rem", fontWeight: 700, color: "#0F172A", margin: "0 0 4px", letterSpacing: "-0.01em" }}>
            My Case Status
          </h2>
          <p style={{ fontSize: "0.875rem", color: "#64748B", margin: 0 }}>
            {cases.length} linked case{cases.length === 1 ? "" : "s"} with live progress, payments, documents and communication.
          </p>
        </div>
        <Link href="/documents" className="btn-primary" style={{ padding: "10px 18px", fontSize: "0.875rem" }}>
          Upload document
        </Link>
      </div>

      <div style={{ display: "flex", gap: 4, background: "#F8F9FA", border: "1px solid #E2E8F0", borderRadius: 9, padding: 3, width: "fit-content", maxWidth: "100%", overflowX: "auto" }}>
        {filters.map(item => (
          <button key={item} onClick={() => setFilter(item)} style={{
            padding: "6px 14px",
            background: filter === item ? "#FFFFFF" : "transparent",
            border: "none",
            borderRadius: 7,
            fontSize: "0.8125rem",
            fontWeight: filter === item ? 700 : 500,
            color: filter === item ? "#0F172A" : "#64748B",
            cursor: "pointer",
            whiteSpace: "nowrap",
          }}>
            {item === "ALL" ? "All Cases" : item.replace(/_/g, " ")}
          </button>
        ))}
      </div>

      {cases.length === 0 ? (
        <div style={{ padding: "80px 20px", textAlign: "center", border: "1px dashed #E2E8F0", borderRadius: 16 }}>
          <h3 style={{ fontSize: "1rem", fontWeight: 700, color: "#0F172A", margin: "0 0 8px" }}>No Cases Yet</h3>
          <p style={{ fontSize: "0.875rem", color: "#64748B", margin: "0 0 20px" }}>Once Zenowethu links your profile to a case, progress and payments will appear here.</p>
          <Link href="/quote" className="btn-primary" style={{ padding: "10px 24px" }}>Request a service</Link>
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "minmax(280px, 360px) 1fr", gap: 16, alignItems: "start" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {filtered.map(item => (
              <button key={item.id} onClick={() => setSelectedId(item.id)} style={{
                textAlign: "left",
                background: selected?.id === item.id ? "#FFFFFF" : "#FAFAFA",
                border: selected?.id === item.id ? "2px solid #0B1D35" : "1px solid #E2E8F0",
                borderRadius: 12,
                padding: "16px 18px",
                cursor: "pointer",
                boxShadow: selected?.id === item.id ? "0 4px 12px rgba(11,29,53,0.08)" : "none",
              }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 8, marginBottom: 10 }}>
                  <div>
                    <p style={{ fontSize: "0.875rem", fontWeight: 800, color: "#0F172A", margin: "0 0 3px" }}>{item.title}</p>
                    <p style={{ fontSize: "0.75rem", color: "#64748B", margin: 0 }}>{item.fileNumber}</p>
                  </div>
                  <StatusBadge status={item.status} label={item.statusLabel} />
                </div>
                <ProgressBar value={item.progress} />
                <p style={{ fontSize: "0.75rem", color: "#64748B", margin: "8px 0 0" }}>{item.currentStep}</p>
              </button>
            ))}
          </div>

          {selected && (
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <section className="credo-card" style={{ padding: 24 }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 16, flexWrap: "wrap", marginBottom: 18 }}>
                  <div>
                    <p style={{ fontSize: "0.75rem", color: "#94A3B8", fontWeight: 800, margin: "0 0 4px" }}>{selected.fileNumber}</p>
                    <h3 style={{ fontSize: "1.125rem", color: "#0F172A", margin: "0 0 6px", fontWeight: 800 }}>{selected.title}</h3>
                    <StatusBadge status={selected.status} label={selected.statusLabel} />
                  </div>
                  <a href={`/api/consumer/cases/${selected.id}/statement`} className="btn-outline" style={{ padding: "9px 14px", textDecoration: "none", fontSize: "0.8125rem" }}>
                    Download statement
                  </a>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 6, marginBottom: 18 }}>
                  {selected.progressSteps.map(step => (
                    <div key={step.key} style={{ minWidth: 0 }}>
                      <div style={{
                        height: 6,
                        borderRadius: 999,
                        background: step.state === "done" ? "#059669" : step.state === "current" ? "#0B1D35" : "#E2E8F0",
                        marginBottom: 6,
                      }} />
                      <p style={{ fontSize: "0.68rem", color: step.state === "pending" ? "#94A3B8" : "#0F172A", margin: 0, fontWeight: 700, lineHeight: 1.25 }}>
                        {step.label}
                      </p>
                    </div>
                  ))}
                </div>

                <div style={{ background: "#F0F9FF", border: "1px solid #BAE6FD", borderRadius: 10, padding: "12px 14px" }}>
                  <p style={{ fontSize: "0.8125rem", color: "#0369A1", margin: 0, lineHeight: 1.55 }}>
                    <strong>Next:</strong> {selected.nextAction}
                  </p>
                </div>
              </section>

              <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 10 }}>
                <MoneyCard label="Quoted" value={formatZar(selected.financials.feeBasisTotal ?? selected.financials.acceptedQuotesTotal)} sub={selected.financials.feeBasisSource === "ACCEPTED_QUOTE" ? "Accepted quote basis" : "Service fee basis"} />
                <MoneyCard label="Paid" value={formatZar(selected.financials.totalPaid)} sub={`${selected.payments.length} payment${selected.payments.length === 1 ? "" : "s"} captured`} />
                <MoneyCard label="Balance" value={formatZar(selected.financials.outstanding ?? 0)} sub={selected.financials.quoteOverpaid > 0 ? `Overpaid by ${formatZar(selected.financials.quoteOverpaid)}` : "Remaining payable"} />
              </section>

              <section className="credo-card" style={{ padding: 22 }}>
                <h3 style={sectionTitle}>Quotes, Payments and Documents</h3>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                  <div>
                    <p style={smallHeading}>Quotes</p>
                    {selected.quotes.length === 0 ? <Empty text="No quotes linked yet." /> : selected.quotes.map(quote => (
                      <div key={quote.id} style={rowStyle}>
                        <div>
                          <p style={rowTitle}>{quote.number}</p>
                          <p style={rowMeta}>{quote.status} - {formatDate(quote.issuedAt)}</p>
                        </div>
                        <div style={{ textAlign: "right" }}>
                          <p style={rowTitle}>{formatZar(quote.total)}</p>
                          {quote.viewUrl && <Link href={quote.viewUrl} style={linkStyle}>View</Link>}
                        </div>
                      </div>
                    ))}
                  </div>
                  <div>
                    <p style={smallHeading}>Payments</p>
                    {selected.payments.length === 0 ? <Empty text="No payments captured yet." /> : selected.payments.map(payment => (
                      <div key={payment.id} style={rowStyle}>
                        <div>
                          <p style={rowTitle}>{formatDate(payment.date)}</p>
                          <p style={rowMeta}>{payment.method}{payment.reference ? ` - ${payment.reference}` : ""}</p>
                        </div>
                        <p style={rowTitle}>{formatZar(payment.amount)}</p>
                      </div>
                    ))}
                  </div>
                </div>

                <div style={{ marginTop: 16 }}>
                  <p style={smallHeading}>Documents requested from you</p>
                  {selected.documentRequests.length === 0 ? <Empty text="No open document requests." /> : selected.documentRequests.map(request => (
                    <div key={request.id} style={rowStyle}>
                      <div>
                        <p style={rowTitle}>{request.label}</p>
                        <p style={rowMeta}>{request.notes || request.category}</p>
                      </div>
                      <span style={{ fontSize: "0.75rem", fontWeight: 800, color: request.status === "REQUESTED" ? "#B45309" : "#059669" }}>{request.status}</span>
                    </div>
                  ))}
                </div>
              </section>

              <section className="credo-card" style={{ padding: 22 }}>
                <h3 style={sectionTitle}>Comments and Communication</h3>
                <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
                  <input
                    value={comment}
                    onChange={event => setComment(event.target.value)}
                    className="credo-input"
                    placeholder="Send a comment to your case team"
                    maxLength={2000}
                  />
                  <button onClick={submitComment} disabled={submitting || !comment.trim()} className="btn-primary" style={{ padding: "9px 16px", opacity: submitting || !comment.trim() ? 0.6 : 1 }}>
                    Send
                  </button>
                </div>

                {selected.timeline.length === 0 ? <Empty text="No client-visible communication yet." /> : selected.timeline.map(item => (
                  <div key={item.id} style={{ ...rowStyle, alignItems: "flex-start" }}>
                    <div style={{ width: 8, height: 8, borderRadius: "50%", background: timelineColor(item.kind), marginTop: 7, flexShrink: 0 }} />
                    <div style={{ flex: 1 }}>
                      <p style={rowTitle}>{item.title}</p>
                      {item.detail && <p style={{ ...rowMeta, marginTop: 3, lineHeight: 1.5 }}>{item.detail}</p>}
                    </div>
                    <span style={{ fontSize: "0.75rem", color: "#94A3B8", whiteSpace: "nowrap" }}>{formatDate(item.date)}</span>
                  </div>
                ))}
              </section>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

const sectionTitle: React.CSSProperties = { fontSize: "0.9375rem", fontWeight: 800, color: "#0F172A", margin: "0 0 14px" };
const smallHeading: React.CSSProperties = { fontSize: "0.75rem", fontWeight: 800, color: "#64748B", textTransform: "uppercase", margin: "0 0 8px" };
const rowStyle: React.CSSProperties = { display: "flex", justifyContent: "space-between", gap: 12, border: "1px solid #E2E8F0", borderRadius: 9, padding: "10px 12px", marginBottom: 8, background: "#FFFFFF" };
const rowTitle: React.CSSProperties = { fontSize: "0.8125rem", color: "#0F172A", margin: 0, fontWeight: 800 };
const rowMeta: React.CSSProperties = { fontSize: "0.75rem", color: "#64748B", margin: "2px 0 0" };
const linkStyle: React.CSSProperties = { fontSize: "0.75rem", color: "#C4953A", fontWeight: 800, textDecoration: "none" };

function Empty({ text }: { text: string }) {
  return <p style={{ fontSize: "0.8125rem", color: "#94A3B8", padding: "12px 0", margin: 0 }}>{text}</p>;
}

function formatZar(value: number | null | undefined): string {
  return new Intl.NumberFormat("en-ZA", { style: "currency", currency: "ZAR", minimumFractionDigits: 2 }).format(value ?? 0);
}

function formatDate(value: string | null): string {
  if (!value) return "-";
  return new Intl.DateTimeFormat("en-ZA", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(value));
}

function timelineColor(kind: TimelineKind): string {
  if (kind === "comment") return "#C4953A";
  if (kind === "communication") return "#7C3AED";
  return "#0B1D35";
}

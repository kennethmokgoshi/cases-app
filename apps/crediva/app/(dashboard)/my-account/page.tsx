"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

/* ─── Types ──────────────────────────────────────────────────────── */
type Payment = {
  id: string;
  amount: number;
  date: string;
  method: string;
  reference: string | null;
  category: string;
  status: string;
};

type WorkflowLog = {
  id: string;
  fromStatus: string | null;
  toStatus: string;
  action: string;
  timestamp: string;
  notes: string | null;
};

type AccountData = {
  linked: boolean;
  client?: { firstName: string; lastName: string; idNumber: string };
  account?: {
    serviceFee: number;
    totalPaid: number;
    outstanding: number | null;
    instalments: number;
    monthlyInstallment: number;
  };
  activeCase?: {
    fileNumber: string;
    status: string;
    statusEntryDate: string;
    createdAt: string;
  } | null;
  workflowLogs?: WorkflowLog[];
  payments?: Payment[];
};

/* ─── Status label lookup ────────────────────────────────────────── */
const STATUS_LABELS: Record<string, string> = {
  NEW_LEAD: "File Created",
  NEW_ENQUIRY: "Enquiry Received",
  PENDING_REVIEW: "Under Review",
  IN_PROGRESS: "In Progress",
  DOCUMENTS_REQUESTED: "Documents Requested",
  DOCUMENTS_RECEIVED: "Documents Received",
  DHS_PENDING: "DHS Submission Pending",
  DHS_SUBMITTED: "Submitted to DHS",
  DHS_APPROVED: "DHS Approved",
  WAITING_CREDITORS: "Awaiting Creditors",
  COURT_ORDER_ISSUED: "Court Order Issued",
  FLAG_REMOVAL_IN_PROGRESS: "Flag Removal in Progress",
  FLAG_REMOVED: "Flag Removed",
  COMPLETED: "Completed",
  CLOSED: "Closed",
  CANCELLED: "Cancelled",
};

function friendlyStatus(code: string) {
  return STATUS_LABELS[code] ?? code.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
}

/* ─── Helpers ────────────────────────────────────────────────────── */
function formatZAR(n: number) {
  return new Intl.NumberFormat("en-ZA", { style: "currency", currency: "ZAR" }).format(n);
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-ZA", { day: "2-digit", month: "short", year: "numeric" });
}

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString("en-ZA", {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

function daysAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const days = Math.floor(diff / 86400000);
  if (days === 0) return "today";
  if (days === 1) return "1 day ago";
  return `${days} days ago`;
}

const METHOD_LABELS: Record<string, string> = {
  EFT: "EFT",
  CASH: "Cash",
  DEBIT_ORDER: "Debit Order",
  CHEQUE: "Cheque",
};

const CATEGORY_LABELS: Record<string, string> = {
  INSTALLMENT: "Installment",
  SERVICE_FEE: "Service Fee",
  LEGAL_FEE: "Legal Fee",
  OTHER: "Other",
};

/* ─── Components ─────────────────────────────────────────────────── */
function SummaryCard({
  label, value, sub, accent,
}: { label: string; value: string; sub?: string; accent?: string }) {
  return (
    <div style={{
      background: "#FFFFFF",
      border: "1px solid #E2E8F0",
      borderRadius: 12,
      padding: "20px 22px",
    }}>
      <p style={{ fontSize: "0.75rem", fontWeight: 600, color: "#94A3B8", textTransform: "uppercase", letterSpacing: "0.05em", margin: "0 0 8px" }}>
        {label}
      </p>
      <p style={{ fontSize: "1.75rem", fontWeight: 800, color: accent ?? "#0F172A", margin: "0 0 4px", lineHeight: 1 }}>
        {value}
      </p>
      {sub && <p style={{ fontSize: "0.8125rem", color: "#94A3B8", margin: 0 }}>{sub}</p>}
    </div>
  );
}

/* ─── Page ───────────────────────────────────────────────────────── */
export default function MyAccountPage() {
  const [data, setData] = useState<AccountData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showAllPayments, setShowAllPayments] = useState(false);

  useEffect(() => {
    fetch("/api/consumer/my-account")
      .then(r => r.json())
      .then(d => {
        if (d.error) throw new Error(d.error);
        setData(d);
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: 320 }}>
        <div style={{
          width: 36, height: 36, borderRadius: "50%",
          border: "3px solid #E2E8F0",
          borderTopColor: "#0B1D35",
          animation: "spin 0.8s linear infinite",
        }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{
        background: "#FEF2F2", border: "1px solid #FECACA", borderRadius: 10,
        padding: "16px 20px", color: "#DC2626", fontSize: "0.875rem",
      }}>
        {error}
      </div>
    );
  }

  /* Not yet linked to a staff client record */
  if (!data?.linked) {
    return (
      <div style={{ maxWidth: 560, margin: "0 auto", textAlign: "center", paddingTop: 60 }}>
        <div style={{
          width: 64, height: 64, background: "#F1F5F9", borderRadius: "50%",
          display: "flex", alignItems: "center", justifyContent: "center",
          margin: "0 auto 20px",
        }}>
          <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
            <circle cx="14" cy="10" r="5" stroke="#94A3B8" strokeWidth="1.8" />
            <path d="M4 24c0-5.5 4.5-10 10-10s10 4.5 10 10" stroke="#94A3B8" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
        </div>
        <h2 style={{ fontSize: "1.25rem", fontWeight: 700, color: "#0F172A", margin: "0 0 10px" }}>
          Account not linked yet
        </h2>
        <p style={{ fontSize: "0.9375rem", color: "#64748B", lineHeight: 1.6, margin: "0 0 24px" }}>
          Your Credo account is not yet linked to a Zenowethu debt management file. Once your case is active, your payment history and case progress will appear here.
        </p>
        <Link href="/dashboard" style={{
          display: "inline-block", padding: "10px 24px",
          background: "#0B1D35", color: "#FFFFFF",
          borderRadius: 8, fontWeight: 600, fontSize: "0.875rem",
          textDecoration: "none",
        }}>
          Back to Dashboard
        </Link>
      </div>
    );
  }

  const { client, account, activeCase, workflowLogs = [], payments = [] } = data;
  const progressPercent =
    account && account.serviceFee > 0
      ? Math.min(100, (account.totalPaid / account.serviceFee) * 100)
      : null;

  const visiblePayments = showAllPayments ? payments : payments.slice(0, 5);

  return (
    <div style={{ maxWidth: 900, margin: "0 auto" }}>

      {/* Page title */}
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontSize: "1.5rem", fontWeight: 800, color: "#0F172A", margin: "0 0 4px" }}>
          My Account
        </h1>
        <p style={{ fontSize: "0.9375rem", color: "#64748B", margin: 0 }}>
          Your Zenowethu debt management service — fees paid and case progress
        </p>
      </div>

      {/* Summary cards */}
      {account && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 14, marginBottom: 24 }}>
          <SummaryCard label="Service Fee" value={formatZAR(account.serviceFee)} sub="Total Zenowethu fee" />
          <SummaryCard label="Total Paid" value={formatZAR(account.totalPaid)} sub={`${payments.filter(p => p.status === "COMPLETED").length} payment${payments.filter(p => p.status === "COMPLETED").length !== 1 ? "s" : ""}`} accent="#059669" />
          {account.outstanding !== null && (
            <SummaryCard
              label="Outstanding"
              value={formatZAR(account.outstanding)}
              sub={account.outstanding > 0 ? "Balance remaining" : "Fully paid"}
              accent={account.outstanding > 0 ? "#D97706" : "#059669"}
            />
          )}
          {account.monthlyInstallment > 0 && (
            <SummaryCard label="Monthly Instalment" value={formatZAR(account.monthlyInstallment)} sub={account.instalments > 1 ? `${account.instalments} instalments` : undefined} />
          )}
        </div>
      )}

      {/* Payment progress bar */}
      {progressPercent !== null && (
        <div style={{
          background: "#FFFFFF", border: "1px solid #E2E8F0",
          borderRadius: 12, padding: "20px 22px", marginBottom: 24,
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
            <span style={{ fontSize: "0.875rem", fontWeight: 600, color: "#0F172A" }}>Payment Progress</span>
            <span style={{ fontSize: "0.875rem", fontWeight: 700, color: progressPercent >= 100 ? "#059669" : "#0B1D35" }}>
              {progressPercent.toFixed(0)}%
            </span>
          </div>
          <div style={{ height: 10, background: "#F1F5F9", borderRadius: 9999, overflow: "hidden" }}>
            <div style={{
              height: "100%", borderRadius: 9999,
              background: progressPercent >= 100
                ? "#059669"
                : "linear-gradient(90deg, #0B1D35 0%, #C4953A 100%)",
              width: `${progressPercent}%`,
              transition: "width 1s cubic-bezier(0.4,0,0.2,1)",
            }} />
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8 }}>
            <span style={{ fontSize: "0.75rem", color: "#059669", fontWeight: 600 }}>
              {formatZAR(account?.totalPaid ?? 0)} paid
            </span>
            <span style={{ fontSize: "0.75rem", color: "#94A3B8" }}>
              of {formatZAR(account?.serviceFee ?? 0)}
            </span>
          </div>
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, marginBottom: 24 }} className="responsive-grid">
        <style>{`
          @media (max-width: 680px) { .responsive-grid { grid-template-columns: 1fr !important; } }
        `}</style>

        {/* Current case status */}
        {activeCase && (
          <div style={{ background: "#FFFFFF", border: "1px solid #E2E8F0", borderRadius: 12, padding: "20px 22px" }}>
            <p style={{ fontSize: "0.75rem", fontWeight: 700, color: "#94A3B8", textTransform: "uppercase", letterSpacing: "0.05em", margin: "0 0 14px" }}>
              Case Status
            </p>
            <div style={{ marginBottom: 10 }}>
              <span style={{
                display: "inline-block",
                padding: "5px 14px",
                borderRadius: 9999,
                background: "#EFF6FF",
                color: "#2563EB",
                fontSize: "0.8125rem",
                fontWeight: 700,
              }}>
                {friendlyStatus(activeCase.status)}
              </span>
            </div>
            <p style={{ fontSize: "0.8125rem", color: "#64748B", margin: "0 0 4px" }}>
              File number: <strong style={{ color: "#0F172A" }}>{activeCase.fileNumber}</strong>
            </p>
            <p style={{ fontSize: "0.8125rem", color: "#64748B", margin: "0 0 4px" }}>
              In this stage: <strong style={{ color: "#0F172A" }}>{daysAgo(activeCase.statusEntryDate)}</strong>
            </p>
            <p style={{ fontSize: "0.8125rem", color: "#64748B", margin: 0 }}>
              Case opened: <strong style={{ color: "#0F172A" }}>{formatDate(activeCase.createdAt)}</strong>
            </p>
          </div>
        )}

        {/* Recent payments quick view */}
        {payments.length > 0 && (
          <div style={{ background: "#FFFFFF", border: "1px solid #E2E8F0", borderRadius: 12, padding: "20px 22px" }}>
            <p style={{ fontSize: "0.75rem", fontWeight: 700, color: "#94A3B8", textTransform: "uppercase", letterSpacing: "0.05em", margin: "0 0 14px" }}>
              Recent Payments
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {payments.slice(0, 3).map(p => (
                <div key={p.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div>
                    <p style={{ fontSize: "0.8125rem", fontWeight: 600, color: "#0F172A", margin: "0 0 2px" }}>
                      {formatZAR(Number(p.amount))}
                    </p>
                    <p style={{ fontSize: "0.75rem", color: "#94A3B8", margin: 0 }}>
                      {formatDate(p.date)} · {METHOD_LABELS[p.method] ?? p.method}
                    </p>
                  </div>
                  <span style={{
                    padding: "2px 8px", borderRadius: 6,
                    background: p.status === "COMPLETED" ? "#ECFDF5" : "#FEF3C7",
                    color: p.status === "COMPLETED" ? "#059669" : "#D97706",
                    fontSize: "0.6875rem", fontWeight: 700,
                  }}>
                    {p.status === "COMPLETED" ? "Received" : p.status}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Workflow timeline */}
      {workflowLogs.length > 0 && (
        <div style={{ background: "#FFFFFF", border: "1px solid #E2E8F0", borderRadius: 12, padding: "20px 22px", marginBottom: 24 }}>
          <p style={{ fontSize: "0.75rem", fontWeight: 700, color: "#94A3B8", textTransform: "uppercase", letterSpacing: "0.05em", margin: "0 0 20px" }}>
            Case Progress History
          </p>
          <ol style={{ listStyle: "none", margin: 0, padding: "0 0 0 16px", borderLeft: "2px solid #E2E8F0", display: "flex", flexDirection: "column", gap: 20 }}>
            {activeCase && (
              <li style={{ position: "relative" }}>
                <span style={{
                  position: "absolute", left: -25, top: 3,
                  width: 14, height: 14, borderRadius: "50%",
                  background: "#E2E8F0", border: "2px solid #FFFFFF",
                  boxShadow: "0 0 0 2px #E2E8F0",
                }} />
                <p style={{ fontSize: "0.875rem", fontWeight: 600, color: "#0F172A", margin: "0 0 2px" }}>
                  Case opened
                </p>
                <p style={{ fontSize: "0.75rem", color: "#94A3B8", margin: 0 }}>{formatDateTime(activeCase.createdAt)}</p>
              </li>
            )}
            {workflowLogs.map((log) => (
              <li key={log.id} style={{ position: "relative" }}>
                <span style={{
                  position: "absolute", left: -25, top: 3,
                  width: 14, height: 14, borderRadius: "50%",
                  background: "#0B1D35", border: "2px solid #FFFFFF",
                  boxShadow: "0 0 0 2px #0B1D35",
                }} />
                <p style={{ fontSize: "0.875rem", fontWeight: 600, color: "#0F172A", margin: "0 0 2px" }}>
                  {friendlyStatus(log.toStatus)}
                </p>
                <p style={{ fontSize: "0.75rem", color: "#94A3B8", margin: log.notes ? "0 0 6px" : 0 }}>
                  {formatDateTime(log.timestamp)}
                  {log.fromStatus && (
                    <span style={{ marginLeft: 8, color: "#CBD5E1" }}>
                      from {friendlyStatus(log.fromStatus)}
                    </span>
                  )}
                </p>
                {log.notes && (
                  <p style={{
                    fontSize: "0.8125rem", color: "#475569", margin: 0,
                    background: "#F8F9FA", border: "1px solid #E2E8F0",
                    borderRadius: 6, padding: "6px 12px",
                  }}>
                    {log.notes}
                  </p>
                )}
              </li>
            ))}
            {/* Current status pin */}
            {activeCase && (
              <li style={{ position: "relative" }}>
                <span style={{
                  position: "absolute", left: -27, top: 1,
                  width: 18, height: 18, borderRadius: "50%",
                  background: "#C4953A", border: "3px solid #FFFFFF",
                  boxShadow: "0 0 0 2px #C4953A",
                }} />
                <p style={{ fontSize: "0.875rem", fontWeight: 700, color: "#C4953A", margin: "0 0 2px" }}>
                  {friendlyStatus(activeCase.status)} — Current
                </p>
                <p style={{ fontSize: "0.75rem", color: "#94A3B8", margin: 0 }}>
                  {daysAgo(activeCase.statusEntryDate)}
                </p>
              </li>
            )}
          </ol>
        </div>
      )}

      {/* Full payment history */}
      {payments.length > 0 && (
        <div style={{ background: "#FFFFFF", border: "1px solid #E2E8F0", borderRadius: 12, overflow: "hidden" }}>
          <div style={{ padding: "20px 22px 16px", borderBottom: "1px solid #F1F5F9", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <p style={{ fontSize: "0.75rem", fontWeight: 700, color: "#94A3B8", textTransform: "uppercase", letterSpacing: "0.05em", margin: 0 }}>
              All Payments
            </p>
            <p style={{ fontSize: "0.8125rem", color: "#64748B", margin: 0 }}>
              {payments.length} record{payments.length !== 1 ? "s" : ""} · Total {formatZAR(account?.totalPaid ?? 0)}
            </p>
          </div>

          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.875rem" }}>
              <thead>
                <tr style={{ background: "#F8F9FA" }}>
                  {["Date", "Amount", "Method", "Category", "Reference", "Status"].map(h => (
                    <th key={h} style={{
                      padding: "10px 16px", textAlign: "left",
                      fontSize: "0.6875rem", fontWeight: 700,
                      color: "#94A3B8", textTransform: "uppercase",
                      letterSpacing: "0.05em", whiteSpace: "nowrap",
                      borderBottom: "1px solid #E2E8F0",
                    }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {visiblePayments.map((p, i) => (
                  <tr key={p.id} style={{ borderBottom: i < visiblePayments.length - 1 ? "1px solid #F1F5F9" : "none" }}>
                    <td style={{ padding: "12px 16px", color: "#475569", whiteSpace: "nowrap" }}>{formatDate(p.date)}</td>
                    <td style={{ padding: "12px 16px", fontWeight: 700, color: "#059669", whiteSpace: "nowrap" }}>{formatZAR(Number(p.amount))}</td>
                    <td style={{ padding: "12px 16px", color: "#64748B" }}>{METHOD_LABELS[p.method] ?? p.method}</td>
                    <td style={{ padding: "12px 16px", color: "#64748B" }}>{CATEGORY_LABELS[p.category] ?? p.category}</td>
                    <td style={{ padding: "12px 16px", color: "#94A3B8", fontFamily: "monospace", fontSize: "0.8125rem" }}>
                      {p.reference ?? "—"}
                    </td>
                    <td style={{ padding: "12px 16px" }}>
                      <span style={{
                        padding: "2px 8px", borderRadius: 6,
                        background: p.status === "COMPLETED" ? "#ECFDF5" : "#FEF3C7",
                        color: p.status === "COMPLETED" ? "#059669" : "#D97706",
                        fontSize: "0.6875rem", fontWeight: 700,
                      }}>
                        {p.status === "COMPLETED" ? "Received" : p.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {payments.length > 5 && (
            <div style={{ padding: "12px 22px", borderTop: "1px solid #F1F5F9", textAlign: "center" }}>
              <button
                onClick={() => setShowAllPayments(v => !v)}
                style={{
                  background: "none", border: "1px solid #E2E8F0",
                  borderRadius: 8, padding: "8px 20px",
                  fontSize: "0.875rem", fontWeight: 600,
                  color: "#475569", cursor: "pointer",
                }}
              >
                {showAllPayments ? "Show fewer" : `Show all ${payments.length} payments`}
              </button>
            </div>
          )}
        </div>
      )}

      {/* No payments yet */}
      {payments.length === 0 && (
        <div style={{
          background: "#FFFFFF", border: "1px solid #E2E8F0",
          borderRadius: 12, padding: "40px 22px", textAlign: "center",
        }}>
          <p style={{ color: "#94A3B8", fontSize: "0.9375rem", margin: 0 }}>
            No payments have been recorded against your account yet.
          </p>
          <p style={{ color: "#CBD5E1", fontSize: "0.8125rem", marginTop: 8 }}>
            Payments recorded by Zenowethu will appear here once processed.
          </p>
        </div>
      )}
    </div>
  );
}

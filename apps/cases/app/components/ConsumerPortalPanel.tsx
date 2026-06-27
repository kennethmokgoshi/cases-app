"use client";

import { useCallback, useEffect, useState } from "react";

interface ConsumerDoc {
  id: string;
  originalName: string;
  mimeType: string;
  size: number;
  category: string;
  createdAt: string;
  fulfilledRequest: { id: string; label: string } | null;
}

interface DocRequest {
  id: string;
  category: string;
  label: string;
  notes: string | null;
  status: "REQUESTED" | "UPLOADED" | "APPROVED" | "REJECTED";
  createdAt: string;
  reviewedAt: string | null;
  fulfilledDoc: { id: string; originalName: string; createdAt: string } | null;
}

const CATEGORIES = [
  { key: "IDENTITY", label: "Identity" },
  { key: "INCOME", label: "Income" },
  { key: "BUREAU", label: "Bureau Reports" },
  { key: "LEGAL", label: "Legal" },
  { key: "CORRESPONDENCE", label: "Correspondence" },
];

const STATUS_STYLES: Record<string, { bg: string; color: string; label: string }> = {
  REQUESTED: { bg: "#FEF3C7", color: "#92400E", label: "Awaiting upload" },
  UPLOADED: { bg: "#DBEAFE", color: "#1E40AF", label: "Uploaded" },
  APPROVED: { bg: "#DCFCE7", color: "#166534", label: "Approved" },
  REJECTED: { bg: "#FEE2E2", color: "#991B1B", label: "Rejected" },
};

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function ConsumerPortalPanel({ caseId }: { caseId: string }) {
  const [docs, setDocs] = useState<ConsumerDoc[]>([]);
  const [requests, setRequests] = useState<DocRequest[]>([]);
  const [linked, setLinked] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);

  const [category, setCategory] = useState("IDENTITY");
  const [label, setLabel] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [dRes, rRes] = await Promise.all([
        fetch(`/api/cases/${caseId}/consumer-documents`),
        fetch(`/api/cases/${caseId}/document-requests`),
      ]);
      if (dRes.ok) {
        const d = await dRes.json();
        setDocs(d.documents || []);
        setLinked(d.linked);
      }
      if (rRes.ok) {
        const r = await rRes.json();
        setRequests(r.requests || []);
      }
    } finally {
      setLoading(false);
    }
  }, [caseId]);

  useEffect(() => { load(); }, [load]);

  async function submitRequest(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setOkMsg(null);
    if (!label.trim()) {
      setError("Describe the document you need.");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch(`/api/cases/${caseId}/document-requests`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ category, label: label.trim(), notes: notes.trim() || undefined }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Could not create the request.");
      } else {
        setOkMsg("Request sent. The consumer has been notified by email.");
        setLabel("");
        setNotes("");
        await load();
      }
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mt-6 rounded-xl border border-gray-200 bg-white">
      <div className="border-b border-gray-100 px-5 py-4">
        <h3 className="text-base font-semibold text-gray-900">Credo Consumer Portal</h3>
        <p className="text-sm text-gray-500">
          Documents the consumer uploaded via Credo, and document requests raised by staff.
        </p>
      </div>

      <div className="p-5 space-y-6">
        {loading ? (
          <p className="text-sm text-gray-400">Loading…</p>
        ) : (
          <>
            {linked === false && (
              <div className="rounded-lg bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-800">
                No Credo profile is linked to this case&apos;s client yet. A profile is created
                automatically when the case is loaded (requires a valid 13-digit ID number).
                Raising a request below will create and invite one.
              </div>
            )}

            {/* Request a document */}
            <form onSubmit={submitRequest} className="rounded-lg border border-gray-200 p-4 space-y-3">
              <p className="text-sm font-semibold text-gray-800">Request a document from the consumer</p>
              {error && <div className="rounded bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">{error}</div>}
              {okMsg && <div className="rounded bg-green-50 border border-green-200 px-3 py-2 text-sm text-green-700">{okMsg}</div>}
              <div className="flex flex-wrap gap-3">
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="rounded-md border border-gray-300 px-3 py-2 text-sm"
                >
                  {CATEGORIES.map((c) => (
                    <option key={c.key} value={c.key}>{c.label}</option>
                  ))}
                </select>
                <input
                  type="text"
                  value={label}
                  onChange={(e) => setLabel(e.target.value)}
                  placeholder="e.g. Latest 3 months' payslips"
                  maxLength={200}
                  className="flex-1 min-w-[220px] rounded-md border border-gray-300 px-3 py-2 text-sm"
                />
              </div>
              <input
                type="text"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Optional note for the consumer"
                maxLength={1000}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
              />
              <button
                type="submit"
                disabled={submitting}
                className="rounded-md bg-[#0B1D35] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
              >
                {submitting ? "Sending…" : "Send request"}
              </button>
            </form>

            {/* Outstanding / past requests */}
            {requests.length > 0 && (
              <div>
                <p className="mb-2 text-sm font-semibold text-gray-800">Document requests</p>
                <div className="space-y-2">
                  {requests.map((r) => {
                    const s = STATUS_STYLES[r.status] ?? STATUS_STYLES.REQUESTED;
                    return (
                      <div key={r.id} className="flex items-center justify-between gap-3 rounded-lg border border-gray-200 px-4 py-3">
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-gray-900">{r.label}</p>
                          <p className="text-xs text-gray-400">
                            {CATEGORIES.find((c) => c.key === r.category)?.label ?? r.category}
                            {r.fulfilledDoc ? ` · ${r.fulfilledDoc.originalName}` : ""}
                          </p>
                        </div>
                        <div className="flex items-center gap-3">
                          {r.fulfilledDoc && (
                            <a
                              href={`/api/cases/${caseId}/consumer-documents?download=${r.fulfilledDoc.id}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-xs font-medium text-[#0B1D35] underline"
                            >
                              View
                            </a>
                          )}
                          <span
                            className="rounded-full px-2.5 py-1 text-xs font-semibold"
                            style={{ background: s.bg, color: s.color }}
                          >
                            {s.label}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Consumer-uploaded documents */}
            <div>
              <p className="mb-2 text-sm font-semibold text-gray-800">
                Consumer uploads {docs.length > 0 && <span className="text-gray-400">({docs.length})</span>}
              </p>
              {docs.length === 0 ? (
                <p className="text-sm text-gray-400">The consumer has not uploaded any documents yet.</p>
              ) : (
                <div className="overflow-hidden rounded-lg border border-gray-200">
                  {docs.map((d, i) => (
                    <div
                      key={d.id}
                      className={`flex items-center justify-between gap-3 px-4 py-3 ${i > 0 ? "border-t border-gray-100" : ""}`}
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-gray-900">{d.originalName}</p>
                        <p className="text-xs text-gray-400">
                          {CATEGORIES.find((c) => c.key === d.category)?.label ?? d.category} · {formatBytes(d.size)} ·{" "}
                          {new Date(d.createdAt).toLocaleDateString("en-ZA")}
                        </p>
                      </div>
                      <a
                        href={`/api/cases/${caseId}/consumer-documents?download=${d.id}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="shrink-0 rounded-md border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
                      >
                        View
                      </a>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

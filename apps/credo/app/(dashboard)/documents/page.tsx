"use client";

import { useState, useEffect, useRef, useCallback } from "react";

type DocCategory = "ALL" | "IDENTITY" | "INCOME" | "BUREAU" | "LEGAL" | "CORRESPONDENCE";

interface CredoDoc {
  id: string;
  originalName: string;
  mimeType: string;
  size: number;
  category: string;
  createdAt: string;
}

const CATEGORIES: { key: DocCategory; label: string }[] = [
  { key: "ALL",            label: "All Files"      },
  { key: "IDENTITY",       label: "Identity"       },
  { key: "INCOME",         label: "Income"         },
  { key: "BUREAU",         label: "Bureau Reports" },
  { key: "LEGAL",          label: "Legal"          },
  { key: "CORRESPONDENCE", label: "Correspondence" },
];

const CATEGORY_CONFIG: Record<string, { color: string; bg: string; icon: React.ReactNode }> = {
  IDENTITY: {
    color: "#2563EB", bg: "#EFF6FF",
    icon: <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><circle cx="7" cy="5" r="2.5" stroke="currentColor" strokeWidth="1.3"/><path d="M2 12c0-2.8 2.2-5 5-5s5 2.2 5 5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/></svg>,
  },
  INCOME: {
    color: "#059669", bg: "#ECFDF5",
    icon: <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><rect x="1.5" y="2" width="11" height="10" rx="1.5" stroke="currentColor" strokeWidth="1.3"/><path d="M4 6h6M4 8.5h4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/></svg>,
  },
  BUREAU: {
    color: "#7C3AED", bg: "#F5F3FF",
    icon: <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M2 10l3-3.5 3 1.5 3-4 1.5 1.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/><path d="M1.5 12.5h11" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/><path d="M1.5 1.5v11" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/></svg>,
  },
  LEGAL: {
    color: "#C4953A", bg: "#F6EDD6",
    icon: <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M9.5 1.5H3a1 1 0 00-1 1v9a1 1 0 001 1h8a1 1 0 001-1V4.5L9.5 1.5z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"/><path d="M9.5 1.5v3H12.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/></svg>,
  },
  CORRESPONDENCE: {
    color: "#0B1D35", bg: "#E4EDF8",
    icon: <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><rect x="1.5" y="3" width="11" height="8" rx="1.5" stroke="currentColor" strokeWidth="1.3"/><path d="M1.5 4l5 3.5 5-3.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/></svg>,
  },
};

function fileExt(mimeType: string): string {
  const map: Record<string, string> = {
    "application/pdf": "pdf",
    "image/jpeg": "jpg",
    "image/jpg": "jpg",
    "image/png": "png",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  };
  return map[mimeType] ?? "file";
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function DocTypeIcon({ mimeType }: { mimeType: string }) {
  const ext = fileExt(mimeType);
  const isPdf = ext === "pdf";
  return (
    <div style={{
      width: 40, height: 48,
      background: isPdf ? "#FEF2F2" : "#EFF6FF",
      borderRadius: 6,
      display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center",
      flexShrink: 0,
      border: `1px solid ${isPdf ? "#FECACA" : "#BFDBFE"}`,
    }}>
      <span style={{
        fontSize: "0.6rem",
        fontWeight: 800,
        color: isPdf ? "#DC2626" : "#2563EB",
        letterSpacing: "0.04em",
        textTransform: "uppercase",
      }}>
        {ext}
      </span>
    </div>
  );
}

const UPLOAD_LIMIT_BYTES = 1024 * 1024 * 1024; // 1 GB

export default function DocumentsPage() {
  const [docs, setDocs] = useState<CredoDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeCategory, setActiveCategory] = useState<DocCategory>("ALL");
  const [view, setView] = useState<"grid" | "list">("list");
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadCategory, setUploadCategory] = useState<Exclude<DocCategory, "ALL">>("IDENTITY");
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchDocs = useCallback(async () => {
    try {
      const res = await fetch("/api/consumer/documents");
      if (res.ok) {
        const data = await res.json() as { documents: CredoDoc[] };
        setDocs(data.documents);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchDocs(); }, [fetchDocs]);

  async function uploadFile(file: File) {
    setError(null);
    setUploading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("category", uploadCategory);

      const res = await fetch("/api/consumer/upload", { method: "POST", body: form });
      const data = await res.json() as { error?: string };

      if (!res.ok) {
        setError(data.error ?? "Upload failed");
      } else {
        await fetchDocs();
      }
    } finally {
      setUploading(false);
    }
  }

  async function deleteDoc(id: string) {
    if (!confirm("Delete this document? This cannot be undone.")) return;
    await fetch(`/api/consumer/documents?id=${id}`, { method: "DELETE" });
    setDocs(prev => prev.filter(d => d.id !== id));
  }

  function downloadDoc(id: string, name: string) {
    const a = document.createElement("a");
    a.href = `/api/consumer/documents/${id}/download`;
    a.download = name;
    a.click();
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) uploadFile(file);
  }

  function handleFileInput(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) uploadFile(file);
    e.target.value = "";
  }

  const filtered = activeCategory === "ALL"
    ? docs
    : docs.filter(d => d.category === activeCategory);

  const usedBytes = docs.reduce((sum, d) => sum + d.size, 0);
  const usedPct = (usedBytes / UPLOAD_LIMIT_BYTES) * 100;

  return (
    <div className="animate-fade-in" style={{ display: "flex", flexDirection: "column", gap: 20 }}>

      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 20, flexWrap: "wrap" }}>
        <div>
          <h2 style={{ fontSize: "1.25rem", fontWeight: 700, color: "#0F172A", margin: "0 0 4px", letterSpacing: "-0.01em" }}>
            Document Vault
          </h2>
          <p style={{ fontSize: "0.875rem", color: "#64748B", margin: 0 }}>
            {loading ? "Loading…" : `${docs.length} files`} &bull; POPIA-compliant &bull; AES-256 encrypted
          </p>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          {/* Category selector for upload */}
          <select
            value={uploadCategory}
            onChange={e => setUploadCategory(e.target.value as Exclude<DocCategory, "ALL">)}
            style={{
              padding: "8px 12px", border: "1px solid #E2E8F0", borderRadius: 8,
              fontSize: "0.8125rem", color: "#475569", background: "#FFFFFF", cursor: "pointer",
            }}
          >
            {CATEGORIES.filter(c => c.key !== "ALL").map(c => (
              <option key={c.key} value={c.key}>{c.label}</option>
            ))}
          </select>
          {/* View toggle */}
          <div style={{ display: "flex", background: "#F1F5F9", borderRadius: 8, padding: 3 }}>
            {(["list", "grid"] as const).map(v => (
              <button key={v} onClick={() => setView(v)} style={{
                padding: "5px 10px", border: "none", cursor: "pointer", borderRadius: 6,
                background: view === v ? "#FFFFFF" : "transparent",
                color: view === v ? "#0F172A" : "#94A3B8",
                boxShadow: view === v ? "0 1px 3px rgba(0,0,0,0.08)" : "none",
                transition: "all 150ms",
              }}>
                {v === "list"
                  ? <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M2 4h10M2 7h10M2 10h10" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/></svg>
                  : <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><rect x="1.5" y="1.5" width="4.5" height="4.5" rx="1" stroke="currentColor" strokeWidth="1.3"/><rect x="8" y="1.5" width="4.5" height="4.5" rx="1" stroke="currentColor" strokeWidth="1.3"/><rect x="1.5" y="8" width="4.5" height="4.5" rx="1" stroke="currentColor" strokeWidth="1.3"/><rect x="8" y="8" width="4.5" height="4.5" rx="1" stroke="currentColor" strokeWidth="1.3"/></svg>
                }
              </button>
            ))}
          </div>
          <button
            className="btn-primary"
            disabled={uploading}
            onClick={() => fileInputRef.current?.click()}
            style={{ padding: "9px 18px", fontSize: "0.875rem", opacity: uploading ? 0.7 : 1 }}
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M7 1v12M1 7h12" stroke="white" strokeWidth="2" strokeLinecap="round"/>
            </svg>
            {uploading ? "Uploading…" : "Upload file"}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.jpg,.jpeg,.png,.docx"
            style={{ display: "none" }}
            onChange={handleFileInput}
          />
        </div>
      </div>

      {/* Error banner */}
      {error && (
        <div style={{
          background: "#FEF2F2", border: "1px solid #FECACA", borderRadius: 8,
          padding: "12px 16px", display: "flex", alignItems: "center", justifyContent: "space-between",
        }}>
          <span style={{ fontSize: "0.875rem", color: "#DC2626" }}>{error}</span>
          <button onClick={() => setError(null)} style={{ background: "none", border: "none", color: "#DC2626", cursor: "pointer", fontSize: "1rem" }}>✕</button>
        </div>
      )}

      {/* Storage bar */}
      <div className="credo-card" style={{ padding: "16px 20px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M8 2a6 6 0 100 12A6 6 0 008 2zm0 0v6m0 0l2.5-2.5M8 8l-2.5-2.5" stroke="#0B1D35" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            <span style={{ fontSize: "0.875rem", fontWeight: 600, color: "#0F172A" }}>Storage</span>
          </div>
          <span style={{ fontSize: "0.8125rem", color: "#64748B" }}>
            {formatBytes(usedBytes)} of 1 GB used
          </span>
        </div>
        <div style={{ height: 6, background: "#F1F5F9", borderRadius: 9999, overflow: "hidden" }}>
          <div style={{
            height: "100%", borderRadius: 9999,
            background: usedPct > 80 ? "#DC2626" : usedPct > 60 ? "#D97706" : "#0B1D35",
            width: `${usedPct}%`,
            transition: "width 0.8s cubic-bezier(0.4,0,0.2,1)",
          }}/>
        </div>
        <p style={{ fontSize: "0.75rem", color: "#94A3B8", margin: "6px 0 0" }}>
          Standard plan: 1 GB &bull; Upgrade to Premium for 10 GB
        </p>
      </div>

      {/* Category tabs */}
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {CATEGORIES.map(cat => (
          <button key={cat.key} onClick={() => setActiveCategory(cat.key)} style={{
            padding: "6px 14px",
            background: activeCategory === cat.key ? "#0B1D35" : "#FFFFFF",
            border: `1px solid ${activeCategory === cat.key ? "#0B1D35" : "#E2E8F0"}`,
            borderRadius: 9999,
            fontSize: "0.8125rem",
            fontWeight: activeCategory === cat.key ? 600 : 500,
            color: activeCategory === cat.key ? "#FFFFFF" : "#475569",
            cursor: "pointer",
            transition: "all 150ms",
          }}>
            {cat.label}
            <span style={{
              marginLeft: 6,
              padding: "1px 6px",
              borderRadius: 9999,
              background: activeCategory === cat.key ? "rgba(255,255,255,0.2)" : "#F1F5F9",
              color: activeCategory === cat.key ? "#E2E8F0" : "#94A3B8",
              fontSize: "0.7rem",
              fontWeight: 600,
            }}>
              {cat.key === "ALL" ? docs.length : docs.filter(d => d.category === cat.key).length}
            </span>
          </button>
        ))}
      </div>

      {/* Upload drop zone */}
      <div
        onDragOver={e => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        style={{
          border: `2px dashed ${dragging ? "#0B1D35" : "#E2E8F0"}`,
          borderRadius: 12,
          padding: "28px 24px",
          textAlign: "center",
          background: dragging ? "#F0F5FB" : "#FAFAFA",
          transition: "all 200ms",
          cursor: "pointer",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 12 }}>
          <div style={{ width: 36, height: 36, background: "#E4EDF8", borderRadius: 9, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
              <path d="M9 13V5M6 8l3-3 3 3" stroke="#0B1D35" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M3 15h12" stroke="#0B1D35" strokeWidth="1.6" strokeLinecap="round"/>
            </svg>
          </div>
          <div style={{ textAlign: "left" }}>
            <p style={{ fontSize: "0.875rem", fontWeight: 600, color: "#0F172A", margin: 0 }}>
              {uploading ? "Uploading…" : <>Drop files here or <span style={{ color: "#C4953A" }}>browse</span></>}
            </p>
            <p style={{ fontSize: "0.8125rem", color: "#94A3B8", margin: 0 }}>
              PDF, PNG, JPG, DOCX &bull; Max 10 MB per file &bull; Category: {CATEGORIES.find(c => c.key === uploadCategory)?.label}
            </p>
          </div>
        </div>
      </div>

      {/* Loading skeleton */}
      {loading && (
        <div className="credo-card" style={{ padding: "20px", display: "flex", flexDirection: "column", gap: 12 }}>
          {[1, 2, 3].map(i => (
            <div key={i} style={{ height: 48, background: "#F1F5F9", borderRadius: 8, animation: "pulse 1.5s infinite" }} />
          ))}
        </div>
      )}

      {/* Empty state */}
      {!loading && docs.length === 0 && (
        <div style={{ textAlign: "center", padding: "48px 20px", color: "#94A3B8" }}>
          <svg width="48" height="48" viewBox="0 0 48 48" fill="none" style={{ margin: "0 auto 16px" }}>
            <rect x="8" y="6" width="32" height="36" rx="4" stroke="#CBD5E1" strokeWidth="2"/>
            <path d="M16 18h16M16 24h10" stroke="#CBD5E1" strokeWidth="2" strokeLinecap="round"/>
          </svg>
          <p style={{ fontWeight: 600, color: "#475569", margin: "0 0 4px" }}>No documents yet</p>
          <p style={{ fontSize: "0.875rem", margin: 0 }}>Upload your first document using the button above.</p>
        </div>
      )}

      {/* File list */}
      {!loading && filtered.length > 0 && (view === "list" ? (
        <div className="credo-card" style={{ overflow: "hidden" }}>
          <div style={{
            display: "grid",
            gridTemplateColumns: "1fr 130px 90px 100px 120px",
            padding: "10px 20px",
            background: "#F8F9FA",
            borderBottom: "1px solid #E2E8F0",
          }}>
            {["Document", "Category", "Size", "Date", ""].map(h => (
              <span key={h} style={{ fontSize: "0.75rem", fontWeight: 600, color: "#94A3B8", letterSpacing: "0.04em", textTransform: "uppercase" }}>
                {h}
              </span>
            ))}
          </div>

          {filtered.map((doc, i) => {
            const cfg = CATEGORY_CONFIG[doc.category];
            return (
              <div key={doc.id} style={{
                display: "grid",
                gridTemplateColumns: "1fr 130px 90px 100px 120px",
                padding: "14px 20px",
                alignItems: "center",
                borderBottom: i < filtered.length - 1 ? "1px solid #F1F5F9" : "none",
                transition: "background-color 150ms",
              }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = "#FAFAFA"; }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = "transparent"; }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <DocTypeIcon mimeType={doc.mimeType} />
                  <p style={{ fontSize: "0.875rem", fontWeight: 600, color: "#0F172A", margin: 0, wordBreak: "break-word" }}>
                    {doc.originalName}
                  </p>
                </div>

                <span style={{
                  display: "inline-flex", alignItems: "center", gap: 5,
                  padding: "3px 10px",
                  background: cfg?.bg ?? "#F1F5F9", color: cfg?.color ?? "#475569",
                  borderRadius: 9999, fontSize: "0.75rem", fontWeight: 600,
                  width: "fit-content",
                }}>
                  {cfg?.icon}
                  {CATEGORIES.find(c => c.key === doc.category)?.label ?? doc.category}
                </span>

                <span style={{ fontSize: "0.8125rem", color: "#64748B" }}>{formatBytes(doc.size)}</span>

                <span style={{ fontSize: "0.8125rem", color: "#64748B" }}>
                  {new Date(doc.createdAt).toLocaleDateString("en-ZA")}
                </span>

                <div style={{ display: "flex", gap: 6 }}>
                  <button
                    onClick={() => downloadDoc(doc.id, doc.originalName)}
                    style={{
                      padding: "5px 10px", border: "1px solid #E2E8F0",
                      background: "#FFFFFF", borderRadius: 6,
                      cursor: "pointer", color: "#64748B",
                      fontSize: "0.75rem", fontWeight: 500,
                      display: "flex", alignItems: "center", gap: 4,
                    }}
                  >
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                      <path d="M6 8V2M3.5 5.5L6 8l2.5-2.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
                      <path d="M2 10h8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
                    </svg>
                  </button>
                  <button
                    onClick={() => deleteDoc(doc.id)}
                    style={{
                      padding: "5px 8px", border: "1px solid #FECACA",
                      background: "#FEF2F2", borderRadius: 6,
                      cursor: "pointer", color: "#DC2626",
                      fontSize: "0.75rem", fontWeight: 500,
                    }}
                  >
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                      <path d="M2 3h8M5 3V2h2v1M4.5 10h3M3 3l.5 7h5L9 3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 14 }}>
          {filtered.map(doc => {
            const cfg = CATEGORY_CONFIG[doc.category];
            return (
              <div key={doc.id} className="credo-card" style={{ padding: "18px", cursor: "pointer" }}>
                <div style={{ display: "flex", justifyContent: "center", marginBottom: 14 }}>
                  <div style={{
                    width: 56, height: 72,
                    background: doc.mimeType === "application/pdf" ? "#FEF2F2" : "#EFF6FF",
                    borderRadius: 8,
                    display: "flex", flexDirection: "column",
                    alignItems: "center", justifyContent: "center",
                    border: `1px solid ${doc.mimeType === "application/pdf" ? "#FECACA" : "#BFDBFE"}`,
                  }}>
                    <span style={{ fontSize: "0.75rem", fontWeight: 800, color: doc.mimeType === "application/pdf" ? "#DC2626" : "#2563EB", letterSpacing: "0.04em" }}>
                      {fileExt(doc.mimeType).toUpperCase()}
                    </span>
                  </div>
                </div>
                <p style={{ fontSize: "0.8125rem", fontWeight: 600, color: "#0F172A", margin: "0 0 6px", lineHeight: 1.4, textAlign: "center", wordBreak: "break-word" }}>
                  {doc.originalName.length > 36 ? doc.originalName.slice(0, 36) + "…" : doc.originalName}
                </p>
                <div style={{ display: "flex", justifyContent: "center", gap: 6 }}>
                  <span style={{ padding: "2px 8px", background: cfg?.bg ?? "#F1F5F9", color: cfg?.color ?? "#475569", borderRadius: 9999, fontSize: "0.7rem", fontWeight: 600 }}>
                    {CATEGORIES.find(c => c.key === doc.category)?.label ?? doc.category}
                  </span>
                </div>
                <div style={{ display: "flex", justifyContent: "center", gap: 6, marginTop: 10 }}>
                  <button onClick={() => downloadDoc(doc.id, doc.originalName)} style={{ padding: "4px 10px", border: "1px solid #E2E8F0", borderRadius: 6, background: "#FFFFFF", cursor: "pointer", fontSize: "0.75rem", color: "#64748B" }}>
                    Download
                  </button>
                  <button onClick={() => deleteDoc(doc.id)} style={{ padding: "4px 8px", border: "1px solid #FECACA", borderRadius: 6, background: "#FEF2F2", cursor: "pointer", fontSize: "0.75rem", color: "#DC2626" }}>
                    Delete
                  </button>
                </div>
                <p style={{ fontSize: "0.75rem", color: "#94A3B8", textAlign: "center", margin: "6px 0 0" }}>
                  {new Date(doc.createdAt).toLocaleDateString("en-ZA")}
                </p>
              </div>
            );
          })}
        </div>
      ))}

      {/* POPIA notice */}
      <div style={{
        background: "#F8F9FA", border: "1px solid #E2E8F0",
        borderRadius: 10, padding: "14px 18px",
        display: "flex", gap: 10, alignItems: "flex-start",
      }}>
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" style={{ flexShrink: 0, marginTop: 1 }}>
          <path d="M8 2l5.5 3v3.5A5.5 5.5 0 018 14.5 5.5 5.5 0 012.5 8.5V5L8 2z" stroke="#64748B" strokeWidth="1.4" strokeLinejoin="round"/>
        </svg>
        <p style={{ fontSize: "0.8125rem", color: "#64748B", margin: 0, lineHeight: 1.6 }}>
          All documents are encrypted using AES-256 and stored in compliance with the
          Protection of Personal Information Act (POPIA). Only you and your authorised
          case manager can access your files.
        </p>
      </div>
    </div>
  );
}

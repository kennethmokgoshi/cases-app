"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { getCredoSupportContact } from "@/lib/support-contact";

interface ConsentView {
  token: string;
  status: string;
  expired: boolean;
  consumerFirstName: string | null;
  consumerDisplayName?: string | null;
  fileNumber: string | null;
  consentText: string;
  consentedAt: string | null;
}

const card: React.CSSProperties = {
  width: "100%",
  maxWidth: 560,
  background: "#FFFFFF",
  border: "1px solid #E2E8F0",
  borderRadius: 14,
  padding: "36px 32px",
  boxShadow: "0 10px 30px rgba(11,29,53,0.08)",
};

const contactActions: React.CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 10,
  marginTop: 18,
};

const primaryContactLink: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  minHeight: 40,
  padding: "10px 16px",
  background: "#0B1D35",
  color: "#FFFFFF",
  fontWeight: 700,
  fontSize: "0.875rem",
  borderRadius: 9,
  textDecoration: "none",
};

const secondaryContactLink: React.CSSProperties = {
  ...primaryContactLink,
  background: "#F8FAFC",
  color: "#0B1D35",
  border: "1px solid #CBD5E1",
};

export default function ConsentClient({ token }: { token: string }) {
  const [view, setView] = useState<ConsentView | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [agreed, setAgreed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [approved, setApproved] = useState(false);
  const consumerDisplayName = view?.consumerDisplayName ?? view?.consumerFirstName ?? null;
  const supportContact = getCredoSupportContact();
  const expiredSupportContact = getCredoSupportContact("expired-consent-link");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/consumer/consent/${token}`);
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "We could not load this consent request.");
      } else {
        setView(data);
        if (data.status === "CONSENTED") setApproved(true);
      }
    } catch {
      setError("We could not load this consent request. Please check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  const approve = async () => {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/consumer/consent/${token}`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "We could not record your approval. Please try again.");
      } else {
        setApproved(true);
      }
    } catch {
      setError("We could not record your approval. Please check your connection and try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "linear-gradient(160deg, #F8F9FA 0%, #EEF2F7 100%)",
        padding: "32px 16px",
      }}
    >
      <div style={card}>
        {/* Brand header */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 28 }}>
          <div
            style={{
              width: 40,
              height: 40,
              background: "rgba(196,149,58,0.12)",
              border: "1px solid rgba(196,149,58,0.3)",
              borderRadius: 10,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
              <path d="M11 2.5C6.86 2.5 3.5 5.86 3.5 11s3.36 8.5 7.5 8.5 8.5-3.36 8.5-7.5" stroke="#C4953A" strokeWidth="2" strokeLinecap="round" />
              <path d="M7.5 11l2.5 2.5 5-5" stroke="#0B1D35" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <div>
            <div style={{ fontWeight: 700, fontSize: "1.05rem", color: "#0B1D35" }}>Zenowethu Debt Management</div>
            <div style={{ fontSize: "0.75rem", color: "#94A3B8", fontWeight: 600, letterSpacing: "0.03em" }}>NCRDC3693 · Credo Portal</div>
          </div>
        </div>

        {loading ? (
          <div style={{ textAlign: "center", padding: "40px 0", color: "#64748B", fontSize: "0.9375rem" }}>
            Loading your consent request…
          </div>
        ) : approved ? (
          <div style={{ textAlign: "center", padding: "12px 0" }}>
            <div
              style={{
                width: 56, height: 56, margin: "0 auto 18px", borderRadius: "50%",
                background: "#ECFDF5", border: "1px solid #A7F3D0",
                display: "flex", alignItems: "center", justifyContent: "center",
              }}
            >
              <svg width="26" height="26" viewBox="0 0 26 26" fill="none">
                <path d="M6 13.5l4.5 4.5L20 8.5" stroke="#059669" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            <h1 style={{ fontSize: "1.375rem", fontWeight: 700, color: "#0F172A", marginBottom: 10 }}>
              Approval recorded — thank you{consumerDisplayName ? `, ${consumerDisplayName}` : ""}
            </h1>
            <p style={{ fontSize: "0.9375rem", color: "#475569", lineHeight: 1.6, marginBottom: 8 }}>
              Our team will now continue working on your file
              {view?.fileNumber ? ` (${view.fileNumber})` : ""}. We are checking that all required documents are on
              record, and we will contact you here or by email if anything further is needed from your side.
            </p>
            <p style={{ fontSize: "0.8125rem", color: "#94A3B8", lineHeight: 1.6, marginBottom: 24 }}>
              The debt review flag removal follows a regulated process — timelines depend on the credit bureaus and the
              relevant authorities.
            </p>
            <Link
              href="/dashboard"
              style={{
                display: "inline-block", padding: "12px 28px", background: "#0B1D35", color: "#FFFFFF",
                fontWeight: 600, fontSize: "0.9375rem", borderRadius: 9, textDecoration: "none",
              }}
            >
              Go to my dashboard
            </Link>
            <p style={{ fontSize: "0.8125rem", color: "#64748B", lineHeight: 1.6, marginTop: 18, marginBottom: 0 }}>
              Need help?{" "}
              <a href={supportContact.whatsappHref} target="_blank" rel="noopener noreferrer" style={{ color: "#0B1D35", fontWeight: 700 }}>
                WhatsApp us
              </a>{" "}
              or contact{" "}
              <a href={supportContact.supportHref} style={{ color: "#0B1D35", fontWeight: 700 }}>
                Support
              </a>
              .
            </p>
          </div>
        ) : error && !view ? (
          <div>
            <h1 style={{ fontSize: "1.375rem", fontWeight: 700, color: "#0F172A", marginBottom: 10 }}>
              We could not open this consent link
            </h1>
            <div
              style={{
                background: "#FEF2F2", border: "1px solid #FECACA", borderRadius: 9,
                padding: "12px 14px", fontSize: "0.875rem", color: "#DC2626", marginBottom: 20,
              }}
            >
              {error}
            </div>
            <p style={{ fontSize: "0.875rem", color: "#64748B", lineHeight: 1.6 }}>
              If you believe this is a mistake, please call{" "}
              <a href={supportContact.phoneHref} style={{ color: "#0B1D35", fontWeight: 700 }}>
                {supportContact.phoneDisplay}
              </a>
              , reply to the email we sent you, or use one of the quick contact options below.
            </p>
            <div style={contactActions}>
              <a
                href={supportContact.whatsappHref}
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Contact Zenowethu staff on WhatsApp"
                style={primaryContactLink}
              >
                WhatsApp us
              </a>
              <a
                href={supportContact.supportHref}
                aria-label="Email Zenowethu support"
                style={secondaryContactLink}
              >
                Support
              </a>
            </div>
          </div>
        ) : view && (view.expired || view.status === "EXPIRED" || view.status === "CANCELLED") ? (
          <div>
            <h1 style={{ fontSize: "1.375rem", fontWeight: 700, color: "#0F172A", marginBottom: 10 }}>
              This consent link is no longer active
            </h1>
            <p style={{ fontSize: "0.9375rem", color: "#475569", lineHeight: 1.6 }}>
              {view.status === "CANCELLED"
                ? "This consent request has been cancelled."
                : "This consent link has expired."}{" "}
              Please call{" "}
              <a href={expiredSupportContact.phoneHref} style={{ color: "#0B1D35", fontWeight: 700 }}>
                {expiredSupportContact.phoneDisplay}
              </a>
              , WhatsApp us, or contact Support and we will send you a new one.
            </p>
            <div style={contactActions}>
              <a
                href={expiredSupportContact.whatsappHref}
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Request a new consent link on WhatsApp"
                style={primaryContactLink}
              >
                WhatsApp us
              </a>
              <a
                href={expiredSupportContact.supportHref}
                aria-label="Email Zenowethu support for a new consent link"
                style={secondaryContactLink}
              >
                Support
              </a>
            </div>
          </div>
        ) : view ? (
          <div>
            <h1 style={{ fontSize: "1.375rem", fontWeight: 700, color: "#0F172A", marginBottom: 6 }}>
              {consumerDisplayName ? `${consumerDisplayName}, your` : "Your"} approval is needed
            </h1>
            <p style={{ fontSize: "0.9375rem", color: "#475569", lineHeight: 1.6, marginBottom: 20 }}>
              Your debt review file{view.fileNumber ? ` (${view.fileNumber})` : ""} has been transferred to Zenowethu
              Debt Management. This approval confirms that you know Zenowethu is now working on your file, so there is
              a clear record before our team continues.
            </p>

            <div
              style={{
                background: "#F8FAFC", border: "1px solid #E2E8F0", borderRadius: 10,
                padding: "16px 18px", fontSize: "0.875rem", color: "#334155",
                lineHeight: 1.7, marginBottom: 20,
              }}
            >
              {view.consentText}
            </div>

            {error && (
              <div
                style={{
                  background: "#FEF2F2", border: "1px solid #FECACA", borderRadius: 9,
                  padding: "10px 14px", fontSize: "0.8125rem", color: "#DC2626", marginBottom: 16,
                }}
              >
                {error}
              </div>
            )}

            <label
              style={{
                display: "flex", alignItems: "flex-start", gap: 10, cursor: "pointer",
                fontSize: "0.875rem", color: "#0F172A", marginBottom: 20, lineHeight: 1.5,
              }}
            >
              <input
                type="checkbox"
                checked={agreed}
                onChange={(e) => setAgreed(e.target.checked)}
                style={{ marginTop: 3, width: 16, height: 16, accentColor: "#0B1D35" }}
              />
              <span>
                I have read and understood the consent above, and I confirm Zenowethu Debt Management is authorised to
                continue working on my file.
              </span>
            </label>

            <button
              type="button"
              onClick={approve}
              disabled={!agreed || submitting}
              style={{
                width: "100%", padding: "13px 0",
                background: !agreed || submitting ? "#94A3B8" : "#0B1D35",
                color: "#FFFFFF", fontWeight: 600, fontSize: "0.9375rem",
                border: "none", borderRadius: 9,
                cursor: !agreed || submitting ? "not-allowed" : "pointer",
                boxShadow: !agreed || submitting ? "none" : "0 4px 14px rgba(11,29,53,0.2)",
              }}
            >
              {submitting ? "Recording your approval..." : "I Approve - Zenowethu may continue"}
            </button>

            <p style={{ textAlign: "center", marginTop: 18, fontSize: "0.75rem", color: "#94A3B8", lineHeight: 1.6 }}>
              Your personal information is protected under POPIA. Your approval is recorded with a secure audit trail.
              {" "}
              Need help?{" "}
              <a href={supportContact.whatsappHref} target="_blank" rel="noopener noreferrer" style={{ color: "#0B1D35", fontWeight: 700 }}>
                WhatsApp us
              </a>{" "}
              or contact{" "}
              <a href={supportContact.supportHref} style={{ color: "#0B1D35", fontWeight: 700 }}>
                Support
              </a>
              .
            </p>
          </div>
        ) : null}
      </div>
    </div>
  );
}

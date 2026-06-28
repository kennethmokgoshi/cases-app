'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';

interface ConsentView {
  token: string;
  status: string;
  expired: boolean;
  consumerFirstName: string | null;
  fileNumber: string | null;
  consentText: string;
  consentedAt: string | null;
}

const NAVY = '#0B1D35';
const ACCENT = '#C4953A';

export default function DebtReviewRemovalConsentPage() {
  const params = useParams();
  const token = params.token as string;

  const [loadingData, setLoadingData] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [data, setData] = useState<ConsentView | null>(null);
  const [agreed, setAgreed] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`/api/consent/debt-review-removal/${token}`);
        const body = await res.json();
        if (!res.ok) {
          setError(body.error || 'This consent link is not valid.');
        } else {
          setData(body);
          if (body.status === 'CONSENTED') setDone(true);
        }
      } catch {
        setError('Failed to load the consent page. Please try again.');
      } finally {
        setLoadingData(false);
      }
    })();
  }, [token]);

  const submit = async () => {
    setSubmitting(true);
    setError('');
    try {
      const res = await fetch(`/api/consent/debt-review-removal/${token}`, { method: 'POST' });
      const body = await res.json();
      if (!res.ok) {
        setError(body.error || 'Could not record your consent. Please try again.');
      } else {
        setDone(true);
      }
    } catch {
      setError('Could not record your consent. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const Shell = ({ children }: { children: React.ReactNode }) => (
    <div style={{ minHeight: '100vh', background: '#F5F6F8', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, fontFamily: 'Inter, system-ui, sans-serif' }}>
      <div style={{ width: '100%', maxWidth: 560, background: '#fff', borderRadius: 14, boxShadow: '0 8px 30px rgba(0,0,0,0.08)', overflow: 'hidden' }}>
        <div style={{ background: NAVY, padding: '20px 28px' }}>
          <div style={{ color: '#fff', fontWeight: 700, fontSize: 18 }}>Zenowethu Debt Management</div>
          <div style={{ color: ACCENT, fontSize: 13, marginTop: 2 }}>Debt Review Removal — Consumer Consent</div>
        </div>
        <div style={{ padding: 28 }}>{children}</div>
      </div>
    </div>
  );

  if (loadingData) {
    return <Shell><p style={{ color: '#475569' }}>Loading…</p></Shell>;
  }

  if (error && !data) {
    return <Shell><div style={{ color: '#B91C1C', fontWeight: 600 }}>{error}</div><p style={{ color: '#64748B', marginTop: 12, fontSize: 14 }}>If you need help, contact us on 012 035 1824 or info@zenowethu.co.za.</p></Shell>;
  }

  if (done) {
    return (
      <Shell>
        <div style={{ fontSize: 40, marginBottom: 8 }}>✅</div>
        <h2 style={{ color: NAVY, margin: '0 0 8px' }}>Thank you{data?.consumerFirstName ? `, ${data.consumerFirstName}` : ''}!</h2>
        <p style={{ color: '#334155', lineHeight: 1.6 }}>
          Your consent has been recorded and we will now proceed with the removal of your debt review flag
          {data?.fileNumber ? ` (File: ${data.fileNumber})` : ''}. Our team will keep you updated on the progress.
        </p>
      </Shell>
    );
  }

  if (data?.expired || data?.status === 'EXPIRED') {
    return <Shell><div style={{ color: '#B45309', fontWeight: 600 }}>This consent link has expired.</div><p style={{ color: '#64748B', marginTop: 12, fontSize: 14 }}>Please contact us on 012 035 1824 and we will send you a new link.</p></Shell>;
  }

  return (
    <Shell>
      <h2 style={{ color: NAVY, margin: '0 0 6px' }}>Hello{data?.consumerFirstName ? ` ${data.consumerFirstName}` : ''},</h2>
      <p style={{ color: '#334155', lineHeight: 1.6, marginTop: 0 }}>
        Your debt review file{data?.fileNumber ? ` (${data.fileNumber})` : ''} has been accepted. Before we proceed with
        removing the debt review flag from your credit profile, we need your consent.
      </p>

      <div style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 10, padding: 16, margin: '16px 0', color: '#334155', fontSize: 14, lineHeight: 1.6 }}>
        {data?.consentText}
      </div>

      <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer', color: '#1E293B', fontSize: 14 }}>
        <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} style={{ marginTop: 3, width: 18, height: 18, accentColor: ACCENT }} />
        <span>I have read and I agree to the above. I give my consent to proceed with debt review removal.</span>
      </label>

      {error && <div style={{ color: '#B91C1C', marginTop: 12, fontSize: 14 }}>{error}</div>}

      <button
        onClick={submit}
        disabled={!agreed || submitting}
        style={{
          marginTop: 20, width: '100%', padding: '13px 16px', borderRadius: 10, border: 'none',
          background: !agreed || submitting ? '#CBD5E1' : ACCENT, color: !agreed || submitting ? '#64748B' : '#1A1206',
          fontWeight: 700, fontSize: 15, cursor: !agreed || submitting ? 'not-allowed' : 'pointer',
        }}
      >
        {submitting ? 'Submitting…' : 'I Consent — Proceed'}
      </button>

      <p style={{ color: '#94A3B8', fontSize: 12, marginTop: 16, textAlign: 'center' }}>
        Aaron Nzotho | NCRDC3693 | Zenowethu Debt Management | 012 035 1824 | Member of DCASA
      </p>
    </Shell>
  );
}

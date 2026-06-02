'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { SignaturePad } from '@zenowethu/ui';
import { toast } from '@zenowethu/ui';

interface PoaData {
  clientName: string;
  poaType: string;
  channel: string;
  expiryHours: number;
}

export default function SignPoaPage() {
  const params = useParams();
  const router = useRouter();
  const token = params.token as string;

  const [loading, setLoading] = useState(false);
  const [loadingData, setLoadingData] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [poaData, setPoaData] = useState<PoaData | null>(null);

  // Validate token on mount
  useEffect(() => {
    const validateToken = async () => {
      try {
        const res = await fetch(`/api/poa/validate/${token}`, { method: 'GET' });
        const data = await res.json();

        if (!res.ok) {
          setError(data.error || 'Invalid or expired signing link.');
          setLoadingData(false);
          return;
        }

        setPoaData(data);
      } catch (err) {
        setError('Failed to load signing page. Please try again.');
      } finally {
        setLoadingData(false);
      }
    };

    validateToken();
  }, [token]);

  const handleSaveSignature = async (signatureDataUrl: string) => {
    setLoading(true);
    setError('');

    try {
      const res = await fetch(`/api/poa/sign/${token}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ signatureImage: signatureDataUrl }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Failed to submit signature.');
        setLoading(false);
        return;
      }

      setSuccess(true);
      setTimeout(() => {
        router.push('/');
      }, 3000);
    } catch (err: any) {
      setError(err.message || 'Network error. Please try again.');
      setLoading(false);
    }
  };

  // Loading state
  if (loadingData) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-4">
        <div className="w-12 h-12 border-3 border-cyan-500 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  // Success state
  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-4">
        <div className="max-w-md text-center">
          <div className="w-20 h-20 bg-green-500/20 rounded-full flex items-center justify-center mb-6 mx-auto animate-bounce">
            <svg className="w-10 h-10 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h1 className="text-3xl font-bold text-white mb-3">Document Signed!</h1>
          <p className="text-gray-300 mb-6">
            Your Power of Attorney has been digitally signed and submitted. Thank you!
          </p>
          <p className="text-sm text-gray-500">
            You will be redirected shortly. If not, you can close this window.
          </p>
        </div>
      </div>
    );
  }

  // Error state
  if (error && !poaData) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-4">
        <div className="max-w-md">
          <div className="w-16 h-16 bg-red-500/20 rounded-full flex items-center justify-center mb-6 mx-auto">
            <svg className="w-8 h-8 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </div>
          <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-6 py-4 text-center">
            <h2 className="text-lg font-semibold text-red-400 mb-2">Signing Link Invalid</h2>
            <p className="text-sm text-red-300 mb-4">{error}</p>
            <p className="text-xs text-red-400">
              Please contact Zenowethu Debt Management at <strong>012 035 1824</strong> to request a new signing link.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Normal signing state
  if (!poaData) return null;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-4">
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-4xl font-bold text-white">Sign Your Power of Attorney</h1>
              <p className="text-gray-400 mt-2">
                Complete your document signature in under 1 minute
              </p>
            </div>
            <div className="w-16 h-16 bg-gradient-to-br from-cyan-500 to-blue-500 rounded-full flex items-center justify-center">
              <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4" />
              </svg>
            </div>
          </div>

          {/* Client details card */}
          <div className="bg-white/5 border border-white/10 rounded-2xl p-6 backdrop-blur-md">
            <div className="grid md:grid-cols-2 gap-6">
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">
                  Client Name
                </p>
                <p className="text-xl font-bold text-white">{poaData.clientName}</p>
              </div>
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">
                  Document Type
                </p>
                <p className="text-xl font-bold text-white">
                  {poaData.poaType === 'WESBANK' ? 'Wesbank POA' : 'Standard POA'}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Main content */}
        <div className="grid lg:grid-cols-2 gap-8 items-start">
          {/* Document preview (left) */}
          <div className="bg-white/5 border border-white/10 rounded-2xl p-8 backdrop-blur-md aspect-[1/1.414] relative overflow-hidden group">
            <div className="absolute inset-0 bg-gradient-to-b from-transparent to-black/20 group-hover:to-black/40 transition-all"></div>
            <div className="space-y-4 opacity-50">
              <div className="h-6 bg-white/20 rounded w-2/3 mx-auto"></div>
              <div className="h-3 bg-white/10 rounded w-1/2 mx-auto"></div>
              <div className="space-y-2 pt-12">
                {[...Array(14)].map((_, i) => (
                  <div key={i} className="h-2 bg-white/5 rounded w-full"></div>
                ))}
              </div>
            </div>
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="bg-slate-950/80 backdrop-blur-sm px-4 py-2 rounded-full border border-white/20 text-xs text-white font-medium">
                Document Preview
              </div>
            </div>
          </div>

          {/* Signature pad (right) */}
          <div className="space-y-6">
            {error && (
              <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
                {error}
              </div>
            )}

            <SignaturePad
              onSave={handleSaveSignature}
              title="Your Signature"
              description="Draw your signature using your finger, mouse, or stylus. Keep it within the box."
            />

            {/* Legal notice */}
            <div className="rounded-xl border border-blue-500/20 bg-blue-500/10 p-4 space-y-2">
              <div className="flex gap-3">
                <svg className="w-5 h-5 text-blue-400 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <div className="text-xs text-blue-300 leading-relaxed">
                  <p className="font-semibold mb-1">Electronic Signature Notice</p>
                  <p>
                    This digital signature is legally binding under the Electronic Communications and Transactions Act (ECTA, Act 25 of 2002).
                    Your IP address, timestamp, and browser details are recorded and will be attached to your signed document as proof.
                  </p>
                </div>
              </div>
            </div>

            {/* Status info */}
            {loading && (
              <div className="flex items-center justify-center gap-3 text-cyan-400 animate-pulse">
                <div className="w-4 h-4 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin"></div>
                <span className="text-sm font-medium">Processing your signature...</span>
              </div>
            )}

            {/* Help text */}
            <div className="text-xs text-gray-500 space-y-1">
              <p>• Link valid for 72 hours</p>
              <p>• Each link can only be signed once</p>
              <p>• Questions? Call us at 012 035 1824</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

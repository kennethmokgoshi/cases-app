'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

type Partner = { id: string; name: string };
type PreviewResult = {
  totalRows: number;
  validRows: number;
  invalidRows: number;
  totalCollected: number;
  totalInvoiceAmount: number;
  groupedLines: {
    paymentMethod: string;
    totalCollected: number;
    splitPercentage: number;
    invoiceAmount: number;
  }[];
  errors: string[];
};

export default function ImportPartnerReportPage() {
  const router = useRouter();
  const [partners, setPartners] = useState<Partner[]>([]);
  const [partnerId, setPartnerId] = useState<string>('');
  const [splitPercent, setSplitPercent] = useState<number>(50);
  const [file, setFile] = useState<File | null>(null);
  
  const [loading, setLoading] = useState(false);
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    fetch('/api/b2b/partners')
      .then(res => res.json())
      .then(data => {
        setPartners(data);
        if (data.length > 0) setPartnerId(data[0].id);
      })
      .catch(() => setError('Failed to load partners'));
  }, []);

  const handlePreview = async () => {
    if (!file) return;
    setLoading(true);
    setError(null);
    setPreview(null);

    const formData = new FormData();
    formData.append('file', file);
    formData.append('splitPercent', splitPercent.toString());

    try {
      const res = await fetch('/api/finance/invoices/partner-upload/preview', {
        method: 'POST',
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Preview failed');
      setPreview(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleConfirm = async () => {
    if (!preview || !partnerId) return;
    setConfirming(true);
    setError(null);

    try {
      const res = await fetch('/api/finance/invoices/partner-upload/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          partnerId,
          splitPercent,
          groupedLines: preview.groupedLines,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Confirm failed');
      
      router.push(`/invoices/${data.invoiceId}`);
    } catch (err: any) {
      setError(err.message);
      setConfirming(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-8">
      <div className="flex items-center gap-4">
        <Link href="/b2b-portal" className="p-2 rounded-lg hover:bg-white/5 text-gray-400 hover:text-white transition-colors">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
          </svg>
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-white">Import Partner Report</h1>
          <p className="text-sm text-gray-400 mt-1">Upload an XLS/XLSX file to auto-generate a commission invoice</p>
        </div>
      </div>

      <div className="bg-zeno-gray rounded-2xl border border-white/5 p-6 space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">B2B Partner</label>
            <select
              value={partnerId}
              onChange={e => setPartnerId(e.target.value)}
              className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-zeno-cyan focus:ring-1 focus:ring-zeno-cyan"
            >
              {partners.map(p => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">Zenowethu Split Percentage</label>
            <div className="relative">
              <input
                type="number"
                min="0"
                max="100"
                value={splitPercent}
                onChange={e => setSplitPercent(Number(e.target.value))}
                className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-zeno-cyan focus:ring-1 focus:ring-zeno-cyan"
              />
              <span className="absolute right-4 top-3 text-gray-500">%</span>
            </div>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">Upload Report (.xlsx)</label>
          <div className="flex items-center gap-4">
            <input
              type="file"
              accept=".xlsx,.xls"
              onChange={e => setFile(e.target.files?.[0] || null)}
              className="block w-full text-sm text-gray-400 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-zeno-cyan/10 file:text-zeno-cyan hover:file:bg-zeno-cyan/20"
            />
            <button
              onClick={handlePreview}
              disabled={!file || loading}
              className="px-6 py-2 bg-zeno-cyan text-zeno-navy font-semibold rounded-lg hover:bg-cyan-400 transition-colors disabled:opacity-50"
            >
              {loading ? 'Processing...' : 'Preview'}
            </button>
          </div>
        </div>

        {error && (
          <div className="bg-red-500/10 border border-red-500/20 text-red-400 px-4 py-3 rounded-lg text-sm">
            {error}
          </div>
        )}
      </div>

      {preview && (
        <div className="bg-zeno-gray rounded-2xl border border-white/5 overflow-hidden">
          <div className="p-6 border-b border-white/5 flex justify-between items-center">
            <div>
              <h3 className="text-lg font-semibold text-white">Import Preview</h3>
              <p className="text-sm text-gray-400 mt-1">
                Found {preview.validRows} valid rows (ignored {preview.invalidRows} invalid/empty). 
                Total Collected: R {preview.totalCollected.toFixed(2)}
              </p>
            </div>
            <div className="text-right">
              <p className="text-sm text-gray-400">Invoice Subtotal</p>
              <p className="text-2xl font-bold text-zeno-cyan">R {preview.totalInvoiceAmount.toFixed(2)}</p>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-white/5 text-gray-400">
                <tr>
                  <th className="px-6 py-3 font-medium">Payment Method</th>
                  <th className="px-6 py-3 font-medium text-right">Total Collected</th>
                  <th className="px-6 py-3 font-medium text-right">Split</th>
                  <th className="px-6 py-3 font-medium text-right">Invoice Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {preview.groupedLines.map((line, i) => (
                  <tr key={i} className="hover:bg-white/5">
                    <td className="px-6 py-4 text-white font-medium">{line.paymentMethod}</td>
                    <td className="px-6 py-4 text-gray-300 text-right">R {line.totalCollected.toFixed(2)}</td>
                    <td className="px-6 py-4 text-gray-500 text-right">{line.splitPercentage}%</td>
                    <td className="px-6 py-4 text-emerald-400 font-medium text-right">R {line.invoiceAmount.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="p-6 bg-white/5 flex justify-end gap-4">
            <button
              onClick={() => setPreview(null)}
              className="px-6 py-2 text-gray-300 hover:text-white transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleConfirm}
              disabled={confirming}
              className="px-6 py-2 bg-emerald-500 text-white font-semibold rounded-lg hover:bg-emerald-400 transition-colors disabled:opacity-50 flex items-center gap-2"
            >
              {confirming ? 'Generating...' : 'Generate Invoice'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

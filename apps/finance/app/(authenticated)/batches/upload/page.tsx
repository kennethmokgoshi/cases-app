'use client';

import { useState, useRef } from 'react';
import Link from 'next/link';

type SkippedRow = {
    rowNumber: number;
    name: string | null;
    amount: number;
    reason: string;
};

type UploadSummary = {
    format: 'letsatsi' | 'generic';
    totalRows: number;
    totalAmount: number;
    matchCount: number;
    unmatchCount: number;
    skippedCount: number;
    skippedRows: SkippedRow[];
};

type UploadResult = {
    batch: { id: string; fileName: string };
    summary: UploadSummary;
};

function formatZAR(amount: number) {
    return new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR' }).format(amount);
}

export default function UploadBatchPage() {
    const fileRef = useRef<HTMLInputElement>(null);
    const [file, setFile] = useState<File | null>(null);
    const [uploading, setUploading] = useState(false);
    const [error, setError] = useState('');
    const [result, setResult] = useState<UploadResult | null>(null);
    const [showSkipped, setShowSkipped] = useState(false);

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        const f = e.dataTransfer.files[0];
        if (f && (f.name.endsWith('.xlsx') || f.name.endsWith('.xls'))) {
            setFile(f);
            setError('');
        } else {
            setError('Please drop an Excel file (.xlsx or .xls)');
        }
    };

    const handleUpload = async () => {
        if (!file) return;
        setUploading(true);
        setError('');
        setResult(null);
        setShowSkipped(false);
        try {
            const form = new FormData();
            form.append('file', file);
            const res = await fetch('/api/finance/batches', { method: 'POST', body: form });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Upload failed');
            setResult(data);
        } catch (err: any) {
            setError(err.message);
        } finally {
            setUploading(false);
        }
    };

    return (
        <div className="p-6 max-w-3xl mx-auto">
            <div className="mb-8">
                <Link href="/batches" className="text-cyan-400 hover:text-cyan-300 text-sm mb-2 inline-block">← Batches</Link>
                <h1 className="text-3xl font-bold text-white">Import Payment Batch</h1>
                <p className="text-gray-400 text-sm mt-1">
                    Upload a Letsatsi or generic Excel file — payments are auto-matched by File nr and SA ID number
                </p>
            </div>

            {result ? (
                /* ── Success view ───────────────────────────────────────────── */
                <div className="space-y-5">
                    {/* Header card */}
                    <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-2xl p-6 text-center">
                        <div className="w-14 h-14 bg-emerald-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
                            <svg className="w-7 h-7 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                            </svg>
                        </div>
                        <h2 className="text-xl font-bold text-white mb-1">Batch Imported</h2>
                        <p className="text-gray-400 text-sm">{result.batch.fileName}</p>
                        <span className={`inline-block mt-2 px-3 py-1 rounded-full text-xs font-medium ${
                            result.summary.format === 'letsatsi'
                                ? 'bg-indigo-500/20 text-indigo-400'
                                : 'bg-gray-500/20 text-gray-400'
                        }`}>
                            {result.summary.format === 'letsatsi' ? '⚡ Letsatsi format detected' : 'Generic format'}
                        </span>
                    </div>

                    {/* Stats grid */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                        <div className="bg-[var(--color-bg-secondary)] rounded-xl p-4 text-center border border-white/5">
                            <p className="text-2xl font-bold text-white">{result.summary.totalRows}</p>
                            <p className="text-xs text-gray-500 mt-1">Total Rows</p>
                        </div>
                        <div className="bg-emerald-500/10 rounded-xl p-4 text-center border border-emerald-500/20">
                            <p className="text-2xl font-bold text-emerald-400">{result.summary.matchCount}</p>
                            <p className="text-xs text-emerald-600 mt-1">Matched</p>
                        </div>
                        <div className="bg-orange-500/10 rounded-xl p-4 text-center border border-orange-500/20">
                            <p className="text-2xl font-bold text-orange-400">{result.summary.unmatchCount}</p>
                            <p className="text-xs text-orange-600 mt-1">Unmatched</p>
                        </div>
                        <div className={`rounded-xl p-4 text-center border ${
                            result.summary.skippedCount > 0
                                ? 'bg-red-500/10 border-red-500/20'
                                : 'bg-[var(--color-bg-secondary)] border-white/5'
                        }`}>
                            <p className={`text-2xl font-bold ${result.summary.skippedCount > 0 ? 'text-red-400' : 'text-gray-500'}`}>
                                {result.summary.skippedCount}
                            </p>
                            <p className={`text-xs mt-1 ${result.summary.skippedCount > 0 ? 'text-red-600' : 'text-gray-600'}`}>
                                Skipped
                            </p>
                        </div>
                    </div>

                    {/* Total amount */}
                    <div className="bg-[var(--color-bg-secondary)] rounded-xl p-4 border border-white/5 flex items-center justify-between">
                        <span className="text-gray-400 text-sm">Total Amount Imported</span>
                        <span className="text-white font-bold text-lg">{formatZAR(result.summary.totalAmount)}</span>
                    </div>

                    {/* Skipped rows section */}
                    {result.summary.skippedCount > 0 && (
                        <div className="bg-red-500/5 border border-red-500/20 rounded-2xl overflow-hidden">
                            <button
                                onClick={() => setShowSkipped(s => !s)}
                                className="w-full flex items-center justify-between px-5 py-4 hover:bg-red-500/5 transition-colors"
                            >
                                <div className="flex items-center gap-3">
                                    <svg className="w-5 h-5 text-red-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                                    </svg>
                                    <div className="text-left">
                                        <p className="text-red-400 font-semibold text-sm">
                                            {result.summary.skippedCount} row{result.summary.skippedCount !== 1 ? 's' : ''} skipped
                                        </p>
                                        <p className="text-red-600 text-xs">These rows could not be imported — review and correct the source file</p>
                                    </div>
                                </div>
                                <svg
                                    className={`w-4 h-4 text-red-400 transition-transform shrink-0 ${showSkipped ? 'rotate-180' : ''}`}
                                    fill="none" stroke="currentColor" viewBox="0 0 24 24"
                                >
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                </svg>
                            </button>

                            {showSkipped && (
                                <div className="border-t border-red-500/20 overflow-x-auto">
                                    <table className="w-full text-sm text-left">
                                        <thead className="bg-red-500/10 text-red-500 text-xs uppercase tracking-wider">
                                            <tr>
                                                <th className="px-5 py-2.5">Row #</th>
                                                <th className="px-5 py-2.5">Name</th>
                                                <th className="px-5 py-2.5 text-right">Amount</th>
                                                <th className="px-5 py-2.5">Reason</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-red-500/10">
                                            {result.summary.skippedRows.map((row, i) => (
                                                <tr key={i} className="hover:bg-red-500/5 transition-colors">
                                                    <td className="px-5 py-3 text-red-400 font-mono text-xs">{row.rowNumber}</td>
                                                    <td className="px-5 py-3 text-gray-300 text-sm">
                                                        {row.name || <span className="text-gray-600 italic">—</span>}
                                                    </td>
                                                    <td className="px-5 py-3 text-white font-semibold text-right text-sm">
                                                        {row.amount > 0 ? formatZAR(row.amount) : <span className="text-gray-600">—</span>}
                                                    </td>
                                                    <td className="px-5 py-3 text-red-400/80 text-xs">{row.reason}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </div>
                    )}

                    {/* Actions */}
                    <div className="flex gap-3">
                        <Link
                            href={`/batches/${result.batch.id}`}
                            className="flex-1 py-3 bg-cyan-500 hover:bg-cyan-400 text-white rounded-xl text-center font-semibold transition-colors"
                        >
                            View Batch Details
                        </Link>
                        <Link href="/batches" className="px-6 py-3 bg-white/5 hover:bg-white/10 text-gray-400 rounded-xl text-center transition-colors">
                            All Batches
                        </Link>
                    </div>
                </div>
            ) : (
                /* ── Upload form ────────────────────────────────────────────── */
                <div className="space-y-5">
                    {/* Drop zone */}
                    <div
                        onDrop={handleDrop}
                        onDragOver={(e) => e.preventDefault()}
                        onClick={() => fileRef.current?.click()}
                        className={`border-2 border-dashed rounded-2xl p-12 text-center cursor-pointer transition-all ${
                            file
                                ? 'border-emerald-500/50 bg-emerald-500/5'
                                : 'border-white/10 hover:border-indigo-500/50 hover:bg-indigo-500/5'
                        }`}
                    >
                        <input
                            ref={fileRef}
                            type="file"
                            accept=".xlsx,.xls"
                            className="hidden"
                            onChange={(e) => { const f = e.target.files?.[0]; if (f) { setFile(f); setError(''); } }}
                        />
                        {file ? (
                            <div>
                                <div className="w-12 h-12 bg-emerald-500/20 rounded-xl flex items-center justify-center mx-auto mb-3">
                                    <svg className="w-6 h-6 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1.0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                    </svg>
                                </div>
                                <p className="text-white font-medium">{file.name}</p>
                                <p className="text-gray-500 text-xs mt-1">{(file.size / 1024).toFixed(1)} KB · Click to change</p>
                            </div>
                        ) : (
                            <div>
                                <div className="w-12 h-12 bg-indigo-500/20 rounded-xl flex items-center justify-center mx-auto mb-3">
                                    <svg className="w-6 h-6 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                                    </svg>
                                </div>
                                <p className="text-white font-medium">Drop your Excel file here</p>
                                <p className="text-gray-500 text-sm mt-1">or click to browse · .xlsx, .xls</p>
                            </div>
                        )}
                    </div>

                    {/* Format guide */}
                    <div className="bg-[var(--color-bg-secondary)] rounded-xl border border-white/5 overflow-hidden">
                        <div className="px-5 py-3 border-b border-white/5">
                            <p className="text-xs text-gray-400 uppercase tracking-wider font-semibold">Supported Formats</p>
                            <p className="text-gray-600 text-xs mt-0.5">The correct format is detected automatically</p>
                        </div>
                        <div className="grid sm:grid-cols-2 divide-y sm:divide-y-0 sm:divide-x divide-white/5">
                            {/* Letsatsi */}
                            <div className="p-5">
                                <div className="flex items-center gap-2 mb-3">
                                    <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-indigo-500/20 text-indigo-400">Letsatsi</span>
                                    <span className="text-gray-600 text-xs">Auto-detected</span>
                                </div>
                                <div className="space-y-1.5 text-xs">
                                    {[
                                        ['File nr', 'Zenowethu case number (primary match)'],
                                        ['ID number', 'Client SA ID (fallback match)'],
                                        ['Surname and Initials', 'Client name'],
                                        ['Loan nr', 'Letsatsi loan reference'],
                                        ['Date', 'Transaction date'],
                                        ['Total', 'Payment amount'],
                                    ].map(([col, desc]) => (
                                        <div key={col} className="flex gap-2">
                                            <span className="font-mono text-indigo-400 w-28 shrink-0">{col}</span>
                                            <span className="text-gray-500">{desc}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                            {/* Generic */}
                            <div className="p-5">
                                <div className="flex items-center gap-2 mb-3">
                                    <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-gray-500/20 text-gray-400">Generic</span>
                                </div>
                                <div className="space-y-1.5 text-xs">
                                    {[
                                        ['ID Number', 'Client SA ID (required)'],
                                        ['Amount', 'Payment amount (required)'],
                                        ['Date', 'Payment date'],
                                        ['Method', 'EFT, CASH, DEBIT_ORDER'],
                                        ['Reference', 'Bank reference number'],
                                    ].map(([col, desc]) => (
                                        <div key={col} className="flex gap-2">
                                            <span className="font-mono text-cyan-400 w-28 shrink-0">{col}</span>
                                            <span className="text-gray-500">{desc}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </div>

                    {error && (
                        <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-3 text-red-400 text-sm">{error}</div>
                    )}

                    <div className="flex gap-3">
                        <button
                            onClick={handleUpload}
                            disabled={!file || uploading}
                            className="flex-1 py-3 bg-indigo-500 hover:bg-indigo-400 disabled:opacity-40 text-white rounded-xl font-semibold transition-colors"
                        >
                            {uploading ? 'Importing...' : 'Import Batch'}
                        </button>
                        <Link href="/batches" className="px-6 py-3 bg-white/5 hover:bg-white/10 text-gray-400 rounded-xl text-center transition-colors">
                            Cancel
                        </Link>
                    </div>
                </div>
            )}
        </div>
    );
}

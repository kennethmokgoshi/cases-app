'use client';
import { toast } from '@zenowethu/ui';
import { useSession } from '@zenowethu/ui';
import { useRouter } from 'next/navigation';
import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { Pagination } from '@zenowethu/ui';

type Client = {
    id: string;
    firstName: string;
    lastName: string;
    idNumber: string;
    email: string | null;
    phone: string | null;
    employer: string | null;
    createdAt: string;
    _count: { cases: number };
};

const COMMISSION_TYPES = ['FIXED', 'VOLUME_BASED'] as const;
const FIXED_AMOUNT_PRESETS = [200, 250, 300, 500];

export default function ConvertClientsPage() {
    const { data: session, status } = useSession();
    const router = useRouter();

    const [clients, setClients] = useState<Client[]>([]);
    const [total, setTotal] = useState(0);
    const [pages, setPages] = useState(1);
    const [page, setPage] = useState(1);
    const [search, setSearch] = useState('');
    const [loading, setLoading] = useState(true);

    const [selectedClientIds, setSelectedClientIds] = useState<Set<string>>(new Set());
    const [showBulkModal, setShowBulkModal] = useState(false);
    const [bulkForm, setBulkForm] = useState({
        commissionType: 'FIXED' as 'FIXED' | 'VOLUME_BASED',
        fixedCommissionAmount: '250',
        notes: '',
    });
    const [bulkConverting, setBulkConverting] = useState(false);
    const [bulkError, setBulkError] = useState('');
    const [bulkProgress, setBulkProgress] = useState({ current: 0, total: 0 });

    const [convertTarget, setConvertTarget] = useState<Client | null>(null);
    const [convertForm, setConvertForm] = useState({
        commissionType: 'FIXED' as 'FIXED' | 'VOLUME_BASED',
        fixedCommissionAmount: '250',
        notes: '',
    });
    const [converting, setConverting] = useState(false);
    const [convertError, setConvertError] = useState('');

    const isManager = session?.user?.isAdmin || session?.user?.isExecutive || session?.user?.isSeniorManager || session?.user?.role === 'MANAGER';

    useEffect(() => {
        if (status === 'authenticated' && !isManager) router.push('/');
    }, [session, status, isManager, router]);

    const fetchClients = useCallback(async () => {
        setLoading(true);
        try {
            const params = new URLSearchParams({ page: String(page) });
            if (search) params.set('search', search);
            const res = await fetch(`/api/admin/clients?${params}`);
            if (!res.ok) throw new Error('Failed to load');
            const data = await res.json();
            setClients(data.clients);
            setTotal(data.total);
            setPages(data.pages);
        } catch {
            // silently handled — keep stale data
        } finally {
            setLoading(false);
        }
    }, [page, search]);

    useEffect(() => {
        fetchClients();
    }, [fetchClients]);

    async function openConvert(client: Client) {
        setConvertTarget(client);
        setConvertForm({
            commissionType: 'FIXED',
            fixedCommissionAmount: '250',
            notes: '',
        });
        setConvertError('');
    }

    async function handleConvert() {
        if (!convertTarget) return;
        setConverting(true);
        setConvertError('');
        try {
            const payload = {
                clientId: convertTarget.id,
                commissionType: convertForm.commissionType,
                fixedCommissionAmount: convertForm.commissionType === 'FIXED' ? parseFloat(convertForm.fixedCommissionAmount) : null,
                notes: convertForm.notes.trim() || null,
            };
            const res = await fetch('/api/admin/clients/convert-to-referrer', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });
            const json = await res.json();
            if (!res.ok) {
                setConvertError(json.error ?? 'Conversion failed');
                return;
            }
            toast.success(`${convertTarget.firstName} ${convertTarget.lastName} is now a referrer! 🎉`);
            setConvertTarget(null);
            fetchClients();
        } catch {
            setConvertError('Network error');
        } finally {
            setConverting(false);
        }
    }

    async function handleBulkConvert() {
        if (selectedClientIds.size === 0) return;
        setBulkConverting(true);
        setBulkError('');
        setBulkProgress({ current: 0, total: selectedClientIds.size });
        try {
            let successCount = 0;
            let failureCount = 0;
            for (const clientId of selectedClientIds) {
                try {
                    const payload = {
                        clientId,
                        commissionType: bulkForm.commissionType,
                        fixedCommissionAmount: bulkForm.commissionType === 'FIXED' ? parseFloat(bulkForm.fixedCommissionAmount) : null,
                        notes: bulkForm.notes.trim() || null,
                    };
                    const res = await fetch('/api/admin/clients/convert-to-referrer', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(payload),
                    });
                    if (res.ok) {
                        successCount++;
                    } else {
                        failureCount++;
                    }
                } catch {
                    failureCount++;
                }
                setBulkProgress((p) => ({ ...p, current: p.current + 1 }));
            }
            toast.success(`✅ Converted ${successCount} clients${failureCount > 0 ? ` (${failureCount} failed)` : ''}`);
            setShowBulkModal(false);
            setSelectedClientIds(new Set());
            fetchClients();
        } catch {
            setBulkError('Bulk conversion failed');
        } finally {
            setBulkConverting(false);
            setBulkProgress({ current: 0, total: 0 });
        }
    }

    if (status === 'loading') {
        return (
            <div className="flex items-center justify-center min-h-[60vh]">
                <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-zeno-cyan"></div>
            </div>
        );
    }

    if (!isManager) return null;

    return (
        <div className="max-w-7xl mx-auto">
            {/* Header */}
            <div className="flex items-center justify-between mb-6">
                <div>
                    <div className="flex items-center gap-3 mb-1">
                        <Link href="/admin" className="text-gray-400 hover:text-white text-sm transition-colors">← Back to Admin</Link>
                    </div>
                    <h1 className="text-2xl font-bold text-white">Convert Clients to Referrers</h1>
                    <p className="text-gray-400 text-sm mt-1">Turn satisfied clients into active referrers while preserving their referral chain</p>
                </div>
                {selectedClientIds.size > 0 && (
                    <button
                        onClick={() => setShowBulkModal(true)}
                        className="bg-emerald-500 hover:bg-emerald-600 text-white font-semibold px-4 py-2 rounded-lg transition-colors flex items-center gap-2"
                    >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                        Convert {selectedClientIds.size} Client{selectedClientIds.size !== 1 ? 's' : ''}
                    </button>
                )}
            </div>

            {/* Info Card */}
            <div className="bg-blue-500/10 border border-blue-500/30 rounded-xl p-5 mb-6">
                <h3 className="text-sm font-semibold text-blue-400 mb-2">How it works</h3>
                <ul className="text-xs text-blue-300 space-y-1">
                    <li>✓ Client data (name, contact, banking details) is automatically transferred</li>
                    <li>✓ If the client was referred by someone, that referral chain is preserved</li>
                    <li>✓ A new sub-project is created under the referrer hierarchy</li>
                    <li>✓ Commission tiers are configurable (fixed amount or volume-based)</li>
                    <li>✓ Any future cases they refer will automatically track commissions</li>
                </ul>
            </div>

            {/* Filters */}
            <div className="mb-5">
                <input
                    type="text"
                    placeholder="Search by name, ID, or email..."
                    value={search}
                    onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                    className="bg-zeno-blue/30 border border-zeno-blue/50 rounded-lg px-3 py-2 text-white text-sm placeholder-gray-500 focus:outline-none focus:border-zeno-cyan/50 w-full max-w-md"
                />
            </div>

            {/* Table */}
            <div className="bg-zeno-blue/20 border border-zeno-blue/40 rounded-xl overflow-hidden">
                <table className="w-full text-sm">
                    <thead>
                        <tr className="border-b border-zeno-blue/40">
                            <th className="text-left py-3 px-4 text-gray-400 font-medium">
                                <input
                                    type="checkbox"
                                    checked={selectedClientIds.size > 0 && selectedClientIds.size === clients.length && clients.length > 0}
                                    onChange={(e) => {
                                        if (e.target.checked) {
                                            setSelectedClientIds(new Set(clients.map(c => c.id)));
                                        } else {
                                            setSelectedClientIds(new Set());
                                        }
                                    }}
                                    className="w-4 h-4 accent-zeno-cyan cursor-pointer"
                                />
                            </th>
                            <th className="text-left py-3 px-4 text-gray-400 font-medium">Name</th>
                            <th className="text-left py-3 px-4 text-gray-400 font-medium">ID Number</th>
                            <th className="text-left py-3 px-4 text-gray-400 font-medium">Contact</th>
                            <th className="text-left py-3 px-4 text-gray-400 font-medium">Employer</th>
                            <th className="text-left py-3 px-4 text-gray-400 font-medium">Cases</th>
                            <th className="text-left py-3 px-4 text-gray-400 font-medium">Joined</th>
                            <th className="py-3 px-4"></th>
                        </tr>
                    </thead>
                    <tbody>
                        {loading ? (
                            <tr><td colSpan={8} className="py-12 text-center text-gray-400">Loading...</td></tr>
                        ) : clients.length === 0 ? (
                            <tr><td colSpan={8} className="py-12 text-center text-gray-400">No clients found</td></tr>
                        ) : clients.map((c) => (
                            <tr key={c.id} className={`border-b border-zeno-blue/20 transition-colors ${selectedClientIds.has(c.id) ? 'bg-zeno-cyan/10' : 'hover:bg-zeno-blue/20'}`}>
                                <td className="py-3 px-4">
                                    <input
                                        type="checkbox"
                                        checked={selectedClientIds.has(c.id)}
                                        onChange={(e) => {
                                            const newSet = new Set(selectedClientIds);
                                            if (e.target.checked) {
                                                newSet.add(c.id);
                                            } else {
                                                newSet.delete(c.id);
                                            }
                                            setSelectedClientIds(newSet);
                                        }}
                                        className="w-4 h-4 accent-zeno-cyan cursor-pointer"
                                    />
                                </td>
                                <td className="py-3 px-4">
                                    <div className="text-white font-medium">{c.firstName} {c.lastName}</div>
                                </td>
                                <td className="py-3 px-4 text-gray-300 font-mono text-xs">{c.idNumber}</td>
                                <td className="py-3 px-4">
                                    <div className="text-gray-300 text-xs">{c.phone ?? '—'}</div>
                                    <div className="text-gray-500 text-xs">{c.email ?? '—'}</div>
                                </td>
                                <td className="py-3 px-4 text-gray-300 text-xs">{c.employer ?? '—'}</td>
                                <td className="py-3 px-4 text-white font-medium">{c._count.cases}</td>
                                <td className="py-3 px-4 text-gray-400 text-xs">{new Date(c.createdAt).toLocaleDateString('en-ZA')}</td>
                                <td className="py-3 px-4">
                                    <button
                                        onClick={() => openConvert(c)}
                                        className="text-zeno-cyan hover:text-zeno-cyan/80 text-xs font-medium px-3 py-1.5 rounded hover:bg-zeno-cyan/10 transition-colors"
                                    >
                                        Convert
                                    </button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            <Pagination
                currentPage={page}
                totalPages={pages}
                onPageChange={setPage}
            />

            {/* Convert Modal */}
            {convertTarget && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
                    <div className="bg-zeno-dark border border-zeno-blue/50 rounded-xl w-full max-w-xl">
                        <div className="sticky top-0 bg-zeno-dark border-b border-zeno-blue/40 px-6 py-4 flex items-center justify-between">
                            <h2 className="text-lg font-bold text-white">Convert to Referrer</h2>
                            <button onClick={() => setConvertTarget(null)} className="text-gray-400 hover:text-white transition-colors">✕</button>
                        </div>

                        <div className="p-6 space-y-6">
                            {convertError && (
                                <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-3 text-red-400 text-sm">{convertError}</div>
                            )}

                            {/* Summary */}
                            <div className="bg-zeno-blue/20 border border-zeno-blue/30 rounded-lg p-4 space-y-2">
                                <div className="text-sm">
                                    <span className="text-gray-400">Converting: </span>
                                    <span className="text-white font-medium">{convertTarget.firstName} {convertTarget.lastName}</span>
                                </div>
                                <div className="text-sm">
                                    <span className="text-gray-400">ID Number: </span>
                                    <span className="text-white font-mono text-xs">{convertTarget.idNumber}</span>
                                </div>
                                <div className="text-sm">
                                    <span className="text-gray-400">Current Cases: </span>
                                    <span className="text-white font-medium">{convertTarget._count.cases}</span>
                                </div>
                            </div>

                            {/* Commission Type */}
                            <section>
                                <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Commission Structure</h3>
                                <div className="space-y-3">
                                    <div className="flex gap-3">
                                        {(['FIXED', 'VOLUME_BASED'] as const).map((type) => (
                                            <button
                                                key={type}
                                                type="button"
                                                onClick={() => setConvertForm((f) => ({ ...f, commissionType: type }))}
                                                className={`flex-1 py-2 px-3 rounded-lg border text-sm font-medium transition-colors ${
                                                    convertForm.commissionType === type
                                                        ? 'bg-zeno-cyan/10 border-zeno-cyan/50 text-zeno-cyan'
                                                        : 'bg-zeno-blue/20 border-zeno-blue/40 text-gray-400 hover:border-gray-500'
                                                }`}
                                            >
                                                {type === 'FIXED' ? 'Fixed Amount' : 'Volume-Based'}
                                            </button>
                                        ))}
                                    </div>

                                    {convertForm.commissionType === 'FIXED' && (
                                        <div>
                                            <label className="block text-xs text-gray-400 mb-2">Commission per Referral (ZAR)</label>
                                            <div className="flex gap-2 mb-2">
                                                {FIXED_AMOUNT_PRESETS.map((amt) => (
                                                    <button
                                                        key={amt}
                                                        type="button"
                                                        onClick={() => setConvertForm((f) => ({ ...f, fixedCommissionAmount: String(amt) }))}
                                                        className={`px-3 py-1 rounded-full text-xs border font-medium transition-colors ${
                                                            convertForm.fixedCommissionAmount === String(amt)
                                                                ? 'bg-zeno-cyan/20 border-zeno-cyan/50 text-zeno-cyan'
                                                                : 'bg-zeno-blue/20 border-zeno-blue/40 text-gray-400 hover:border-gray-500'
                                                        }`}
                                                    >
                                                        R{amt}
                                                    </button>
                                                ))}
                                            </div>
                                            <input
                                                type="number"
                                                min={1}
                                                step={50}
                                                value={convertForm.fixedCommissionAmount}
                                                onChange={(e) => setConvertForm((f) => ({ ...f, fixedCommissionAmount: e.target.value }))}
                                                placeholder="e.g. 250"
                                                className="w-full bg-zeno-blue/30 border border-zeno-blue/50 rounded-lg px-3 py-2 text-white text-sm placeholder-gray-500 focus:outline-none focus:border-zeno-cyan/50"
                                            />
                                        </div>
                                    )}

                                    {convertForm.commissionType === 'VOLUME_BASED' && (
                                        <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg px-4 py-3 text-blue-300 text-xs space-y-1">
                                            <p className="font-semibold">Commission auto-calculated based on case count:</p>
                                            <p>• <strong>1 – 9 cases</strong> → <strong>R200</strong> per referral</p>
                                            <p>• <strong>10 or more cases</strong> → <strong>R300</strong> per referral</p>
                                        </div>
                                    )}
                                </div>
                            </section>

                            {/* Notes */}
                            <section>
                                <label className="block text-xs text-gray-400 uppercase tracking-wider mb-2 font-semibold">Additional Notes (Optional)</label>
                                <textarea
                                    value={convertForm.notes}
                                    onChange={(e) => setConvertForm((f) => ({ ...f, notes: e.target.value }))}
                                    rows={3}
                                    className="w-full bg-zeno-blue/30 border border-zeno-blue/50 rounded-lg px-3 py-2 text-white text-sm placeholder-gray-500 focus:outline-none focus:border-zeno-cyan/50 resize-none"
                                    placeholder="e.g., 'Excellent referrer in Cape Town region'"
                                />
                            </section>

                            {/* Preservation Notice */}
                            <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-lg px-4 py-3 text-emerald-300 text-xs">
                                <p className="font-semibold mb-1">✓ Referral chain preserved</p>
                                <p>All client details and referral relationships will be maintained. Their sub-project will be created in the proper hierarchy.</p>
                            </div>
                        </div>

                        <div className="sticky bottom-0 bg-zeno-dark border-t border-zeno-blue/40 px-6 py-4 flex justify-end gap-3">
                            <button onClick={() => setConvertTarget(null)} className="px-4 py-2 text-sm text-gray-400 hover:text-white transition-colors">Cancel</button>
                            <button
                                onClick={handleConvert}
                                disabled={converting}
                                className="bg-zeno-cyan text-zeno-dark font-semibold px-5 py-2 rounded-lg hover:bg-zeno-cyan/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm"
                            >
                                {converting ? 'Converting…' : 'Convert to Referrer'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Bulk Convert Modal */}
            {showBulkModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
                    <div className="bg-zeno-dark border border-zeno-blue/50 rounded-xl w-full max-w-xl">
                        <div className="sticky top-0 bg-zeno-dark border-b border-zeno-blue/40 px-6 py-4 flex items-center justify-between">
                            <h2 className="text-lg font-bold text-white">Bulk Convert to Referrers</h2>
                            <button onClick={() => setShowBulkModal(false)} className="text-gray-400 hover:text-white transition-colors">✕</button>
                        </div>

                        <div className="p-6 space-y-6">
                            {bulkError && (
                                <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-3 text-red-400 text-sm">{bulkError}</div>
                            )}

                            {/* Progress */}
                            {bulkConverting && bulkProgress.total > 0 && (
                                <div className="space-y-2">
                                    <div className="flex items-center justify-between">
                                        <span className="text-sm text-gray-400">Converting {bulkProgress.current} of {bulkProgress.total}...</span>
                                        <span className="text-sm font-medium text-white">{Math.round((bulkProgress.current / bulkProgress.total) * 100)}%</span>
                                    </div>
                                    <div className="w-full h-2 bg-white/10 rounded-full overflow-hidden">
                                        <div
                                            className="h-full bg-emerald-500 transition-all duration-300 rounded-full"
                                            style={{ width: `${(bulkProgress.current / bulkProgress.total) * 100}%` }}
                                        />
                                    </div>
                                </div>
                            )}

                            {/* Summary */}
                            <div className="bg-zeno-blue/20 border border-zeno-blue/30 rounded-lg p-4">
                                <div className="text-sm">
                                    <span className="text-gray-400">Clients to convert: </span>
                                    <span className="text-white font-bold">{selectedClientIds.size}</span>
                                </div>
                            </div>

                            {/* Commission Type */}
                            <section>
                                <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Commission Structure (All)</h3>
                                <div className="space-y-3">
                                    <div className="flex gap-3">
                                        {(['FIXED', 'VOLUME_BASED'] as const).map((type) => (
                                            <button
                                                key={type}
                                                type="button"
                                                onClick={() => setBulkForm((f) => ({ ...f, commissionType: type }))}
                                                disabled={bulkConverting}
                                                className={`flex-1 py-2 px-3 rounded-lg border text-sm font-medium transition-colors disabled:opacity-50 ${
                                                    bulkForm.commissionType === type
                                                        ? 'bg-zeno-cyan/10 border-zeno-cyan/50 text-zeno-cyan'
                                                        : 'bg-zeno-blue/20 border-zeno-blue/40 text-gray-400 hover:border-gray-500'
                                                }`}
                                            >
                                                {type === 'FIXED' ? 'Fixed Amount' : 'Volume-Based'}
                                            </button>
                                        ))}
                                    </div>

                                    {bulkForm.commissionType === 'FIXED' && (
                                        <div>
                                            <label className="block text-xs text-gray-400 mb-2">Commission per Referral (ZAR)</label>
                                            <div className="flex gap-2 mb-2">
                                                {FIXED_AMOUNT_PRESETS.map((amt) => (
                                                    <button
                                                        key={amt}
                                                        type="button"
                                                        onClick={() => setBulkForm((f) => ({ ...f, fixedCommissionAmount: String(amt) }))}
                                                        disabled={bulkConverting}
                                                        className={`px-3 py-1 rounded-full text-xs border font-medium transition-colors disabled:opacity-50 ${
                                                            bulkForm.fixedCommissionAmount === String(amt)
                                                                ? 'bg-zeno-cyan/20 border-zeno-cyan/50 text-zeno-cyan'
                                                                : 'bg-zeno-blue/20 border-zeno-blue/40 text-gray-400 hover:border-gray-500'
                                                        }`}
                                                    >
                                                        R{amt}
                                                    </button>
                                                ))}
                                            </div>
                                            <input
                                                type="number"
                                                min={1}
                                                step={50}
                                                value={bulkForm.fixedCommissionAmount}
                                                onChange={(e) => setBulkForm((f) => ({ ...f, fixedCommissionAmount: e.target.value }))}
                                                disabled={bulkConverting}
                                                placeholder="e.g. 250"
                                                className="w-full bg-zeno-blue/30 border border-zeno-blue/50 rounded-lg px-3 py-2 text-white text-sm placeholder-gray-500 focus:outline-none focus:border-zeno-cyan/50 disabled:opacity-50"
                                            />
                                        </div>
                                    )}
                                </div>
                            </section>

                            {/* Notes */}
                            <section>
                                <label className="block text-xs text-gray-400 uppercase tracking-wider mb-2 font-semibold">Notes (Optional)</label>
                                <textarea
                                    value={bulkForm.notes}
                                    onChange={(e) => setBulkForm((f) => ({ ...f, notes: e.target.value }))}
                                    disabled={bulkConverting}
                                    rows={2}
                                    className="w-full bg-zeno-blue/30 border border-zeno-blue/50 rounded-lg px-3 py-2 text-white text-sm placeholder-gray-500 focus:outline-none focus:border-zeno-cyan/50 resize-none disabled:opacity-50"
                                    placeholder="Applied to all conversions"
                                />
                            </section>
                        </div>

                        <div className="sticky bottom-0 bg-zeno-dark border-t border-zeno-blue/40 px-6 py-4 flex justify-end gap-3">
                            <button onClick={() => setShowBulkModal(false)} disabled={bulkConverting} className="px-4 py-2 text-sm text-gray-400 hover:text-white transition-colors disabled:opacity-50">Cancel</button>
                            <button
                                onClick={handleBulkConvert}
                                disabled={bulkConverting || selectedClientIds.size === 0}
                                className="bg-emerald-500 text-white font-semibold px-5 py-2 rounded-lg hover:bg-emerald-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm flex items-center gap-2"
                            >
                                {bulkConverting ? (
                                    <>
                                        <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></div>
                                        Converting...
                                    </>
                                ) : (
                                    <>
                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                        </svg>
                                        Convert All ({selectedClientIds.size})
                                    </>
                                )}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

'use client';
import { toast } from '@zenowethu/ui';
import { useSession, Pagination } from '@zenowethu/ui';
import { useRouter } from 'next/navigation';
import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';

type Commission = {
    id: string;
    referrerId: string;
    caseId: string;
    commissionAmount: number;
    isPaid: boolean;
    paidAt: string | null;
    paymentRef: string | null;
    createdAt: string;
    referrer: {
        id: string;
        firstName: string;
        lastName: string;
        bankName: string | null;
        accountNumber: string | null;
        branchCode: string | null;
    };
    case: {
        id: string;
        client: {
            firstName: string;
            lastName: string;
        };
    };
};

export default function CommissionPayoutsPage() {
    const { data: session, status } = useSession();
    const router = useRouter();

    const [commissions, setCommissions] = useState<Commission[]>([]);
    const [total, setTotal] = useState(0);
    const [pages, setPages] = useState(1);
    const [page, setPage] = useState(1);
    const [filterStatus, setFilterStatus] = useState('UNPAID');
    const [loading, setLoading] = useState(true);

    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [paymentRef, setPaymentRef] = useState('');
    const [processing, setProcessing] = useState(false);

    const isManager = session?.user?.isAdmin || session?.user?.isExecutive || session?.user?.isSeniorManager || session?.user?.role === 'MANAGER';

    useEffect(() => {
        if (status === 'authenticated' && !isManager) router.push('/');
    }, [session, status, isManager, router]);

    const fetchCommissions = useCallback(async () => {
        setLoading(true);
        try {
            const res = await fetch(`/api/admin/commissions?page=${page}&status=${filterStatus}`);
            if (!res.ok) throw new Error('Failed to load');
            const data = await res.json();
            setCommissions(data.commissions);
            setTotal(data.total);
            setPages(data.pages);
        } catch {
            toast.error('Failed to load commissions');
        } finally {
            setLoading(false);
        }
    }, [page, filterStatus]);

    useEffect(() => { fetchCommissions(); }, [fetchCommissions]);

    const toggleSelectAll = () => {
        if (selectedIds.size === commissions.length) {
            setSelectedIds(new Set());
        } else {
            setSelectedIds(new Set(commissions.map(c => c.id)));
        }
    };

    const toggleSelect = (id: string) => {
        const newSet = new Set(selectedIds);
        if (newSet.has(id)) newSet.delete(id);
        else newSet.add(id);
        setSelectedIds(newSet);
    };

    const handleBulkPayout = async () => {
        if (selectedIds.size === 0) return toast.error('Select at least one commission');
        if (!paymentRef.trim()) return toast.error('Payment reference is required');

        setProcessing(true);
        try {
            const res = await fetch('/api/admin/commissions/payout', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    commissionIds: Array.from(selectedIds),
                    paymentRef: paymentRef.trim(),
                }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Payout failed');

            toast.success(`Successfully paid ${data.count} commissions`);
            setSelectedIds(new Set());
            setPaymentRef('');
            fetchCommissions();
        } catch (err: any) {
            toast.error(err.message);
        } finally {
            setProcessing(false);
        }
    };

    if (status === 'loading') {
        return (
            <div className="flex items-center justify-center min-h-[60vh]">
                <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-zeno-cyan"></div>
            </div>
        );
    }

    if (!isManager) return null;

    const totalSelectedAmount = commissions
        .filter(c => selectedIds.has(c.id))
        .reduce((sum, c) => sum + (Number(c.commissionAmount) || 0), 0);

    return (
        <div className="max-w-7xl mx-auto space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <div className="flex items-center gap-3 mb-1">
                        <Link href="/admin/referrers" className="text-gray-400 hover:text-white text-sm transition-colors">← Back to Referrers</Link>
                    </div>
                    <h1 className="text-2xl font-bold text-white">Commission Payouts</h1>
                    <p className="text-gray-400 text-sm mt-1">Manage and bulk-pay eligible referrer commissions</p>
                </div>
                <div className="flex gap-3">
                    <a
                        href={`/api/admin/commissions/export-eft${selectedIds.size > 0 ? `?commissionIds=${Array.from(selectedIds).join(',')}` : ''}`}
                        download
                        className="bg-emerald-500/20 border border-emerald-500/30 text-emerald-400 font-medium px-4 py-2 rounded-lg hover:bg-emerald-500/30 transition-colors text-sm flex items-center gap-2"
                    >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                        </svg>
                        Export EFT File
                    </a>
                    <a
                        href={`/api/admin/commissions/export?status=${filterStatus}`}
                        download
                        className="bg-white/5 border border-white/10 text-white font-medium px-4 py-2 rounded-lg hover:bg-white/10 transition-colors text-sm flex items-center gap-2"
                    >
                        Export CSV
                    </a>
                </div>
            </div>

            <div className="flex gap-4 items-end">
                <div className="w-48">
                    <label className="block text-xs text-gray-400 mb-1">Status Filter</label>
                    <select
                        value={filterStatus}
                        onChange={(e) => { setFilterStatus(e.target.value); setPage(1); setSelectedIds(new Set()); }}
                        className="w-full bg-zeno-blue/30 border border-zeno-blue/50 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-zeno-cyan/50"
                    >
                        <option value="UNPAID">Unpaid</option>
                        <option value="PAID">Paid</option>
                        <option value="ALL">All</option>
                    </select>
                </div>
                {filterStatus === 'UNPAID' && selectedIds.size > 0 && (
                    <div className="flex-1 flex gap-4 items-end bg-zeno-blue/20 border border-zeno-cyan/30 rounded-lg p-3">
                        <div>
                            <p className="text-xs text-gray-400 mb-1">Selected Amount ({selectedIds.size})</p>
                            <p className="text-lg font-bold text-emerald-400">R {totalSelectedAmount.toFixed(2)}</p>
                        </div>
                        <div className="flex-1">
                            <label className="block text-xs text-gray-400 mb-1">Bank Reference *</label>
                            <input
                                type="text"
                                value={paymentRef}
                                onChange={(e) => setPaymentRef(e.target.value)}
                                placeholder="e.g. FNB-BULK-01"
                                className="w-full bg-black/20 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-zeno-cyan"
                            />
                        </div>
                        <button
                            onClick={handleBulkPayout}
                            disabled={processing || !paymentRef.trim()}
                            className="bg-emerald-500 text-white font-semibold px-6 py-2 rounded-lg hover:bg-emerald-400 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm h-[38px]"
                        >
                            {processing ? 'Processing...' : 'Mark as Paid'}
                        </button>
                    </div>
                )}
            </div>

            {/* Table */}
            <div className="bg-zeno-blue/20 border border-zeno-blue/40 rounded-xl overflow-hidden">
                <table className="w-full text-sm">
                    <thead>
                        <tr className="border-b border-zeno-blue/40">
                            {filterStatus === 'UNPAID' && (
                                <th className="py-3 px-4 w-10">
                                    <input 
                                        type="checkbox" 
                                        checked={commissions.length > 0 && selectedIds.size === commissions.length}
                                        onChange={toggleSelectAll}
                                        className="w-4 h-4 accent-zeno-cyan cursor-pointer"
                                    />
                                </th>
                            )}
                            <th className="text-left py-3 px-4 text-gray-400 font-medium">Referrer</th>
                            <th className="text-left py-3 px-4 text-gray-400 font-medium">Banking</th>
                            <th className="text-left py-3 px-4 text-gray-400 font-medium">Client / Case</th>
                            <th className="text-right py-3 px-4 text-gray-400 font-medium">Amount</th>
                            <th className="text-left py-3 px-4 text-gray-400 font-medium pl-6">Status</th>
                        </tr>
                    </thead>
                    <tbody>
                        {loading ? (
                            <tr><td colSpan={6} className="py-12 text-center text-gray-400">Loading...</td></tr>
                        ) : commissions.length === 0 ? (
                            <tr><td colSpan={6} className="py-12 text-center text-gray-400">No commissions found</td></tr>
                        ) : commissions.map((c) => (
                            <tr key={c.id} className="border-b border-zeno-blue/20 hover:bg-zeno-blue/20 transition-colors">
                                {filterStatus === 'UNPAID' && (
                                    <td className="py-3 px-4">
                                        <input 
                                            type="checkbox" 
                                            checked={selectedIds.has(c.id)}
                                            onChange={() => toggleSelect(c.id)}
                                            className="w-4 h-4 accent-zeno-cyan cursor-pointer"
                                        />
                                    </td>
                                )}
                                <td className="py-3 px-4">
                                    <Link href={`/admin/referrers/${c.referrer.id}`} className="text-white font-medium hover:text-zeno-cyan transition-colors">
                                        {c.referrer.firstName} {c.referrer.lastName}
                                    </Link>
                                    <div className="text-xs text-gray-500 mt-1">{new Date(c.createdAt).toLocaleDateString()}</div>
                                </td>
                                <td className="py-3 px-4">
                                    {c.referrer.bankName ? (
                                        <>
                                            <div className="text-gray-300 font-medium">{c.referrer.bankName}</div>
                                            <div className="text-gray-500 text-xs">{c.referrer.accountNumber} ({c.referrer.branchCode})</div>
                                        </>
                                    ) : (
                                        <span className="text-red-400 text-xs">No banking details</span>
                                    )}
                                </td>
                                <td className="py-3 px-4">
                                    <Link href={`/cases/${c.case.id}`} className="text-zeno-cyan hover:underline">
                                        {c.case.client.firstName} {c.case.client.lastName}
                                    </Link>
                                </td>
                                <td className="py-3 px-4 text-right">
                                    <span className="font-medium text-amber-400">R {Number(c.commissionAmount).toLocaleString('en-ZA', { minimumFractionDigits: 2 })}</span>
                                </td>
                                <td className="py-3 px-4 pl-6">
                                    {c.isPaid ? (
                                        <div>
                                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-500/20 text-emerald-400">Paid</span>
                                            <div className="text-xs text-gray-500 mt-1">{c.paymentRef}</div>
                                        </div>
                                    ) : (
                                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gray-500/20 text-gray-400">Unpaid</span>
                                    )}
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
        </div>
    );
}

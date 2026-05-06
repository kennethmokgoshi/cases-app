'use client';

import { useSession } from '@zenowethu/ui';
import { useRouter } from 'next/navigation';
import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';

type Referrer = {
    id: string;
    firstName: string;
    lastName: string;
    idNumber: string;
    email: string | null;
    cellNumber: string | null;
    employerName: string | null;
    employmentType: string | null;
    employerAddress: string | null;
    employerPhone: string | null;
    occupation: string | null;
    monthlyIncome: number | null;
    bankName: string | null;
    accountNumber: string | null;
    accountType: string | null;
    branchCode: string | null;
    accountHolderName: string | null;
    isActive: boolean;
    notes: string | null;
    project: { id: string; name: string } | null;
    _count: { cases: number };
    createdAt: string;
};

const EMPLOYMENT_TYPES = ['EMPLOYED', 'SELF_EMPLOYED', 'CONTRACT', 'UNEMPLOYED', 'RETIRED'];
const ACCOUNT_TYPES = ['CHEQUE', 'SAVINGS', 'CURRENT'];

const emptyForm = {
    firstName: '',
    lastName: '',
    idNumber: '',
    email: '',
    cellNumber: '',
    employerName: '',
    employmentType: '',
    employerAddress: '',
    employerPhone: '',
    occupation: '',
    monthlyIncome: '',
    bankName: '',
    accountNumber: '',
    accountType: '',
    branchCode: '',
    accountHolderName: '',
    notes: '',
    isActive: true,
};

type FormState = typeof emptyForm;

export default function ReferrersPage() {
    const { data: session, status } = useSession();
    const router = useRouter();

    const [referrers, setReferrers] = useState<Referrer[]>([]);
    const [total, setTotal] = useState(0);
    const [pages, setPages] = useState(1);
    const [page, setPage] = useState(1);
    const [meta, setMeta] = useState({ total: 0, active: 0, inactive: 0 });
    const [search, setSearch] = useState('');
    const [isActiveFilter, setIsActiveFilter] = useState('');
    const [loading, setLoading] = useState(true);

    const [modalOpen, setModalOpen] = useState(false);
    const [editTarget, setEditTarget] = useState<Referrer | null>(null);
    const [form, setForm] = useState<FormState>(emptyForm);
    const [saving, setSaving] = useState(false);
    const [formError, setFormError] = useState('');

    const [deleteTarget, setDeleteTarget] = useState<Referrer | null>(null);
    const [deleting, setDeleting] = useState(false);

    const [detailTarget, setDetailTarget] = useState<Referrer | null>(null);

    const isManager = session?.user?.isAdmin || session?.user?.isExecutive || session?.user?.isSeniorManager || session?.user?.role === 'MANAGER';
    const canDelete = session?.user?.isAdmin || session?.user?.isExecutive;

    useEffect(() => {
        if (status === 'authenticated' && !isManager) router.push('/');
    }, [session, status, isManager, router]);

    const fetchReferrers = useCallback(async () => {
        setLoading(true);
        try {
            const params = new URLSearchParams({ page: String(page) });
            if (search) params.set('search', search);
            if (isActiveFilter) params.set('isActive', isActiveFilter);
            const res = await fetch(`/api/admin/referrers?${params}`);
            if (!res.ok) throw new Error('Failed to load');
            const data = await res.json();
            setReferrers(data.referrers);
            setTotal(data.total);
            setPages(data.pages);
            setMeta(data.meta);
        } catch {
            // silently handled — keep stale data
        } finally {
            setLoading(false);
        }
    }, [page, search, isActiveFilter]);

    useEffect(() => { fetchReferrers(); }, [fetchReferrers]);

    function openAdd() {
        setEditTarget(null);
        setForm(emptyForm);
        setFormError('');
        setModalOpen(true);
    }

    function openEdit(r: Referrer) {
        setEditTarget(r);
        setForm({
            firstName: r.firstName,
            lastName: r.lastName,
            idNumber: r.idNumber,
            email: r.email ?? '',
            cellNumber: r.cellNumber ?? '',
            employerName: r.employerName ?? '',
            employmentType: r.employmentType ?? '',
            employerAddress: r.employerAddress ?? '',
            employerPhone: r.employerPhone ?? '',
            occupation: r.occupation ?? '',
            monthlyIncome: r.monthlyIncome != null ? String(r.monthlyIncome) : '',
            bankName: r.bankName ?? '',
            accountNumber: r.accountNumber ?? '',
            accountType: r.accountType ?? '',
            branchCode: r.branchCode ?? '',
            accountHolderName: r.accountHolderName ?? '',
            notes: r.notes ?? '',
            isActive: r.isActive,
        });
        setFormError('');
        setModalOpen(true);
    }

    async function handleSave() {
        setSaving(true);
        setFormError('');
        try {
            const payload: Record<string, unknown> = {
                firstName: form.firstName.trim(),
                lastName: form.lastName.trim(),
                idNumber: form.idNumber.trim(),
                email: form.email.trim() || null,
                cellNumber: form.cellNumber.trim() || null,
                employerName: form.employerName.trim() || null,
                employmentType: form.employmentType || null,
                employerAddress: form.employerAddress.trim() || null,
                employerPhone: form.employerPhone.trim() || null,
                occupation: form.occupation.trim() || null,
                monthlyIncome: form.monthlyIncome ? parseFloat(form.monthlyIncome) : null,
                bankName: form.bankName.trim() || null,
                accountNumber: form.accountNumber.trim() || null,
                accountType: form.accountType || null,
                branchCode: form.branchCode.trim() || null,
                accountHolderName: form.accountHolderName.trim() || null,
                notes: form.notes.trim() || null,
                isActive: form.isActive,
            };

            const url = editTarget ? `/api/admin/referrers/${editTarget.id}` : '/api/admin/referrers';
            const method = editTarget ? 'PATCH' : 'POST';
            const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
            const json = await res.json();
            if (!res.ok) {
                setFormError(json.error ?? 'Save failed');
                return;
            }
            setModalOpen(false);
            fetchReferrers();
        } catch {
            setFormError('Network error');
        } finally {
            setSaving(false);
        }
    }

    async function handleDelete() {
        if (!deleteTarget) return;
        setDeleting(true);
        try {
            const res = await fetch(`/api/admin/referrers/${deleteTarget.id}`, { method: 'DELETE' });
            const json = await res.json();
            if (!res.ok) { alert(json.error ?? 'Delete failed'); return; }
            setDeleteTarget(null);
            fetchReferrers();
        } catch {
            alert('Network error');
        } finally {
            setDeleting(false);
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
                    <h1 className="text-2xl font-bold text-white">Referrer Registry</h1>
                    <p className="text-gray-400 text-sm mt-1">Capture referrers and manage their sub-projects</p>
                </div>
                <button onClick={openAdd} className="bg-zeno-cyan text-zeno-dark font-semibold px-4 py-2 rounded-lg hover:bg-zeno-cyan/90 transition-colors text-sm">
                    + Add Referrer
                </button>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-3 gap-4 mb-6">
                {[
                    { label: 'Total Referrers', value: meta.total, color: 'text-white' },
                    { label: 'Active', value: meta.active, color: 'text-emerald-400' },
                    { label: 'Inactive', value: meta.inactive, color: 'text-gray-400' },
                ].map((s) => (
                    <div key={s.label} className="bg-zeno-blue/30 border border-zeno-blue/50 rounded-xl p-4">
                        <p className="text-xs text-gray-400 uppercase tracking-wider mb-1">{s.label}</p>
                        <p className={`text-3xl font-bold ${s.color}`}>{s.value}</p>
                    </div>
                ))}
            </div>

            {/* Filters */}
            <div className="flex flex-wrap gap-3 mb-5">
                <input
                    type="text"
                    placeholder="Search name, ID, email, cell..."
                    value={search}
                    onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                    className="bg-zeno-blue/30 border border-zeno-blue/50 rounded-lg px-3 py-2 text-white text-sm placeholder-gray-500 focus:outline-none focus:border-zeno-cyan/50 w-72"
                />
                <select
                    value={isActiveFilter}
                    onChange={(e) => { setIsActiveFilter(e.target.value); setPage(1); }}
                    className="bg-zeno-blue/30 border border-zeno-blue/50 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-zeno-cyan/50"
                >
                    <option value="">All Status</option>
                    <option value="true">Active</option>
                    <option value="false">Inactive</option>
                </select>
            </div>

            {/* Table */}
            <div className="bg-zeno-blue/20 border border-zeno-blue/40 rounded-xl overflow-hidden">
                <table className="w-full text-sm">
                    <thead>
                        <tr className="border-b border-zeno-blue/40">
                            <th className="text-left py-3 px-4 text-gray-400 font-medium">Name</th>
                            <th className="text-left py-3 px-4 text-gray-400 font-medium">ID Number</th>
                            <th className="text-left py-3 px-4 text-gray-400 font-medium">Contact</th>
                            <th className="text-left py-3 px-4 text-gray-400 font-medium">Employer</th>
                            <th className="text-left py-3 px-4 text-gray-400 font-medium">Sub-Project</th>
                            <th className="text-left py-3 px-4 text-gray-400 font-medium">Cases</th>
                            <th className="text-left py-3 px-4 text-gray-400 font-medium">Status</th>
                            <th className="py-3 px-4"></th>
                        </tr>
                    </thead>
                    <tbody>
                        {loading ? (
                            <tr><td colSpan={8} className="py-12 text-center text-gray-400">Loading...</td></tr>
                        ) : referrers.length === 0 ? (
                            <tr><td colSpan={8} className="py-12 text-center text-gray-400">No referrers found</td></tr>
                        ) : referrers.map((r) => (
                            <tr key={r.id} className="border-b border-zeno-blue/20 hover:bg-zeno-blue/20 transition-colors">
                                <td className="py-3 px-4">
                                    <button onClick={() => setDetailTarget(r)} className="text-white font-medium hover:text-zeno-cyan transition-colors text-left">
                                        {r.firstName} {r.lastName}
                                    </button>
                                </td>
                                <td className="py-3 px-4 text-gray-300 font-mono text-xs">{r.idNumber}</td>
                                <td className="py-3 px-4">
                                    <div className="text-gray-300 text-xs">{r.cellNumber ?? '—'}</div>
                                    <div className="text-gray-500 text-xs">{r.email ?? '—'}</div>
                                </td>
                                <td className="py-3 px-4">
                                    <div className="text-gray-300 text-xs">{r.employerName ?? '—'}</div>
                                    {r.employmentType && (
                                        <span className="text-xs text-indigo-400">{r.employmentType}</span>
                                    )}
                                </td>
                                <td className="py-3 px-4">
                                    {r.project ? (
                                        <Link href={`/projects?id=${r.project.id}`} className="text-zeno-cyan text-xs hover:underline">
                                            {r.project.name}
                                        </Link>
                                    ) : (
                                        <span className="text-gray-500 text-xs">—</span>
                                    )}
                                </td>
                                <td className="py-3 px-4">
                                    <span className="text-white font-medium">{r._count.cases}</span>
                                </td>
                                <td className="py-3 px-4">
                                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${r.isActive ? 'bg-emerald-500/20 text-emerald-400' : 'bg-gray-500/20 text-gray-400'}`}>
                                        {r.isActive ? 'Active' : 'Inactive'}
                                    </span>
                                </td>
                                <td className="py-3 px-4">
                                    <div className="flex items-center gap-2 justify-end">
                                        <Link href={`/admin/referrers/${r.id}`} className="text-zeno-cyan hover:text-zeno-cyan/80 text-xs px-2 py-1 rounded hover:bg-zeno-cyan/10 transition-colors">
                                            Commission
                                        </Link>
                                        <button onClick={() => openEdit(r)} className="text-gray-400 hover:text-white text-xs transition-colors px-2 py-1 rounded hover:bg-white/5">
                                            Edit
                                        </button>
                                        {canDelete && (
                                            <button onClick={() => setDeleteTarget(r)} className="text-red-400 hover:text-red-300 text-xs transition-colors px-2 py-1 rounded hover:bg-red-500/10">
                                                Delete
                                            </button>
                                        )}
                                    </div>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {/* Pagination */}
            {pages > 1 && (
                <div className="flex items-center justify-between mt-4 text-sm text-gray-400">
                    <span>Showing {referrers.length} of {total} referrers</span>
                    <div className="flex gap-2">
                        <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1} className="px-3 py-1 rounded bg-zeno-blue/30 border border-zeno-blue/40 disabled:opacity-40 hover:border-zeno-cyan/50 transition-colors">Prev</button>
                        <span className="px-3 py-1">{page} / {pages}</span>
                        <button onClick={() => setPage((p) => Math.min(pages, p + 1))} disabled={page === pages} className="px-3 py-1 rounded bg-zeno-blue/30 border border-zeno-blue/40 disabled:opacity-40 hover:border-zeno-cyan/50 transition-colors">Next</button>
                    </div>
                </div>
            )}

            {/* Add / Edit Modal */}
            {modalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
                    <div className="bg-zeno-dark border border-zeno-blue/50 rounded-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
                        <div className="sticky top-0 bg-zeno-dark border-b border-zeno-blue/40 px-6 py-4 flex items-center justify-between">
                            <h2 className="text-lg font-bold text-white">{editTarget ? 'Edit Referrer' : 'Add Referrer'}</h2>
                            <button onClick={() => setModalOpen(false)} className="text-gray-400 hover:text-white transition-colors">✕</button>
                        </div>

                        <div className="p-6 space-y-6">
                            {formError && (
                                <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-3 text-red-400 text-sm">{formError}</div>
                            )}

                            {/* Personal Details */}
                            <section>
                                <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Personal Details</h3>
                                <div className="grid grid-cols-2 gap-3">
                                    <Field label="First Name *" value={form.firstName} onChange={(v) => setForm((f) => ({ ...f, firstName: v }))} />
                                    <Field label="Last Name *" value={form.lastName} onChange={(v) => setForm((f) => ({ ...f, lastName: v }))} />
                                    <Field label="SA ID Number *" value={form.idNumber} onChange={(v) => setForm((f) => ({ ...f, idNumber: v }))} disabled={!!editTarget} placeholder="13-digit SA ID" />
                                    <Field label="Email Address" value={form.email} onChange={(v) => setForm((f) => ({ ...f, email: v }))} type="email" />
                                    <Field label="Cell Number" value={form.cellNumber} onChange={(v) => setForm((f) => ({ ...f, cellNumber: v }))} placeholder="e.g. 082 000 0000" />
                                </div>
                            </section>

                            {/* Employment Details */}
                            <section>
                                <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Employment Details</h3>
                                <div className="grid grid-cols-2 gap-3">
                                    <Field label="Employer / Company Name" value={form.employerName} onChange={(v) => setForm((f) => ({ ...f, employerName: v }))} />
                                    <div>
                                        <label className="block text-xs text-gray-400 mb-1">Employment Type</label>
                                        <select value={form.employmentType} onChange={(e) => setForm((f) => ({ ...f, employmentType: e.target.value }))} className="w-full bg-zeno-blue/30 border border-zeno-blue/50 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-zeno-cyan/50">
                                            <option value="">— Select —</option>
                                            {EMPLOYMENT_TYPES.map((t) => <option key={t} value={t}>{t.replace('_', ' ')}</option>)}
                                        </select>
                                    </div>
                                    <Field label="Occupation / Job Title" value={form.occupation} onChange={(v) => setForm((f) => ({ ...f, occupation: v }))} />
                                    <Field label="Employer Phone" value={form.employerPhone} onChange={(v) => setForm((f) => ({ ...f, employerPhone: v }))} />
                                    <Field label="Monthly Income (ZAR)" value={form.monthlyIncome} onChange={(v) => setForm((f) => ({ ...f, monthlyIncome: v }))} type="number" />
                                    <div className="col-span-2">
                                        <Field label="Employer Address" value={form.employerAddress} onChange={(v) => setForm((f) => ({ ...f, employerAddress: v }))} />
                                    </div>
                                </div>
                            </section>

                            {/* Banking Details */}
                            <section>
                                <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Banking Details</h3>
                                <div className="grid grid-cols-2 gap-3">
                                    <Field label="Bank Name" value={form.bankName} onChange={(v) => setForm((f) => ({ ...f, bankName: v }))} placeholder="e.g. ABSA, FNB, Capitec" />
                                    <Field label="Account Number" value={form.accountNumber} onChange={(v) => setForm((f) => ({ ...f, accountNumber: v }))} />
                                    <div>
                                        <label className="block text-xs text-gray-400 mb-1">Account Type</label>
                                        <select value={form.accountType} onChange={(e) => setForm((f) => ({ ...f, accountType: e.target.value }))} className="w-full bg-zeno-blue/30 border border-zeno-blue/50 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-zeno-cyan/50">
                                            <option value="">— Select —</option>
                                            {ACCOUNT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                                        </select>
                                    </div>
                                    <Field label="Branch Code" value={form.branchCode} onChange={(v) => setForm((f) => ({ ...f, branchCode: v }))} placeholder="e.g. 632005" />
                                    <div className="col-span-2">
                                        <Field label="Account Holder Name" value={form.accountHolderName} onChange={(v) => setForm((f) => ({ ...f, accountHolderName: v }))} />
                                    </div>
                                </div>
                            </section>

                            {/* Status & Notes */}
                            <section>
                                <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Status & Notes</h3>
                                <div className="space-y-3">
                                    <label className="flex items-center gap-3 cursor-pointer">
                                        <input type="checkbox" checked={form.isActive} onChange={(e) => setForm((f) => ({ ...f, isActive: e.target.checked }))} className="w-4 h-4 accent-zeno-cyan" />
                                        <span className="text-sm text-gray-300">Active referrer</span>
                                    </label>
                                    <div>
                                        <label className="block text-xs text-gray-400 mb-1">Notes</label>
                                        <textarea value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} rows={3} className="w-full bg-zeno-blue/30 border border-zeno-blue/50 rounded-lg px-3 py-2 text-white text-sm placeholder-gray-500 focus:outline-none focus:border-zeno-cyan/50 resize-none" placeholder="Any additional notes..." />
                                    </div>
                                </div>
                            </section>
                        </div>

                        <div className="sticky bottom-0 bg-zeno-dark border-t border-zeno-blue/40 px-6 py-4 flex justify-end gap-3">
                            <button onClick={() => setModalOpen(false)} className="px-4 py-2 text-sm text-gray-400 hover:text-white transition-colors">Cancel</button>
                            <button onClick={handleSave} disabled={saving || !form.firstName || !form.lastName || !form.idNumber} className="bg-zeno-cyan text-zeno-dark font-semibold px-5 py-2 rounded-lg hover:bg-zeno-cyan/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm">
                                {saving ? 'Saving…' : editTarget ? 'Save Changes' : 'Create Referrer'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Delete confirmation */}
            {deleteTarget && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
                    <div className="bg-zeno-dark border border-red-500/30 rounded-xl w-full max-w-md p-6">
                        <h2 className="text-lg font-bold text-white mb-2">Delete Referrer?</h2>
                        <p className="text-gray-400 text-sm mb-4">
                            This will permanently delete <strong className="text-white">{deleteTarget.firstName} {deleteTarget.lastName}</strong> and their sub-project (if empty). This cannot be undone.
                        </p>
                        {deleteTarget._count.cases > 0 && (
                            <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg px-4 py-3 text-amber-400 text-sm mb-4">
                                This referrer has {deleteTarget._count.cases} linked case(s). Deletion is blocked — deactivate instead.
                            </div>
                        )}
                        <div className="flex justify-end gap-3">
                            <button onClick={() => setDeleteTarget(null)} className="px-4 py-2 text-sm text-gray-400 hover:text-white transition-colors">Cancel</button>
                            <button onClick={handleDelete} disabled={deleting || deleteTarget._count.cases > 0} className="bg-red-500 hover:bg-red-600 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold px-4 py-2 rounded-lg transition-colors text-sm">
                                {deleting ? 'Deleting…' : 'Delete'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Detail drawer */}
            {detailTarget && (
                <div className="fixed inset-0 z-50 flex justify-end bg-black/50" onClick={() => setDetailTarget(null)}>
                    <div className="bg-zeno-dark border-l border-zeno-blue/40 w-full max-w-lg h-full overflow-y-auto" onClick={(e) => e.stopPropagation()}>
                        <div className="sticky top-0 bg-zeno-dark border-b border-zeno-blue/40 px-6 py-4 flex items-center justify-between">
                            <h2 className="text-lg font-bold text-white">{detailTarget.firstName} {detailTarget.lastName}</h2>
                            <button onClick={() => setDetailTarget(null)} className="text-gray-400 hover:text-white transition-colors">✕</button>
                        </div>
                        <div className="p-6 space-y-5">
                            <DetailSection title="Personal">
                                <DetailRow label="ID Number" value={<span className="font-mono text-xs">{detailTarget.idNumber}</span>} />
                                <DetailRow label="Email" value={detailTarget.email} />
                                <DetailRow label="Cell" value={detailTarget.cellNumber} />
                            </DetailSection>
                            <DetailSection title="Employment">
                                <DetailRow label="Employer" value={detailTarget.employerName} />
                                <DetailRow label="Type" value={detailTarget.employmentType?.replace('_', ' ')} />
                                <DetailRow label="Occupation" value={detailTarget.occupation} />
                                <DetailRow label="Employer Phone" value={detailTarget.employerPhone} />
                                <DetailRow label="Monthly Income" value={detailTarget.monthlyIncome != null ? `R ${Number(detailTarget.monthlyIncome).toLocaleString('en-ZA', { minimumFractionDigits: 2 })}` : null} />
                                <DetailRow label="Employer Address" value={detailTarget.employerAddress} />
                            </DetailSection>
                            <DetailSection title="Banking">
                                <DetailRow label="Bank" value={detailTarget.bankName} />
                                <DetailRow label="Account #" value={detailTarget.accountNumber} />
                                <DetailRow label="Type" value={detailTarget.accountType} />
                                <DetailRow label="Branch Code" value={detailTarget.branchCode} />
                                <DetailRow label="Account Holder" value={detailTarget.accountHolderName} />
                            </DetailSection>
                            {detailTarget.notes && (
                                <DetailSection title="Notes">
                                    <p className="text-gray-300 text-sm whitespace-pre-wrap">{detailTarget.notes}</p>
                                </DetailSection>
                            )}
                            <DetailSection title="Sub-Project">
                                {detailTarget.project ? (
                                    <Link href={`/projects?id=${detailTarget.project.id}`} className="text-zeno-cyan hover:underline text-sm">
                                        {detailTarget.project.name} →
                                    </Link>
                                ) : (
                                    <span className="text-gray-500 text-sm">No sub-project linked</span>
                                )}
                                <p className="text-gray-400 text-xs mt-1">Total cases: <strong className="text-white">{detailTarget._count.cases}</strong></p>
                            </DetailSection>
                        </div>
                        <div className="px-6 pb-6">
                            <button onClick={() => { setDetailTarget(null); openEdit(detailTarget); }} className="w-full border border-zeno-cyan/40 text-zeno-cyan rounded-lg py-2 text-sm hover:bg-zeno-cyan/10 transition-colors">
                                Edit Referrer
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

function Field({ label, value, onChange, type = 'text', placeholder, disabled }: {
    label: string;
    value: string;
    onChange: (v: string) => void;
    type?: string;
    placeholder?: string;
    disabled?: boolean;
}) {
    return (
        <div>
            <label className="block text-xs text-gray-400 mb-1">{label}</label>
            <input
                type={type}
                value={value}
                onChange={(e) => onChange(e.target.value)}
                placeholder={placeholder}
                disabled={disabled}
                className="w-full bg-zeno-blue/30 border border-zeno-blue/50 rounded-lg px-3 py-2 text-white text-sm placeholder-gray-500 focus:outline-none focus:border-zeno-cyan/50 disabled:opacity-50 disabled:cursor-not-allowed"
            />
        </div>
    );
}

function DetailSection({ title, children }: { title: string; children: React.ReactNode }) {
    return (
        <div>
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">{title}</h3>
            <div className="bg-zeno-blue/20 border border-zeno-blue/30 rounded-lg p-4 space-y-2">{children}</div>
        </div>
    );
}

function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
    if (!value) return null;
    return (
        <div className="flex items-start justify-between gap-4 text-sm">
            <span className="text-gray-400 shrink-0">{label}</span>
            <span className="text-gray-200 text-right">{value}</span>
        </div>
    );
}

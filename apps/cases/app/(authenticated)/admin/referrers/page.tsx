'use client';
import { toast } from '@zenowethu/ui';


import { useSession } from '@zenowethu/ui';
import { useRouter } from 'next/navigation';
import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { Pagination } from '@zenowethu/ui';

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
    project: { id: string; name: string; parentId: string | null } | null;
    parentReferrer: { id: string; firstName: string; lastName: string } | null;
    _count: { cases: number };
    createdAt: string;
    outstandingCommission: number;
    paidCommission: number;
    commissionType: string;
    fixedCommissionAmount: number | null;
};

type StaffUser = {
    id: string;
    firstName: string | null;
    lastName: string | null;
    email: string;
    userType: string;
    isLocked: boolean;
};

const EMPLOYMENT_TYPES = ['EMPLOYED', 'SELF_EMPLOYED', 'CONTRACT', 'UNEMPLOYED', 'RETIRED'];
const ACCOUNT_TYPES = ['CHEQUE', 'SAVINGS', 'CURRENT'];

/** Quick preset amounts shown as chips in the Fixed commission section */
const FIXED_AMOUNT_PRESETS = [200, 300, 500];

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
    commissionType: 'FIXED' as 'FIXED' | 'VOLUME_BASED',
    fixedCommissionAmount: '',
    parentReferrerId: '',
    memberUserIds: [] as string[],
};

type FormState = typeof emptyForm;

export default function ReferrersPage() {
    const { data: session, status } = useSession();
    const router = useRouter();

    const [referrers, setReferrers] = useState<Referrer[]>([]);
    const [total, setTotal] = useState(0);
    const [pages, setPages] = useState(1);
    const [page, setPage] = useState(1);
    const [meta, setMeta] = useState({ total: 0, active: 0, inactive: 0, totalOutstanding: 0, totalPaid: 0 });
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
    const [staffUsers, setStaffUsers] = useState<StaffUser[]>([]);
    const [allReferrers, setAllReferrers] = useState<{ id: string; firstName: string; lastName: string }[]>([]);
    const [unregisteredFolders, setUnregisteredFolders] = useState<{ id: string; name: string; type: string; parent: { id: string; name: string } | null; _count: { cases: number } }[]>([]);
    const [loadingFolders, setLoadingFolders] = useState(false);
    const [registeringFolderId, setRegisteringFolderId] = useState<string | null>(null);

    const isManager = session?.user?.isAdmin || session?.user?.isExecutive || session?.user?.isSeniorManager || session?.user?.role === 'MANAGER';
    // Managers can view and add referrers; only Admin/Executive can edit or delete
    const canManage = session?.user?.isAdmin || session?.user?.isExecutive;

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

    async function openAdd() {
        setEditTarget(null);
        setForm(emptyForm);
        setFormError('');
        await Promise.all([loadAllReferrers(), loadStaffUsers()]);
        setModalOpen(true);
    }

    // Staff list for the initial-members picker (create mode only)
    async function loadStaffUsers() {
        try {
            const res = await fetch('/api/users');
            if (!res.ok) return;
            const users: StaffUser[] = await res.json();
            setStaffUsers(users.filter((u) => u.userType === 'STAFF' && !u.isLocked));
        } catch {
            // non-critical — picker just stays empty
        }
    }

    async function openEdit(r: Referrer) {
        setEditTarget(r);
        setForm({
            firstName: r.firstName,
            lastName: r.lastName,
            idNumber: r.idNumber ?? '',
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
            commissionType: (r.commissionType as 'FIXED' | 'VOLUME_BASED') ?? 'FIXED',
            fixedCommissionAmount: r.fixedCommissionAmount != null ? String(r.fixedCommissionAmount) : '',
            parentReferrerId: r.parentReferrer?.id ?? '',
            memberUserIds: [], // members are managed on the referrer detail page after creation
        });
        setFormError('');
        await loadAllReferrers();
        setModalOpen(true);
    }

    async function loadAllReferrers() {
        try {
            const res = await fetch('/api/admin/referrers/dropdown');
            if (!res.ok) return;
            const data = await res.json();
            setAllReferrers(data.referrers
                .filter((r: any) => !r.id.startsWith('project:')) // exclude orphan projects
                .map((r: any) => ({ id: r.id, firstName: r.name.split(' ')[0], lastName: r.name.split(' ').slice(1).join(' ') })));
        } catch {
            // non-critical — dropdown just stays empty
        }
    }

    const fetchUnregisteredFolders = useCallback(async () => {
        setLoadingFolders(true);
        try {
            const res = await fetch('/api/admin/referrers/unregistered-folders');
            if (!res.ok) return;
            const data = await res.json();
            setUnregisteredFolders(data.folders ?? []);
        } catch {
            // non-critical
        } finally {
            setLoadingFolders(false);
        }
    }, []);

    useEffect(() => { fetchUnregisteredFolders(); }, [fetchUnregisteredFolders]);

    async function registerFolder(projectId: string) {
        setRegisteringFolderId(projectId);
        try {
            const res = await fetch('/api/admin/referrers/register-from-project', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ projectId }),
            });
            const json = await res.json();
            if (!res.ok) {
                toast.error(json.error ?? 'Failed to register');
                return;
            }
            toast.success(`${json.firstName} ${json.lastName} registered as referrer`);
            await Promise.all([fetchReferrers(), fetchUnregisteredFolders()]);
        } catch {
            toast.error('Network error');
        } finally {
            setRegisteringFolderId(null);
        }
    }

    async function handleSave() {
        setSaving(true);
        setFormError('');
        try {
            const normalizedIdNumber = (form.idNumber ?? '').trim();
            if (!editTarget && !/^\d{13}$/.test(normalizedIdNumber)) {
                setFormError('A 13-digit SA ID number is required to create the referrer login.');
                return;
            }

            const payload: Record<string, unknown> = {
                firstName: form.firstName.trim(),
                lastName: form.lastName.trim(),
                idNumber: normalizedIdNumber || null,
                email: (form.email ?? '').trim() || null,
                cellNumber: (form.cellNumber ?? '').trim() || null,
                employerName: (form.employerName ?? '').trim() || null,
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
                commissionType: form.commissionType,
                fixedCommissionAmount: form.commissionType === 'FIXED' && form.fixedCommissionAmount
                    ? parseFloat(form.fixedCommissionAmount)
                    : null,
                parentReferrerId: form.parentReferrerId || null,
            };
            if (!editTarget) {
                payload.memberUserIds = form.memberUserIds;
            }

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
            if (!res.ok) { toast.error(json.error ?? 'Delete failed'); return; }
            setDeleteTarget(null);
            fetchReferrers();
        } catch {
            toast.error('Network error');
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
                <div className="flex gap-3">
                    <Link href="/admin/referrers/payouts" className="bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-semibold px-4 py-2 rounded-lg hover:bg-emerald-500/20 transition-colors text-sm">
                        Commission Payouts
                    </Link>
                    <button onClick={openAdd} className="bg-zeno-cyan text-zeno-dark font-semibold px-4 py-2 rounded-lg hover:bg-zeno-cyan/90 transition-colors text-sm">
                        + Add Referrer
                    </button>
                </div>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-5 gap-4 mb-6">
                {[
                    { label: 'Total Referrers', value: meta.total, color: 'text-white' },
                    { label: 'Active', value: meta.active, color: 'text-emerald-400' },
                    { label: 'Inactive', value: meta.inactive, color: 'text-gray-400' },
                    { label: 'Outstanding Pay', value: `R ${meta.totalOutstanding.toLocaleString()}`, color: 'text-amber-400' },
                    { label: 'Total Paid', value: `R ${meta.totalPaid.toLocaleString()}`, color: 'text-emerald-400' },
                ].map((s) => (
                    <div key={s.label} className="bg-zeno-blue/30 border border-zeno-blue/50 rounded-xl p-4">
                        <p className="text-xs text-gray-400 uppercase tracking-wider mb-1">{s.label}</p>
                        <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
                    </div>
                ))}
            </div>

            {/* Unregistered Referral Folders — alert panel */}
            {(loadingFolders || unregisteredFolders.length > 0) && (
                <div className="bg-amber-500/5 border border-amber-500/25 rounded-xl p-5 mb-6">
                    <div className="flex items-center justify-between mb-3">
                        <div>
                            <h2 className="text-sm font-semibold text-amber-400">Unregistered Referral Folders</h2>
                            <p className="text-xs text-gray-400 mt-0.5">
                                These project folders are used as referral buckets but have no Referrer record.
                                Cases inside them are not tracked for commissions. Click <strong className="text-white">Register</strong> to link them.
                            </p>
                        </div>
                    </div>
                    {loadingFolders ? (
                        <p className="text-xs text-gray-500">Loading…</p>
                    ) : (
                        <div className="grid grid-cols-1 gap-2">
                            {unregisteredFolders.map((folder) => (
                                <div key={folder.id} className="flex items-center justify-between bg-zeno-blue/20 border border-zeno-blue/30 rounded-lg px-4 py-2.5">
                                    <div>
                                        <span className="text-white text-sm font-medium">{folder.name}</span>
                                        {folder.parent && (
                                            <span className="text-gray-500 text-xs ml-2">under {folder.parent.name}</span>
                                        )}
                                        <span className="ml-3 text-xs text-gray-400">{folder._count.cases} case{folder._count.cases !== 1 ? 's' : ''}</span>
                                    </div>
                                    <button
                                        onClick={() => registerFolder(folder.id)}
                                        disabled={registeringFolderId === folder.id}
                                        className="bg-amber-500/20 border border-amber-500/30 text-amber-400 text-xs font-semibold px-3 py-1.5 rounded-lg hover:bg-amber-500/30 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                    >
                                        {registeringFolderId === folder.id ? 'Registering…' : 'Register'}
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}

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
                            <th className="text-left py-3 px-4 text-gray-400 font-medium">Referred By</th>
                            <th className="text-left py-3 px-4 text-gray-400 font-medium">Cases</th>
                            <th className="text-right py-3 px-4 text-gray-400 font-medium">Outstanding</th>
                            <th className="text-left py-3 px-4 text-gray-400 font-medium pl-6">Status</th>
                            <th className="py-3 px-4"></th>
                        </tr>
                    </thead>
                    <tbody>
                        {loading ? (
                            <tr><td colSpan={9} className="py-12 text-center text-gray-400">Loading...</td></tr>
                        ) : referrers.length === 0 ? (
                            <tr><td colSpan={9} className="py-12 text-center text-gray-400">No referrers found</td></tr>
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
                                    {r.parentReferrer ? (
                                        <span className="text-purple-400 text-xs">{r.parentReferrer.firstName} {r.parentReferrer.lastName}</span>
                                    ) : (
                                        <span className="text-gray-600 text-xs">—</span>
                                    )}
                                </td>
                                <td className="py-3 px-4">
                                    <span className="text-white font-medium">{r._count.cases}</span>
                                </td>
                                <td className="py-3 px-4 text-right">
                                    <div className="text-amber-400 font-medium text-xs whitespace-nowrap">
                                        R {r.outstandingCommission.toLocaleString('en-ZA', { minimumFractionDigits: 2 })}
                                    </div>
                                    <div className="text-gray-500 text-xs whitespace-nowrap mt-1">
                                        Paid: R {r.paidCommission.toLocaleString('en-ZA', { minimumFractionDigits: 2 })}
                                    </div>
                                </td>
                                <td className="py-3 px-4 pl-6">
                                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${r.isActive ? 'bg-emerald-500/20 text-emerald-400' : 'bg-gray-500/20 text-gray-400'}`}>
                                        {r.isActive ? 'Active' : 'Inactive'}
                                    </span>
                                </td>
                                <td className="py-3 px-4">
                                    <div className="flex items-center gap-2 justify-end">
                                        <Link href={`/admin/referrers/${r.id}`} className="text-zeno-cyan hover:text-zeno-cyan/80 text-xs px-2 py-1 rounded hover:bg-zeno-cyan/10 transition-colors">
                                            Commission
                                        </Link>
                                        {canManage && (
                                            <button onClick={() => openEdit(r)} className="text-gray-400 hover:text-white text-xs transition-colors px-2 py-1 rounded hover:bg-white/5">
                                                Edit
                                            </button>
                                        )}
                                        {canManage && (
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

            <Pagination 
                currentPage={page} 
                totalPages={pages} 
                onPageChange={setPage} 
            />

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
                                    <Field label="SA ID Number *" value={form.idNumber} onChange={(v) => setForm((f) => ({ ...f, idNumber: v }))} placeholder="13-digit SA ID" />
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

                            {/* Commission Tier */}
                            <section>
                                <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Commission Rate</h3>
                                <div className="space-y-3">
                                    <div className="flex gap-3">
                                        {(['FIXED', 'VOLUME_BASED'] as const).map((type) => (
                                            <button
                                                key={type}
                                                type="button"
                                                onClick={() => setForm((f) => ({ ...f, commissionType: type }))}
                                                className={`flex-1 py-2 px-3 rounded-lg border text-sm font-medium transition-colors ${
                                                    form.commissionType === type
                                                        ? 'bg-zeno-cyan/10 border-zeno-cyan/50 text-zeno-cyan'
                                                        : 'bg-zeno-blue/20 border-zeno-blue/40 text-gray-400 hover:border-gray-500'
                                                }`}
                                            >
                                                {type === 'FIXED' ? 'Fixed Amount' : 'Volume-Based'}
                                            </button>
                                        ))}
                                    </div>

                                    {form.commissionType === 'FIXED' && (
                                        <div>
                                            <label className="block text-xs text-gray-400 mb-2">Commission Amount (ZAR)</label>
                                            {/* Quick preset chips */}
                                            <div className="flex gap-2 mb-2">
                                                {FIXED_AMOUNT_PRESETS.map((amt) => (
                                                    <button
                                                        key={amt}
                                                        type="button"
                                                        onClick={() => setForm((f) => ({ ...f, fixedCommissionAmount: String(amt) }))}
                                                        className={`px-3 py-1 rounded-full text-xs border font-medium transition-colors ${
                                                            form.fixedCommissionAmount === String(amt)
                                                                ? 'bg-zeno-cyan/20 border-zeno-cyan/50 text-zeno-cyan'
                                                                : 'bg-zeno-blue/20 border-zeno-blue/40 text-gray-400 hover:border-gray-500'
                                                        }`}
                                                    >
                                                        R{amt}
                                                    </button>
                                                ))}
                                                <span className="text-xs text-gray-500 self-center">or enter custom →</span>
                                            </div>
                                            <input
                                                type="number"
                                                min={1}
                                                step={50}
                                                value={form.fixedCommissionAmount}
                                                onChange={(e) => setForm((f) => ({ ...f, fixedCommissionAmount: e.target.value }))}
                                                placeholder="e.g. 200, 300, 500"
                                                className="w-full bg-zeno-blue/30 border border-zeno-blue/50 rounded-lg px-3 py-2 text-white text-sm placeholder-gray-500 focus:outline-none focus:border-zeno-cyan/50"
                                            />
                                        </div>
                                    )}

                                    {form.commissionType === 'VOLUME_BASED' && (
                                        <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg px-4 py-3 text-blue-300 text-xs space-y-1">
                                            <p className="font-semibold">Auto-calculated per referral based on total cases brought:</p>
                                            <p>• <strong>1 – 9 cases</strong> → <strong>R200</strong> per referral</p>
                                            <p>• <strong>10 or more cases</strong> → <strong>R300</strong> per referral</p>
                                            <p className="text-blue-400/70 mt-1">Amount is recalculated each time a referral reaches the eligible stage.</p>
                                        </div>
                                    )}
                                </div>
                            </section>

                            {/* Referred By */}
                            <section>
                                <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Referred By (Optional)</h3>
                                <p className="text-xs text-gray-500 mb-2">If this referrer was brought in by another referrer, select them here. Their sub-project will be nested under the referring referrer.</p>
                                <select
                                    value={form.parentReferrerId}
                                    onChange={(e) => setForm((f) => ({ ...f, parentReferrerId: e.target.value }))}
                                    className="w-full bg-zeno-blue/30 border border-zeno-blue/50 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-zeno-cyan/50"
                                >
                                    <option value="">— None (top-level referrer) —</option>
                                    {allReferrers
                                        .filter((r) => r.id !== editTarget?.id)
                                        .map((r) => (
                                            <option key={r.id} value={r.id}>{r.firstName} {r.lastName}</option>
                                        ))
                                    }
                                </select>
                            </section>

                            {/* Team Members — create mode only; edits happen on the detail page */}
                            <section>
                                <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Team Members</h3>
                                {editTarget ? (
                                    <p className="text-xs text-gray-500">
                                        Members are managed on the referrer&apos;s{' '}
                                        <Link href={`/admin/referrers/${editTarget.id}`} className="text-zeno-cyan hover:underline">detail page</Link>.
                                    </p>
                                ) : (
                                    <>
                                        <p className="text-xs text-gray-500 mb-2">
                                            Only members of the referrer&apos;s sub-project can see this referrer and its cases.
                                            You will be added automatically as manager; select any other staff who need access.
                                        </p>
                                        {staffUsers.length === 0 ? (
                                            <p className="text-xs text-gray-500 bg-zeno-blue/20 border border-zeno-blue/30 rounded-lg px-4 py-3">No staff users available.</p>
                                        ) : (
                                            <div className="bg-zeno-blue/20 border border-zeno-blue/30 rounded-lg p-3 max-h-48 overflow-y-auto space-y-1">
                                                {staffUsers
                                                    .filter((u) => u.id !== session?.user?.id)
                                                    .map((u) => (
                                                        <label key={u.id} className="flex items-center gap-3 cursor-pointer rounded-lg px-2 py-1.5 hover:bg-zeno-blue/30 transition-colors">
                                                            <input
                                                                type="checkbox"
                                                                checked={form.memberUserIds.includes(u.id)}
                                                                onChange={(e) => setForm((f) => ({
                                                                    ...f,
                                                                    memberUserIds: e.target.checked
                                                                        ? [...f.memberUserIds, u.id]
                                                                        : f.memberUserIds.filter((id) => id !== u.id),
                                                                }))}
                                                                className="w-4 h-4 accent-zeno-cyan"
                                                            />
                                                            <span className="text-sm text-gray-300">{[u.firstName, u.lastName].filter(Boolean).join(' ') || u.email}</span>
                                                            <span className="text-xs text-gray-500 ml-auto">{u.email}</span>
                                                        </label>
                                                    ))}
                                            </div>
                                        )}
                                        {form.memberUserIds.length > 0 && (
                                            <p className="text-xs text-zeno-cyan mt-2">{form.memberUserIds.length} member{form.memberUserIds.length !== 1 ? 's' : ''} selected (plus you as manager)</p>
                                        )}
                                    </>
                                )}
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
                            <button onClick={handleSave} disabled={saving || !form.firstName || !form.lastName} className="bg-zeno-cyan text-zeno-dark font-semibold px-5 py-2 rounded-lg hover:bg-zeno-cyan/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm">
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
                            <DetailSection title="Commission">
                                <DetailRow
                                    label="Type"
                                    value={detailTarget.commissionType === 'VOLUME_BASED' ? 'Volume-Based' : 'Fixed'}
                                />
                                {detailTarget.commissionType === 'FIXED' && (
                                    <DetailRow
                                        label="Fixed Amount"
                                        value={detailTarget.fixedCommissionAmount != null
                                            ? `R ${Number(detailTarget.fixedCommissionAmount).toLocaleString('en-ZA', { minimumFractionDigits: 2 })}`
                                            : 'Not set'}
                                    />
                                )}
                                {detailTarget.commissionType === 'VOLUME_BASED' && (
                                    <p className="text-gray-400 text-xs">R200 (1–9 cases) / R300 (10+ cases)</p>
                                )}
                            </DetailSection>

                            {detailTarget.parentReferrer && (
                                <DetailSection title="Referred By">
                                    <p className="text-purple-400 text-sm font-medium">
                                        {detailTarget.parentReferrer.firstName} {detailTarget.parentReferrer.lastName}
                                    </p>
                                    <p className="text-gray-500 text-xs mt-1">This referrer was brought in by the above referrer. Their sub-project is nested under theirs.</p>
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
                        {canManage && (
                            <div className="px-6 pb-6">
                                <button onClick={() => { setDetailTarget(null); openEdit(detailTarget); }} className="w-full border border-zeno-cyan/40 text-zeno-cyan rounded-lg py-2 text-sm hover:bg-zeno-cyan/10 transition-colors">
                                    Edit Referrer
                                </button>
                            </div>
                        )}
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

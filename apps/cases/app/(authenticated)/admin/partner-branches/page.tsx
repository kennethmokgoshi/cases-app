'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast, DeleteConfirmationModal } from '@zenowethu/ui';
import { branchCsvTemplate } from '@/lib/partner-branch-csv';

type Partner = { id: string; name: string };

type Branch = {
    id: string;
    partnerProjectId: string;
    projectId: string | null;
    name: string;
    code: string | null;
    contactPerson: string | null;
    email: string | null;
    phone: string | null;
    alternatePhone: string | null;
    whatsappNumber: string | null;
    addressLine: string | null;
    city: string | null;
    province: string | null;
    postalCode: string | null;
    notes: string | null;
    isActive: boolean;
    partnerProject: { id: string; name: string };
    _count: { cases: number };
};

type Summary = { total: number; withEmail: number; withPhone: number; unreachable: number };

type ImportRow = {
    line: number;
    name: string;
    outcome: 'CREATE' | 'UPDATE' | 'UNCHANGED' | 'ERROR';
    changes: { field: string; from: string | null; to: string | null }[];
    errors: string[];
};

type ImportPreview = {
    dryRun: boolean;
    summary: { create: number; update: number; unchanged: number; errors: number };
    rows: ImportRow[];
    unknownHeaders: string[];
};

const EDITABLE_FIELDS = [
    { key: 'name', label: 'Branch', type: 'text' },
    { key: 'code', label: 'Code', type: 'text' },
    { key: 'contactPerson', label: 'Contact person', type: 'text' },
    { key: 'email', label: 'Email', type: 'email' },
    { key: 'phone', label: 'Phone', type: 'tel' },
    { key: 'alternatePhone', label: 'Alternate phone', type: 'tel' },
    { key: 'whatsappNumber', label: 'WhatsApp', type: 'tel' },
    { key: 'addressLine', label: 'Address', type: 'text' },
    { key: 'city', label: 'City', type: 'text' },
    { key: 'province', label: 'Province', type: 'text' },
    { key: 'postalCode', label: 'Postal code', type: 'text' },
] as const;

type EditableKey = (typeof EDITABLE_FIELDS)[number]['key'];

type EditForm = Record<EditableKey, string> & { notes: string; isActive: boolean };

function toForm(branch: Branch): EditForm {
    const form = { notes: branch.notes ?? '', isActive: branch.isActive } as EditForm;
    for (const field of EDITABLE_FIELDS) form[field.key] = branch[field.key] ?? '';
    return form;
}

export default function PartnerBranchesPage() {
    const [branches, setBranches] = useState<Branch[]>([]);
    const [partners, setPartners] = useState<Partner[]>([]);
    const [summary, setSummary] = useState<Summary | null>(null);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState<string | null>(null);

    const [partnerFilter, setPartnerFilter] = useState('');
    const [search, setSearch] = useState('');
    const [missingOnly, setMissingOnly] = useState(false);

    const [editingId, setEditingId] = useState<string | null>(null);
    const [form, setForm] = useState<EditForm | null>(null);
    const [saving, setSaving] = useState(false);
    const [deleteTarget, setDeleteTarget] = useState<Branch | null>(null);

    const [showImport, setShowImport] = useState(false);
    const [csv, setCsv] = useState('');
    const [importing, setImporting] = useState(false);
    const [preview, setPreview] = useState<ImportPreview | null>(null);

    const load = useCallback(async () => {
        setLoading(true);
        setLoadError(null);
        try {
            const params = new URLSearchParams();
            if (partnerFilter) params.set('partnerProjectId', partnerFilter);
            if (search.trim()) params.set('search', search.trim());
            if (missingOnly) params.set('missingContact', 'true');

            const res = await fetch(`/api/admin/partner-branches?${params}`);
            if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? 'Failed to load branches');
            const data = await res.json();
            setBranches(data.branches ?? []);
            setPartners(data.partners ?? []);
            setSummary(data.summary ?? null);
        } catch (error) {
            setLoadError((error as Error).message);
        } finally {
            setLoading(false);
        }
    }, [partnerFilter, search, missingOnly]);

    useEffect(() => {
        const timer = setTimeout(load, search ? 300 : 0);
        return () => clearTimeout(timer);
    }, [load, search]);

    const startEdit = (branch: Branch) => {
        setEditingId(branch.id);
        setForm(toForm(branch));
    };

    const saveEdit = async () => {
        if (!editingId || !form) return;
        setSaving(true);
        try {
            const res = await fetch(`/api/admin/partner-branches/${editingId}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(form) });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data.error ?? 'Could not save branch');
            toast.success(`${form.name} saved`);
            setEditingId(null);
            setForm(null);
            await load();
        } catch (error) {
            toast.error((error as Error).message);
        } finally {
            setSaving(false);
        }
    };

    const confirmDelete = async () => {
        if (!deleteTarget) return;
        try {
            const res = await fetch(`/api/admin/partner-branches/${deleteTarget.id}`, { method: 'DELETE' });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data.error ?? 'Could not remove branch');
            toast.success(data.message ?? `${deleteTarget.name} removed`);
            setDeleteTarget(null);
            await load();
        } catch (error) {
            toast.error((error as Error).message);
        }
    };

    const runImport = async (dryRun: boolean) => {
        if (!partnerFilter) {
            toast.error('Choose a partner before importing');
            return;
        }
        if (!csv.trim()) {
            toast.error('Paste the CSV contact list first');
            return;
        }
        setImporting(true);
        try {
            const res = await fetch('/api/admin/partner-branches/import', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ partnerProjectId: partnerFilter, csv, dryRun }) });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data.error ?? 'Import failed');
            setPreview(data);
            if (!dryRun) {
                toast.success(`Imported — ${data.summary.create} added, ${data.summary.update} updated`);
                setCsv('');
                setShowImport(false);
                setPreview(null);
                await load();
            }
        } catch (error) {
            toast.error((error as Error).message);
        } finally {
            setImporting(false);
        }
    };

    const downloadTemplate = () => {
        const names = branches.filter((b) => !b.email && !b.phone).map((b) => b.name);
        const blob = new Blob([branchCsvTemplate(names)], { type: 'text/csv;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = 'partner-branch-contacts.csv';
        link.click();
        URL.revokeObjectURL(url);
    };

    const grouped = useMemo(() => {
        const map = new Map<string, Branch[]>();
        for (const branch of branches) {
            const key = branch.partnerProject.name;
            map.set(key, [...(map.get(key) ?? []), branch]);
        }
        return [...map.entries()];
    }, [branches]);

    return (
        <div className="p-6 max-w-[1400px] mx-auto">
            <header className="mb-6">
                <h1 className="text-2xl font-bold text-white">Partner Branches</h1>
                <p className="text-sm text-gray-400 mt-1 max-w-3xl">
                    Contact details for every B2B partner branch. When a consumer has no email address or cell
                    number of their own, case notifications fall back to their referring branch — so a branch with
                    no contact details here means those consumers cannot be reached at all.
                </p>
            </header>

            {summary && (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
                    {[
                        { label: 'Branches', value: summary.total, tone: 'text-white' },
                        { label: 'With email', value: summary.withEmail, tone: 'text-emerald-400' },
                        { label: 'With phone', value: summary.withPhone, tone: 'text-emerald-400' },
                        { label: 'No contact at all', value: summary.unreachable, tone: summary.unreachable > 0 ? 'text-amber-400' : 'text-gray-400' },
                    ].map((stat) => (
                        <div key={stat.label} className="bg-zeno-navy border border-white/10 rounded-lg px-4 py-3">
                            <div className={`text-2xl font-bold ${stat.tone}`}>{stat.value}</div>
                            <div className="text-xs text-gray-400 uppercase tracking-wide mt-1">{stat.label}</div>
                        </div>
                    ))}
                </div>
            )}

            <div className="flex flex-wrap gap-3 items-center mb-4">
                <select
                    value={partnerFilter}
                    onChange={(e) => setPartnerFilter(e.target.value)}
                    className="bg-zeno-navy border border-white/10 rounded-lg px-3 py-2 text-sm text-white [color-scheme:dark]"
                >
                    <option value="">All partners</option>
                    {partners.map((p) => (
                        <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                </select>

                <input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search branch, contact, email, city..."
                    className="bg-zeno-navy border border-white/10 rounded-lg px-3 py-2 text-sm text-white flex-1 min-w-[240px]"
                />

                <label className="flex items-center gap-2 text-sm text-gray-300">
                    <input type="checkbox" checked={missingOnly} onChange={(e) => setMissingOnly(e.target.checked)} />
                    Missing contact details only
                </label>

                <button
                    onClick={downloadTemplate}
                    className="px-3 py-2 text-sm rounded-lg border border-white/10 text-gray-300 hover:text-white hover:bg-white/5"
                >
                    Download CSV template
                </button>
                <button
                    onClick={() => setShowImport((v) => !v)}
                    className="px-3 py-2 text-sm rounded-lg bg-zeno-cyan/10 text-zeno-cyan border border-zeno-cyan/30 hover:bg-zeno-cyan/20"
                >
                    {showImport ? 'Close import' : 'Import CSV'}
                </button>
            </div>

            {showImport && (
                <section className="bg-zeno-navy border border-white/10 rounded-lg p-4 mb-6">
                    <h2 className="text-sm font-semibold text-white mb-2">Bulk import contact details</h2>
                    <p className="text-xs text-gray-400 mb-3">
                        Pick a partner above, then paste the contact list. Columns are matched by heading —
                        <span className="text-gray-300"> Branch, Code, Contact Person, Email, Phone, Alternate Phone, WhatsApp, Address, City, Province, Postal Code, Notes</span>.
                        Blank cells leave the stored value alone. Nothing is written until you review the preview.
                    </p>
                    <textarea
                        value={csv}
                        onChange={(e) => { setCsv(e.target.value); setPreview(null); }}
                        rows={8}
                        placeholder={'Branch,Contact Person,Email,Phone\nMthata,Nomsa Dlamini,mthata@example.co.za,047 000 0000'}
                        className="w-full bg-zeno-dark border border-white/10 rounded-lg px-3 py-2 text-sm text-white font-mono"
                    />
                    <div className="flex gap-3 mt-3">
                        <button
                            onClick={() => runImport(true)}
                            disabled={importing}
                            className="px-4 py-2 text-sm rounded-lg border border-white/10 text-gray-200 hover:bg-white/5 disabled:opacity-50"
                        >
                            {importing ? 'Checking...' : 'Preview changes'}
                        </button>
                        <button
                            onClick={() => runImport(false)}
                            disabled={importing || !preview || preview.summary.create + preview.summary.update === 0}
                            className="px-4 py-2 text-sm rounded-lg bg-zeno-cyan text-zeno-navy font-semibold disabled:opacity-40"
                        >
                            Apply {preview ? `${preview.summary.create + preview.summary.update} change(s)` : 'changes'}
                        </button>
                    </div>

                    {preview && (
                        <div className="mt-4">
                            {preview.unknownHeaders.length > 0 && (
                                <p className="text-xs text-amber-400 mb-2">
                                    Ignored unrecognised columns: {preview.unknownHeaders.join(', ')}
                                </p>
                            )}
                            <p className="text-xs text-gray-300 mb-2">
                                {preview.summary.create} to add · {preview.summary.update} to update ·{' '}
                                {preview.summary.unchanged} unchanged · {preview.summary.errors} with errors
                            </p>
                            <div className="max-h-72 overflow-y-auto border border-white/10 rounded-lg">
                                <table className="w-full text-xs">
                                    <thead className="bg-white/5 text-gray-400 sticky top-0">
                                        <tr>
                                            <th className="text-left px-3 py-2">Line</th>
                                            <th className="text-left px-3 py-2">Branch</th>
                                            <th className="text-left px-3 py-2">Outcome</th>
                                            <th className="text-left px-3 py-2">Detail</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {preview.rows.map((row) => (
                                            <tr key={row.line} className="border-t border-white/5">
                                                <td className="px-3 py-2 text-gray-500">{row.line}</td>
                                                <td className="px-3 py-2 text-white">{row.name || '—'}</td>
                                                <td className={`px-3 py-2 font-medium ${
                                                    row.outcome === 'ERROR' ? 'text-red-400'
                                                        : row.outcome === 'CREATE' ? 'text-emerald-400'
                                                            : row.outcome === 'UPDATE' ? 'text-zeno-cyan' : 'text-gray-500'}`}>
                                                    {row.outcome}
                                                </td>
                                                <td className="px-3 py-2 text-gray-400">
                                                    {row.errors.length > 0
                                                        ? row.errors.join(' ')
                                                        : row.changes.map((c) => `${c.field}: ${c.from ?? '—'} → ${c.to}`).join('; ') || 'No change'}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}
                </section>
            )}

            {loading && <p className="text-gray-400 text-sm py-8">Loading branches...</p>}

            {!loading && loadError && (
                <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4 text-red-300 text-sm">
                    {loadError}
                    <button onClick={load} className="ml-3 underline">Retry</button>
                </div>
            )}

            {!loading && !loadError && branches.length === 0 && (
                <div className="border border-white/10 rounded-lg p-8 text-center text-gray-400 text-sm">
                    No branches match these filters.
                </div>
            )}

            {!loading && !loadError && grouped.map(([partnerName, rows]) => (
                <section key={partnerName} className="mb-8">
                    <h2 className="text-sm font-semibold text-zeno-cyan uppercase tracking-wide mb-2">
                        {partnerName} <span className="text-gray-500 normal-case">({rows.length})</span>
                    </h2>
                    <div className="overflow-x-auto border border-white/10 rounded-lg">
                        <table className="w-full text-sm min-w-[900px]">
                            <thead className="bg-white/5 text-gray-400 text-xs uppercase">
                                <tr>
                                    <th className="text-left px-3 py-2">Branch</th>
                                    <th className="text-left px-3 py-2">Contact person</th>
                                    <th className="text-left px-3 py-2">Email</th>
                                    <th className="text-left px-3 py-2">Phone</th>
                                    <th className="text-left px-3 py-2">City</th>
                                    <th className="text-right px-3 py-2">Cases</th>
                                    <th className="text-right px-3 py-2">Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {rows.map((branch) => (
                                    <tr key={branch.id} className={`border-t border-white/5 ${branch.isActive ? '' : 'opacity-50'}`}>
                                        <td className="px-3 py-2 text-white">
                                            {branch.name}
                                            {!branch.isActive && <span className="ml-2 text-xs text-amber-400">inactive</span>}
                                        </td>
                                        <td className="px-3 py-2 text-gray-300">{branch.contactPerson ?? '—'}</td>
                                        <td className={`px-3 py-2 ${branch.email ? 'text-gray-300' : 'text-amber-400/70'}`}>
                                            {branch.email ?? 'not set'}
                                        </td>
                                        <td className={`px-3 py-2 ${branch.phone ? 'text-gray-300' : 'text-amber-400/70'}`}>
                                            {branch.phone ?? 'not set'}
                                        </td>
                                        <td className="px-3 py-2 text-gray-400">{branch.city ?? '—'}</td>
                                        <td className="px-3 py-2 text-right text-gray-400">{branch._count.cases}</td>
                                        <td className="px-3 py-2 text-right whitespace-nowrap">
                                            <button onClick={() => startEdit(branch)} className="text-zeno-cyan hover:underline">Edit</button>
                                            <button onClick={() => setDeleteTarget(branch)} className="ml-3 text-red-400 hover:underline">Remove</button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </section>
            ))}

            {editingId && form && (
                <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4" role="dialog" aria-modal="true">
                    <div className="bg-zeno-navy border border-white/10 rounded-xl p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
                        <h2 className="text-lg font-semibold text-white mb-4">Edit branch</h2>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {EDITABLE_FIELDS.map((field) => (
                                <div key={field.key}>
                                    <label className="block text-xs text-gray-400 mb-1">{field.label}</label>
                                    <input
                                        type={field.type}
                                        value={form[field.key] ?? ''}
                                        onChange={(e) => setForm({ ...form, [field.key]: e.target.value })}
                                        className="w-full bg-zeno-dark border border-white/10 rounded-lg px-3 py-2 text-sm text-white"
                                    />
                                </div>
                            ))}
                            <div className="md:col-span-2">
                                <label className="block text-xs text-gray-400 mb-1">Notes</label>
                                <textarea
                                    rows={3}
                                    value={form.notes ?? ''}
                                    onChange={(e) => setForm({ ...form, notes: e.target.value })}
                                    className="w-full bg-zeno-dark border border-white/10 rounded-lg px-3 py-2 text-sm text-white"
                                />
                            </div>
                            <label className="flex items-center gap-2 text-sm text-gray-300 md:col-span-2">
                                <input
                                    type="checkbox"
                                    checked={form.isActive}
                                    onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
                                />
                                Active — inactive branches are never used as a fallback contact
                            </label>
                        </div>
                        <div className="flex justify-end gap-3 mt-6">
                            <button
                                onClick={() => { setEditingId(null); setForm(null); }}
                                className="px-4 py-2 text-sm rounded-lg border border-white/10 text-gray-300 hover:bg-white/5"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={saveEdit}
                                disabled={saving}
                                className="px-4 py-2 text-sm rounded-lg bg-zeno-cyan text-zeno-navy font-semibold disabled:opacity-50"
                            >
                                {saving ? 'Saving...' : 'Save branch'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {deleteTarget && (
                <DeleteConfirmationModal
                    isOpen
                    onClose={() => setDeleteTarget(null)}
                    onConfirm={confirmDelete}
                    title="Remove branch"
                    message={
                        deleteTarget._count.cases > 0
                            ? `${deleteTarget.name} has ${deleteTarget._count.cases} linked case(s), so it will be deactivated rather than deleted.`
                            : `Permanently remove ${deleteTarget.name} from the branch directory?`
                    }
                />
            )}
        </div>
    );
}

'use client';

import { useEffect, useState } from 'react';
import type { CompanyProfile } from '@zenowethu/shared-lib/src/company/profile';

/**
 * Admin → Settings → Company Profile.
 *
 * Edits the tenant firm's identity: everything that used to be hard-coded as
 * "Zenowethu" across documents, emails, SMS and AI prompts. Fields left blank
 * fall back to the platform defaults, so a partially completed profile never
 * produces empty letterheads.
 */

type FormState = {
    legalName: string;
    tradingName: string;
    shortName: string;
    tagline: string;
    registrationNumber: string;
    vatNumber: string;
    ncrdcNumber: string;
    dcasaNumber: string;
    debtCounsellorName: string;
    directorName: string;
    directorIdNumber: string;
    addressLine1: string;
    addressLine2: string;
    city: string;
    postalCode: string;
    phone: string;
    phoneInternational: string;
    cell: string;
    email: string;
    debtReviewEmail: string;
    debtReviewPhone: string;
    website: string;
    websiteUrl: string;
    primaryColor: string;
    accentColor: string;
    logoUrl: string;
    bankName: string;
    bankAccountHolder: string;
    bankAccountNumber: string;
    bankBranchCode: string;
    bankAccountType: string;
};

const EMPTY: FormState = {
    legalName: '', tradingName: '', shortName: '', tagline: '',
    registrationNumber: '', vatNumber: '', ncrdcNumber: '', dcasaNumber: '',
    debtCounsellorName: '', directorName: '', directorIdNumber: '',
    addressLine1: '', addressLine2: '', city: '', postalCode: '',
    phone: '', phoneInternational: '', cell: '', email: '', debtReviewEmail: '', debtReviewPhone: '',
    website: '', websiteUrl: '', primaryColor: '', accentColor: '', logoUrl: '',
    bankName: '', bankAccountHolder: '', bankAccountNumber: '', bankBranchCode: '', bankAccountType: '',
};

function fromProfile(p: CompanyProfile): FormState {
    return {
        legalName: p.legalName,
        tradingName: p.tradingName,
        shortName: p.shortName,
        tagline: p.tagline ?? '',
        registrationNumber: p.registrationNumber ?? '',
        vatNumber: p.vatNumber ?? '',
        ncrdcNumber: p.ncrdcNumber ?? '',
        dcasaNumber: p.dcasaNumber ?? '',
        debtCounsellorName: p.debtCounsellorName ?? '',
        directorName: p.directorName ?? '',
        directorIdNumber: p.directorIdNumber ?? '',
        addressLine1: p.addressLine1,
        addressLine2: p.addressLine2 ?? '',
        city: p.city,
        postalCode: p.postalCode,
        phone: p.phone,
        phoneInternational: p.phoneInternational,
        cell: p.cell ?? '',
        email: p.email,
        debtReviewEmail: p.debtReviewEmail ?? '',
        debtReviewPhone: p.debtReviewPhone ?? '',
        website: p.website,
        websiteUrl: p.websiteUrl,
        primaryColor: p.primaryColor,
        accentColor: p.accentColor,
        logoUrl: p.logoUrl ?? '',
        bankName: p.bank?.bankName ?? '',
        bankAccountHolder: p.bank?.accountHolder ?? '',
        bankAccountNumber: p.bank?.accountNumber ?? '',
        bankBranchCode: p.bank?.branchCode ?? '',
        bankAccountType: p.bank?.accountType ?? '',
    };
}

type Group = { title: string; hint?: string; fields: Array<{ key: keyof FormState; label: string; placeholder?: string; type?: string }> };

const GROUPS: Group[] = [
    {
        title: 'Identity',
        fields: [
            { key: 'legalName', label: 'Registered legal name', placeholder: 'Zenowethu Debt Management (PTY) LTD' },
            { key: 'tradingName', label: 'Trading name (used in letters & emails)', placeholder: 'Zenowethu Debt Management' },
            { key: 'shortName', label: 'Short brand name', placeholder: 'Zenowethu' },
            { key: 'tagline', label: 'Tagline (email header)', placeholder: 'Debt Management | Insurance | Financial Services' },
        ],
    },
    {
        title: 'Registrations',
        hint: 'Leave the NCRDC number blank for a firm that is not a registered debt counsellor — NCR lines are then omitted from documents.',
        fields: [
            { key: 'registrationNumber', label: 'Company registration no.', placeholder: '2013/121120/07' },
            { key: 'vatNumber', label: 'VAT number', placeholder: '4590307072' },
            { key: 'ncrdcNumber', label: 'NCRDC number', placeholder: 'NCRDC3693' },
            { key: 'dcasaNumber', label: 'DCASA membership no.', placeholder: '0863' },
            { key: 'debtCounsellorName', label: 'Registered debt counsellor', placeholder: 'Aaron Nzotho' },
            { key: 'directorName', label: 'Director (POA preamble)', placeholder: 'Aaron Nzotho' },
            { key: 'directorIdNumber', label: 'Director ID number', placeholder: '13 digits' },
        ],
    },
    {
        title: 'Address',
        fields: [
            { key: 'addressLine1', label: 'Address line 1', placeholder: 'Suite 2, 2nd Floor, Central House' },
            { key: 'addressLine2', label: 'Address line 2', placeholder: '17 Central Road' },
            { key: 'city', label: 'City / town', placeholder: 'Mabopane' },
            { key: 'postalCode', label: 'Postal code', placeholder: '0190' },
        ],
    },
    {
        title: 'Contact',
        fields: [
            { key: 'phone', label: 'Phone (local)', placeholder: '081 747 7616' },
            { key: 'phoneInternational', label: 'Phone (international)', placeholder: '+27 81 747 7616' },
            { key: 'cell', label: 'Cell', placeholder: '082 363 8207' },
            { key: 'email', label: 'Notifications email', placeholder: 'notifications@example.co.za', type: 'email' },
            { key: 'debtReviewEmail', label: 'Debt review mailbox (NCA forms)', placeholder: 'debtreview@example.co.za', type: 'email' },
            { key: 'debtReviewPhone', label: 'Debt review phone (NCA forms)', placeholder: '+27 81 747 7616' },
            { key: 'website', label: 'Website (display)', placeholder: 'www.example.co.za' },
            { key: 'websiteUrl', label: 'Website URL', placeholder: 'https://www.example.co.za', type: 'url' },
        ],
    },
    {
        title: 'Brand',
        fields: [
            { key: 'primaryColor', label: 'Primary colour', placeholder: '#0B1D35' },
            { key: 'accentColor', label: 'Accent colour', placeholder: '#C4953A' },
            { key: 'logoUrl', label: 'Logo URL', placeholder: 'https://…/logo.png', type: 'url' },
        ],
    },
    {
        title: 'Banking (invoices & quotes)',
        hint: 'Used when an invoice has no bank account or staff banking selected. Clear the account number to omit banking from documents.',
        fields: [
            { key: 'bankName', label: 'Bank', placeholder: 'FNB' },
            { key: 'bankAccountHolder', label: 'Account holder', placeholder: 'Company (PTY) LTD' },
            { key: 'bankAccountNumber', label: 'Account number', placeholder: '62867268635' },
            { key: 'bankBranchCode', label: 'Branch code', placeholder: '250655' },
            { key: 'bankAccountType', label: 'Account type', placeholder: 'Business Cheque' },
        ],
    },
];

export default function CompanyProfileSection({ canEdit }: { canEdit: boolean }) {
    const [form, setForm] = useState<FormState>(EMPTY);
    const [initial, setInitial] = useState<FormState>(EMPTY);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [fieldErrors, setFieldErrors] = useState<Partial<Record<keyof FormState, string>>>({});
    const [success, setSuccess] = useState<string | null>(null);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const res = await fetch('/api/admin/settings/company-profile');
                if (!res.ok) throw new Error('Failed to load company profile');
                const data = await res.json();
                if (!cancelled) {
                    const state = fromProfile(data.profile);
                    setForm(state);
                    setInitial(state);
                }
            } catch (e) {
                if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load company profile');
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();
        return () => { cancelled = true; };
    }, []);

    const dirty = (Object.keys(form) as Array<keyof FormState>).some((k) => form[k] !== initial[k]);

    const handleSave = async () => {
        setSaving(true);
        setError(null);
        setSuccess(null);
        setFieldErrors({});
        // Send only changed fields; blank means "clear back to default".
        const payload: Record<string, string | null> = {};
        for (const k of Object.keys(form) as Array<keyof FormState>) {
            if (form[k] !== initial[k]) payload[k] = form[k].trim() === '' ? null : form[k];
        }
        try {
            const res = await fetch('/api/admin/settings/company-profile', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });
            const data = await res.json();
            if (res.status === 422 && data.issues) {
                const errs: Partial<Record<keyof FormState, string>> = {};
                for (const [k, msgs] of Object.entries(data.issues as Record<string, string[]>)) {
                    errs[k as keyof FormState] = msgs?.[0] ?? 'Invalid value';
                }
                setFieldErrors(errs);
                setError('Please fix the highlighted fields.');
                return;
            }
            if (!res.ok) {
                setError(data.error || 'Failed to save company profile');
                return;
            }
            const state = fromProfile(data.profile);
            setForm(state);
            setInitial(state);
            setSuccess('Company profile saved. Documents and emails generated from now on use these details.');
        } catch {
            setError('An error occurred while saving the company profile');
        } finally {
            setSaving(false);
        }
    };

    return (
        <section className="bg-zeno-blue/30 border border-zeno-blue/50 rounded-xl p-6">
            <div className="flex items-center gap-4 mb-6">
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-orange-500 to-amber-500 flex items-center justify-center text-white text-2xl">
                    🏢
                </div>
                <div>
                    <div className="flex items-center gap-3">
                        <h2 className="text-xl font-bold text-white">Company Profile</h2>
                        <span className="px-2 py-0.5 text-xs font-semibold bg-orange-500/20 text-orange-400 border border-orange-500/40 rounded-full">
                            {canEdit ? 'Admin only' : 'Read only'}
                        </span>
                    </div>
                    <p className="text-gray-400 text-sm mt-0.5">
                        The firm named on every letter, PDF, email, SMS and AI prompt — NCRDC, address, banking and branding.
                        Blank fields fall back to the platform defaults.
                    </p>
                </div>
            </div>

            {loading ? (
                <div className="text-sm text-gray-400 py-6 text-center">Loading company profile…</div>
            ) : (
                <>
                    {error && (
                        <div className="mb-4 px-4 py-3 rounded-lg bg-red-500/10 border border-red-500/40 text-red-300 text-sm">{error}</div>
                    )}
                    {success && (
                        <div className="mb-4 px-4 py-3 rounded-lg bg-green-500/10 border border-green-500/40 text-green-300 text-sm">{success}</div>
                    )}

                    <div className="space-y-6">
                        {GROUPS.map((group) => (
                            <div key={group.title}>
                                <h3 className="text-sm font-semibold text-zeno-orange uppercase tracking-wide mb-1">{group.title}</h3>
                                {group.hint && <p className="text-xs text-gray-500 mb-3">{group.hint}</p>}
                                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                                    {group.fields.map((f) => (
                                        <div key={f.key}>
                                            <label className="block text-xs font-medium text-gray-400 mb-1">{f.label}</label>
                                            <input
                                                type={f.type ?? 'text'}
                                                value={form[f.key]}
                                                disabled={!canEdit}
                                                onChange={(e) => setForm((p) => ({ ...p, [f.key]: e.target.value }))}
                                                placeholder={f.placeholder}
                                                className={`w-full px-3 py-2 bg-black/30 border rounded-lg text-white text-sm focus:outline-none focus:border-zeno-orange disabled:opacity-60 ${
                                                    fieldErrors[f.key] ? 'border-red-500/60' : 'border-white/10'
                                                }`}
                                            />
                                            {fieldErrors[f.key] && <p className="text-xs text-red-400 mt-1">{fieldErrors[f.key]}</p>}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        ))}
                    </div>

                    {canEdit && (
                        <div className="flex justify-end mt-6">
                            <button
                                onClick={handleSave}
                                disabled={saving || !dirty}
                                className="px-5 py-2 bg-zeno-orange text-white text-sm font-bold rounded-lg hover:bg-orange-500 transition-colors disabled:opacity-50"
                            >
                                {saving ? 'Saving…' : dirty ? 'Save Company Profile' : 'No changes'}
                            </button>
                        </div>
                    )}
                </>
            )}
        </section>
    );
}

'use client';

import { useState, useEffect } from 'react';

type NcrdcData = {
    ncrdc_number: string;
    registered_name: string;
    registration_date: string;
    expiry_date: string;
    notes: string;
};

type RegistrationStatus = 'ACTIVE' | 'EXPIRING_SOON' | 'EXPIRED' | 'NOT_SET';

function getStatus(expiryDate: string): RegistrationStatus {
    if (!expiryDate) return 'NOT_SET';
    const expiry = new Date(expiryDate);
    const today = new Date();
    const daysUntilExpiry = Math.floor((expiry.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    if (daysUntilExpiry < 0) return 'EXPIRED';
    if (daysUntilExpiry <= 30) return 'EXPIRING_SOON';
    return 'ACTIVE';
}

function getDaysUntilExpiry(expiryDate: string): number {
    if (!expiryDate) return 0;
    const expiry = new Date(expiryDate);
    const today = new Date();
    return Math.floor((expiry.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

const STATUS_CONFIG: Record<RegistrationStatus, { label: string; colour: string; bg: string; border: string; icon: string }> = {
    ACTIVE:         { label: 'Active',          colour: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/30', icon: '✅' },
    EXPIRING_SOON:  { label: 'Expiring Soon',   colour: 'text-yellow-400',  bg: 'bg-yellow-500/10',  border: 'border-yellow-500/30',  icon: '⚠️' },
    EXPIRED:        { label: 'Expired',         colour: 'text-red-400',     bg: 'bg-red-500/10',     border: 'border-red-500/30',     icon: '🔴' },
    NOT_SET:        { label: 'Not Configured',  colour: 'text-gray-400',    bg: 'bg-gray-500/10',    border: 'border-gray-500/30',    icon: '⚪' },
};

export default function CompliancePage() {
    const [data, setData] = useState<NcrdcData>({
        ncrdc_number: '',
        registered_name: '',
        registration_date: '',
        expiry_date: '',
        notes: '',
    });
    const [editing, setEditing] = useState(false);
    const [draft, setDraft] = useState<NcrdcData>(data);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [lastUpdated, setLastUpdated] = useState<string | null>(null);
    const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

    useEffect(() => {
        fetchNcrdc();
    }, []);

    const fetchNcrdc = async () => {
        try {
            setLoading(true);
            const res = await fetch('/api/admin/compliance/ncrdc');
            if (res.ok) {
                const json = await res.json();
                const settings = json.settings as NcrdcData;
                setData(settings);
                setDraft(settings);
                if (json.lastUpdated) setLastUpdated(new Date(json.lastUpdated).toLocaleString('en-ZA'));
            }
        } catch {
            // silent
        } finally {
            setLoading(false);
        }
    };

    const handleSave = async () => {
        setSaving(true);
        setMessage(null);
        try {
            const res = await fetch('/api/admin/compliance/ncrdc', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(draft),
            });
            if (res.ok) {
                setData(draft);
                setEditing(false);
                setMessage({ type: 'success', text: 'NCRDC registration saved successfully.' });
                fetchNcrdc();
            } else {
                const err = await res.json();
                setMessage({ type: 'error', text: err.error || 'Failed to save.' });
            }
        } catch {
            setMessage({ type: 'error', text: 'An error occurred while saving.' });
        } finally {
            setSaving(false);
        }
    };

    const handleCancel = () => {
        setDraft(data);
        setEditing(false);
        setMessage(null);
    };

    const status = getStatus(data.expiry_date);
    const statusCfg = STATUS_CONFIG[status];
    const daysLeft = getDaysUntilExpiry(data.expiry_date);

    if (loading) {
        return (
            <div className="flex items-center justify-center py-24">
                <div className="animate-spin rounded-full h-10 w-10 border-4 border-zeno-cyan border-t-transparent" />
            </div>
        );
    }

    return (
        <div className="max-w-4xl mx-auto">
            {/* Header */}
            <div className="mb-8">
                <div className="flex items-center gap-3 mb-2">
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-zeno-cyan/20 to-blue-500/20 border border-zeno-cyan/30 flex items-center justify-center text-xl">
                        🛡️
                    </div>
                    <div>
                        <h1 className="text-2xl font-bold text-white">Compliance</h1>
                        <p className="text-gray-400 text-sm">NCR regulatory registration tracking</p>
                    </div>
                </div>
            </div>

            {/* Alert banner for expiry warnings */}
            {status === 'EXPIRED' && (
                <div className="mb-6 flex items-start gap-3 p-4 rounded-xl bg-red-500/10 border border-red-500/30 text-red-300">
                    <span className="text-xl mt-0.5">🔴</span>
                    <div>
                        <p className="font-semibold">NCRDC Registration Expired</p>
                        <p className="text-sm text-red-400 mt-0.5">Your NCRDC registration expired {Math.abs(daysLeft)} day{Math.abs(daysLeft) !== 1 ? 's' : ''} ago. Renew immediately to remain compliant with the NCA.</p>
                    </div>
                </div>
            )}
            {status === 'EXPIRING_SOON' && (
                <div className="mb-6 flex items-start gap-3 p-4 rounded-xl bg-yellow-500/10 border border-yellow-500/30 text-yellow-300">
                    <span className="text-xl mt-0.5">⚠️</span>
                    <div>
                        <p className="font-semibold">Registration Expiring in {daysLeft} day{daysLeft !== 1 ? 's' : ''}</p>
                        <p className="text-sm text-yellow-400 mt-0.5">Submit your renewal to the NCR before the expiry date to avoid a lapse in registration.</p>
                    </div>
                </div>
            )}

            {/* Toast message */}
            {message && (
                <div className={`mb-6 p-4 rounded-xl border text-sm font-medium ${message.type === 'success' ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300' : 'bg-red-500/10 border-red-500/30 text-red-300'}`}>
                    {message.text}
                </div>
            )}

            {/* NCRDC Registration Card */}
            <div className="bg-zeno-gray border border-white/10 rounded-2xl overflow-hidden">
                {/* Card header */}
                <div className="flex items-center justify-between p-6 border-b border-white/10">
                    <div className="flex items-center gap-3">
                        <div>
                            <h2 className="text-lg font-bold text-white">NCRDC Registration</h2>
                            <p className="text-gray-400 text-sm">National Credit Regulator Debt Counsellor registration</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-3">
                        {/* Status badge */}
                        <span className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold border ${statusCfg.bg} ${statusCfg.colour} ${statusCfg.border}`}>
                            <span>{statusCfg.icon}</span>
                            {statusCfg.label}
                        </span>
                        {!editing && (
                            <button
                                onClick={() => { setEditing(true); setMessage(null); }}
                                className="px-4 py-2 bg-zeno-cyan text-zeno-navy font-semibold rounded-lg hover:bg-cyan-400 transition-colors text-sm"
                            >
                                Edit
                            </button>
                        )}
                    </div>
                </div>

                {/* Card body */}
                <div className="p-6">
                    {!editing ? (
                        /* ─── View mode ─── */
                        <div className="space-y-5">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                                <Field label="NCRDC Number" value={data.ncrdc_number} highlight />
                                <Field label="Registered Name" value={data.registered_name} />
                                <Field label="Registration Date" value={data.registration_date ? new Date(data.registration_date).toLocaleDateString('en-ZA') : ''} />
                                <Field
                                    label="Expiry / Renewal Date"
                                    value={data.expiry_date ? new Date(data.expiry_date).toLocaleDateString('en-ZA') : ''}
                                    statusColour={statusCfg.colour}
                                />
                            </div>
                            {data.notes && (
                                <div>
                                    <p className="text-xs text-gray-500 uppercase tracking-wider font-semibold mb-1">Notes</p>
                                    <p className="text-gray-300 text-sm bg-zeno-navy/50 rounded-lg p-3">{data.notes}</p>
                                </div>
                            )}
                            {lastUpdated && (
                                <p className="text-xs text-gray-600 pt-2">Last updated: {lastUpdated}</p>
                            )}
                        </div>
                    ) : (
                        /* ─── Edit mode ─── */
                        <div className="space-y-5">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                                <InputField
                                    label="NCRDC Number"
                                    placeholder="e.g. NCRDC1234"
                                    value={draft.ncrdc_number}
                                    onChange={v => setDraft({ ...draft, ncrdc_number: v })}
                                />
                                <InputField
                                    label="Registered Name"
                                    placeholder="Full registered name"
                                    value={draft.registered_name}
                                    onChange={v => setDraft({ ...draft, registered_name: v })}
                                />
                                <InputField
                                    label="Registration Date"
                                    type="date"
                                    value={draft.registration_date}
                                    onChange={v => setDraft({ ...draft, registration_date: v })}
                                />
                                <InputField
                                    label="Expiry / Renewal Date"
                                    type="date"
                                    value={draft.expiry_date}
                                    onChange={v => setDraft({ ...draft, expiry_date: v })}
                                />
                            </div>
                            <div>
                                <label className="block text-xs text-gray-400 uppercase tracking-wider font-semibold mb-1.5">Notes (Optional)</label>
                                <textarea
                                    rows={3}
                                    value={draft.notes}
                                    onChange={e => setDraft({ ...draft, notes: e.target.value })}
                                    placeholder="Any additional compliance notes..."
                                    className="w-full px-4 py-3 bg-zeno-navy border border-white/10 rounded-lg text-white placeholder-gray-600 text-sm focus:outline-none focus:border-zeno-cyan transition-colors resize-none"
                                />
                            </div>

                            <div className="flex items-center gap-3 pt-2">
                                <button
                                    onClick={handleSave}
                                    disabled={saving}
                                    className="px-6 py-2.5 bg-zeno-cyan text-zeno-navy font-bold rounded-lg hover:bg-cyan-400 transition-colors disabled:opacity-50 text-sm"
                                >
                                    {saving ? 'Saving...' : 'Save Registration'}
                                </button>
                                <button
                                    onClick={handleCancel}
                                    disabled={saving}
                                    className="px-6 py-2.5 bg-white/5 text-gray-300 font-semibold rounded-lg hover:bg-white/10 transition-colors text-sm"
                                >
                                    Cancel
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* NCR info footer */}
            <div className="mt-6 p-4 rounded-xl bg-blue-500/5 border border-blue-500/20 flex items-start gap-3">
                <span className="text-blue-400 text-lg mt-0.5">ℹ️</span>
                <div className="text-sm text-gray-400">
                    <p className="font-medium text-gray-300 mb-1">About NCRDC Registration</p>
                    <p>Debt counsellors must be registered with the <strong className="text-white">National Credit Regulator (NCR)</strong> under the National Credit Act 34 of 2005. Your NCRDC number must appear on all correspondence with consumers and credit providers. Renew annually at <span className="text-zeno-cyan">ncrdebthelp.co.za</span>.</p>
                </div>
            </div>
        </div>
    );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function Field({ label, value, highlight, statusColour }: { label: string; value: string; highlight?: boolean; statusColour?: string }) {
    return (
        <div>
            <p className="text-xs text-gray-500 uppercase tracking-wider font-semibold mb-1">{label}</p>
            <p className={`text-sm font-medium ${statusColour ?? (highlight ? 'text-zeno-cyan font-bold text-base' : 'text-white')}`}>
                {value || <span className="text-gray-600 italic">Not set</span>}
            </p>
        </div>
    );
}

function InputField({ label, placeholder, value, onChange, type = 'text' }: {
    label: string;
    placeholder?: string;
    value: string;
    onChange: (v: string) => void;
    type?: string;
}) {
    return (
        <div>
            <label className="block text-xs text-gray-400 uppercase tracking-wider font-semibold mb-1.5">{label}</label>
            <input
                type={type}
                value={value}
                onChange={e => onChange(e.target.value)}
                placeholder={placeholder}
                className="w-full px-4 py-3 bg-zeno-navy border border-white/10 rounded-lg text-white placeholder-gray-600 text-sm focus:outline-none focus:border-zeno-cyan transition-colors"
            />
        </div>
    );
}

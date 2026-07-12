'use client';

import { useCallback, useEffect, useState } from 'react';
import { confirm, useSession } from '@zenowethu/ui';
import { isGmailMailbox } from '@/lib/mailboxes';

interface Mailbox {
    id: string;
    label: string;
    emailAddress: string;
    imapHost: string;
    imapPort: number;
    imapSecure: boolean;
    isDcCommunication: boolean;
    isActive: boolean;
    ownerUserId: string | null;
    notes: string | null;
    lastCheckedAt: string | null;
    updatedAt: string;
    hasPassword: boolean;
    passwordSource: 'own' | 'smtp' | null;
    ownerName: string | null;
}

function passwordBadge(m: Mailbox) {
    if (m.passwordSource === 'smtp') return { text: 'Password saved (from Email SMTP settings)', ok: true };
    if (m.hasPassword) return { text: 'Password saved', ok: true };
    return { text: 'No password — cannot search yet', ok: false };
}

function gmailBadge(emailAddress: string, imapHost: string) {
    if (!isGmailMailbox(emailAddress, imapHost)) return null;
    return (
        <span className="px-2 py-0.5 text-xs rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-300">
            Gmail: App Password required
        </span>
    );
}

function mailboxPasswordPlaceholder(m: Pick<Mailbox, 'emailAddress' | 'imapHost' | 'hasPassword'> | null, fallback: string): string {
    if (!m || !isGmailMailbox(m.emailAddress, m.imapHost)) return fallback;
    return m.hasPassword ? 'Paste new Google App Password to replace' : 'Paste Google App Password, not Gmail password';
}

interface MailboxListResponse {
    shared: Mailbox[];
    personal: Mailbox | null;
    otherPersonal: Mailbox[];
}

interface MailboxForm {
    label: string;
    emailAddress: string;
    imapHost: string;
    imapPort: string;
    imapSecure: boolean;
    isDcCommunication: boolean;
    password: string;
}

const EMPTY_FORM: MailboxForm = {
    label: '',
    emailAddress: '',
    imapHost: '',
    imapPort: '993',
    imapSecure: true,
    isDcCommunication: false,
    password: '',
};

function formToPayload(form: MailboxForm) {
    return {
        label: form.label.trim(),
        emailAddress: form.emailAddress.trim(),
        imapHost: form.imapHost.trim(),
        imapPort: Number(form.imapPort) || 993,
        imapSecure: form.imapSecure,
        isDcCommunication: form.isDcCommunication,
        ...(form.password.trim() ? { password: form.password } : {}),
    };
}

function mailboxToForm(m: Mailbox): MailboxForm {
    return {
        label: m.label,
        emailAddress: m.emailAddress,
        imapHost: m.imapHost,
        imapPort: String(m.imapPort),
        imapSecure: m.imapSecure,
        isDcCommunication: m.isDcCommunication,
        password: '',
    };
}

const inputCls =
    'w-full px-3 py-2 bg-zeno-dark/50 border border-zeno-blue/50 rounded-lg text-white text-sm placeholder-gray-500 focus:outline-none focus:border-zeno-cyan transition-colors';
const labelCls = 'block text-xs font-medium text-gray-400 mb-1';

function MailboxFormFields({
    form,
    setForm,
    showDcFlag,
    passwordPlaceholder,
}: {
    form: MailboxForm;
    setForm: (f: MailboxForm) => void;
    showDcFlag: boolean;
    passwordPlaceholder: string;
}) {
    const [showPassword, setShowPassword] = useState(false);
    const isGmail = isGmailMailbox(form.emailAddress, form.imapHost);
    return (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
                <label className={labelCls}>Label</label>
                <input type="text" value={form.label} onChange={e => setForm({ ...form, label: e.target.value })} className={inputCls} placeholder="e.g. Transfers" />
            </div>
            <div>
                <label className={labelCls}>Email Address</label>
                <input type="email" value={form.emailAddress} onChange={e => setForm({ ...form, emailAddress: e.target.value })} className={inputCls} placeholder="mailbox@zenowethu.co.za" />
            </div>
            <div>
                <label className={labelCls}>IMAP Host</label>
                <input type="text" value={form.imapHost} onChange={e => setForm({ ...form, imapHost: e.target.value })} className={inputCls} placeholder="mail.zenowethu.co.za or imap.gmail.com" />
            </div>
            <div className="grid grid-cols-2 gap-3">
                <div>
                    <label className={labelCls}>IMAP Port</label>
                    <input type="text" inputMode="numeric" value={form.imapPort} onChange={e => setForm({ ...form, imapPort: e.target.value.replace(/\D/g, '') })} className={inputCls} placeholder="993" />
                </div>
                <div className="flex items-end pb-2">
                    <label className="flex items-center gap-2 cursor-pointer select-none text-xs text-gray-300">
                        <input type="checkbox" checked={form.imapSecure} onChange={e => setForm({ ...form, imapSecure: e.target.checked })} className="w-4 h-4 rounded border-zeno-blue/50 bg-zeno-dark/50 accent-cyan-500" />
                        SSL/TLS
                    </label>
                </div>
            </div>
            <div>
                <label className={labelCls}>Mailbox Password</label>
                <div className="relative">
                    <input
                        type={showPassword ? 'text' : 'password'}
                        value={form.password}
                        onChange={e => setForm({ ...form, password: e.target.value })}
                        className={`${inputCls} pr-10`}
                        placeholder={passwordPlaceholder}
                    />
                    <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white transition-colors text-sm">
                        {showPassword ? '🙈' : '👁️'}
                    </button>
                </div>
                {isGmail && (
                    <p className="mt-1 text-xs text-amber-300">
                        Gmail requires a Google App Password here. The normal Gmail login password will fail.
                    </p>
                )}
            </div>
            {showDcFlag && (
                <div className="flex items-end pb-2">
                    <label className="flex items-center gap-2 cursor-pointer select-none text-xs text-gray-300">
                        <input type="checkbox" checked={form.isDcCommunication} onChange={e => setForm({ ...form, isDcCommunication: e.target.checked })} className="w-4 h-4 rounded border-zeno-blue/50 bg-zeno-dark/50 accent-amber-500" />
                        Used to communicate with other Debt Counsellors
                    </label>
                </div>
            )}
        </div>
    );
}

// Invoice-search mailbox management.
// mode="admin": full management of shared org mailboxes (incl. passwords) plus a
// read-only view of every user's personal mailbox — personal passwords stay
// owner-managed. mode="personal": the signed-in user's own mailbox only.
export default function MailboxSettings({ mode }: { mode: 'admin' | 'personal' }) {
    const { data: session } = useSession();
    const [data, setData] = useState<MailboxListResponse | null>(null);
    const [loading, setLoading] = useState(true);
    const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
    const [savingId, setSavingId] = useState<string | null>(null);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editForm, setEditForm] = useState<MailboxForm>(EMPTY_FORM);
    const [showAddShared, setShowAddShared] = useState(false);
    const [addForm, setAddForm] = useState<MailboxForm>(EMPTY_FORM);
    const [personalForm, setPersonalForm] = useState<MailboxForm>(EMPTY_FORM);
    const [editingPersonal, setEditingPersonal] = useState(false);
    const [testingId, setTestingId] = useState<string | null>(null);
    const [testResults, setTestResults] = useState<Record<string, { ok: boolean; text: string }>>({});

    const flash = (type: 'success' | 'error', text: string) => {
        setMessage({ type, text });
        setTimeout(() => setMessage(null), 6000);
    };

    const fetchMailboxes = useCallback(async () => {
        try {
            const res = await fetch('/api/admin/settings/mailboxes');
            if (res.ok) {
                const json: MailboxListResponse = await res.json();
                setData(json);
                if (json.personal) setPersonalForm(mailboxToForm(json.personal));
            } else {
                flash('error', 'Failed to load mailboxes');
            }
        } catch {
            flash('error', 'Network error loading mailboxes');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchMailboxes();
    }, [fetchMailboxes]);

    useEffect(() => {
        if (!loading && !data?.personal && session?.user?.email) {
            const email = session.user.email.trim();
            setPersonalForm(prev => {
                const emailAddress = prev.emailAddress === EMPTY_FORM.emailAddress ? email : prev.emailAddress;
                let imapHost = prev.imapHost;
                if (prev.imapHost === EMPTY_FORM.imapHost) {
                    if (email.toLowerCase().endsWith('@gmail.com') || email.toLowerCase().endsWith('@googlemail.com')) {
                        imapHost = 'imap.gmail.com';
                    } else {
                        const domain = email.split('@')[1];
                        if (domain) {
                            imapHost = `mail.${domain}`;
                        }
                    }
                }
                const label = prev.label === EMPTY_FORM.label ? 'My Mailbox' : prev.label;
                return {
                    ...prev,
                    emailAddress,
                    imapHost,
                    label,
                };
            });
        }
    }, [session?.user?.email, loading, data?.personal]);

    const patchMailbox = async (id: string, payload: Record<string, unknown>, successText: string) => {
        setSavingId(id);
        try {
            const res = await fetch(`/api/admin/settings/mailboxes/${id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });
            const json = await res.json();
            if (res.ok && json.success) {
                flash('success', successText);
                setEditingId(null);
                setEditingPersonal(false);
                await fetchMailboxes();
            } else {
                flash('error', json.error || 'Update failed');
            }
        } catch {
            flash('error', 'Network error — please try again');
        } finally {
            setSavingId(null);
        }
    };

    const createMailbox = async (scope: 'SHARED' | 'PERSONAL', form: MailboxForm) => {
        setSavingId(scope);
        try {
            const res = await fetch('/api/admin/settings/mailboxes', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ scope, ...formToPayload(form) }),
            });
            const json = await res.json();
            if (res.ok && json.success) {
                flash('success', scope === 'SHARED' ? 'Shared mailbox added' : 'Your mailbox has been registered');
                setShowAddShared(false);
                setAddForm(EMPTY_FORM);
                await fetchMailboxes();
            } else {
                const firstFieldError = json.details && Object.values(json.details as Record<string, string[]>)[0]?.[0];
                flash('error', json.error || firstFieldError || 'Failed to add mailbox');
            }
        } catch {
            flash('error', 'Network error — please try again');
        } finally {
            setSavingId(null);
        }
    };

    const testMailbox = async (m: Mailbox) => {
        setTestingId(m.id);
        setTestResults(prev => { const next = { ...prev }; delete next[m.id]; return next; });
        try {
            const res = await fetch(`/api/admin/settings/mailboxes/${m.id}/test`, { method: 'POST' });
            const json = await res.json();
            setTestResults(prev => ({
                ...prev,
                [m.id]: json.success
                    ? { ok: true, text: json.message || 'Connection successful' }
                    : { ok: false, text: json.error || 'Connection failed' },
            }));
        } catch {
            setTestResults(prev => ({ ...prev, [m.id]: { ok: false, text: 'Network error — please try again' } }));
        } finally {
            setTestingId(null);
        }
    };

    const testButton = (m: Mailbox) => (
        <button
            onClick={() => testMailbox(m)}
            disabled={testingId !== null || savingId !== null}
            className="text-xs text-sky-400 border border-sky-500/40 px-2.5 py-1 rounded hover:bg-sky-500/10 transition-colors disabled:opacity-50 flex items-center gap-1.5"
        >
            {testingId === m.id ? (
                <>
                    <span className="w-3 h-3 border-2 border-sky-400/40 border-t-sky-400 rounded-full animate-spin" />
                    Testing…
                </>
            ) : '🔌 Test'}
        </button>
    );

    const testResultLine = (m: Mailbox) => {
        const r = testResults[m.id];
        if (!r) return null;
        return (
            <div className={`mt-2 text-xs flex items-start gap-1.5 ${r.ok ? 'text-green-400' : 'text-red-400'}`}>
                <span>{r.ok ? '✅' : '❌'}</span>
                <span>{r.text}</span>
            </div>
        );
    };

    const deleteMailbox = async (m: Mailbox) => {
        const ok = await confirm({
            title: 'Remove mailbox',
            message: `Remove ${m.emailAddress}? The app will no longer search this inbox for invoices.`,
        });
        if (!ok) return;
        setSavingId(m.id);
        try {
            const res = await fetch(`/api/admin/settings/mailboxes/${m.id}`, { method: 'DELETE' });
            const json = await res.json();
            if (res.ok && json.success) {
                flash('success', 'Mailbox removed');
                await fetchMailboxes();
            } else {
                flash('error', json.error || 'Failed to remove mailbox');
            }
        } catch {
            flash('error', 'Network error — please try again');
        } finally {
            setSavingId(null);
        }
    };

    if (loading) {
        return (
            <div className="flex items-center gap-3 text-gray-400 text-sm py-4">
                <span className="w-4 h-4 border-2 border-cyan-400/40 border-t-cyan-400 rounded-full animate-spin" />
                Loading mailboxes…
            </div>
        );
    }

    const personal = data?.personal ?? null;
    const hasGmailMailboxes = Boolean(data && [...data.shared, data.personal, ...data.otherPersonal].some(m => m && isGmailMailbox(m.emailAddress, m.imapHost)));

    const renderPersonalCard = () => (
        <div className="bg-zeno-dark/30 border border-white/10 rounded-xl p-4">
            <div className="flex items-center justify-between mb-3">
                <div>
                    <h3 className="text-sm font-semibold text-white">My Invoice Search Mailbox</h3>
                    <p className="text-xs text-gray-500 mt-0.5">
                        Your own email account the app can search for DC fee invoices. Only you can set or change this password — not even Admin can.
                    </p>
                </div>
                {personal && !editingPersonal && (
                    <div className="flex items-center gap-2">
                        <span className={`px-2 py-0.5 text-xs rounded-full border ${passwordBadge(personal).ok ? 'bg-green-500/10 border-green-500/30 text-green-400' : 'bg-amber-500/10 border-amber-500/30 text-amber-400'}`}>
                            {passwordBadge(personal).text}
                        </span>
                        {gmailBadge(personal.emailAddress, personal.imapHost)}
                        {testButton(personal)}
                        <button onClick={() => { setPersonalForm(mailboxToForm(personal)); setEditingPersonal(true); }} className="text-xs text-cyan-400 border border-cyan-500/40 px-2.5 py-1 rounded hover:bg-cyan-500/10 transition-colors">
                            Edit
                        </button>
                    </div>
                )}
            </div>
            {personal && !editingPersonal ? (
                <div className="text-sm text-gray-300">
                    <span className="font-medium text-white">{personal.emailAddress}</span>
                    <span className="text-gray-500"> — {personal.imapHost}:{personal.imapPort}{personal.imapSecure ? ' (SSL)' : ''}</span>
                    {!personal.isActive && <span className="ml-2 text-xs text-red-400">(disabled)</span>}
                    {testResultLine(personal)}
                </div>
            ) : (
                <div className="space-y-3">
                    <MailboxFormFields
                        form={personalForm}
                        setForm={setPersonalForm}
                        showDcFlag={false}
                        passwordPlaceholder={mailboxPasswordPlaceholder(personal, personal?.hasPassword ? 'Enter new password to change' : 'Enter mailbox password')}
                    />
                    <div className="flex items-center gap-3">
                        <button
                            onClick={() =>
                                personal
                                    ? patchMailbox(personal.id, formToPayload(personalForm), 'Your mailbox has been updated')
                                    : createMailbox('PERSONAL', personalForm)
                            }
                            disabled={savingId !== null}
                            className="px-4 py-2 text-sm bg-gradient-to-r from-cyan-600 to-blue-600 text-white font-semibold rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50"
                        >
                            {savingId ? 'Saving…' : personal ? 'Save My Mailbox' : 'Register My Mailbox'}
                        </button>
                        {personal && editingPersonal && (
                            <button onClick={() => setEditingPersonal(false)} className="px-4 py-2 text-sm text-gray-400 border border-white/10 rounded-lg hover:bg-white/5 transition-colors">
                                Cancel
                            </button>
                        )}
                    </div>
                </div>
            )}
        </div>
    );

    return (
        <div className="space-y-4">
            {message && (
                <div className={`p-3 rounded-lg border text-sm ${message.type === 'success' ? 'bg-green-500/10 border-green-500/30 text-green-400' : 'bg-red-500/10 border-red-500/30 text-red-400'}`}>
                    {message.text}
                </div>
            )}

            {hasGmailMailboxes && (
                <div className="p-3 rounded-lg border border-amber-500/30 bg-amber-500/10 text-amber-200 text-sm">
                    Gmail mailboxes must be saved with a Google App Password. The normal Gmail login password will fail for IMAP tests and invoice searches.
                </div>
            )}

            {mode === 'admin' && (
                <>
                    <div className="space-y-3">
                        {(data?.shared ?? []).map(m => (
                            <div key={m.id} className={`bg-zeno-dark/30 border rounded-xl p-4 ${m.isActive ? 'border-white/10' : 'border-red-500/20 opacity-70'}`}>
                                <div className="flex flex-wrap items-center justify-between gap-3">
                                    <div className="min-w-0">
                                        <div className="flex items-center gap-2 flex-wrap">
                                            <span className="font-semibold text-white text-sm">{m.label}</span>
                                            {m.isDcCommunication && (
                                                <span className="px-2 py-0.5 text-xs rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-400">DC communication</span>
                                            )}
                                            <span className={`px-2 py-0.5 text-xs rounded-full border ${passwordBadge(m).ok ? 'bg-green-500/10 border-green-500/30 text-green-400' : 'bg-amber-500/10 border-amber-500/30 text-amber-400'}`}>
                                                {passwordBadge(m).text}
                                            </span>
                                            {gmailBadge(m.emailAddress, m.imapHost)}
                                            {!m.isActive && <span className="px-2 py-0.5 text-xs rounded-full bg-red-500/10 border border-red-500/30 text-red-400">Disabled</span>}
                                        </div>
                                        <div className="text-sm text-gray-400 mt-1 truncate">
                                            {m.emailAddress} <span className="text-gray-600">— {m.imapHost}:{m.imapPort}{m.imapSecure ? ' (SSL)' : ''}</span>
                                        </div>
                                        {testResultLine(m)}
                                    </div>
                                    <div className="flex items-center gap-2">
                                        {testButton(m)}
                                        <button
                                            onClick={() => patchMailbox(m.id, { isActive: !m.isActive }, m.isActive ? 'Mailbox disabled' : 'Mailbox enabled')}
                                            disabled={savingId !== null}
                                            className="text-xs text-gray-300 border border-white/10 px-2.5 py-1 rounded hover:bg-white/5 transition-colors disabled:opacity-50"
                                        >
                                            {m.isActive ? 'Disable' : 'Enable'}
                                        </button>
                                        <button
                                            onClick={() => {
                                                if (editingId === m.id) { setEditingId(null); return; }
                                                setEditForm(mailboxToForm(m));
                                                setEditingId(m.id);
                                            }}
                                            disabled={savingId !== null}
                                            className="text-xs text-cyan-400 border border-cyan-500/40 px-2.5 py-1 rounded hover:bg-cyan-500/10 transition-colors disabled:opacity-50"
                                        >
                                            {editingId === m.id ? 'Close' : 'Edit / Set password'}
                                        </button>
                                        <button
                                            onClick={() => deleteMailbox(m)}
                                            disabled={savingId !== null}
                                            className="text-xs text-red-400 border border-red-500/40 px-2.5 py-1 rounded hover:bg-red-500/10 transition-colors disabled:opacity-50"
                                        >
                                            Remove
                                        </button>
                                    </div>
                                </div>
                                {editingId === m.id && (
                                    <div className="mt-4 pt-4 border-t border-white/10 space-y-3">
                                        <MailboxFormFields
                                            form={editForm}
                                            setForm={setEditForm}
                                            showDcFlag
                                            passwordPlaceholder={mailboxPasswordPlaceholder(m, m.hasPassword ? 'Enter new password to change' : 'Enter mailbox password')}
                                        />
                                        <button
                                            onClick={() => patchMailbox(m.id, formToPayload(editForm), `${editForm.emailAddress || m.emailAddress} updated`)}
                                            disabled={savingId !== null}
                                            className="px-4 py-2 text-sm bg-gradient-to-r from-cyan-600 to-blue-600 text-white font-semibold rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50"
                                        >
                                            {savingId === m.id ? 'Saving…' : 'Save Mailbox'}
                                        </button>
                                    </div>
                                )}
                            </div>
                        ))}
                        {(data?.shared ?? []).length === 0 && (
                            <p className="text-sm text-gray-500">No shared mailboxes registered yet.</p>
                        )}
                    </div>

                    {showAddShared ? (
                        <div className="bg-zeno-dark/30 border border-cyan-500/20 rounded-xl p-4 space-y-3">
                            <h3 className="text-sm font-semibold text-white">Add Shared Mailbox</h3>
                            <MailboxFormFields form={addForm} setForm={setAddForm} showDcFlag passwordPlaceholder={isGmailMailbox(addForm.emailAddress, addForm.imapHost) ? 'Paste Google App Password, not Gmail password' : 'Enter mailbox password (can be set later)'} />
                            <div className="flex items-center gap-3">
                                <button
                                    onClick={() => createMailbox('SHARED', addForm)}
                                    disabled={savingId !== null}
                                    className="px-4 py-2 text-sm bg-gradient-to-r from-cyan-600 to-blue-600 text-white font-semibold rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50"
                                >
                                    {savingId === 'SHARED' ? 'Adding…' : 'Add Mailbox'}
                                </button>
                                <button onClick={() => setShowAddShared(false)} className="px-4 py-2 text-sm text-gray-400 border border-white/10 rounded-lg hover:bg-white/5 transition-colors">
                                    Cancel
                                </button>
                            </div>
                        </div>
                    ) : (
                        <button onClick={() => setShowAddShared(true)} className="text-sm text-cyan-400 border border-cyan-500/40 px-3 py-1.5 rounded-lg hover:bg-cyan-500/10 transition-colors">
                            + Add shared mailbox
                        </button>
                    )}

                    {(data?.otherPersonal ?? []).length > 0 && (
                        <div className="bg-zeno-dark/30 border border-white/10 rounded-xl p-4">
                            <h3 className="text-sm font-semibold text-white mb-1">Staff Personal Mailboxes</h3>
                            <p className="text-xs text-gray-500 mb-3">
                                Each staff member manages their own mailbox and password from Account Settings. You can only enable or disable them here.
                            </p>
                            <div className="space-y-2">
                                {(data?.otherPersonal ?? []).map(m => (
                                    <div key={m.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                                        <div className="text-gray-300">
                                            <span className="text-white">{m.ownerName}</span>
                                            <span className="text-gray-500"> — {m.emailAddress}</span>
                                            <span className={`ml-2 px-2 py-0.5 text-xs rounded-full border ${passwordBadge(m).ok ? 'bg-green-500/10 border-green-500/30 text-green-400' : 'bg-amber-500/10 border-amber-500/30 text-amber-400'}`}>
                                                {passwordBadge(m).text}
                                            </span>
                                            {gmailBadge(m.emailAddress, m.imapHost)}
                                            {!m.isActive && <span className="ml-2 text-xs text-red-400">(disabled)</span>}
                                        </div>
                                        <button
                                            onClick={() => patchMailbox(m.id, { isActive: !m.isActive }, m.isActive ? 'Mailbox disabled' : 'Mailbox enabled')}
                                            disabled={savingId !== null}
                                            className="text-xs text-gray-300 border border-white/10 px-2.5 py-1 rounded hover:bg-white/5 transition-colors disabled:opacity-50"
                                        >
                                            {m.isActive ? 'Disable' : 'Enable'}
                                        </button>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </>
            )}

            {renderPersonalCard()}
        </div>
    );
}

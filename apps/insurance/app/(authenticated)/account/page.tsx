'use client';

import { useState, useEffect } from 'react';
import { useSession } from '@zenowethu/ui';
import { useRouter } from 'next/navigation';
import { logger } from '@zenowethu/shared-lib/src/logger';

// ─── DCCP Credentials Section ─────────────────────────────────────────────────

function DCCPCredentialsSection() {
    const [status, setStatus] = useState<{
        isConfigured: boolean;
        usernameDisplay?: string;
        portalUrl?: string;
        lastUpdated?: string;
    } | null>(null);

    const [form, setForm] = useState({
        username: '',
        password: '',
        confirmPassword: '',
        portalUrl: 'https://portal.colms.co.za/arsys/shared/login.jsp?/arsys/',
        useDemo: false,
    });

    const [showPassword, setShowPassword] = useState(false);
    const [saving, setSaving] = useState(false);
    const [removing, setRemoving] = useState(false);
    const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
    const [showForm, setShowForm] = useState(false);

    useEffect(() => {
        fetch('/api/dccp/credentials')
            .then(r => r.json())
            .then(data => {
                setStatus(data);
                if (data.portalUrl) setForm(f => ({ ...f, portalUrl: data.portalUrl }));
            })
            .catch(err => logger.error('Failed to fetch DCCP credential status', err));
    }, []);

    function handleDemoToggle(e: React.ChangeEvent<HTMLInputElement>) {
        const demo = e.target.checked;
        setForm(f => ({
            ...f,
            useDemo: demo,
            portalUrl: demo
                ? 'https://demo.pontis.co.za/arsys'
                : 'https://portal.colms.co.za/arsys/shared/login.jsp?/arsys/',
        }));
    }

    async function handleSave(e: React.FormEvent) {
        e.preventDefault();
        setMessage(null);

        if (!form.username.trim()) { setMessage({ type: 'error', text: 'Username is required' }); return; }
        if (!form.password.trim()) { setMessage({ type: 'error', text: 'Password is required' }); return; }
        if (form.password !== form.confirmPassword) { setMessage({ type: 'error', text: 'Passwords do not match' }); return; }

        setSaving(true);
        try {
            const res = await fetch('/api/dccp/credentials', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    username: form.username,
                    password: form.password,
                    portalUrl: form.portalUrl,
                }),
            });
            const data = await res.json();
            if (res.ok) {
                setMessage({ type: 'success', text: 'DCCP credentials saved successfully.' });
                setStatus({ isConfigured: true, usernameDisplay: data.username, portalUrl: data.portalUrl, lastUpdated: data.updatedAt });
                setForm(f => ({ ...f, password: '', confirmPassword: '' }));
                setShowForm(false);
            } else {
                setMessage({ type: 'error', text: data.error ?? 'Failed to save credentials' });
            }
        } catch {
            setMessage({ type: 'error', text: 'An unexpected error occurred' });
        } finally {
            setSaving(false);
        }
    }

    async function handleRemove() {
        if (!confirm('Remove your DCCP portal credentials? You will need to re-enter them to use portal automation.')) return;
        setRemoving(true);
        try {
            const res = await fetch('/api/dccp/credentials', { method: 'DELETE' });
            if (res.ok) {
                setStatus({ isConfigured: false });
                setForm(f => ({ ...f, username: '', password: '', confirmPassword: '' }));
                setMessage({ type: 'success', text: 'DCCP credentials removed.' });
            }
        } catch {
            setMessage({ type: 'error', text: 'Failed to remove credentials' });
        } finally {
            setRemoving(false);
        }
    }

    return (
        <section>
            <h2 className="text-xl font-semibold mb-2 text-zeno-cyan flex items-center gap-2">
                <span className="w-8 h-8 rounded-full bg-zeno-cyan/10 flex items-center justify-center text-sm">4</span>
                DC Credit Protect — Portal Credentials
            </h2>
            <p className="text-sm text-gray-400 mb-6">
                Enter your personal DCCP portal login. These are used to automatically submit policies to the COLMS system on your behalf. Each staff member uses their own credentials.
            </p>

            {/* Status badge */}
            {status !== null && (
                <div className={`flex items-center justify-between p-4 rounded-xl border mb-5 ${status.isConfigured ? 'bg-green-500/10 border-green-500/20' : 'bg-yellow-500/10 border-yellow-500/20'}`}>
                    <div className="flex items-center gap-3">
                        <span className={`text-xl ${status.isConfigured ? 'text-green-400' : 'text-yellow-400'}`}>
                            {status.isConfigured ? '🔐' : '⚠️'}
                        </span>
                        <div>
                            <p className={`font-medium text-sm ${status.isConfigured ? 'text-green-400' : 'text-yellow-400'}`}>
                                {status.isConfigured ? 'Credentials configured' : 'No credentials saved yet'}
                            </p>
                            {status.isConfigured && (
                                <p className="text-xs text-gray-400">
                                    Username: <span className="text-white font-mono">{status.usernameDisplay}</span>
                                    {status.portalUrl?.includes('demo') && <span className="ml-2 px-1.5 py-0.5 bg-purple-500/20 text-purple-400 text-xs rounded">Demo Portal</span>}
                                    {status.lastUpdated && <span className="ml-2 text-gray-500">· Updated {new Date(status.lastUpdated).toLocaleDateString('en-ZA')}</span>}
                                </p>
                            )}
                        </div>
                    </div>
                    <div className="flex gap-2">
                        <button
                            type="button"
                            onClick={() => setShowForm(v => !v)}
                            className="px-3 py-1.5 text-xs font-medium bg-white/5 hover:bg-white/10 text-gray-300 rounded-lg transition-all"
                        >
                            {showForm ? 'Cancel' : status.isConfigured ? 'Update' : 'Add Credentials'}
                        </button>
                        {status.isConfigured && !showForm && (
                            <button
                                type="button"
                                onClick={handleRemove}
                                disabled={removing}
                                className="px-3 py-1.5 text-xs font-medium bg-red-500/10 hover:bg-red-500/20 text-red-400 rounded-lg transition-all"
                            >
                                {removing ? 'Removing…' : 'Remove'}
                            </button>
                        )}
                    </div>
                </div>
            )}

            {/* Credential form */}
            {showForm && (
                <form onSubmit={handleSave} className="bg-black/20 border border-white/10 rounded-xl p-6 space-y-5">
                    {/* Portal selector */}
                    <div className="flex items-center justify-between p-3 bg-zeno-blue/30 rounded-lg border border-white/5">
                        <div>
                            <p className="text-sm font-medium text-white">Use Demo Portal</p>
                            <p className="text-xs text-gray-400">demo.pontis.co.za — for training and testing</p>
                        </div>
                        <label className="relative inline-flex items-center cursor-pointer">
                            <input type="checkbox" checked={form.useDemo} onChange={handleDemoToggle} className="sr-only peer" />
                            <div className="w-10 h-5 bg-white/10 peer-checked:bg-zeno-cyan rounded-full transition-all after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:after:translate-x-5" />
                        </label>
                    </div>

                    <div className="p-3 bg-black/20 border border-white/5 rounded-lg">
                        <p className="text-xs text-gray-400">Portal URL</p>
                        <p className="text-sm text-white font-mono mt-0.5 break-all">{form.portalUrl}</p>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <label className="text-sm font-medium text-gray-400">DCCP Username</label>
                            <input
                                type="text"
                                value={form.username}
                                onChange={e => setForm(f => ({ ...f, username: e.target.value }))}
                                placeholder="Your DCCP portal username"
                                autoComplete="username"
                                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-zeno-cyan transition-colors"
                            />
                        </div>
                        <div className="space-y-2">
                            <label className="text-sm font-medium text-gray-400">DCCP Password</label>
                            <div className="relative">
                                <input
                                    type={showPassword ? 'text' : 'password'}
                                    value={form.password}
                                    onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                                    placeholder="Your DCCP portal password"
                                    autoComplete="new-password"
                                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-zeno-cyan transition-colors pr-12"
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowPassword(v => !v)}
                                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white text-xs"
                                >
                                    {showPassword ? 'Hide' : 'Show'}
                                </button>
                            </div>
                        </div>
                        <div className="space-y-2 md:col-span-2">
                            <label className="text-sm font-medium text-gray-400">Confirm Password</label>
                            <input
                                type="password"
                                value={form.confirmPassword}
                                onChange={e => setForm(f => ({ ...f, confirmPassword: e.target.value }))}
                                placeholder="Re-enter your DCCP portal password"
                                autoComplete="new-password"
                                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-zeno-cyan transition-colors"
                            />
                        </div>
                    </div>

                    {message && (
                        <div className={`p-3 rounded-lg text-sm border ${message.type === 'success' ? 'bg-green-500/10 border-green-500/20 text-green-400' : 'bg-red-500/10 border-red-500/20 text-red-400'}`}>
                            {message.text}
                        </div>
                    )}

                    <div className="flex gap-3">
                        <button
                            type="submit"
                            disabled={saving}
                            className="flex-1 py-3 bg-zeno-cyan hover:bg-cyan-400 text-zeno-navy font-bold rounded-xl transition-all disabled:opacity-50"
                        >
                            {saving ? 'Saving…' : 'Save DCCP Credentials'}
                        </button>
                        <button
                            type="button"
                            onClick={() => setShowForm(false)}
                            className="px-6 py-3 bg-white/5 hover:bg-white/10 text-gray-400 rounded-xl transition-all"
                        >
                            Cancel
                        </button>
                    </div>
                </form>
            )}

            {!showForm && message && (
                <div className={`p-3 rounded-lg text-sm border ${message.type === 'success' ? 'bg-green-500/10 border-green-500/20 text-green-400' : 'bg-red-500/10 border-red-500/20 text-red-400'}`}>
                    {message.text}
                </div>
            )}
        </section>
    );
}

export default function AccountSettings() {
    const { data: session, update } = useSession();
    const router = useRouter();

    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [message, setMessage] = useState({ type: '', text: '' });

    const [formData, setFormData] = useState({
        firstName: '',
        lastName: '',
        email: '',
        phone: '',
        avatarUrl: '',
        currentPassword: '',
        newPassword: '',
        confirmPassword: '' });

    useEffect(() => {
        async function fetchProfile() {
            try {
                const res = await fetch('/api/users/profile');
                if (res.ok) {
                    const data = await res.json();
                    setFormData(prev => ({
                        ...prev,
                        firstName: data.firstName || '',
                        lastName: data.lastName || '',
                        email: data.email || '',
                        phone: data.phone || '',
                        avatarUrl: data.avatarUrl || '' }));
                }
            } catch (error) {
                logger.error('Error fetching profile:', error);
            } finally {
                setLoading(false);
            }
        }
        fetchProfile();
    }, []);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setMessage({ type: '', text: '' });

        if (formData.newPassword && formData.newPassword !== formData.confirmPassword) {
            setMessage({ type: 'error', text: 'New passwords do not match' });
            return;
        }

        setSaving(true);
        try {
            const res = await fetch('/api/users/profile', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    firstName: formData.firstName,
                    lastName: formData.lastName,
                    email: formData.email,
                    phone: formData.phone,
                    avatarUrl: formData.avatarUrl,
                    currentPassword: formData.currentPassword,
                    newPassword: formData.newPassword }) });

            const result = await res.json();
            if (res.ok) {
                setMessage({ type: 'success', text: 'Profile updated successfully!' });
                // Reset password fields
                setFormData(prev => ({
                    ...prev,
                    currentPassword: '',
                    newPassword: '',
                    confirmPassword: '' }));
                // Update session
                await update({
                    ...session,
                    user: {
                        ...session?.user,
                        firstName: formData.firstName,
                        lastName: formData.lastName,
                        email: formData.email }
                });
            } else {
                setMessage({ type: 'error', text: result.error || 'Failed to update profile' });
            }
        } catch (error) {
            setMessage({ type: 'error', text: 'An unexpected error occurred' });
        } finally {
            setSaving(false);
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-[60vh]">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-zeno-cyan"></div>
            </div>
        );
    }

    return (
        <div className="max-w-4xl mx-auto py-8">
            <h1 className="text-3xl font-bold mb-8 text-white">Account Settings</h1>

            <div className="bg-zeno-gray border border-white/10 rounded-2xl overflow-hidden shadow-2xl">
                <form onSubmit={handleSubmit} className="p-8 space-y-8">
                    {/* Profile Section */}
                    <section>
                        <h2 className="text-xl font-semibold mb-6 text-zeno-cyan flex items-center gap-2">
                            <span className="w-8 h-8 rounded-full bg-zeno-cyan/10 flex items-center justify-center text-sm">1</span>
                            Personal Information
                        </h2>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div className="space-y-2">
                                <label className="text-sm font-medium text-gray-400">First Name</label>
                                <input
                                    type="text"
                                    name="firstName"
                                    value={formData.firstName}
                                    onChange={handleChange}
                                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-zeno-cyan transition-colors"
                                    required
                                />
                            </div>
                            <div className="space-y-2">
                                <label className="text-sm font-medium text-gray-400">Last Name</label>
                                <input
                                    type="text"
                                    name="lastName"
                                    value={formData.lastName}
                                    onChange={handleChange}
                                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-zeno-cyan transition-colors"
                                    required
                                />
                            </div>
                            <div className="space-y-2">
                                <label className="text-sm font-medium text-gray-400">Email Address</label>
                                <input
                                    type="email"
                                    name="email"
                                    value={formData.email}
                                    onChange={handleChange}
                                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-zeno-cyan transition-colors"
                                    required
                                />
                            </div>
                            <div className="space-y-2">
                                <label className="text-sm font-medium text-gray-400">Phone Number (Optional)</label>
                                <input
                                    type="tel"
                                    name="phone"
                                    value={formData.phone}
                                    onChange={handleChange}
                                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-zeno-cyan transition-colors"
                                />
                            </div>
                        </div>
                    </section>

                    <div className="h-px bg-white/5"></div>

                    {/* Avatar Section */}
                    <section>
                        <h2 className="text-xl font-semibold mb-6 text-zeno-cyan flex items-center gap-2">
                            <span className="w-8 h-8 rounded-full bg-zeno-cyan/10 flex items-center justify-center text-sm">2</span>
                            Profile Picture
                        </h2>

                        <div className="flex items-center gap-8">
                            <div className="relative group">
                                <div className="w-24 h-24 rounded-full bg-gradient-to-br from-zeno-cyan to-blue-600 flex items-center justify-center text-2xl font-bold text-white overflow-hidden border-4 border-white/5 shadow-xl">
                                    {formData.avatarUrl ? (
                                        <img src={formData.avatarUrl} alt="Avatar" className="w-full h-full object-cover" />
                                    ) : (
                                        <span>{formData.firstName[0]}{formData.lastName[0]}</span>
                                    )}
                                </div>
                            </div>

                            <div className="flex-1 space-y-2">
                                <label className="text-sm font-medium text-gray-400">Avatar URL</label>
                                <input
                                    type="url"
                                    name="avatarUrl"
                                    value={formData.avatarUrl}
                                    onChange={handleChange}
                                    placeholder="https://example.com/photo.jpg"
                                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-zeno-cyan transition-colors"
                                />
                                <p className="text-xs text-gray-500 italic">Enter a direct link to an image. Profile pictures make the dashboard feel more personal.</p>
                            </div>
                        </div>
                    </section>

                    <div className="h-px bg-white/5"></div>

                    {/* Password Section */}
                    <section>
                        <h2 className="text-xl font-semibold mb-6 text-zeno-orange flex items-center gap-2">
                            <span className="w-8 h-8 rounded-full bg-zeno-orange/10 flex items-center justify-center text-sm">3</span>
                            Security
                        </h2>

                        <div className="space-y-6">
                            <div className="space-y-2">
                                <label className="text-sm font-medium text-gray-400">Current Password</label>
                                <input
                                    type="password"
                                    name="currentPassword"
                                    value={formData.currentPassword}
                                    onChange={handleChange}
                                    placeholder="Required to change password"
                                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-zeno-cyan transition-colors"
                                />
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <div className="space-y-2">
                                    <label className="text-sm font-medium text-gray-400">New Password</label>
                                    <input
                                        type="password"
                                        name="newPassword"
                                        value={formData.newPassword}
                                        onChange={handleChange}
                                        className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-zeno-cyan transition-colors"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-sm font-medium text-gray-400">Confirm New Password</label>
                                    <input
                                        type="password"
                                        name="confirmPassword"
                                        value={formData.confirmPassword}
                                        onChange={handleChange}
                                        className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-zeno-cyan transition-colors"
                                    />
                                </div>
                            </div>
                        </div>
                    </section>

                    {message.text && (
                        <div className={`p-4 rounded-xl text-center text-sm font-medium border ${message.type === 'success'
                                ? 'bg-green-500/10 border-green-500/20 text-green-400'
                                : 'bg-red-500/10 border-red-500/20 text-red-400'
                            }`}>
                            {message.text}
                        </div>
                    )}

                    <div className="pt-4">
                        <button
                            type="submit"
                            disabled={saving}
                            className={`w-full py-4 rounded-xl font-bold text-white transition-all shadow-lg ${saving
                                    ? 'bg-gray-600 cursor-not-allowed'
                                    : 'bg-gradient-to-r from-zeno-cyan to-blue-600 hover:scale-[1.01] hover:shadow-zeno-cyan/20 active:scale-[0.99]'
                                }`}
                        >
                            {saving ? (
                                <span className="flex items-center justify-center gap-2">
                                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                                    Saving Changes...
                                </span>
                            ) : (
                                'Save Account Changes'
                            )}
                        </button>
                    </div>
                </form>
            </div>

            {/* DCCP Portal Credentials — outside the main profile form */}
            <div className="mt-6 bg-zeno-gray border border-white/10 rounded-2xl overflow-hidden shadow-2xl p-8">
                <DCCPCredentialsSection />
            </div>
        </div>
    );
}

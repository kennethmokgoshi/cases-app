'use client';
import { confirm } from '@zenowethu/ui';


import { useSession } from '@zenowethu/ui';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import Link from 'next/link';

const logger = {
    info: (...args: any[]) => console.log('[INFO]', ...args),
    warn: (...args: any[]) => console.warn('[WARN]', ...args),
    error: (...args: any[]) => console.error('[ERROR]', ...args),
};

interface DHSSettings {
    dhs_username: string;
    dhs_password: string;
}

interface GHLSettings {
    ghl_api_key: string;
    ghl_location_id: string;
    ghl_email: string;
    ghl_password: string;
}

export default function SettingsPage() {
    const { data: session, status } = useSession();
    const router = useRouter();

    const [dhsSettings, setDhsSettings] = useState<DHSSettings>({
        dhs_username: '',
        dhs_password: '' });
    const [ghlSettings, setGhlSettings] = useState<GHLSettings>({
        ghl_api_key: '',
        ghl_location_id: '',
        ghl_email: '',
        ghl_password: '' });
    const [hasExistingPassword, setHasExistingPassword] = useState(false);
    const [hasGhlApiKey, setHasGhlApiKey] = useState(false);
    const [hasGhlPassword, setHasGhlPassword] = useState(false);
    const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
    const [ghlLastUpdated, setGhlLastUpdated] = useState<Date | null>(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [ghlSaving, setGhlSaving] = useState(false);
    const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
    const [showPassword, setShowPassword] = useState(false);
    const [showGhlApiKey, setShowGhlApiKey] = useState(false);
    const [showGhlPassword, setShowGhlPassword] = useState(false);
    const [mounted, setMounted] = useState(false);

    // Track when component is mounted for hydration-safe rendering
    useEffect(() => {
        setMounted(true);
    }, []);

    useEffect(() => {
        if (status === 'authenticated' && !session?.user?.isAdmin) {
            router.push('/');
        }
    }, [session, status, router]);

    useEffect(() => {
        fetchSettings();
    }, []);

    const fetchSettings = async () => {
        setLoading(true);
        try {
            await Promise.all([fetchDHSSettings(), fetchGHLSettings()]);
        } catch (error) {
            logger.error('Error fetching settings:', error);
        } finally {
            setLoading(false);
        }
    };

    const fetchDHSSettings = async () => {
        try {
            const res = await fetch('/api/admin/settings/dhs');
            if (res.ok) {
                const data = await res.json();
                // Check if password exists (API returns masked value)
                const passwordExists = data.settings.dhs_password && data.settings.dhs_password.includes('•');
                setHasExistingPassword(passwordExists);

                setDhsSettings({
                    dhs_username: data.settings.dhs_username || '',
                    // Don't populate password field with masked value - keep empty for new input
                    dhs_password: '' });
                if (data.lastUpdated) {
                    setLastUpdated(new Date(data.lastUpdated));
                }
            }
        } catch (error) {
            logger.error('Error fetching DHS settings:', error);
        }
    };

    const fetchGHLSettings = async () => {
        try {
            const res = await fetch('/api/admin/settings/ghl');
            if (res.ok) {
                const data = await res.json();
                setHasGhlApiKey(data.settings.ghl_api_key && data.settings.ghl_api_key.includes('•'));
                setHasGhlPassword(data.settings.ghl_password && data.settings.ghl_password.includes('•'));

                setGhlSettings({
                    ghl_api_key: '',
                    ghl_location_id: data.settings.ghl_location_id || '',
                    ghl_email: data.settings.ghl_email || '',
                    ghl_password: '' });
                if (data.lastUpdated) {
                    setGhlLastUpdated(new Date(data.lastUpdated));
                }
            }
        } catch (error) {
            logger.error('Error fetching GHL settings:', error);
        }
    };

    const handleSave = async () => {
        setSaving(true);
        setMessage(null);

        try {
            const res = await fetch('/api/admin/settings/dhs', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    username: dhsSettings.dhs_username,
                    password: dhsSettings.dhs_password }) });

            if (res.ok) {
                setMessage({ type: 'success', text: 'DHS credentials saved successfully!' });
                // Refresh to get updated timestamp
                fetchDHSSettings();
            } else {
                const data = await res.json();
                setMessage({ type: 'error', text: data.error || 'Failed to save settings' });
            }
        } catch (error) {
            setMessage({ type: 'error', text: 'An error occurred while saving' });
        } finally {
            setSaving(false);
        }
    };

    const handleSaveGHL = async () => {
        setGhlSaving(true);
        setMessage(null);

        try {
            const res = await fetch('/api/admin/settings/ghl', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    apiKey: ghlSettings.ghl_api_key,
                    locationId: ghlSettings.ghl_location_id,
                    email: ghlSettings.ghl_email,
                    password: ghlSettings.ghl_password }) });

            if (res.ok) {
                setMessage({ type: 'success', text: 'GHL credentials saved successfully!' });
                fetchGHLSettings();
            } else {
                const data = await res.json();
                setMessage({ type: 'error', text: data.error || 'Failed to save GHL settings' });
            }
        } catch (error) {
            setMessage({ type: 'error', text: 'An error occurred while saving GHL settings' });
        } finally {
            setGhlSaving(false);
        }
    };

    const handleReset = async () => {
        if (!await confirm('Are you sure you want to reset DHS credentials to default values?')) {
            return;
        }

        setSaving(true);
        setMessage(null);

        try {
            const res = await fetch('/api/admin/settings/dhs', {
                method: 'DELETE' });

            if (res.ok) {
                setMessage({ type: 'success', text: 'DHS credentials reset to defaults' });
                fetchDHSSettings();
            } else {
                const data = await res.json();
                setMessage({ type: 'error', text: data.error || 'Failed to reset settings' });
            }
        } catch (error) {
            setMessage({ type: 'error', text: 'An error occurred while resetting' });
        } finally {
            setSaving(false);
        }
    };

    const handleResetGHL = async () => {
        if (!await confirm('Are you sure you want to reset GHL credentials?')) {
            return;
        }

        setGhlSaving(true);
        setMessage(null);

        try {
            const res = await fetch('/api/admin/settings/ghl', {
                method: 'DELETE' });

            if (res.ok) {
                setMessage({ type: 'success', text: 'GHL credentials reset successfully' });
                fetchGHLSettings();
            } else {
                const data = await res.json();
                setMessage({ type: 'error', text: data.error || 'Failed to reset GHL settings' });
            }
        } catch (error) {
            setMessage({ type: 'error', text: 'An error occurred while resetting GHL settings' });
        } finally {
            setGhlSaving(false);
        }
    };

    if (status === 'loading' || loading) {
        return (
            <div className="flex items-center justify-center min-h-[60vh]">
                <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-zeno-cyan"></div>
            </div>
        );
    }

    if (!session?.user?.isAdmin) {
        return (
            <div className="flex items-center justify-center min-h-[60vh]">
                <div className="text-center">
                    <h2 className="text-2xl font-bold text-white mb-2">Access Denied</h2>
                    <p className="text-gray-400">You do not have permission to access this page.</p>
                </div>
            </div>
        );
    }

    return (
        <div className="max-w-4xl mx-auto pb-12">
            {/* Header */}
            <div className="mb-8">
                <div className="flex items-center gap-2 text-gray-400 text-sm mb-4">
                    <Link href="/admin" className="hover:text-white transition-colors">
                        Admin
                    </Link>
                    <span>/</span>
                    <span className="text-white">Settings</span>
                </div>
                <h1 className="text-3xl font-bold text-white mb-2">System Settings</h1>
                <p className="text-gray-400">Configure system-wide settings and integrations</p>
            </div>

            {/* Message */}
            {message && (
                <div className={`mb-6 p-4 rounded-lg ${message.type === 'success'
                    ? 'bg-green-500/20 border border-green-500/50 text-green-400'
                    : 'bg-red-500/20 border border-red-500/50 text-red-400'
                    }`}>
                    {message.text}
                </div>
            )}

            <div className="space-y-8">
                {/* DHS Credentials Section */}
                <section className="bg-zeno-blue/30 border border-zeno-blue/50 rounded-xl p-6">
                    <div className="flex items-center gap-4 mb-6">
                        <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-500 flex items-center justify-center text-white text-2xl">
                            🏛️
                        </div>
                        <div>
                            <h2 className="text-xl font-bold text-white">DHS Portal Credentials</h2>
                            <p className="text-gray-400 text-sm">
                                Configure login credentials for the NCR Debt Help System portal
                            </p>
                        </div>
                    </div>

                    <div className="space-y-4">
                        {/* Username */}
                        <div>
                            <label className="block text-sm font-medium text-gray-300 mb-2">
                                DHS Username (NCRDC Number)
                            </label>
                            <input
                                type="text"
                                value={dhsSettings.dhs_username}
                                onChange={(e) => setDhsSettings({ ...dhsSettings, dhs_username: e.target.value })}
                                className="w-full px-4 py-3 bg-zeno-dark/50 border border-zeno-blue/50 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-zeno-cyan transition-colors"
                                placeholder="e.g., NCRDC3693"
                            />
                        </div>

                        {/* Password */}
                        <div>
                            <label className="block text-sm font-medium text-gray-300 mb-2">
                                DHS Password
                                {hasExistingPassword && (
                                    <span className="ml-2 text-xs text-green-400">(Password saved)</span>
                                )}
                            </label>
                            <div className="relative">
                                <input
                                    type={showPassword ? 'text' : 'password'}
                                    value={dhsSettings.dhs_password}
                                    onChange={(e) => setDhsSettings({ ...dhsSettings, dhs_password: e.target.value })}
                                    className="w-full px-4 py-3 pr-12 bg-zeno-dark/50 border border-zeno-blue/50 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-zeno-cyan transition-colors"
                                    placeholder={hasExistingPassword ? "Enter new password to change" : "Enter password"}
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowPassword(!showPassword)}
                                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white transition-colors"
                                >
                                    {showPassword ? (
                                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.542 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                                        </svg>
                                    ) : (
                                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                                        </svg>
                                    )}
                                </button>
                            </div>
                        </div>

                        {mounted && lastUpdated && (
                            <div className="pt-2 text-sm text-gray-500">
                                Last updated: {lastUpdated.toLocaleString()}
                            </div>
                        )}
                    </div>

                    <div className="flex items-center gap-4 mt-6 pt-6 border-t border-zeno-blue/30">
                        <button
                            onClick={handleSave}
                            disabled={saving}
                            className="px-6 py-3 bg-gradient-to-r from-zeno-purple to-zeno-cyan text-white font-semibold rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                        >
                            {saving ? 'Saving...' : 'Save DHS Credentials'}
                        </button>
                        <button
                            onClick={handleReset}
                            disabled={saving}
                            className="px-6 py-3 bg-zeno-dark/50 border border-red-500/50 text-red-400 font-semibold rounded-lg hover:bg-red-500/10 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            Reset
                        </button>
                    </div>
                </section>

                {/* GoHighLevel Settings Section */}
                <section className="bg-zeno-blue/30 border border-zeno-blue/50 rounded-xl p-6">
                    <div className="flex items-center gap-4 mb-6">
                        <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-cyan-500 to-blue-500 flex items-center justify-center text-white text-2xl">
                            🚀
                        </div>
                        <div>
                            <h2 className="text-xl font-bold text-white">GoHighLevel Integration</h2>
                            <p className="text-gray-400 text-sm">
                                Configure credentials for GHL messaging and automation
                            </p>
                        </div>
                    </div>

                    <div className="space-y-4">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {/* API Key */}
                            <div>
                                <label className="block text-sm font-medium text-gray-300 mb-2">
                                    GHL API Key
                                    {hasGhlApiKey && (
                                        <span className="ml-2 text-xs text-green-400">(Saved)</span>
                                    )}
                                </label>
                                <div className="relative">
                                    <input
                                        type={showGhlApiKey ? 'text' : 'password'}
                                        value={ghlSettings.ghl_api_key}
                                        onChange={(e) => setGhlSettings({ ...ghlSettings, ghl_api_key: e.target.value })}
                                        className="w-full px-4 py-3 pr-12 bg-zeno-dark/50 border border-zeno-blue/50 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-zeno-cyan transition-colors"
                                        placeholder={hasGhlApiKey ? "••••••••" : "Enter API Key"}
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setShowGhlApiKey(!showGhlApiKey)}
                                        className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white transition-colors"
                                    >
                                        {showGhlApiKey ? '🙈' : '👁️'}
                                    </button>
                                </div>
                            </div>

                            {/* Location ID */}
                            <div>
                                <label className="block text-sm font-medium text-gray-300 mb-2">
                                    Location ID
                                </label>
                                <input
                                    type="text"
                                    value={ghlSettings.ghl_location_id}
                                    onChange={(e) => setGhlSettings({ ...ghlSettings, ghl_location_id: e.target.value })}
                                    className="w-full px-4 py-3 bg-zeno-dark/50 border border-zeno-blue/50 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-zeno-cyan transition-colors"
                                    placeholder="Enter Location ID"
                                />
                            </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {/* Login Email */}
                            <div>
                                <label className="block text-sm font-medium text-gray-300 mb-2">
                                    Login Email (Optional)
                                </label>
                                <input
                                    type="email"
                                    value={ghlSettings.ghl_email}
                                    onChange={(e) => setGhlSettings({ ...ghlSettings, ghl_email: e.target.value })}
                                    className="w-full px-4 py-3 bg-zeno-dark/50 border border-zeno-blue/50 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-zeno-cyan transition-colors"
                                    placeholder="email@example.com"
                                />
                            </div>

                            {/* Login Password */}
                            <div>
                                <label className="block text-sm font-medium text-gray-300 mb-2">
                                    Login Password (Optional)
                                    {hasGhlPassword && (
                                        <span className="ml-2 text-xs text-green-400">(Saved)</span>
                                    )}
                                </label>
                                <div className="relative">
                                    <input
                                        type={showGhlPassword ? 'text' : 'password'}
                                        value={ghlSettings.ghl_password}
                                        onChange={(e) => setGhlSettings({ ...ghlSettings, ghl_password: e.target.value })}
                                        className="w-full px-4 py-3 pr-12 bg-zeno-dark/50 border border-zeno-blue/50 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-zeno-cyan transition-colors"
                                        placeholder={hasGhlPassword ? "••••••••" : "Enter Password"}
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setShowGhlPassword(!showGhlPassword)}
                                        className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white transition-colors"
                                    >
                                        {showGhlPassword ? '🙈' : '👁️'}
                                    </button>
                                </div>
                            </div>
                        </div>

                        {mounted && ghlLastUpdated && (
                            <div className="pt-2 text-sm text-gray-500">
                                Last updated: {ghlLastUpdated.toLocaleString()}
                            </div>
                        )}
                    </div>

                    <div className="flex items-center gap-4 mt-6 pt-6 border-t border-zeno-blue/30">
                        <button
                            onClick={handleSaveGHL}
                            disabled={ghlSaving}
                            className="px-6 py-3 bg-gradient-to-r from-cyan-600 to-blue-600 text-white font-semibold rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                        >
                            {ghlSaving ? 'Saving...' : 'Save GHL Credentials'}
                        </button>
                        <button
                            onClick={handleResetGHL}
                            disabled={ghlSaving}
                            className="px-6 py-3 bg-zeno-dark/50 border border-red-500/50 text-red-400 font-semibold rounded-lg hover:bg-red-500/10 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            Reset
                        </button>
                    </div>
                </section>
            </div>

            {/* Info Box */}
            <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-6 mt-8">
                <div className="flex items-start gap-4">
                    <div className="flex-shrink-0">
                        <svg className="w-6 h-6 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                    </div>
                    <div>
                        <h3 className="text-amber-400 font-semibold mb-1">Security Warning</h3>
                        <p className="text-gray-400 text-sm">
                            Keep your API keys and passwords secure. If you believe your credentials have been compromised,
                            rotate them immediately in the respective platforms and update them here.
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
}

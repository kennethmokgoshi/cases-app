'use client';

import { useSession } from '@zenowethu/ui';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';

// Client-side logger
const logger = {
    info: (...args: any[]) => console.log('[INFO]', ...args),
    error: (...args: any[]) => console.error('[ERROR]', ...args),
    warn: (...args: any[]) => console.warn('[WARN]', ...args),
    debug: (...args: any[]) => console.debug('[DEBUG]', ...args)
};

interface DHSSettings {
    dhs_username: string;
    dhs_password: string;
}

interface MaxDcSettings {
    maxdc_username: string;
    maxdc_password: string;
}

interface BureauEntry {
    key:   string;
    name:  string;
    email: string;
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
    const [maxdcSettings, setMaxdcSettings] = useState<MaxDcSettings>({ maxdc_username: '', maxdc_password: '' });
    const [hasMaxdcPassword, setHasMaxdcPassword] = useState(false);
    const [maxdcLastUpdated, setMaxdcLastUpdated] = useState<Date | null>(null);
    const [maxdcSaving, setMaxdcSaving] = useState(false);
    const [showMaxdcPassword, setShowMaxdcPassword] = useState(false);
    const [mounted, setMounted] = useState(false);

    // Credit bureau emails state
    const [bureauEntries, setBureauEntries] = useState<BureauEntry[]>([]);
    const [bureauSaving, setBureauSaving] = useState(false);
    const [bureauLastUpdated, setBureauLastUpdated] = useState<Date | null>(null);
    const [bureauIsDefault, setBureauIsDefault] = useState(true);

    // Letterhead state
    const [letterheadUrl, setLetterheadUrl] = useState<string | null>(null);
    const [letterheadUpdatedAt, setLetterheadUpdatedAt] = useState<Date | null>(null);
    const [letterheadSaving, setLetterheadSaving] = useState(false);
    const [letterheadPreview, setLetterheadPreview] = useState<string | null>(null);
    const [selectedFile, setSelectedFile] = useState<File | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

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
            await Promise.all([fetchDHSSettings(), fetchGHLSettings(), fetchMaxDcSettings(), fetchLetterheadSettings(), fetchBureauSettings()]);
        } catch (error) {
            logger.error('Error fetching settings:', error);
        } finally {
            setLoading(false);
        }
    };

    const fetchLetterheadSettings = async () => {
        try {
            const res = await fetch('/api/admin/settings/letterhead');
            if (res.ok) {
                const data = await res.json();
                setLetterheadUrl(data.url ?? null);
                setLetterheadUpdatedAt(data.updatedAt ? new Date(data.updatedAt) : null);
            }
        } catch (error) {
            logger.error('Error fetching letterhead settings:', error);
        }
    };

    const handleLetterheadFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setSelectedFile(file);
        setLetterheadPreview(URL.createObjectURL(file));
    };

    const handleLetterheadUpload = async () => {
        if (!selectedFile) return;
        setLetterheadSaving(true);
        setMessage(null);
        try {
            const formData = new FormData();
            formData.append('file', selectedFile);
            const res = await fetch('/api/admin/settings/letterhead', { method: 'POST', body: formData });
            if (res.ok) {
                const data = await res.json();
                setLetterheadUrl(data.url);
                setLetterheadPreview(null);
                setSelectedFile(null);
                if (fileInputRef.current) fileInputRef.current.value = '';
                setMessage({ type: 'success', text: 'Letterhead uploaded successfully!' });
                fetchLetterheadSettings();
            } else {
                const data = await res.json();
                setMessage({ type: 'error', text: data.error || 'Failed to upload letterhead' });
            }
        } catch {
            setMessage({ type: 'error', text: 'An error occurred while uploading the letterhead' });
        } finally {
            setLetterheadSaving(false);
        }
    };

    const handleLetterheadRemove = async () => {
        if (!confirm('Are you sure you want to remove the current letterhead?')) return;
        setLetterheadSaving(true);
        setMessage(null);
        try {
            const res = await fetch('/api/admin/settings/letterhead', { method: 'DELETE' });
            if (res.ok) {
                setLetterheadUrl(null);
                setLetterheadUpdatedAt(null);
                setLetterheadPreview(null);
                setSelectedFile(null);
                if (fileInputRef.current) fileInputRef.current.value = '';
                setMessage({ type: 'success', text: 'Letterhead removed successfully' });
            } else {
                const data = await res.json();
                setMessage({ type: 'error', text: data.error || 'Failed to remove letterhead' });
            }
        } catch {
            setMessage({ type: 'error', text: 'An error occurred while removing the letterhead' });
        } finally {
            setLetterheadSaving(false);
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

    const fetchMaxDcSettings = async () => {
        try {
            const res = await fetch('/api/admin/settings/maxdc');
            if (res.ok) {
                const data = await res.json();
                setHasMaxdcPassword(!!(data.settings.maxdc_password && data.settings.maxdc_password.includes('•')));
                setMaxdcSettings({ maxdc_username: data.settings.maxdc_username || '', maxdc_password: '' });
                if (data.lastUpdated) setMaxdcLastUpdated(new Date(data.lastUpdated));
            }
        } catch (error) {
            logger.error('Error fetching MaxDC settings:', error);
        }
    };

    const handleSaveMaxDc = async () => {
        setMaxdcSaving(true);
        setMessage(null);
        try {
            const res = await fetch('/api/admin/settings/maxdc', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username: maxdcSettings.maxdc_username, password: maxdcSettings.maxdc_password })
            });
            if (res.ok) {
                setMessage({ type: 'success', text: 'MaxDC credentials saved successfully!' });
                fetchMaxDcSettings();
            } else {
                const data = await res.json();
                setMessage({ type: 'error', text: data.error || 'Failed to save MaxDC credentials' });
            }
        } catch (error) {
            setMessage({ type: 'error', text: 'An error occurred while saving MaxDC credentials' });
        } finally {
            setMaxdcSaving(false);
        }
    };

    const handleResetMaxDc = async () => {
        if (!confirm('Are you sure you want to clear MaxDC credentials?')) return;
        setMaxdcSaving(true);
        setMessage(null);
        try {
            const res = await fetch('/api/admin/settings/maxdc', { method: 'DELETE' });
            if (res.ok) {
                setMessage({ type: 'success', text: 'MaxDC credentials cleared' });
                setMaxdcSettings({ maxdc_username: '', maxdc_password: '' });
                setHasMaxdcPassword(false);
            } else {
                const data = await res.json();
                setMessage({ type: 'error', text: data.error || 'Failed to clear MaxDC credentials' });
            }
        } catch (error) {
            setMessage({ type: 'error', text: 'An error occurred while clearing MaxDC credentials' });
        } finally {
            setMaxdcSaving(false);
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
                setMessage({ type: 'success', text: 'OPSGENTY credentials saved successfully!' });
                fetchGHLSettings();
            } else {
                const data = await res.json();
                setMessage({ type: 'error', text: data.error || 'Failed to save OPSGENTY settings' });
            }
        } catch (error) {
            setMessage({ type: 'error', text: 'An error occurred while saving OPSGENTY settings' });
        } finally {
            setGhlSaving(false);
        }
    };

    const fetchBureauSettings = async () => {
        try {
            const res = await fetch('/api/admin/settings/credit-bureaus');
            if (res.ok) {
                const data = await res.json();
                setBureauEntries(data.bureaus || []);
                setBureauLastUpdated(data.lastUpdated ? new Date(data.lastUpdated) : null);
                setBureauIsDefault(data.isDefault ?? true);
            }
        } catch (error) {
            logger.error('Error fetching bureau settings:', error);
        }
    };

    const handleSaveBureaus = async () => {
        setBureauSaving(true);
        setMessage(null);
        try {
            const res = await fetch('/api/admin/settings/credit-bureaus', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ bureaus: bureauEntries }),
            });
            if (res.ok) {
                setMessage({ type: 'success', text: 'Credit bureau emails saved successfully!' });
                fetchBureauSettings();
            } else {
                const data = await res.json();
                setMessage({ type: 'error', text: data.error || 'Failed to save bureau emails' });
            }
        } catch {
            setMessage({ type: 'error', text: 'An error occurred while saving bureau emails' });
        } finally {
            setBureauSaving(false);
        }
    };

    const handleResetBureaus = async () => {
        if (!confirm('Reset to default SA credit bureau email addresses?')) return;
        setBureauSaving(true);
        setMessage(null);
        try {
            const res = await fetch('/api/admin/settings/credit-bureaus', { method: 'DELETE' });
            if (res.ok) {
                setMessage({ type: 'success', text: 'Credit bureau emails reset to defaults' });
                fetchBureauSettings();
            } else {
                const data = await res.json();
                setMessage({ type: 'error', text: data.error || 'Failed to reset bureau emails' });
            }
        } catch {
            setMessage({ type: 'error', text: 'An error occurred while resetting bureau emails' });
        } finally {
            setBureauSaving(false);
        }
    };

    const addBureauRow = () => {
        const idx = bureauEntries.length + 1;
        setBureauEntries(prev => [...prev, { key: `bureau_email_custom_${idx}`, name: '', email: '' }]);
    };

    const updateBureauRow = (index: number, field: keyof BureauEntry, value: string) => {
        setBureauEntries(prev => prev.map((entry, i) =>
            i === index
                ? { ...entry, [field]: value, ...(field === 'name' ? { key: `bureau_email_${value.toLowerCase().replace(/[^a-z0-9]/g, '_')}` } : {}) }
                : entry
        ));
    };

    const removeBureauRow = (index: number) => {
        setBureauEntries(prev => prev.filter((_, i) => i !== index));
    };

    const handleReset = async () => {
        if (!confirm('Are you sure you want to reset DHS credentials to default values?')) {
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
        if (!confirm('Are you sure you want to reset OPSGENTY credentials?')) {
            return;
        }

        setGhlSaving(true);
        setMessage(null);

        try {
            const res = await fetch('/api/admin/settings/ghl', {
                method: 'DELETE' });

            if (res.ok) {
                setMessage({ type: 'success', text: 'OPSGENTY credentials reset successfully' });
                fetchGHLSettings();
            } else {
                const data = await res.json();
                setMessage({ type: 'error', text: data.error || 'Failed to reset OPSGENTY settings' });
            }
        } catch (error) {
            setMessage({ type: 'error', text: 'An error occurred while resetting OPSGENTY settings' });
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
                {/* Letterhead Section — ADMIN and EXECUTIVE only */}
                {(session?.user?.isAdmin || session?.user?.isExecutive) && (
                    <section className="bg-zeno-blue/30 border border-zeno-blue/50 rounded-xl p-6">
                        <div className="flex items-center gap-4 mb-6">
                            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-teal-500 to-emerald-500 flex items-center justify-center text-white text-2xl">
                                🖼️
                            </div>
                            <div>
                                <div className="flex items-center gap-3">
                                    <h2 className="text-xl font-bold text-white">Document Letterhead</h2>
                                    <span className="px-2 py-0.5 text-xs font-semibold bg-teal-500/20 text-teal-400 border border-teal-500/40 rounded-full">
                                        Admin &amp; Executive only
                                    </span>
                                </div>
                                <p className="text-gray-400 text-sm mt-0.5">
                                    Upload the Zenowethu letterhead image used on generated NCA documents (Form 16, Form 17.1, etc.)
                                </p>
                            </div>
                        </div>

                        {/* Current letterhead preview */}
                        {letterheadUrl && !letterheadPreview && (
                            <div className="mb-5">
                                <p className="text-sm text-gray-400 mb-2">Current letterhead:</p>
                                <div className="border border-zeno-blue/40 rounded-lg overflow-hidden bg-white p-2 max-w-lg">
                                    <img
                                        src={letterheadUrl}
                                        alt="Current letterhead"
                                        className="w-full object-contain max-h-40"
                                    />
                                </div>
                                {mounted && letterheadUpdatedAt && (
                                    <p className="text-xs text-gray-500 mt-1">
                                        Last updated: {letterheadUpdatedAt.toLocaleString()}
                                    </p>
                                )}
                            </div>
                        )}

                        {/* New file preview */}
                        {letterheadPreview && (
                            <div className="mb-5">
                                <p className="text-sm text-teal-400 mb-2">New letterhead preview:</p>
                                <div className="border border-teal-500/40 rounded-lg overflow-hidden bg-white p-2 max-w-lg">
                                    <img
                                        src={letterheadPreview}
                                        alt="New letterhead preview"
                                        className="w-full object-contain max-h-40"
                                    />
                                </div>
                                <p className="text-xs text-gray-400 mt-1">{selectedFile?.name}</p>
                            </div>
                        )}

                        {/* No letterhead yet */}
                        {!letterheadUrl && !letterheadPreview && (
                            <div className="mb-5 p-4 bg-amber-500/10 border border-amber-500/30 rounded-lg text-sm text-amber-300">
                                No letterhead uploaded yet. Documents will be generated without a letterhead until one is uploaded.
                            </div>
                        )}

                        {/* File picker */}
                        <div className="mb-4">
                            <label className="block text-sm font-medium text-gray-300 mb-2">
                                Select new letterhead file
                                <span className="ml-2 text-xs text-gray-500">(PNG, JPEG, WebP or PDF — max 5 MB)</span>
                            </label>
                            <input
                                ref={fileInputRef}
                                type="file"
                                accept="image/png,image/jpeg,image/jpg,image/webp,application/pdf"
                                onChange={handleLetterheadFileChange}
                                className="block w-full text-sm text-gray-300 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-teal-600 file:text-white hover:file:bg-teal-500 file:cursor-pointer cursor-pointer"
                            />
                        </div>

                        <div className="flex items-center gap-4 pt-4 border-t border-zeno-blue/30">
                            <button
                                onClick={handleLetterheadUpload}
                                disabled={!selectedFile || letterheadSaving}
                                className="px-6 py-3 bg-gradient-to-r from-teal-600 to-emerald-600 text-white font-semibold rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                            >
                                {letterheadSaving ? 'Uploading...' : 'Upload Letterhead'}
                            </button>
                            {letterheadUrl && (
                                <button
                                    onClick={handleLetterheadRemove}
                                    disabled={letterheadSaving}
                                    className="px-6 py-3 bg-zeno-dark/50 border border-red-500/50 text-red-400 font-semibold rounded-lg hover:bg-red-500/10 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    Remove
                                </button>
                            )}
                        </div>
                    </section>
                )}

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

                {/* OPSGENTY Settings Section */}
                <section className="bg-zeno-blue/30 border border-zeno-blue/50 rounded-xl p-6">
                    <div className="flex items-center gap-4 mb-6">
                        <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-cyan-500 to-blue-500 flex items-center justify-center text-white text-2xl">
                            🚀
                        </div>
                        <div>
                            <h2 className="text-xl font-bold text-white">OPSGENTY Integration</h2>
                            <p className="text-gray-400 text-sm">
                                Configure credentials for OPSGENTY messaging and automation
                            </p>
                        </div>
                    </div>

                    <div className="space-y-4">
                        {/* Webhook URL info box */}
                        <div className="p-4 bg-cyan-500/10 border border-cyan-500/30 rounded-lg">
                            <p className="text-sm font-medium text-cyan-300 mb-1">Inbound Webhook URL</p>
                            <p className="text-xs text-gray-400 mb-2">
                                Add this URL as a Webhook action in your GHL Automation / Workflow to receive replies and inbound messages:
                            </p>
                            <code className="block text-xs text-cyan-200 bg-zeno-dark/60 rounded px-3 py-2 break-all select-all">
                                {typeof window !== 'undefined' ? `${window.location.origin}/api/webhooks/ghl` : 'https://cases.zenowethu.co.za/api/webhooks/ghl'}
                            </code>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {/* API Key */}
                            <div>
                                <label className="block text-sm font-medium text-gray-300 mb-2">
                                    OPSGENTY API Key
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
                            {ghlSaving ? 'Saving...' : 'Save OPSGENTY Credentials'}
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

                {/* MaxDC Credentials Section */}
                <section className="bg-zeno-blue/30 border border-zeno-blue/50 rounded-xl p-6">
                    <div className="flex items-center gap-4 mb-6">
                        <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-orange-500 to-amber-500 flex items-center justify-center text-white text-2xl">
                            ⚖️
                        </div>
                        <div>
                            <div className="flex items-center gap-3">
                                <h2 className="text-xl font-bold text-white">MaxDC Portal Credentials</h2>
                                <span className="px-2 py-0.5 text-xs font-semibold bg-amber-500/20 text-amber-400 border border-amber-500/40 rounded-full">
                                    Active — DHS coming soon
                                </span>
                            </div>
                            <p className="text-gray-400 text-sm mt-0.5">
                                Login credentials for{' '}
                                <a href="https://www.maxdc.co.za/Maximus/Controller?" target="_blank" rel="noopener noreferrer" className="text-zeno-cyan hover:underline">
                                    www.maxdc.co.za
                                </a>{' '}
                                — used to place consumers under debt review
                            </p>
                        </div>
                    </div>

                    <div className="mb-4 p-3 bg-amber-500/10 border border-amber-500/30 rounded-lg text-sm text-amber-300">
                        Note: MaxDC may delay OTP delivery. Allow 2–3 minutes before retrying if the OTP does not arrive.
                    </div>

                    <div className="space-y-4">
                        {/* Username */}
                        <div>
                            <label className="block text-sm font-medium text-gray-300 mb-2">
                                MaxDC Username
                            </label>
                            <input
                                type="text"
                                value={maxdcSettings.maxdc_username}
                                onChange={(e) => setMaxdcSettings({ ...maxdcSettings, maxdc_username: e.target.value })}
                                className="w-full px-4 py-3 bg-zeno-dark/50 border border-zeno-blue/50 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-zeno-cyan transition-colors"
                                placeholder="Enter MaxDC username"
                            />
                        </div>

                        {/* Password */}
                        <div>
                            <label className="block text-sm font-medium text-gray-300 mb-2">
                                MaxDC Password
                                {hasMaxdcPassword && (
                                    <span className="ml-2 text-xs text-green-400">(Password saved)</span>
                                )}
                            </label>
                            <div className="relative">
                                <input
                                    type={showMaxdcPassword ? 'text' : 'password'}
                                    value={maxdcSettings.maxdc_password}
                                    onChange={(e) => setMaxdcSettings({ ...maxdcSettings, maxdc_password: e.target.value })}
                                    className="w-full px-4 py-3 pr-12 bg-zeno-dark/50 border border-zeno-blue/50 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-zeno-cyan transition-colors"
                                    placeholder={hasMaxdcPassword ? 'Enter new password to change' : 'Enter password'}
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowMaxdcPassword(!showMaxdcPassword)}
                                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white transition-colors"
                                >
                                    {showMaxdcPassword ? '🙈' : '👁️'}
                                </button>
                            </div>
                        </div>

                        {mounted && maxdcLastUpdated && (
                            <div className="pt-2 text-sm text-gray-500">
                                Last updated: {maxdcLastUpdated.toLocaleString()}
                            </div>
                        )}
                    </div>

                    <div className="flex items-center gap-4 mt-6 pt-6 border-t border-zeno-blue/30">
                        <button
                            onClick={handleSaveMaxDc}
                            disabled={maxdcSaving}
                            className="px-6 py-3 bg-gradient-to-r from-orange-500 to-amber-500 text-white font-semibold rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                        >
                            {maxdcSaving ? 'Saving...' : 'Save MaxDC Credentials'}
                        </button>
                        <button
                            onClick={handleResetMaxDc}
                            disabled={maxdcSaving}
                            className="px-6 py-3 bg-zeno-dark/50 border border-red-500/50 text-red-400 font-semibold rounded-lg hover:bg-red-500/10 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            Clear
                        </button>
                    </div>
                </section>

                {/* Credit Bureau Email Addresses */}
                <section className="bg-zeno-blue/30 border border-zeno-blue/50 rounded-xl p-6">
                    <div className="flex items-center gap-4 mb-6">
                        <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-cyan-500 to-teal-500 flex items-center justify-center text-white text-2xl">
                            🏛️
                        </div>
                        <div>
                            <div className="flex items-center gap-3">
                                <h2 className="text-xl font-bold text-white">Credit Bureau Email Addresses</h2>
                                {bureauIsDefault && (
                                    <span className="px-2 py-0.5 text-xs font-semibold bg-amber-500/20 text-amber-400 border border-amber-500/40 rounded-full">
                                        Using defaults
                                    </span>
                                )}
                            </div>
                            <p className="text-gray-400 text-sm mt-0.5">
                                Email addresses used when sending formal file-request letters to credit bureaus after DHS acceptance. Add or edit bureau contact details below.
                            </p>
                            {mounted && bureauLastUpdated && (
                                <p className="text-xs text-gray-500 mt-1">Last saved: {bureauLastUpdated.toLocaleString()}</p>
                            )}
                        </div>
                    </div>

                    <div className="space-y-3 mb-4">
                        {/* Header row */}
                        <div className="grid grid-cols-[1fr_2fr_auto] gap-3 px-1">
                            <span className="text-xs text-gray-500 font-semibold uppercase">Bureau Name</span>
                            <span className="text-xs text-gray-500 font-semibold uppercase">Dispute Email Address</span>
                            <span className="w-8" />
                        </div>

                        {bureauEntries.map((entry, idx) => (
                            <div key={idx} className="grid grid-cols-[1fr_2fr_auto] gap-3 items-center">
                                <input
                                    type="text"
                                    value={entry.name}
                                    onChange={e => updateBureauRow(idx, 'name', e.target.value)}
                                    placeholder="e.g. TransUnion"
                                    className="bg-zeno-dark/50 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:border-cyan-500 focus:outline-none"
                                />
                                <input
                                    type="email"
                                    value={entry.email}
                                    onChange={e => updateBureauRow(idx, 'email', e.target.value)}
                                    placeholder="e.g. disputes@transunion.co.za"
                                    className="bg-zeno-dark/50 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:border-cyan-500 focus:outline-none"
                                />
                                <button
                                    onClick={() => removeBureauRow(idx)}
                                    disabled={bureauEntries.length <= 1}
                                    title="Remove bureau"
                                    className="w-8 h-8 flex items-center justify-center text-gray-500 hover:text-red-400 hover:bg-red-500/10 rounded transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                                >
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                    </svg>
                                </button>
                            </div>
                        ))}
                    </div>

                    <button
                        onClick={addBureauRow}
                        className="mb-6 flex items-center gap-2 text-xs text-cyan-400 hover:text-cyan-300 transition-colors"
                    >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                        </svg>
                        Add bureau
                    </button>

                    <div className="flex gap-3">
                        <button
                            onClick={handleSaveBureaus}
                            disabled={bureauSaving}
                            className="px-6 py-3 bg-gradient-to-r from-cyan-500 to-teal-500 text-white font-semibold rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                        >
                            {bureauSaving ? 'Saving...' : 'Save Bureau Emails'}
                        </button>
                        <button
                            onClick={handleResetBureaus}
                            disabled={bureauSaving}
                            className="px-6 py-3 bg-zeno-dark/50 border border-white/10 text-gray-400 font-semibold rounded-lg hover:bg-white/5 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            Reset to Defaults
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

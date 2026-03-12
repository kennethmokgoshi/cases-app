'use client';

import { useState, useEffect } from 'react';
import { useSession } from '@zenowethu/ui';
import { useRouter } from 'next/navigation';

const logger = {
    info: (...args: any[]) => console.log('[INFO]', ...args),
    warn: (...args: any[]) => console.warn('[WARN]', ...args),
    error: (...args: any[]) => console.error('[ERROR]', ...args),
};

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
        </div>
    );
}

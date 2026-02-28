'use client';

import { useState } from 'react';
import { useSession } from 'next-auth/react';

export default function B2BProfilePage() {
    const { data: session } = useSession();
    const [saving, setSaving] = useState(false);
    const [message, setMessage] = useState('');

    const handleSave = async () => {
        setSaving(true);
        setMessage('');

        // Simulate save
        await new Promise(resolve => setTimeout(resolve, 1000));

        setMessage('Settings saved successfully!');
        setSaving(false);

        setTimeout(() => setMessage(''), 3000);
    };

    return (
        <div className="max-w-4xl mx-auto space-y-8">
            <div>
                <h1 className="text-3xl font-bold text-white mb-2">Profile & Settings</h1>
                <p className="text-gray-400">Manage your account and preferences</p>
            </div>

            {/* Success Message */}
            {message && (
                <div className="bg-green-500/10 border border-green-500/50 rounded-xl p-4 flex items-center gap-3">
                    <svg className="w-5 h-5 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <p className="text-green-400">{message}</p>
                </div>
            )}

            {/* Partner Information */}
            <div className="bg-zeno-gray border border-white/10 rounded-xl p-6">
                <h2 className="text-xl font-bold text-white mb-6">Partner Information</h2>

                <div className="space-y-6">
                    <div className="grid grid-cols-2 gap-6">
                        <div>
                            <label className="block text-sm font-medium text-gray-300 mb-2">First Name</label>
                            <input
                                type="text"
                                value={session?.user?.firstName || ''}
                                disabled
                                className="w-full bg-zeno-navy border border-white/10 rounded-lg px-4 py-3 text-gray-400 cursor-not-allowed"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-300 mb-2">Last Name</label>
                            <input
                                type="text"
                                value={session?.user?.lastName || ''}
                                disabled
                                className="w-full bg-zeno-navy border border-white/10 rounded-lg px-4 py-3 text-gray-400 cursor-not-allowed"
                            />
                        </div>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-300 mb-2">Email Address</label>
                        <input
                            type="email"
                            value={session?.user?.email || ''}
                            disabled
                            className="w-full bg-zeno-navy border border-white/10 rounded-lg px-4 py-3 text-gray-400 cursor-not-allowed"
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-300 mb-2">Organization</label>
                        <input
                            type="text"
                            value={session?.user?.organization || 'N/A'}
                            disabled
                            className="w-full bg-zeno-navy border border-white/10 rounded-lg px-4 py-3 text-gray-400 cursor-not-allowed"
                        />
                    </div>

                    <div className="p-4 bg-blue-500/10 border border-blue-500/30 rounded-lg">
                        <p className="text-sm text-blue-300">
                            <strong>Note:</strong> To update your personal information, please contact Zenowethu support.
                        </p>
                    </div>
                </div>
            </div>

            {/* Notification Preferences */}
            <div className="bg-zeno-gray border border-white/10 rounded-xl p-6">
                <h2 className="text-xl font-bold text-white mb-6">Notification Preferences</h2>

                <div className="space-y-4">
                    <label className="flex items-center justify-between p-4 bg-zeno-navy rounded-lg cursor-pointer hover:bg-zeno-navy/80 transition-colors">
                        <div>
                            <p className="text-white font-medium">Email Notifications</p>
                            <p className="text-sm text-gray-400">Receive updates about your referrals via email</p>
                        </div>
                        <input type="checkbox" defaultChecked className="w-5 h-5 rounded border-gray-500 text-zeno-cyan focus:ring-zeno-cyan" />
                    </label>

                    <label className="flex items-center justify-between p-4 bg-zeno-navy rounded-lg cursor-pointer hover:bg-zeno-navy/80 transition-colors">
                        <div>
                            <p className="text-white font-medium">Lead Status Updates</p>
                            <p className="text-sm text-gray-400">Get notified when lead status changes</p>
                        </div>
                        <input type="checkbox" defaultChecked className="w-5 h-5 rounded border-gray-500 text-zeno-cyan focus:ring-zeno-cyan" />
                    </label>

                    <label className="flex items-center justify-between p-4 bg-zeno-navy rounded-lg cursor-pointer hover:bg-zeno-navy/80 transition-colors">
                        <div>
                            <p className="text-white font-medium">Monthly Reports</p>
                            <p className="text-sm text-gray-400">Receive monthly performance summaries</p>
                        </div>
                        <input type="checkbox" defaultChecked className="w-5 h-5 rounded border-gray-500 text-zeno-cyan focus:ring-zeno-cyan" />
                    </label>
                </div>
            </div>

            {/* Account Security */}
            <div className="bg-zeno-gray border border-white/10 rounded-xl p-6">
                <h2 className="text-xl font-bold text-white mb-6">Account Security</h2>

                <div className="space-y-4">
                    <button className="w-full flex items-center justify-between p-4 bg-zeno-navy hover:bg-zeno-navy/80 rounded-lg transition-colors text-left">
                        <div>
                            <p className="text-white font-medium">Change Password</p>
                            <p className="text-sm text-gray-400">Update your password for security</p>
                        </div>
                        <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </svg>
                    </button>

                    <div className="p-4 bg-zeno-navy rounded-lg">
                        <div className="flex items-start gap-3">
                            <svg className="w-5 h-5 text-green-400 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.6 1.4A8.967 8.967 0 0121 12c0 5-4 9-9 9s-9-4-9-9 4-9 9-9c2.5 0 4.75 1 6.4 2.6" />
                            </svg>
                            <div>
                                <p className="text-white font-medium text-sm">Last Login</p>
                                <p className="text-gray-400 text-sm">Today at {new Date().toLocaleTimeString()}</p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Save Button */}
            <div className="flex justify-end gap-4">
                <button
                    onClick={handleSave}
                    disabled={saving}
                    className="bg-zeno-cyan hover:bg-cyan-600 disabled:bg-gray-600 disabled:cursor-not-allowed text-zeno-navy font-bold px-8 py-3 rounded-lg transition-all"
                >
                    {saving ? 'Saving...' : 'Save Preferences'}
                </button>
            </div>
        </div>
    );
}

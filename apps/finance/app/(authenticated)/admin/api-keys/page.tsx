'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { logger } from '@zenowethu/shared-lib';

type Project = { id: string; name: string };

type ApiKey = {
    id: string;
    name: string;
    key: string;
    keyPrefix: string;
    permissions: string;
    projectId: string | null;
    project: Project | null;
    rateLimit: number;
    isActive: boolean;
    lastUsedAt: string | null;
    usageCount: number;
    description: string | null;
    expiresAt: string | null;
    createdAt: string;
};

export default function ApiKeysPage() {
    const [apiKeys, setApiKeys] = useState<ApiKey[]>([]);
    const [projects, setProjects] = useState<Project[]>([]);
    const [loading, setLoading] = useState(true);
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [newKeyData, setNewKeyData] = useState<{ fullKey: string; name: string } | null>(null);

    // Form state
    const [formName, setFormName] = useState('');
    const [formDescription, setFormDescription] = useState('');
    const [formProjectId, setFormProjectId] = useState('');
    const [formPermissions, setFormPermissions] = useState('read');
    const [formRateLimit, setFormRateLimit] = useState(1000);
    const [formExpiresAt, setFormExpiresAt] = useState('');
    const [creating, setCreating] = useState(false);

    useEffect(() => {
        fetchApiKeys();
        fetchProjects();
    }, []);

    const fetchApiKeys = async () => {
        try {
            const res = await fetch('/api/admin/api-keys');
            if (res.ok) {
                const data = await res.json();
                setApiKeys(data);
            }
        } catch (error) {
            logger.error('Failed to fetch API keys:', error);
        } finally {
            setLoading(false);
        }
    };

    const fetchProjects = async () => {
        try {
            const res = await fetch('/api/projects?flat=true');
            if (res.ok) {
                const data = await res.json();
                // Filter to only B2B projects for API key scoping
                setProjects(data.filter((p: { clientType: string }) => p.clientType === 'B2B'));
            }
        } catch (error) {
            logger.error('Failed to fetch projects:', error);
        }
    };

    const createApiKey = async () => {
        if (!formName.trim()) {
            alert('Please enter a name for the API key');
            return;
        }
        setCreating(true);
        try {
            const res = await fetch('/api/admin/api-keys', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name: formName,
                    description: formDescription || null,
                    projectId: formProjectId || null,
                    permissions: formPermissions,
                    rateLimit: formRateLimit,
                    expiresAt: formExpiresAt || null }) });

            if (res.ok) {
                const data = await res.json();
                setNewKeyData({ fullKey: data.fullKey, name: data.name });
                fetchApiKeys();
                resetForm();
            } else {
                const error = await res.json();
                alert(error.error || 'Failed to create API key');
            }
        } catch (error) {
            logger.error('Failed to create API key:', error);
            alert('Failed to create API key');
        } finally {
            setCreating(false);
        }
    };

    const toggleKeyStatus = async (id: string, currentStatus: boolean) => {
        try {
            await fetch(`/api/admin/api-keys/${id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ isActive: !currentStatus }) });
            fetchApiKeys();
        } catch (error) {
            logger.error('Failed to toggle API key status:', error);
        }
    };

    const deleteApiKey = async (id: string, name: string) => {
        if (!confirm(`Are you sure you want to delete the API key "${name}"?`)) return;
        try {
            await fetch(`/api/admin/api-keys/${id}`, { method: 'DELETE' });
            fetchApiKeys();
        } catch (error) {
            logger.error('Failed to delete API key:', error);
        }
    };

    const resetForm = () => {
        setFormName('');
        setFormDescription('');
        setFormProjectId('');
        setFormPermissions('read');
        setFormRateLimit(1000);
        setFormExpiresAt('');
        setShowCreateModal(false);
    };

    const copyToClipboard = (text: string) => {
        navigator.clipboard.writeText(text);
        alert('API key copied to clipboard!');
    };

    return (
        <div className="max-w-6xl mx-auto">
            {/* Header */}
            <div className="mb-8 flex justify-between items-center">
                <div>
                    <Link href="/admin" className="text-zeno-cyan hover:text-cyan-300 text-sm mb-4 inline-block">
                        ← Back to Admin
                    </Link>
                    <h1 className="text-3xl font-bold text-white">API Keys</h1>
                    <p className="text-gray-400">Manage API keys for external integrations</p>
                </div>
                <button
                    onClick={() => setShowCreateModal(true)}
                    className="px-4 py-2 bg-zeno-cyan text-zeno-navy font-medium rounded-lg hover:bg-cyan-400"
                >
                    + Create API Key
                </button>
            </div>

            {/* API Keys List */}
            {loading ? (
                <div className="text-center py-12">
                    <div className="animate-spin rounded-full h-12 w-12 border-4 border-zeno-cyan border-t-transparent mx-auto"></div>
                </div>
            ) : apiKeys.length === 0 ? (
                <div className="bg-zeno-gray rounded-xl p-8 text-center border border-white/10">
                    <div className="text-5xl mb-4">🔑</div>
                    <h3 className="text-xl font-semibold text-white mb-2">No API Keys</h3>
                    <p className="text-gray-400 mb-4">Create an API key to allow external systems to access your data.</p>
                    <button onClick={() => setShowCreateModal(true)} className="text-zeno-cyan hover:text-cyan-300">
                        Create your first API key →
                    </button>
                </div>
            ) : (
                <div className="bg-zeno-gray rounded-xl border border-white/10 overflow-hidden">
                    <table className="w-full">
                        <thead>
                            <tr className="border-b border-white/10 bg-zeno-navy/50">
                                <th className="text-left py-3 px-4 text-gray-400 font-medium">Name</th>
                                <th className="text-left py-3 px-4 text-gray-400 font-medium">Key</th>
                                <th className="text-left py-3 px-4 text-gray-400 font-medium">Scope</th>
                                <th className="text-left py-3 px-4 text-gray-400 font-medium">Permissions</th>
                                <th className="text-left py-3 px-4 text-gray-400 font-medium">Status</th>
                                <th className="text-left py-3 px-4 text-gray-400 font-medium">Usage</th>
                                <th className="text-left py-3 px-4 text-gray-400 font-medium">Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {apiKeys.map(key => (
                                <tr key={key.id} className="border-b border-white/5 hover:bg-white/5">
                                    <td className="py-3 px-4">
                                        <div className="font-medium text-white">{key.name}</div>
                                        {key.description && <div className="text-xs text-gray-500">{key.description}</div>}
                                    </td>
                                    <td className="py-3 px-4">
                                        <code className="text-sm text-gray-400 bg-zeno-navy px-2 py-1 rounded">{key.key}</code>
                                    </td>
                                    <td className="py-3 px-4 text-gray-400">
                                        {key.project ? key.project.name : <span className="text-gray-500">All Projects</span>}
                                    </td>
                                    <td className="py-3 px-4">
                                        <span className={`px-2 py-1 rounded text-xs ${
                                            key.permissions.includes('write') ? 'bg-yellow-500/20 text-yellow-400' : 'bg-blue-500/20 text-blue-400'
                                        }`}>
                                            {key.permissions}
                                        </span>
                                    </td>
                                    <td className="py-3 px-4">
                                        <button
                                            onClick={() => toggleKeyStatus(key.id, key.isActive)}
                                            className={`px-2 py-1 rounded text-xs ${key.isActive ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}
                                        >
                                            {key.isActive ? 'Active' : 'Revoked'}
                                        </button>
                                    </td>
                                    <td className="py-3 px-4 text-gray-400 text-sm">{key.usageCount} requests</td>
                                    <td className="py-3 px-4">
                                        <button onClick={() => deleteApiKey(key.id, key.name)} className="text-red-400 hover:text-red-300 text-sm">
                                            Delete
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {/* Create Modal */}
            {showCreateModal && (
                <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
                    <div className="bg-zeno-gray rounded-xl p-6 max-w-lg w-full mx-4 border border-white/10">
                        <h2 className="text-xl font-bold text-white mb-4">Create API Key</h2>
                        <div className="space-y-4">
                            <div>
                                <label className="block text-gray-400 text-sm mb-1">Name *</label>
                                <input type="text" value={formName} onChange={e => setFormName(e.target.value)}
                                    className="w-full bg-zeno-navy border border-white/10 rounded-lg px-3 py-2 text-white" placeholder="e.g., Letsatsi Integration" />
                            </div>
                            <div>
                                <label className="block text-gray-400 text-sm mb-1">Description</label>
                                <input type="text" value={formDescription} onChange={e => setFormDescription(e.target.value)}
                                    className="w-full bg-zeno-navy border border-white/10 rounded-lg px-3 py-2 text-white" placeholder="Optional description" />
                            </div>
                            <div>
                                <label className="block text-gray-400 text-sm mb-1">Scope (Partner Project)</label>
                                <select value={formProjectId} onChange={e => setFormProjectId(e.target.value)}
                                    className="w-full bg-zeno-navy border border-white/10 rounded-lg px-3 py-2 text-white">
                                    <option value="">All Projects (Full Access)</option>
                                    {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                                </select>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-gray-400 text-sm mb-1">Permissions</label>
                                    <select value={formPermissions} onChange={e => setFormPermissions(e.target.value)}
                                        className="w-full bg-zeno-navy border border-white/10 rounded-lg px-3 py-2 text-white">
                                        <option value="read">Read Only</option>
                                        <option value="read,write">Read & Write</option>
                                        <option value="read,write,delete">Full Access</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-gray-400 text-sm mb-1">Rate Limit (req/hr)</label>
                                    <input type="number" value={formRateLimit} onChange={e => setFormRateLimit(Number(e.target.value))}
                                        className="w-full bg-zeno-navy border border-white/10 rounded-lg px-3 py-2 text-white" />
                                </div>
                            </div>
                            <div>
                                <label className="block text-gray-400 text-sm mb-1">Expires At (optional)</label>
                                <input type="date" value={formExpiresAt} onChange={e => setFormExpiresAt(e.target.value)}
                                    className="w-full bg-zeno-navy border border-white/10 rounded-lg px-3 py-2 text-white" />
                            </div>
                        </div>
                        <div className="flex gap-3 mt-6">
                            <button onClick={resetForm} className="flex-1 px-4 py-2 bg-gray-600 text-white rounded-lg">Cancel</button>
                            <button onClick={createApiKey} disabled={creating} className="flex-1 px-4 py-2 bg-zeno-cyan text-zeno-navy font-medium rounded-lg disabled:opacity-50">
                                {creating ? 'Creating...' : 'Create Key'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* New Key Display Modal */}
            {newKeyData && (
                <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
                    <div className="bg-zeno-gray rounded-xl p-6 max-w-lg w-full mx-4 border border-green-500/30">
                        <div className="text-center mb-4">
                            <div className="text-5xl mb-2">✅</div>
                            <h2 className="text-xl font-bold text-white">API Key Created!</h2>
                            <p className="text-gray-400 text-sm">Save this key now - you won&apos;t see it again!</p>
                        </div>
                        <div className="bg-zeno-navy rounded-lg p-4 mb-4">
                            <p className="text-gray-400 text-xs mb-1">API Key for &quot;{newKeyData.name}&quot;</p>
                            <code className="text-zeno-cyan text-sm break-all">{newKeyData.fullKey}</code>
                        </div>
                        <div className="flex gap-3">
                            <button onClick={() => copyToClipboard(newKeyData.fullKey)} className="flex-1 px-4 py-2 bg-zeno-blue border border-white/10 text-white rounded-lg">
                                📋 Copy Key
                            </button>
                            <button onClick={() => setNewKeyData(null)} className="flex-1 px-4 py-2 bg-zeno-cyan text-zeno-navy font-medium rounded-lg">
                                Done
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}


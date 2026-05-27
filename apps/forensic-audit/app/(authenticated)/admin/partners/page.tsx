'use client';
import { toast } from '@zenowethu/ui';


import { useSession } from '@zenowethu/ui';
import { useRouter } from 'next/navigation';
import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { DeleteConfirmationModal } from '@zenowethu/ui';
const logger = {
    info: (...args: any[]) => console.log('[INFO]', ...args),
    warn: (...args: any[]) => console.warn('[WARN]', ...args),
    error: (...args: any[]) => console.error('[ERROR]', ...args),
};

type Project = {
    id: string;
    name: string;
    description: string | null;
    type: string;
    clientType: string | null;  // B2B or B2C
    parentId: string | null;
    parent?: Project;
    children?: Project[];
    members?: { userId: string; role: string; user: { firstName: string; lastName: string; email: string } }[];
    _count?: { cases: number; children: number };
};

export default function PartnersManagement() {
    const { data: session, status } = useSession();
    const router = useRouter();
    const [partners, setPartners] = useState<Project[]>([]);
    const [loading, setLoading] = useState(true);
    const [showModal, setShowModal] = useState(false);
    const [editingPartner, setEditingPartner] = useState<Project | null>(null);
    const [searchQuery, setSearchQuery] = useState('');

    // Delete Modal State
    const [deleteModal, setDeleteModal] = useState<{
        isOpen: boolean;
        type: 'PROJECT' | 'CASES';
        project: Project;
        totalCases?: number;
    } | null>(null);

    // Form state
    const [formName, setFormName] = useState('');
    const [formDescription, setFormDescription] = useState('');
    const [formClientType, setFormClientType] = useState<string>('B2B'); // Default B2B
    const [formError, setFormError] = useState('');
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        if (status === 'authenticated') {
            fetchPartners();
        }
    }, [status]);

    const fetchPartners = useCallback(async () => {
        try {
            const res = await fetch('/api/projects?flat=true');
            const data = await res.json();
            if (Array.isArray(data)) {
                // Filter for ACQUISITION_SOURCE primarily
                // And ideally sort alphabetically
                const partnerProjects = data.filter((p: Project) =>
                    p.type === 'ACQUISITION_SOURCE'
                ).sort((a, b) => a.name.localeCompare(b.name));
                setPartners(partnerProjects);
            }
        } catch (error) {
            logger.error('Failed to fetch partners:', error);
        } finally {
            setLoading(false);
        }
    }, []);

    const resetForm = () => {
        setFormName('');
        setFormDescription('');
        setFormClientType('B2B');
        setFormError('');
        setEditingPartner(null);
    };

    const openCreateModal = () => {
        resetForm();
        setShowModal(true);
    };

    const openEditModal = (partner: Project) => {
        setEditingPartner(partner);
        setFormName(partner.name);
        setFormDescription(partner.description || '');
        setFormClientType(partner.clientType || 'B2B');
        setShowModal(true);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setFormError('');
        setSaving(true);

        try {
            const url = editingPartner
                ? `/api/projects/${editingPartner.id}`
                : '/api/projects';
            const method = editingPartner ? 'PATCH' : 'POST';

            const res = await fetch(url, {
                method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name: formName,
                    description: formDescription || null,
                    type: 'ACQUISITION_SOURCE', // Hardcoded
                    clientType: formClientType,
                    // Parent ID: Usually null for main sources unless rooted? 
                    // Let's assume null (Independent). If hierarchy exists, they might need to select ROOT.
                    // But simplified view -> Top Level.
                    // Existing projects fetch handles creating Root if needed. 
                    // API creates under Root if parentId missing and type is Root-able? 
                    // Let's check API. API creates under 'ROOT' if parentId is null and type isn't ROOT.
                    // So sending null parentId is fine.
                })
            });

            if (!res.ok) {
                const err = await res.json();
                throw new Error(err.error || 'Failed to save partner');
            }

            setShowModal(false);
            resetForm();
            fetchPartners();
        } catch (error) {
            setFormError(error instanceof Error ? error.message : 'An error occurred');
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async (partner: Project) => {
        setDeleteModal({
            isOpen: true,
            type: 'PROJECT',
            project: partner
        });
    };

    const executeDelete = async () => {
        if (!deleteModal) return;
        const { type, project } = deleteModal;

        try {
            const res = await fetch(`/api/projects/${project.id}`, { method: 'DELETE' });
            if (!res.ok) {
                const err = await res.json();
                throw new Error(err.error || 'Failed to delete partner');
            }
            setDeleteModal(null);
            fetchPartners();
        } catch (error) {
            const msg = error instanceof Error ? error.message : 'An error occurred during deletion';
            toast.error(msg);
        }
    };

    const filteredPartners = partners.filter(p =>
        p.name.toLowerCase().includes(searchQuery.toLowerCase())
    );

    if (status === 'loading' || loading) {
        return (
            <div className="flex items-center justify-center min-h-[60vh]">
                <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-zeno-cyan"></div>
            </div>
        );
    }

    if (!session?.user?.isAdmin) {
        // Redirect handled by layout or middleware usually, but accessible to admins
        return <div className="p-8 text-center text-red-500">Access Denied</div>;
    }

    return (
        <div className="max-w-7xl mx-auto">
            {/* Header */}
            <div className="flex items-center justify-between mb-8">
                <div>
                    <div className="flex items-center gap-3 mb-2">
                        <Link href="/admin" className="text-gray-400 hover:text-white">
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                            </svg>
                        </Link>
                        <h1 className="text-3xl font-bold text-white">Partners</h1>
                    </div>
                    <p className="text-gray-400">Manage all partners and acquisition sources</p>
                </div>

                <div className="flex items-center gap-4">
                    <div className="relative">
                        <input
                            type="text"
                            placeholder="Search partners..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-64 px-4 py-2 pl-10 bg-zeno-blue/50 border border-zeno-blue rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-zeno-cyan placeholder-gray-500"
                        />
                        <svg className="w-5 h-5 absolute left-3 top-2.5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                        </svg>
                    </div>

                    <button
                        onClick={openCreateModal}
                        className="px-4 py-2 bg-zeno-cyan text-zeno-navy font-semibold rounded-lg hover:bg-cyan-400 transition-colors flex items-center gap-2"
                    >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                        </svg>
                        Add Partner
                    </button>
                </div>
            </div>

            {/* Partners List */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {filteredPartners.length === 0 ? (
                    <div className="col-span-full p-8 text-center bg-zeno-blue/30 rounded-xl border border-zeno-blue/50 text-gray-400">
                        No partners found.
                    </div>
                ) : (
                    filteredPartners.map(partner => (
                        <div key={partner.id} className="bg-zeno-blue/30 border border-zeno-blue/50 rounded-xl p-5 hover:border-zeno-cyan/50 transition-all group">
                            <div className="flex justify-between items-start mb-3">
                                <div className="w-12 h-12 rounded-lg bg-blue-500/20 text-blue-400 flex items-center justify-center">
                                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                                    </svg>
                                </div>
                                <div className="flex gap-1">
                                    <button
                                        onClick={() => openEditModal(partner)}
                                        className="p-2 text-gray-400 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
                                        title="Edit"
                                    >
                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                        </svg>
                                    </button>
                                    <button
                                        onClick={() => handleDelete(partner)}
                                        className="p-2 text-gray-400 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
                                        title="Delete"
                                    >
                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                        </svg>
                                    </button>
                                </div>
                            </div>

                            <h3 className="text-xl font-bold text-white mb-1 truncate" title={partner.name}>{partner.name}</h3>
                            <p className="text-sm text-gray-400 mb-4 line-clamp-2 min-h-[2.5rem]">{partner.description || 'No description provided'}</p>

                            <div className="flex items-center justify-between mt-auto pt-3 border-t border-white/5">
                                <span className={`px-2 py-1 text-xs font-medium rounded ${partner.clientType === 'B2B'
                                    ? 'bg-purple-500/20 text-purple-300 border border-purple-500/30'
                                    : 'bg-zeno-cyan/20 text-zeno-cyan border border-zeno-cyan/30'
                                    }`}>
                                    {partner.clientType || 'Standard'}
                                </span>
                                {(partner._count?.cases || 0) > 0 && (
                                    <span className="text-xs text-gray-400">{partner._count?.cases} cases</span>
                                )}
                            </div>
                        </div>
                    ))
                )}
            </div>

            {/* Modal */}
            {showModal && (
                <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
                    <div className="bg-zeno-navy border border-zeno-blue rounded-xl w-full max-w-md">
                        <div className="p-6 border-b border-zeno-blue">
                            <h2 className="text-xl font-semibold text-white">
                                {editingPartner ? 'Edit Partner' : 'Add New Partner'}
                            </h2>
                        </div>
                        <form onSubmit={handleSubmit} className="p-6 space-y-4">
                            {formError && (
                                <div className="p-3 bg-red-500/20 border border-red-500/50 rounded-lg text-red-400 text-sm">
                                    {formError}
                                </div>
                            )}
                            <div>
                                <label className="block text-sm font-medium text-gray-300 mb-2">Partner Name *</label>
                                <input
                                    type="text"
                                    value={formName}
                                    onChange={(e) => setFormName(e.target.value)}
                                    placeholder="e.g., Letsatsi Referrals"
                                    className="w-full px-4 py-2 bg-zeno-blue/50 border border-zeno-blue rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-zeno-cyan"
                                    required
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-300 mb-2">Description</label>
                                <textarea
                                    value={formDescription}
                                    onChange={(e) => setFormDescription(e.target.value)}
                                    className="w-full px-4 py-2 bg-zeno-blue/50 border border-zeno-blue rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-zeno-cyan"
                                    rows={3}
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-300 mb-2">Type</label>
                                <div className="grid grid-cols-2 gap-3">
                                    <button
                                        type="button"
                                        onClick={() => setFormClientType('B2B')}
                                        className={`p-3 rounded-lg border-2 transition-all ${formClientType === 'B2B'
                                            ? 'border-purple-500 bg-purple-500/20 text-purple-300'
                                            : 'border-white/10 bg-zeno-blue/30 text-gray-400 hover:border-white/30'
                                            }`}
                                    >
                                        <div className="font-semibold">B2B (Partner)</div>
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setFormClientType('B2C')}
                                        className={`p-3 rounded-lg border-2 transition-all ${formClientType === 'B2C'
                                            ? 'border-gray-500 bg-gray-500/20 text-gray-300'
                                            : 'border-white/10 bg-zeno-blue/30 text-gray-400 hover:border-white/30'
                                            }`}
                                    >
                                        <div className="font-semibold">Other / B2C</div>
                                    </button>
                                </div>
                            </div>

                            <div className="flex gap-3 pt-4">
                                <button
                                    type="button"
                                    onClick={() => setShowModal(false)}
                                    className="flex-1 py-2 px-4 bg-zeno-blue/30 text-white rounded-lg hover:bg-zeno-blue/50 transition-colors"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    disabled={saving}
                                    className="flex-1 py-2 px-4 bg-zeno-cyan text-zeno-navy font-semibold rounded-lg hover:bg-cyan-400 transition-colors disabled:opacity-50"
                                >
                                    {saving ? 'Saving...' : 'Save Partner'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            <DeleteConfirmationModal
                isOpen={!!deleteModal}
                onClose={() => setDeleteModal(null)}
                // We're just deleting the project, not cases logic handled in modal usually, 
                // but here we simplify to check. 
                // Wait, DeleteConfirmationModal is a component.
                // Assuming it has onConfirm.
                onConfirm={executeDelete}
                title={`Delete ${deleteModal?.project.name}`}
                message="Are you sure you want to delete this partner? This action cannot be undone."
            />
        </div>
    );
}

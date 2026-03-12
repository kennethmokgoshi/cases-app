'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { logger } from '@zenowethu/shared-lib/src/logger';

type Project = {
    id: string;
    name: string;
    type: string;
};

type DocumentResource = {
    id: string;
    name: string;
    fileUrl: string;
    category: string;
    acquisitionType: string | null;
    projects: Project[];
    createdAt: string;
};

export default function AdminDocumentsPage() {
    const router = useRouter();
    const [documents, setDocuments] = useState<DocumentResource[]>([]);
    const [projects, setProjects] = useState<Project[]>([]);
    const [loading, setLoading] = useState(true);
    const [isUploading, setIsUploading] = useState(false);
    const [showModal, setShowModal] = useState(false);

    // Form State
    const [formData, setFormData] = useState({
        name: '',
        category: 'Service Level',
        acquisitionType: 'ALL',
        projectIds: [] as string[],
        file: null as File | null
    });

    useEffect(() => {
        fetchData();
    }, []);

    async function fetchData() {
        try {
            const [docsRes, projectsRes] = await Promise.all([
                fetch('/api/admin/documents'),
                fetch('/api/projects?flat=true') // Get all projects flattened
            ]);

            if (docsRes.ok) {
                setDocuments(await docsRes.json());
            }
            if (projectsRes.ok) {
                const allProjects = await projectsRes.json();
                // Filter to show mainly relevant projects (ROOT, ACQUISITION_SOURCE) to avoid clutter?
                // Or user might want to link to specific branch. Let's start with all but maybe sort/filter in UI.
                // For now, let's keep all but emphasize Sources.
                setProjects(allProjects.filter((p: Project) =>
                    p.type === 'ROOT' || p.type === 'ACQUISITION_SOURCE' || p.type === 'BRANCH'
                ));
            }
        } catch (error) {
            logger.error('Failed to fetch data', error);
        } finally {
            setLoading(false);
        }
    }

    async function handleDelete(id: string) {
        if (!confirm('Are you sure you want to delete this document?')) return;

        try {
            const res = await fetch(`/api/admin/documents/${id}`, { method: 'DELETE' });
            if (res.ok) {
                setDocuments(docs => docs.filter(d => d.id !== id));
            } else {
                alert('Failed to delete document');
            }
        } catch (error) {
            logger.error('Delete error', error);
        }
    }

    async function handleUpload(e: React.FormEvent) {
        e.preventDefault();
        if (!formData.file || !formData.name) {
            alert('Please provide a name and select a file.');
            return;
        }

        setIsUploading(true);
        try {
            // 1. Upload File
            const uploadData = new FormData();
            uploadData.append('file', formData.file);

            const uploadRes = await fetch('/api/admin/documents/upload', {
                method: 'POST',
                body: uploadData
            });

            if (!uploadRes.ok) throw new Error('File upload failed');
            const fileInfo = await uploadRes.json();

            // 2. Create Resource Record
            // Convert 'ALL' acquisition type back to null for API if needed, 
            // or API handles it. My API expects null for global.
            const payload = {
                name: formData.name,
                fileUrl: fileInfo.url,
                fileSize: fileInfo.size,
                mimeType: fileInfo.mimeType,
                category: formData.category,
                acquisitionType: formData.acquisitionType === 'ALL' ? null : formData.acquisitionType,
                projectIds: formData.projectIds
            };

            const createRes = await fetch('/api/admin/documents', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (createRes.ok) {
                setShowModal(false);
                setFormData({
                    name: '',
                    category: 'Service Level',
                    acquisitionType: 'ALL',
                    projectIds: [],
                    file: null
                });
                fetchData(); // Refresh list
            } else {
                throw new Error('Failed to save document metadata');
            }

        } catch (error) {
            logger.error('Upload Error', error);
            alert('Failed to upload document');
        } finally {
            setIsUploading(false);
        }
    }

    const toggleProject = (projectId: string) => {
        setFormData(prev => {
            const current = prev.projectIds;
            if (current.includes(projectId)) {
                return { ...prev, projectIds: current.filter(id => id !== projectId) };
            } else {
                return { ...prev, projectIds: [...current, projectId] };
            }
        });
    };

    if (loading) return <div className="p-8 text-center text-gray-400">Loading...</div>;

    return (
        <div className="max-w-7xl mx-auto">
            <div className="flex items-center justify-between mb-8">
                <div>
                    <h1 className="text-3xl font-bold text-white mb-2">Document Resources</h1>
                    <p className="text-gray-400">Manage system-wide document templates and resources</p>
                </div>
                <button
                    onClick={() => setShowModal(true)}
                    className="px-6 py-2 bg-zeno-cyan text-zeno-navy font-bold rounded-lg hover:bg-cyan-400 transition-colors"
                >
                    + Upload Document
                </button>
            </div>

            {/* List */}
            <div className="bg-zeno-blue/20 rounded-xl border border-white/5 overflow-hidden">
                <table className="w-full text-left">
                    <thead className="bg-zeno-blue/30 border-b border-white/5">
                        <tr>
                            <th className="px-6 py-4 text-xs font-semibold text-gray-400 uppercase">Name</th>
                            <th className="px-6 py-4 text-xs font-semibold text-gray-400 uppercase">Category</th>
                            <th className="px-6 py-4 text-xs font-semibold text-gray-400 uppercase">Access (Type)</th>
                            <th className="px-6 py-4 text-xs font-semibold text-gray-400 uppercase">Projects</th>
                            <th className="px-6 py-4 text-xs font-semibold text-gray-400 uppercase text-right">Actions</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                        {documents.length === 0 ? (
                            <tr><td colSpan={5} className="px-6 py-8 text-center text-gray-500">No documents found.</td></tr>
                        ) : (
                            documents.map(doc => (
                                <tr key={doc.id} className="hover:bg-white/5">
                                    <td className="px-6 py-4">
                                        <div className="text-white font-medium">{doc.name}</div>
                                        <a href={doc.fileUrl} target="_blank" rel="noreferrer" className="text-xs text-zeno-cyan hover:underline truncate block max-w-xs">
                                            {doc.fileUrl.split('/').pop()}
                                        </a>
                                    </td>
                                    <td className="px-6 py-4 text-gray-300">{doc.category}</td>
                                    <td className="px-6 py-4">
                                        <span className={`inline-flex px-2 py-1 rounded text-xs font-medium ${!doc.acquisitionType ? 'bg-green-500/20 text-green-400' :
                                                doc.acquisitionType === 'B2B' ? 'bg-purple-500/20 text-purple-400' :
                                                    'bg-blue-500/20 text-blue-400'
                                            }`}>
                                            {doc.acquisitionType || 'Global / All'}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4">
                                        <div className="flex flex-wrap gap-1">
                                            {doc.projects.length > 0 ? doc.projects.map(p => (
                                                <span key={p.id} className="px-2 py-0.5 bg-gray-700 rounded text-xs text-gray-300">
                                                    {p.name}
                                                </span>
                                            )) : (
                                                <span className="text-gray-500 italic text-xs">All Projects</span>
                                            )}
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 text-right">
                                        <button
                                            onClick={() => handleDelete(doc.id)}
                                            className="text-red-400 hover:text-red-300 text-sm font-medium"
                                        >
                                            Delete
                                        </button>
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>

            {/* Modal */}
            {showModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
                    <div className="bg-zeno-navy border border-white/10 rounded-xl p-8 max-w-lg w-full max-h-[90vh] overflow-y-auto">
                        <h2 className="text-xl font-bold text-white mb-6">Upload Document</h2>
                        <form onSubmit={handleUpload} className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-400 mb-1">Name</label>
                                <input
                                    type="text"
                                    value={formData.name}
                                    onChange={e => setFormData({ ...formData, name: e.target.value })}
                                    className="w-full px-4 py-2 bg-black/20 border border-white/10 rounded-lg text-white focus:outline-none focus:border-zeno-cyan"
                                    placeholder="e.g. Service Level Agreement"
                                    required
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-400 mb-1">Category</label>
                                <select
                                    value={formData.category}
                                    onChange={e => setFormData({ ...formData, category: e.target.value })}
                                    className="w-full px-4 py-2 bg-black/20 border border-white/10 rounded-lg text-white focus:outline-none focus:border-zeno-cyan"
                                >
                                    <option value="Service Level">Service Level</option>
                                    <option value="POA">POA</option>
                                    <option value="Certificate">Certificate</option>
                                    <option value="Compliance">Compliance</option>
                                    <option value="Reference">Reference</option>
                                    <option value="Other">Other</option>
                                </select>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-400 mb-1">Link to Type</label>
                                <select
                                    value={formData.acquisitionType}
                                    onChange={e => setFormData({ ...formData, acquisitionType: e.target.value })}
                                    className="w-full px-4 py-2 bg-black/20 border border-white/10 rounded-lg text-white focus:outline-none focus:border-zeno-cyan"
                                >
                                    <option value="ALL">All (Zenowethu Global)</option>
                                    <option value="B2B">B2B (Partners Only)</option>
                                    <option value="B2C">B2C (Direct Only)</option>
                                </select>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-400 mb-2">Link to Projects (Optional)</label>
                                <div className="max-h-40 overflow-y-auto border border-white/10 rounded-lg p-2 bg-black/20">
                                    {projects.length === 0 ? (
                                        <div className="text-gray-500 text-sm">No projects available</div>
                                    ) : (
                                        projects.map(p => (
                                            <div key={p.id} className="flex items-center py-1">
                                                <input
                                                    type="checkbox"
                                                    id={`proj-${p.id}`}
                                                    checked={formData.projectIds.includes(p.id)}
                                                    onChange={() => toggleProject(p.id)}
                                                    className="w-4 h-4 rounded border-gray-600 bg-gray-700 text-zeno-cyan focus:ring-offset-0"
                                                />
                                                <label htmlFor={`proj-${p.id}`} className="ml-2 text-sm text-gray-300">
                                                    {p.name} <span className="text-xs text-gray-500">({p.type})</span>
                                                </label>
                                            </div>
                                        ))
                                    )}
                                </div>
                                <p className="text-xs text-gray-500 mt-1">
                                    If no projects selected, document is available to all projects within the selected Type.
                                </p>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-400 mb-1">File</label>
                                <input
                                    type="file"
                                    onChange={e => setFormData({ ...formData, file: e.target.files?.[0] || null })}
                                    className="w-full text-gray-300 text-sm file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-bold file:bg-zeno-cyan file:text-zeno-navy hover:file:bg-cyan-400 cursor-pointer"
                                />
                            </div>

                            <div className="flex justify-end gap-3 mt-6">
                                <button
                                    type="button"
                                    onClick={() => setShowModal(false)}
                                    className="px-4 py-2 text-gray-300 hover:text-white font-medium"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    disabled={isUploading}
                                    className="px-6 py-2 bg-zeno-cyan text-zeno-navy font-bold rounded-lg hover:bg-cyan-400 transition-colors disabled:opacity-50 flex items-center gap-2"
                                >
                                    {isUploading ? (
                                        <>
                                            <div className="w-4 h-4 border-2 border-zeno-navy border-t-transparent rounded-full animate-spin"></div>
                                            Uploading...
                                        </>
                                    ) : (
                                        'Save Document'
                                    )}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}

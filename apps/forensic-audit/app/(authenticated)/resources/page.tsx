'use client';

import { useSession } from '@zenowethu/ui';
import { useEffect, useState } from 'react';
const logger = {
    info: (...args: any[]) => console.log('[INFO]', ...args),
    warn: (...args: any[]) => console.warn('[WARN]', ...args),
    error: (...args: any[]) => console.error('[ERROR]', ...args),
};

type DocumentResource = {
    id: string;
    name: string;
    fileUrl: string;
    category: string;
    description?: string;
    acquisitionType: string | null;
    createdAt: string;
};

export default function ResourcesPage() {
    const { data: session } = useSession();
    const [documents, setDocuments] = useState<DocumentResource[]>([]);
    const [loading, setLoading] = useState(true);
    const [mounted, setMounted] = useState(false);

    // Track client-side hydration
    useEffect(() => {
        setMounted(true);
    }, []);

    useEffect(() => {
        if (session?.user) {
            fetchDocuments();
        }
    }, [session]);

    async function fetchDocuments() {
        try {
            // Determine context from user organization
            const org = session?.user?.organization || 'Zenowethu';
            let params = new URLSearchParams();

            // If Admin or Zenowethu staff, they might want to see everything or select context.
            // For now, let's assume if org is NOT Zenowethu, we check if there's a matching project.
            // And acquisitionType? 

            // Logic:
            // 1. Fetch project ID for the user's organization name
            // 2. Pass that to the resources API

            let projectId = '';
            let type = ''; // B2B or B2C

            if (org === 'Letsatsi Finance' || org === 'Letsatsi' || org.includes('Letsatsi')) {
                type = 'B2B'; // Assuming Partners are B2B
                // We need to find the project ID for "Letsatsi Finance" or similar.
                // Since we don't have it in session, we might need to search for it first.
                const projectsRes = await fetch(`/api/projects?flat=true`);
                const allProjects = await projectsRes.json();
                const userProject = allProjects.find((p: any) => p.name.includes('Letsatsi')); // Simple match for now
                if (userProject) params.append('projectId', userProject.id);
                params.append('acquisitionType', 'B2B');
            } else if (org.includes('Shosholoza')) {
                type = 'B2B';
                const projectsRes = await fetch(`/api/projects?flat=true`);
                const allProjects = await projectsRes.json();
                const userProject = allProjects.find((p: any) => p.name.includes('Shosholoza'));
                if (userProject) params.append('projectId', userProject.id);
                params.append('acquisitionType', 'B2B');
            } else if (org.includes('Future Finance')) {
                type = 'B2B';
                const projectsRes = await fetch(`/api/projects?flat=true`);
                const allProjects = await projectsRes.json();
                const userProject = allProjects.find((p: any) => p.name.includes('Future Finance'));
                if (userProject) params.append('projectId', userProject.id);
                params.append('acquisitionType', 'B2B');
            } else {
                // Zenowethu / Internal
                // Show everything? or just Global?
                // If I leave params empty, the API might return only Global logic or everything depending on API impl.
                // Currently API: 
                // if (projectId) matches Linked OR Global
                // if (!projectId) it... wait.

                // Let's refine API behavior or client behavior.
                // If I am internal, I probably want to see ALL resources.
                // My API currently returns Global + Linked-to-Null.

                // If I am admin/internal, maybe I pass a flag or the API handles "Zenowethu" organization specially?
                // But the user said: "The document... users must have access to based on the kind of document who has logged in".

                // If I'm Zenowethu, I should see "Zenowethu POA" (which is global/all).
                // I should NOT see "Letsatsi Service Level" unless I'm part of that project?
                // "Service level of Letsatsi Should only be available to Letsatsi project"
                // "Zenowethu POA all stake holders can have access to that"

                // So internal Zenowethu users likely see only Global/Shared docs by default, 
                // UNLESS they specifically go to a Project page (which implies context).
                // For this "My Resources" page, showing Global items is safe.
            }

            const res = await fetch(`/api/resources?${params.toString()}`);
            if (res.ok) {
                setDocuments(await res.json());
            }
        } catch (error) {
            logger.error('Failed to fetch resources', error);
        } finally {
            setLoading(false);
        }
    }

    if (loading) {
        return (
            <div className="flex items-center justify-center h-96">
                <div className="text-gray-400">Loading documents...</div>
            </div>
        );
    }

    const categories = Array.from(new Set(documents.map(d => d.category)));

    return (
        <div className="max-w-7xl mx-auto">
            <div className="mb-8">
                <h1 className="text-3xl font-bold text-white mb-2">Documents & Resources</h1>
                <p className="text-gray-400">
                    Access standard templates, compliance documents, and service agreements relevant to your account.
                </p>
            </div>

            {documents.length === 0 ? (
                <div className="text-center text-gray-500 py-12 bg-zeno-blue/20 rounded-xl border border-white/5">
                    No documents available for your account at this time.
                </div>
            ) : (
                <div className="space-y-8">
                    {categories.map(category => (
                        <div key={category}>
                            <h2 className="text-lg font-semibold text-zeno-cyan mb-4 px-2 uppercase tracking-wide">
                                {category}
                            </h2>
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                                {documents.filter(d => d.category === category).map(doc => (
                                    <a
                                        key={doc.id}
                                        href={doc.fileUrl}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="bg-zeno-blue/20 border border-white/5 rounded-xl p-6 hover:border-zeno-cyan/50 hover:bg-zeno-blue/30 transition-all group"
                                    >
                                        <div className="flex items-start justify-between mb-4">
                                            <div className="p-3 bg-zeno-navy rounded-lg group-hover:scale-110 transition-transform">
                                                <svg className="w-8 h-8 text-zeno-cyan" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                                                </svg>
                                            </div>
                                            <span className="text-xs text-gray-500 bg-black/20 px-2 py-1 rounded">
                                                {mounted ? new Date(doc.createdAt).toLocaleDateString() : ''}
                                            </span>
                                        </div>
                                        <h3 className="text-white font-medium mb-1 group-hover:text-zeno-cyan transition-colors truncate" title={doc.name}>
                                            {doc.name}
                                        </h3>
                                        <p className="text-sm text-gray-400 truncate">
                                            {doc.description || 'Download PDF'}
                                        </p>
                                    </a>
                                ))}
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

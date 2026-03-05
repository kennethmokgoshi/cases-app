'use client';

import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useEffect, useState, useCallback, Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { ProjectMembersModal } from '@zenowethu/ui';

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
    clientType: string | null;
    parentId: string | null;
    parent?: Project;
    children?: Project[];
    members?: { userId: string; role: string; user: { firstName: string; lastName: string; email: string } }[];
    _count?: { cases: number; children: number };
};

export default function ProjectsDirectory() {
    return (
        <Suspense fallback={<div className="flex items-center justify-center min-h-[60vh] text-white">Loading...</div>}>
            <ProjectsDirectoryComponent />
        </Suspense>
    );
}

function ProjectsDirectoryComponent() {
    const { data: session, status } = useSession();
    const router = useRouter();
    const searchParams = useSearchParams();
    const [projects, setProjects] = useState<Project[]>([]);
    const [loading, setLoading] = useState(true);

    // View/Edit Members Modal State
    const [viewingMembersProject, setViewingMembersProject] = useState<Project | null>(null);

    const [expandedProjects, setExpandedProjects] = useState<Set<string>>(new Set());

    const fetchProjects = useCallback(async () => {
        try {
            const res = await fetch('/api/projects?flat=true');
            const data = await res.json();
            setProjects(data);
        } catch (error) {
            logger.error('Failed to fetch projects:', error);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        if (status === 'authenticated') {
            fetchProjects();
        }
    }, [session, status, fetchProjects]);

    const buildTree = (items: Project[], parentId: string | null = null): Project[] => {
        return items
            .filter(item => item.parentId === parentId)
            .map(item => ({ ...item, children: buildTree(items, item.id) }));
    };

    const toggleExpand = (id: string) => {
        setExpandedProjects(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    const calculateTotalCases = (project: Project): number => {
        const directCases = project._count?.cases || 0;
        const childrenCases = project.children?.reduce((acc, child) => acc + calculateTotalCases(child), 0) || 0;
        return directCases + childrenCases;
    };

    const projectTree = buildTree(projects);

    const renderProjectRow = (project: Project, depth: number = 0) => {
        const hasChildren = project.children && project.children.length > 0;
        const isExpanded = expandedProjects.has(project.id);
        const totalCases = calculateTotalCases(project);

        return (
            <div key={project.id}>
                <div
                    className={`flex items-center gap-3 px-4 py-3 hover:bg-white/5 border-b border-zeno-blue/30 transition-colors ${depth > 0 ? 'bg-zeno-navy/30' : ''}`}
                    style={{ paddingLeft: `${16 + depth * 24}px` }}
                >
                    {/* Expand/Collapse */}
                    <button
                        onClick={() => toggleExpand(project.id)}
                        className={`w-6 h-6 flex items-center justify-center rounded text-gray-400 hover:text-white hover:bg-white/10 ${!hasChildren && 'invisible'}`}
                    >
                        <svg className={`w-4 h-4 transition-transform ${isExpanded ? 'rotate-90' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </svg>
                    </button>

                    {/* Folder Icon */}
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${project.type === 'ROOT' ? 'bg-purple-500/20 text-purple-400' :
                        project.type === 'ACQUISITION_SOURCE' ? 'bg-blue-500/20 text-blue-400' :
                            project.type === 'BRANCH' ? 'bg-green-500/20 text-green-400' :
                                project.type === 'YEAR' ? 'bg-orange-500/20 text-orange-400' :
                                    project.type === 'MONTH' ? 'bg-cyan-500/20 text-cyan-400' :
                                        'bg-gray-500/20 text-gray-400'
                        }`}>
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                        </svg>
                    </div>

                    {/* Name & Type */}
                    <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                            <p className="text-white font-medium truncate">{project.name}</p>
                            {project.clientType && (
                                <span className={`px-2 py-0.5 text-xs font-medium rounded ${project.clientType === 'B2B'
                                    ? 'bg-purple-500/20 text-purple-300 border border-purple-500/30'
                                    : 'bg-teal-500/20 text-teal-300 border border-teal-500/30'
                                    }`}>
                                    {project.clientType}
                                </span>
                            )}
                            {/* Member Count Indicator - Clickable for everyone to view */}
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    setViewingMembersProject(project);
                                }}
                                className={`flex items-center gap-1 px-2 py-0.5 rounded text-xs border transition-colors ${project.members && project.members.length > 0
                                    ? 'bg-gray-700/50 text-gray-300 border-gray-600/30 hover:bg-gray-600'
                                    : 'bg-transparent text-gray-500 border-gray-700/30 hover:bg-white/5 hover:text-gray-300'
                                    }`}
                                title="View Members"
                            >
                                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
                                </svg>
                                <span>{project.members?.length || 0}</span>
                            </button>
                        </div>
                        <p className="text-xs text-gray-500">{project.type}</p>
                    </div>

                    {/* Children & Cases Count */}
                    <div className="text-xs flex gap-4 hidden sm:flex">
                        {totalCases > 0 ? (
                            <Link
                                href={`/cases?projectId=${project.id}`}
                                className="text-gray-400 hover:text-zeno-cyan hover:underline transition-colors"
                            >
                                {totalCases} cases
                            </Link>
                        ) : (
                            <span className="text-gray-500">{totalCases} cases</span>
                        )}
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-2">
                        <button
                            onClick={() => setViewingMembersProject(project)}
                            className="p-2 text-gray-400 hover:text-purple-300 hover:bg-white/5 rounded-lg transition-colors"
                            title="Team Members"
                        >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
                            </svg>
                        </button>
                    </div>
                </div>

                {/* Children */}
                {isExpanded && project.children?.map(child => renderProjectRow(child, depth + 1))}
            </div>
        );
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-[60vh]">
                <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-zeno-cyan"></div>
            </div>
        );
    }

    return (
        <div className="max-w-7xl mx-auto space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold text-white mb-2">Projects Directory</h1>
                    <p className="text-gray-400">Browse projects and view team members.</p>
                </div>
                {/* Admin Link shortcut if Admin */}
                {session?.user?.isAdmin && (
                    <Link href="/admin/projects" className="px-4 py-2 text-sm bg-zeno-blue/30 border border-zeno-blue text-gray-300 rounded-lg hover:bg-zeno-blue/50 transition-colors">
                        Manage Hierarchy (Admin)
                    </Link>
                )}
            </div>

            {/* Tree */}
            <div className="bg-zeno-blue/20 border border-white/5 rounded-xl overflow-hidden">
                <div className="px-4 py-3 bg-zeno-blue/30 border-b border-white/5 flex justify-between items-center">
                    <p className="text-sm font-medium text-gray-300">Project Structure</p>
                    <button
                        onClick={() => {
                            // Expand/Collapse All
                            setExpandedProjects(new Set(projects.map(p => p.id)))
                        }}
                        className="text-xs text-zeno-cyan hover:underline"
                    >
                        Expand All
                    </button>
                </div>
                {projectTree.length === 0 ? (
                    <div className="p-8 text-center text-gray-400">
                        No projects found.
                    </div>
                ) : (
                    projectTree.map(project => renderProjectRow(project))
                )}
            </div>

            {/* View/Edit Members Modal (Reusable Component) */}
            {viewingMembersProject && (
                <ProjectMembersModal
                    project={viewingMembersProject}
                    isOpen={!!viewingMembersProject}
                    onClose={() => setViewingMembersProject(null)}
                    onUpdate={fetchProjects}
                    currentUserId={session?.user?.id}
                    isAdmin={session?.user?.isAdmin}
                />
            )}
        </div>
    );
}

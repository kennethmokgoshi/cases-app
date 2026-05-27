'use client';
import { toast } from '@zenowethu/ui';


import { useSession } from '@zenowethu/ui';
import { useRouter } from 'next/navigation';
import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { DeleteConfirmationModal } from '@zenowethu/ui';
import { MoveProjectModal } from '@zenowethu/ui';
import { DestinationPathSelector } from '@zenowethu/ui';
import { logger } from '@zenowethu/shared-lib/src/logger';

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

type User = {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
};

type Group = {
    id: string;
    name: string;
    members: { user: User }[];
    _count: { members: number };
};

const PROJECT_TYPES = [
    { value: 'ROOT', label: 'Root', description: 'Top-level container' },
    { value: 'ACQUISITION_SOURCE', label: 'Acquisition Source', description: 'Letsatsi, Shosholoza, etc.' },
    { value: 'BRANCH', label: 'Branch', description: 'Sunny Side, Pretoria, etc.' },
    { value: 'YEAR', label: 'Year', description: '2024, 2025, etc.' },
    { value: 'MONTH', label: 'Month', description: 'January, February, etc.' },
    { value: 'FOLDER', label: 'Folder', description: 'General folder' },
];

export default function ProjectsManagement() {
    const { data: session, status } = useSession();
    const router = useRouter();
    const [projects, setProjects] = useState<Project[]>([]);
    const [loading, setLoading] = useState(true);
    const [showModal, setShowModal] = useState(false);
    const [editingProject, setEditingProject] = useState<Project | null>(null);
    const [searchQuery, setSearchQuery] = useState('');

    const [viewingMembersProject, setViewingMembersProject] = useState<Project | null>(null);
    const [modalMembers, setModalMembers] = useState<{ userId: string; role: string }[]>([]);
    const [expandedProjects, setExpandedProjects] = useState<Set<string>>(new Set());

    // Selection State
    const [selectedIds, setSelectedIds] = useState<string[]>([]);
    const [showMoveModal, setShowMoveModal] = useState(false);

    // Delete Modal State
    const [deleteModal, setDeleteModal] = useState<{
        isOpen: boolean;
        type: 'PROJECT' | 'CASES' | 'BULK_PROJECTS';
        project?: Project;
        projectIds?: string[];
        totalCases?: number;
    } | null>(null);

    // Pagination state
    const [currentPage, setCurrentPage] = useState(1);
    const ITEMS_PER_PAGE = 20;

    // Form state
    const [formName, setFormName] = useState('');
    const [formDescription, setFormDescription] = useState('');
    const [formType, setFormType] = useState('FOLDER');
    const [formClientType, setFormClientType] = useState<string | null>(null);  // B2B or B2C
    const [formParentId, setFormParentId] = useState<string | null>(null);
    const [formMembers, setFormMembers] = useState<{ userId: string; role: string }[]>([]);
    const [formError, setFormError] = useState('');
    const [saving, setSaving] = useState(false);

    // Structured Move State (The Cases Way)
    const [useStructuredMove, setUseStructuredMove] = useState(false);
    const [structuredPathDetails, setStructuredPathDetails] = useState<{
        year: string;
        month: string;
        sourceId: string;
        subprojectId?: string;
    } | null>(null);

    // Users and Groups for selection
    const [allUsers, setAllUsers] = useState<User[]>([]);
    const [allGroups, setAllGroups] = useState<Group[]>([]);

    useEffect(() => {
        const fetchData = async () => {
            try {
                const [usersRes, groupsRes] = await Promise.all([
                    fetch('/api/users'),
                    fetch('/api/groups')
                ]);

                if (usersRes.ok) {
                    const users = await usersRes.json();
                    if (Array.isArray(users)) setAllUsers(users);
                }

                if (groupsRes.ok) {
                    const groups = await groupsRes.json();
                    if (Array.isArray(groups)) setAllGroups(groups);
                }
            } catch (e) { logger.error('Failed to fetch users or groups', e); }
        };
        if (status === 'authenticated') fetchData();
    }, [status]);

    useEffect(() => {
        if (viewingMembersProject && viewingMembersProject.members) {
            setModalMembers(viewingMembersProject.members.map(m => ({ userId: m.userId, role: m.role })));
        } else {
            setModalMembers([]);
        }
    }, [viewingMembersProject]);

    const fetchProjects = useCallback(async () => {
        try {
            const res = await fetch('/api/projects?flat=true&all=true');
            const data = await res.json();
            if (Array.isArray(data)) {
                setProjects(data);
            } else {
                logger.error('Expected array for projects, got:', data);
                setProjects([]);
            }
        } catch (error) {
            logger.error('Failed to fetch projects:', error);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        // Redirect logic: If not admin, do we allow? 
        // Plan said: "Allow Edit Project button for Project Managers".
        // So we should remove strict admin requirement here.
        if (status === 'authenticated') {
            fetchProjects();
        }
    }, [session, status, router, fetchProjects]);

    const resetForm = () => {
        setFormName('');
        setFormDescription('');
        setFormType('FOLDER');
        setFormClientType(null);
        setFormParentId(null);
        setFormMembers([]);
        setFormError('');
        setEditingProject(null);
        setUseStructuredMove(false);
        setStructuredPathDetails(null);
    };

    const openCreateModal = (parentId?: string) => {
        resetForm();
        if (parentId) {
            setFormParentId(parentId);
            // Member Inheritance Logic
            const parentProject = projects.find(p => p.id === parentId);
            if (parentProject && parentProject.members) {
                // Map parent members to form members, defaulting role to MEMBER unless specified otherwise?
                // Plan says: "mebers of the main project should be memebrs of the sub-project by default"
                // So we copy them.
                const inheritedMembers = parentProject.members.map(m => ({
                    userId: m.userId,
                    role: m.role // Optionally inherit role or default to MEMBER? User didn't specify, but keeping role seems safer for "managers managing subprojects"
                }));
                setFormMembers(inheritedMembers);
            }
        }
        setShowModal(true);
    };

    const openEditModal = (project: Project) => {
        setEditingProject(project);
        setFormName(project.name);
        setFormDescription(project.description || '');
        setFormType(project.type);
        setFormClientType(project.clientType);
        setFormClientType(project.clientType);
        setFormParentId(project.parentId);
        setFormMembers(project.members?.map(m => ({ userId: m.userId, role: m.role })) || []);
        setShowModal(true);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setFormError('');
        setSaving(true);

        try {
            let finalParentId = formParentId;

            // Handle Structured Move (The Cases Way)
            if (useStructuredMove && structuredPathDetails && structuredPathDetails.sourceId) {
                const baseProjectId = structuredPathDetails.subprojectId || structuredPathDetails.sourceId;

                // 1. Create/Find Year
                const yearRes = await fetch('/api/projects/ensure-path', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        parentId: baseProjectId,
                        name: structuredPathDetails.year,
                        type: 'YEAR'
                    }) });
                if (!yearRes.ok) throw new Error('Failed to create/find target Year project');
                const yearProject = await yearRes.json();

                // 2. Create/Find Month
                const monthRes = await fetch('/api/projects/ensure-path', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        parentId: yearProject.id,
                        name: structuredPathDetails.month,
                        type: 'MONTH'
                    }) });
                if (!monthRes.ok) throw new Error('Failed to create/find target Month project');
                const monthProject = await monthRes.json();

                finalParentId = monthProject.id;
            }

            const url = editingProject
                ? `/api/projects/${editingProject.id}`
                : '/api/projects';
            const method = editingProject ? 'PATCH' : 'POST';

            const res = await fetch(url, {
                method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name: formName,
                    description: formDescription || null,
                    type: formType,
                    clientType: formType === 'ACQUISITION_SOURCE' ? formClientType : null,
                    parentId: finalParentId,
                    members: formMembers
                })
            });

            if (!res.ok) {
                const err = await res.json();
                throw new Error(err.error || 'Failed to save project');
            }

            setShowModal(false);
            resetForm();
            fetchProjects();
        } catch (error) {
            setFormError(error instanceof Error ? error.message : 'An error occurred');
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async (project: Project) => {
        setDeleteModal({
            isOpen: true,
            type: 'PROJECT',
            project
        });
    };

    const handleDeleteCases = async (project: Project) => {
        const totalCases = calculateTotalCases(project);
        if (totalCases === 0) {
            toast.error('No cases to delete in this project.');
            return;
        }
        setDeleteModal({
            isOpen: true,
            type: 'CASES',
            project,
            totalCases
        });
    };

    const handleBulkDelete = () => {
        if (selectedIds.length === 0) return;
        setDeleteModal({
            isOpen: true,
            type: 'BULK_PROJECTS',
            projectIds: selectedIds
        });
    };

    const executeDelete = async () => {
        if (!deleteModal) return;
        const { type, project, projectIds } = deleteModal;

        try {
            if (type === 'PROJECT' && project) {
                const res = await fetch(`/api/projects/${project.id}`, { method: 'DELETE' });
                if (!res.ok) {
                    const err = await res.json();
                    throw new Error(err.error || 'Failed to delete project');
                }
            } else if (type === 'CASES' && project) {
                const res = await fetch(`/api/projects/${project.id}/delete-cases`, { method: 'DELETE' });
                if (!res.ok) {
                    const err = await res.json();
                    throw new Error(err.error || 'Failed to delete cases');
                }
            } else if (type === 'BULK_PROJECTS' && projectIds) {
                const res = await fetch('/api/projects/bulk-delete', {
                    method: 'DELETE',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ projectIds })
                });

                if (!res.ok) {
                    const err = await res.json();
                    throw new Error(err.error || 'Failed to delete projects');
                }

                const result = await res.json();
                if (result.failedCount > 0) {
                    const failedNames = result.failed.map((f: any) => `${f.name} (${f.reason})`).join(', ');
                    toast.error(`${result.message}\n\nFailed projects: ${failedNames}`);
                } else {
                    toast.error(result.message);
                }
                setSelectedIds([]); // Clear selection on bulk success
            }
            setDeleteModal(null); // Close modal on success
            fetchProjects();
        } catch (error) {
            const msg = error instanceof Error ? error.message : 'An error occurred during deletion';
            toast.error(msg); // Or use a toast notification
            logger.error(error);
        }
    };



    const toggleExpand = (id: string) => {
        setExpandedProjects(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    const toggleSelection = (id: string) => {
        setSelectedIds(prev =>
            prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
        );
    };
    const handleSaveMembers = async () => {
        if (!viewingMembersProject) return;
        setSaving(true);
        try {
            const res = await fetch(`/api/projects/${viewingMembersProject.id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    members: modalMembers
                })
            });

            if (!res.ok) {
                const errData = await res.json().catch(() => ({}));
                throw new Error(errData.error || 'Failed to update members');
            }

            await fetchProjects();
            setViewingMembersProject(null); // Close modal on success
        } catch (error) {
            const msg = error instanceof Error ? error.message : 'Failed to save members';
            toast.error(msg);
            logger.error(error);
        } finally {
            setSaving(false);
        }
    };



    // Build Hydrated Project Map for accurate recursive counts (Search & Tree)
    const { projectTree, hydratedProjects } = (() => {
        const map = new Map<string, Project>();
        // 1. Initialize Map
        projects.forEach(p => map.set(p.id, { ...p, children: [] }));

        // 2. Build Relations
        projects.forEach(p => {
            if (p.parentId && map.has(p.parentId)) {
                map.get(p.parentId)!.children!.push(map.get(p.id)!);
            }
        });

        const allHydrated = Array.from(map.values());
        const roots = allHydrated.filter(p => !p.parentId);

        return { projectTree: roots, hydratedProjects: allHydrated };
    })();

    // Search Logic
    const getDisplayedProjects = () => {
        if (!searchQuery.trim()) return projectTree;

        const lowerQuery = searchQuery.toLowerCase();
        // Use hydratedProjects so that 'children' are populated for filtered items too
        return hydratedProjects.filter(p =>
            p.name.toLowerCase().includes(lowerQuery) ||
            (p.description && p.description.toLowerCase().includes(lowerQuery))
        );
    };

    const displayedProjects = getDisplayedProjects();

    // Pagination logic
    const totalPages = Math.ceil(displayedProjects.length / ITEMS_PER_PAGE);
    const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
    const endIndex = startIndex + ITEMS_PER_PAGE;
    const paginatedProjects = displayedProjects.slice(startIndex, endIndex);

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
                    <p className="text-gray-400">You do not have permission to access the Project Management admin page.</p>
                </div>
            </div>
        );
    }

    const calculateTotalCases = (project: Project): number => {
        const directCases = project._count?.cases || 0;
        const childrenCases = project.children?.reduce((acc, child) => acc + calculateTotalCases(child), 0) || 0;
        return directCases + childrenCases;
    };

    const renderProjectRow = (project: Project, depth: number = 0) => {
        const hasChildren = project.children && project.children.length > 0;
        const isExpanded = expandedProjects.has(project.id);
        const totalCases = calculateTotalCases(project);

        return (
            <div key={project.id}>
                <div
                    className={`flex items-center gap-3 px-4 py-3 hover:bg-white/5 border-b border-zeno-blue/30 ${depth > 0 ? 'bg-zeno-navy/30' : ''} ${selectedIds.includes(project.id) ? 'bg-zeno-cyan/10' : ''}`}
                    style={{ paddingLeft: `${16 + depth * 24}px` }}
                >
                    {/* Selection Checkbox */}
                    <div className="flex items-center pr-2">
                        <input
                            type="checkbox"
                            checked={selectedIds.includes(project.id)}
                            onChange={() => toggleSelection(project.id)}
                            className="w-4 h-4 rounded border-white/10 bg-zeno-blue text-zeno-cyan focus:ring-zeno-cyan"
                        />
                    </div>
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
                            {/* B2B/B2C Badge for main source projects */}
                            {project.clientType && (
                                <span className={`px-2 py-0.5 text-xs font-medium rounded ${project.clientType === 'B2B'
                                    ? 'bg-purple-500/20 text-purple-300 border border-purple-500/30'
                                    : 'bg-teal-500/20 text-teal-300 border border-teal-500/30'
                                    }`}>
                                    {project.clientType}
                                </span>
                            )}
                            {/* Member Count Indicator - Always visible and clickable */}
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    setViewingMembersProject(project);
                                }}
                                className={`flex items-center gap-1 px-2 py-0.5 rounded text-xs border transition-colors ${project.members && project.members.length > 0
                                    ? 'bg-gray-700/50 text-gray-300 border-gray-600/30 hover:bg-gray-600'
                                    : 'bg-transparent text-gray-500 border-gray-700/30 hover:bg-white/5 hover:text-gray-300'
                                    }`}
                                title={project.members && project.members.length > 0
                                    ? `Members:\n${project.members.map(m => `• ${m.user.firstName} ${m.user.lastName} (${m.role})`).join('\n')}`
                                    : 'No members assigned. Click to manage.'
                                }
                            >
                                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
                                </svg>
                                <span>{project.members?.length || 0}</span>
                            </button>
                        </div>
                        <p className="text-xs text-gray-500">{project.type}</p>
                    </div>

                    {/* Children & Cases Count - Clickable */}
                    <div className="text-xs flex gap-4">
                        {project._count?.children !== undefined && project._count.children > 0 && (
                            <button
                                onClick={() => toggleExpand(project.id)}
                                className="text-gray-400 hover:text-zeno-cyan hover:underline transition-colors"
                            >
                                {project._count.children} sub-projects
                            </button>
                        )}
                        {project._count?.children !== undefined && project._count.children === 0 && (
                            <span className="text-gray-500">{project._count.children} sub-projects</span>
                        )}
                        {totalCases > 0 ? (
                            <a
                                href={`/cases?projectId=${project.id}`}
                                className="text-gray-400 hover:text-zeno-cyan hover:underline transition-colors"
                            >
                                {totalCases} cases
                            </a>
                        ) : (
                            <span className="text-gray-500">{totalCases} cases</span>
                        )}
                    </div>


                    {/* Actions */}
                    <div className="flex items-center gap-2">
                        {/* View Members Button */}
                        <button
                            onClick={() => setViewingMembersProject(project)}
                            className="p-2 text-gray-400 hover:text-purple-300 hover:bg-white/5 rounded-lg transition-colors"
                            title="View Members"
                        >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
                            </svg>
                        </button>

                        {/* Move Single Project Button */}
                        <button
                            onClick={() => {
                                setSelectedIds([project.id]);
                                setShowMoveModal(true);
                            }}
                            className="p-2 text-gray-400 hover:text-indigo-400 hover:bg-white/5 rounded-lg transition-colors"
                            title="Move Project (Structured Path)"
                        >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
                            </svg>
                        </button>

                        <button
                            onClick={() => openCreateModal(project.id)}
                            className="p-2 text-gray-400 hover:text-zeno-cyan hover:bg-white/5 rounded-lg transition-colors"
                            title="Add sub-project"
                        >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                            </svg>
                        </button>
                        <button
                            onClick={() => openEditModal(project)}
                            className="p-2 text-gray-400 hover:text-white hover:bg-white/5 rounded-lg transition-colors"
                            title="Edit"
                        >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                            </svg>
                        </button>
                        {project.type !== 'ROOT' && (
                            <button
                                onClick={() => handleDelete(project)}
                                className="p-2 text-gray-400 hover:text-red-400 hover:bg-white/5 rounded-lg transition-colors"
                                title="Delete"
                            >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                </svg>
                            </button>
                        )}
                        {/* Delete Cases Action */}
                        {totalCases > 0 && (
                            <button
                                onClick={() => handleDeleteCases(project)}
                                className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-500/10 rounded-lg transition-colors ml-1"
                                title="Delete ALL Cases in this Project"
                            >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 11l4 4m0-4l-4 4" />
                                </svg>
                            </button>
                        )}
                    </div>
                </div>

                {/* Children */}
                {isExpanded && project.children?.map(child => renderProjectRow(child, depth + 1))}
            </div>
        );
    };

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
                        <h1 className="text-3xl font-bold text-white">Projects</h1>
                    </div>
                    <p className="text-gray-400">Manage your project hierarchy</p>
                </div>

                <div className="flex items-center gap-4">
                    <div className="relative">
                        <input
                            type="text"
                            placeholder="Search projects..."
                            value={searchQuery}
                            onChange={(e) => {
                                setSearchQuery(e.target.value);
                                setCurrentPage(1); // Reset to page 1 on search
                            }}
                            className="w-64 px-4 py-2 pl-10 bg-zeno-blue/50 border border-zeno-blue rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-zeno-cyan placeholder-gray-500"
                        />
                        <svg className="w-5 h-5 absolute left-3 top-2.5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                        </svg>
                    </div>

                    {selectedIds.length > 0 && (
                        <div className="flex items-center gap-2">
                            <button
                                onClick={() => setShowMoveModal(true)}
                                className="px-4 py-2 bg-indigo-600 text-white font-semibold rounded-lg hover:bg-indigo-500 transition-colors flex items-center gap-2 shadow-lg shadow-indigo-500/20"
                            >
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
                                </svg>
                                Move ({selectedIds.length})
                            </button>
                            <button
                                onClick={handleBulkDelete}
                                className="px-4 py-2 bg-red-600 text-white font-semibold rounded-lg hover:bg-red-500 transition-colors flex items-center gap-2 shadow-lg shadow-red-500/20"
                            >
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                </svg>
                                Delete ({selectedIds.length})
                            </button>
                        </div>
                    )}

                    <button
                        onClick={() => openCreateModal()}
                        className="px-4 py-2 bg-zeno-cyan text-zeno-navy font-semibold rounded-lg hover:bg-cyan-400 transition-colors flex items-center gap-2"
                    >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                        </svg>
                        New Project
                    </button>
                </div>
            </div>
            {/* Project Tree */}
            <div className="bg-zeno-blue/30 border border-zeno-blue/50 rounded-xl overflow-hidden">
                <div className="px-4 py-3 bg-zeno-blue/50 border-b border-zeno-blue/50">
                    <p className="text-sm font-medium text-gray-300">Project Hierarchy</p>
                </div>
                {projectTree.length === 0 ? (
                    <div className="p-8 text-center text-gray-400">
                        No projects yet. Create your first project to get started.
                    </div>
                ) : (
                    paginatedProjects.map(project => renderProjectRow(project))
                )}
            </div>

            {/* Pagination Controls */}
            {totalPages > 1 && (
                <div className="mt-4 px-4 py-3 bg-zeno-blue/30 border border-zeno-blue/50 rounded-xl flex items-center justify-between">
                    <div className="text-sm text-gray-400">
                        Page {currentPage} of {totalPages}
                    </div>
                    <div className="flex gap-2">
                        <button
                            onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                            disabled={currentPage === 1}
                            className="px-4 py-2 bg-zeno-blue border border-white/10 text-white rounded-lg hover:bg-zeno-blue/80 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                        >
                            Previous
                        </button>

                        {/* Page numbers */}
                        <div className="flex gap-1">
                            {Array.from({ length: totalPages }, (_, i) => i + 1).map(page => {
                                // Show first page, last page, current page, and pages around current
                                const showPage = page === 1 ||
                                    page === totalPages ||
                                    (page >= currentPage - 1 && page <= currentPage + 1);

                                if (!showPage) {
                                    // Show ellipsis
                                    if ((page === currentPage - 2 && currentPage > 3) ||
                                        (page === currentPage + 2 && currentPage < totalPages - 2)) {
                                        return <span key={page} className="px-2 py-2 text-gray-500">...</span>;
                                    }
                                    return null;
                                }

                                return (
                                    <button
                                        key={page}
                                        onClick={() => setCurrentPage(page)}
                                        className={`px-4 py-2 rounded-lg transition-all ${currentPage === page
                                            ? 'bg-zeno-cyan text-zeno-navy font-bold'
                                            : 'bg-zeno-blue border border-white/10 text-white hover:bg-zeno-blue/80'
                                            }`}
                                    >
                                        {page}
                                    </button>
                                );
                            })}
                        </div>

                        <button
                            onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                            disabled={currentPage === totalPages}
                            className="px-4 py-2 bg-zeno-blue border border-white/10 text-white rounded-lg hover:bg-zeno-blue/80 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                        >
                            Next
                        </button>
                    </div>
                </div>
            )}

            {showModal && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-md flex items-center justify-center z-50 p-4">
                    <div className="bg-zeno-navy border border-white/10 rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden ring-1 ring-white/20 animate-in fade-in zoom-in duration-200 flex flex-col h-fit max-h-[90vh]">
                        <div className="p-6 border-b border-zeno-blue shrink-0">
                            <h2 className="text-xl font-semibold text-white">
                                {editingProject ? 'Edit Project' : 'Create Project'}
                            </h2>
                        </div>
                        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar">
                            {formError && (
                                <div className="p-3 bg-red-500/20 border border-red-500/50 rounded-lg text-red-400 text-sm">
                                    {formError}
                                </div>
                            )}
                            <div>
                                <label className="block text-sm font-medium text-gray-300 mb-2">Name *</label>
                                <input
                                    type="text"
                                    value={formName}
                                    onChange={(e) => setFormName(e.target.value)}
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
                                    rows={2}
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-300 mb-2">Type</label>
                                <select
                                    value={formType}
                                    onChange={(e) => setFormType(e.target.value)}
                                    className="w-full px-4 py-2 bg-zeno-blue/50 border border-zeno-blue rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-zeno-cyan"
                                >
                                    {PROJECT_TYPES.map(t => (
                                        <option key={t.value} value={t.value}>{t.label} - {t.description}</option>
                                    ))}
                                </select>
                            </div>
                            <div>
                                <div className="flex items-center justify-between mb-2">
                                    <label className="block text-sm font-medium text-gray-300">Location/Parent Project</label>
                                    <button
                                        type="button"
                                        onClick={() => setUseStructuredMove(!useStructuredMove)}
                                        className={`text-xs px-2 py-1 rounded transition-all ${useStructuredMove
                                            ? 'bg-indigo-500 text-white font-bold'
                                            : 'bg-white/10 text-gray-400 hover:text-white'}`}
                                    >
                                        {useStructuredMove ? 'Using Structured Path' : 'Use Structured Path'}
                                    </button>
                                </div>

                                {useStructuredMove ? (
                                    <div className="p-4 bg-white/5 border border-white/10 rounded-xl space-y-4">
                                        <p className="text-[10px] text-indigo-400 uppercase tracking-wider font-bold">The Cases Way (Auto-create folders)</p>
                                        <DestinationPathSelector
                                            onChange={(_, details) => setStructuredPathDetails(details)}
                                            onError={setFormError}
                                            onLoading={() => { }}
                                        />
                                    </div>
                                ) : (
                                    <select
                                        value={formParentId || ''}
                                        onChange={(e) => {
                                            const newParentId = e.target.value || null;
                                            setFormParentId(newParentId);

                                            // Inheritance on change
                                            if (newParentId && !editingProject) {
                                                const parentProject = projects.find(p => p.id === newParentId);
                                                if (parentProject && parentProject.members) {
                                                    const existingIds = new Set(formMembers.map(m => m.userId));
                                                    const newMembers = parentProject.members
                                                        .filter(m => !existingIds.has(m.userId))
                                                        .map(m => ({ userId: m.userId, role: m.role }));

                                                    if (newMembers.length > 0) {
                                                        setFormMembers(prev => [...prev, ...newMembers]);
                                                    }
                                                }
                                            }
                                        }}
                                        className="w-full px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-zeno-cyan"
                                    >
                                        <option value="">None (Top Level)</option>
                                        {projects.filter(p => p.id !== editingProject?.id).map(p => (
                                            <option key={p.id} value={p.id}>{p.name} ({p.type})</option>
                                        ))}
                                    </select>
                                )}
                            </div>
                            {/* Client Type - For ACQUISITION_SOURCE type projects (main sources) */}
                            {formType === 'ACQUISITION_SOURCE' && (
                                <div>
                                    <label className="block text-sm font-medium text-gray-300 mb-2">
                                        Client Type <span className="text-red-400">*</span>
                                    </label>
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
                                            <div className="text-xs mt-1 opacity-70">Letsatsi, Shosholoza, etc.</div>
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setFormClientType('B2C')}
                                            className={`p-3 rounded-lg border-2 transition-all ${formClientType === 'B2C'
                                                ? 'border-teal-500 bg-teal-500/20 text-teal-300'
                                                : 'border-white/10 bg-zeno-blue/30 text-gray-400 hover:border-white/30'
                                                }`}
                                        >
                                            <div className="font-semibold">B2C (Private)</div>
                                            <div className="text-xs mt-1 opacity-70">Walk-ins, Dealerships</div>
                                        </button>
                                    </div>
                                    {!formClientType && (
                                        <p className="text-yellow-400 text-xs mt-2">Please select B2B or B2C for this main source</p>
                                    )}
                                </div>
                            )}

                            {/* Member Assignment */}
                            <div>
                                <label className="block text-sm font-medium text-gray-300 mb-1">Assign Members</label>
                                <p className="text-[10px] text-gray-500 mb-2 italic">At least one Manager is required. If none are assigned, you will be made the Manager automatically.</p>
                                <div className="space-y-3">
                                    <div className="flex gap-2">
                                        <select
                                            className="flex-1 px-4 py-2 bg-zeno-blue/50 border border-zeno-blue rounded-lg text-white"
                                            onChange={(e) => {
                                                const value = e.target.value;
                                                if (!value) return;

                                                if (value.startsWith('GROUP:')) {
                                                    // Handle Group Selection
                                                    const groupId = value.replace('GROUP:', '');
                                                    const group = allGroups.find(g => g.id === groupId);
                                                    if (group) {
                                                        const newMembers = [...formMembers];
                                                        let addedCount = 0;
                                                        group.members.forEach(gm => {
                                                            if (!newMembers.some(m => m.userId === gm.user.id)) {
                                                                newMembers.push({ userId: gm.user.id, role: 'MEMBER' });
                                                                addedCount++;
                                                            }
                                                        });
                                                        setFormMembers(newMembers);
                                                        // Optional: notify user how many added?
                                                    }
                                                } else {
                                                    // Handle Single User Selection
                                                    setFormMembers([...formMembers, { userId: value, role: 'MEMBER' }]);
                                                }
                                                e.target.value = ''; // Reset
                                            }}
                                        >
                                            <option value="">Select a user or group to add...</option>
                                            <optgroup label="Groups">
                                                {allGroups.map(g => (
                                                    <option key={g.id} value={`GROUP:${g.id}`}>
                                                        {g.name} ({g._count.members} members)
                                                    </option>
                                                ))}
                                            </optgroup>
                                            <optgroup label="Users">
                                                {allUsers
                                                    .filter(u => !formMembers.some(m => m.userId === u.id))
                                                    .map(u => (
                                                        <option key={u.id} value={u.id}>{u.firstName} {u.lastName} ({u.email})</option>
                                                    ))}
                                            </optgroup>
                                        </select>
                                    </div>

                                    {formMembers.length > 0 && (
                                        <div className="border border-zeno-blue/50 rounded-lg divide-y divide-zeno-blue/30 max-h-40 overflow-y-auto">
                                            {formMembers.map((member, idx) => {
                                                const user = allUsers.find(u => u.id === member.userId);
                                                return (
                                                    <div key={member.userId} className="flex items-center justify-between p-2">
                                                        <span className="text-sm text-gray-300">
                                                            {user ? `${user.firstName} ${user.lastName}` : member.userId}
                                                        </span>
                                                        <div className="flex items-center gap-2">
                                                            <select
                                                                value={member.role}
                                                                onChange={(e) => {
                                                                    const newMembers = [...formMembers];
                                                                    newMembers[idx].role = e.target.value;
                                                                    setFormMembers(newMembers);
                                                                }}
                                                                className="text-xs bg-zeno-navy border border-zeno-blue rounded px-2 py-1 text-white"
                                                            >
                                                                <option value="MEMBER">Member</option>
                                                                <option value="MANAGER">Manager</option>
                                                            </select>
                                                            <button
                                                                type="button"
                                                                onClick={() => setFormMembers(formMembers.filter(m => m.userId !== member.userId))}
                                                                className="text-red-400 hover:text-red-300"
                                                            >
                                                                ×
                                                            </button>
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    )}
                                </div>
                            </div>
                        </form>

                        <div className="p-6 border-t border-white/10 flex gap-3 bg-white/5 shrink-0">
                            <button
                                type="button"
                                onClick={() => { setShowModal(false); resetForm(); }}
                                className="flex-1 px-4 py-3 bg-gray-600/20 text-gray-300 border border-white/10 rounded-xl hover:bg-gray-600/40 hover:text-white transition-all font-medium"
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                onClick={(e) => handleSubmit(e as any)}
                                disabled={saving}
                                className="flex-1 px-4 py-3 bg-zeno-cyan text-zeno-navy font-bold rounded-xl hover:bg-cyan-400 transition-all disabled:opacity-50 shadow-lg shadow-zeno-cyan/20"
                            >
                                {saving ? (
                                    <div className="flex items-center justify-center gap-2">
                                        <div className="w-4 h-4 border-2 border-zeno-navy/30 border-t-zeno-navy rounded-full animate-spin"></div>
                                        <span>Saving...</span>
                                    </div>
                                ) : (editingProject ? 'Update Project' : 'Create Project')}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {deleteModal && (
                <DeleteConfirmationModal
                    isOpen={deleteModal.isOpen}
                    onClose={() => setDeleteModal(null)}
                    onConfirm={executeDelete}
                    title={
                        deleteModal.type === 'PROJECT' ? 'Delete Project' :
                            deleteModal.type === 'BULK_PROJECTS' ? 'Delete Multiple Projects' :
                                'Delete All Cases'
                    }
                    message={
                        deleteModal.type === 'PROJECT' && deleteModal.project ? (
                            <span>
                                Are you sure you want to delete the project <strong className="text-white">"{deleteModal.project.name}"</strong>?
                                <br /><br />
                                <span className="text-red-400">Warning: This action cannot be undone.</span>
                            </span>
                        ) : deleteModal.type === 'BULK_PROJECTS' && deleteModal.projectIds ? (
                            <span>
                                Are you sure you want to delete <strong className="text-white">{deleteModal.projectIds.length}</strong> selected projects?
                                <br /><br />
                                <span className="text-red-400">Note: Only projects without sub-projects and without linked cases will be deleted. This action cannot be undone.</span>
                            </span>
                        ) : deleteModal.project ? (
                            <span>
                                Are you sure you want to PERMANENTLY DELETE ALL <strong className="text-white">{deleteModal.totalCases}</strong> cases in <strong className="text-white">"{deleteModal.project.name}"</strong>?
                                <br /><br />
                                <span className="text-red-400">This will remove these cases from ALL projects. This action cannot be undone.</span>
                            </span>
                        ) : null
                    }
                    requireInput={deleteModal.type === 'CASES' && deleteModal.project ? deleteModal.project.name : undefined}
                    confirmText="Delete Permanently"
                />
            )}

            {viewingMembersProject && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                    <div className="bg-zeno-navy border border-zeno-blue rounded-xl w-full max-w-md">
                        <div className="p-6 border-b border-zeno-blue flex justify-between items-center">
                            <h2 className="text-xl font-semibold text-white">
                                Members: {viewingMembersProject.name}
                            </h2>
                            <button onClick={() => setViewingMembersProject(null)} className="text-gray-400 hover:text-white">
                                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </div>
                        <div className="p-6">
                            {/* Check permissions: Admin OR Manager of this project */}
                            {(() => {
                                const canManage = session?.user?.isAdmin || viewingMembersProject.members?.some(m => m.userId === session?.user?.id && m.role === 'MANAGER');

                                return (
                                    <>
                                        {canManage && (
                                            <div className="mb-4">
                                                <select
                                                    className="w-full px-4 py-2 bg-zeno-blue/50 border border-zeno-blue rounded-lg text-white mb-2"
                                                    onChange={(e) => {
                                                        const value = e.target.value;
                                                        if (!value) return;

                                                        if (value.startsWith('GROUP:')) {
                                                            const groupId = value.replace('GROUP:', '');
                                                            const group = allGroups.find(g => g.id === groupId);
                                                            if (group) {
                                                                const newMembers = [...modalMembers];
                                                                group.members.forEach(gm => {
                                                                    if (!newMembers.some(m => m.userId === gm.user.id)) {
                                                                        newMembers.push({ userId: gm.user.id, role: 'MEMBER' });
                                                                    }
                                                                });
                                                                setModalMembers(newMembers);
                                                            }
                                                        } else {
                                                            setModalMembers([...modalMembers, { userId: value, role: 'MEMBER' }]);
                                                        }
                                                        e.target.value = '';
                                                    }}
                                                >
                                                    <option value="">+ Add Member...</option>
                                                    <optgroup label="Groups">
                                                        {allGroups.map(g => (
                                                            <option key={g.id} value={`GROUP:${g.id}`}>
                                                                {g.name} ({g._count.members} members)
                                                            </option>
                                                        ))}
                                                    </optgroup>
                                                    <optgroup label="Users">
                                                        {allUsers
                                                            .filter(u => !modalMembers.some(m => m.userId === u.id))
                                                            .map(u => (
                                                                <option key={u.id} value={u.id}>{u.firstName} {u.lastName} ({u.email})</option>
                                                            ))}
                                                    </optgroup>
                                                </select>
                                            </div>
                                        )}

                                        {modalMembers.length > 0 ? (
                                            <div className="space-y-3 max-h-[50vh] overflow-y-auto">
                                                {modalMembers.map((member) => {
                                                    const user = allUsers.find(u => u.id === member.userId);
                                                    // Fallback if user not in allUsers yet (though should be if fetched)
                                                    const displayName = user ? `${user.firstName} ${user.lastName}` : 'Unknown User';
                                                    const displayEmail = user?.email || member.userId;
                                                    const initials = user ? `${user.firstName[0]}${user.lastName[0]}` : '??';

                                                    return (
                                                        <div key={member.userId} className="flex items-center justify-between p-3 bg-zeno-blue/30 rounded-lg">
                                                            <div className="flex items-center gap-3">
                                                                <div className="w-8 h-8 rounded-full bg-purple-500/20 text-purple-300 flex items-center justify-center font-bold">
                                                                    {initials}
                                                                </div>
                                                                <div>
                                                                    <div className="text-white font-medium">{displayName}</div>
                                                                    <div className="text-xs text-gray-400">{displayEmail}</div>
                                                                </div>
                                                            </div>

                                                            <div className="flex items-center gap-2">
                                                                {canManage ? (
                                                                    <>
                                                                        <select
                                                                            value={member.role}
                                                                            onChange={(e) => {
                                                                                const newMebs = modalMembers.map(m => m.userId === member.userId ? { ...m, role: e.target.value } : m);
                                                                                setModalMembers(newMebs);
                                                                            }}
                                                                            className="px-2 py-1 text-xs bg-zeno-navy border border-zeno-blue rounded text-white"
                                                                        >
                                                                            <option value="MEMBER">Member</option>
                                                                            <option value="MANAGER">Manager</option>
                                                                        </select>
                                                                        <button
                                                                            onClick={() => setModalMembers(modalMembers.filter(m => m.userId !== member.userId))}
                                                                            className="text-red-400 hover:text-white"
                                                                        >
                                                                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                                                            </svg>
                                                                        </button>
                                                                    </>
                                                                ) : (
                                                                    <span className={`px-2 py-1 text-xs font-medium rounded ${member.role === 'MANAGER'
                                                                        ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                                                                        : 'bg-blue-500/20 text-blue-300 border border-blue-500/30'
                                                                        }`}>
                                                                        {member.role}
                                                                    </span>
                                                                )}
                                                            </div>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        ) : (
                                            <div className="text-center text-gray-400 py-8">
                                                No members assigned to this project.
                                            </div>
                                        )}

                                        <div className="p-6 border-t border-zeno-blue bg-zeno-blue/10 rounded-b-xl flex justify-end gap-3 -mx-6 -mb-6 mt-6">
                                            <button
                                                onClick={() => setViewingMembersProject(null)}
                                                className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-500 transition-colors"
                                            >
                                                Close
                                            </button>
                                            {canManage && (
                                                <button
                                                    onClick={handleSaveMembers}
                                                    disabled={saving}
                                                    className="px-4 py-2 bg-zeno-cyan text-zeno-navy font-semibold rounded-lg hover:bg-cyan-400 transition-colors disabled:opacity-50"
                                                >
                                                    {saving ? 'Saving...' : 'Save Changes'}
                                                </button>
                                            )}
                                        </div>
                                    </>
                                );
                            })()}
                        </div>
                    </div>
                </div>
            )}
            {/* Move Project Modal (the cases way) */}
            <MoveProjectModal
                isOpen={showMoveModal}
                onClose={() => setShowMoveModal(false)}
                selectedProjectIds={selectedIds}
                onSuccess={() => {
                    setSelectedIds([]);
                    fetchProjects();
                }}
            />
        </div >
    );
}
